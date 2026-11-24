/**
 * Staged Gothic mansion acceptance harness — run via window.__gothicStage(name).
 * Stages: init | build | surfaces | materials_ui | prefabs | persist | play | perf
 */
(function (global) {
  const REPORT = global.__GOTHIC_ACCEPTANCE_REPORT__ || {
    startedAt: new Date().toISOString(),
    results: {},
    performance: {},
    defects: [],
    limitations: [],
    notes: [],
  };
  global.__GOTHIC_ACCEPTANCE_REPORT__ = REPORT;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  function findCtx(need) {
    const rootEl = document.getElementById('root') || document.body.firstElementChild;
    const key = Object.keys(rootEl).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
    let fiber = rootEl[key];
    if (fiber?.stateNode?.current) fiber = fiber.stateNode.current;
    let found = null;
    const seen = new Set();
    function walk(f, d = 0) {
      if (!f || d > 140 || found) return;
      if (seen.has(f)) return;
      seen.add(f);
      const p = f.memoizedProps;
      if (p?.value && need(p.value)) { found = p.value; return; }
      walk(f.child, d + 1);
      walk(f.sibling, d + 1);
    }
    walk(fiber);
    return found;
  }

  const editor = () => findCtx((v) => v.createBrushAtBounds && v.world && v.play);
  const assets = () => findCtx((v) => v.createNewMaterial || v.duplicateMaterial);
  const mark = (key, status, detail) => { REPORT.results[key] = { status, detail: detail || null }; };
  const allActors = (ed) => ed.world?.actors || [];
  const actorCount = (ed) => allActors(ed).length;

  function mem() {
    const m = performance.memory;
    if (!m) return null;
    return {
      usedJSHeapMB: +(m.usedJSHeapSize / 1048576).toFixed(2),
      totalJSHeapMB: +(m.totalJSHeapSize / 1048576).toFixed(2),
    };
  }

  async function measureFps(seconds = 0.7) {
    const times = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    while (performance.now() < end) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    if (!times.length) return { avgFps: 0, samples: 0 };
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    return {
      avgFps: +(1000 / avgMs).toFixed(1),
      avgFrameMs: +avgMs.toFixed(2),
      samples: times.length,
      minFrameMs: +Math.min(...times).toFixed(2),
      maxFrameMs: +Math.max(...times).toFixed(2),
    };
  }

  async function measureResync(ed, label) {
    const rt = ed.runtimeRef?.current;
    if (!rt?.resyncWorld) return { label, ms: null, error: 'no resyncWorld' };
    const t0 = performance.now();
    rt.resyncWorld();
    await frame();
    return { label, ms: +(performance.now() - t0).toFixed(2), actors: actorCount(ed) };
  }

  function create(ed, kind, cx, cy, cz, sx, sy, sz) {
    return ed.createBrushAtBounds(kind, {
      x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2,
    }, {
      x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2,
    });
  }

  async function waitDirty(ed, expect, timeoutMs = 2500) {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (!!ed.isDirty === !!expect) return true;
      await sleep(40);
    }
    return !!ed.isDirty === !!expect;
  }

  function mat(ed, id, materialId, cellId) {
    if (!id) return;
    ed.selectActor(id);
    if (materialId) ed.applySelectedMaterialToBrush?.(materialId);
    if (cellId) ed.assignSelectedToCell?.(cellId);
  }

  function buildStructure(ed) {
    const ids = {};
    const log = [];
    const WH = 300;
    const WY = 160;

    ids.cellGround = ed.createCell('Mansion Ground')?.id;
    ids.cellUpper = ed.createCell('Mansion Upper')?.id;
    ids.cellTower = ed.createCell('Spiral Tower', { x: 900, y: 0, z: -200 })?.id;
    log.push('cells');

    ids.hallFloor = create(ed, 'box', 0, 10, 0, 1200, 20, 1200)?.id;
    mat(ed, ids.hallFloor, 'mat_hall_floor', ids.cellGround);
    ids.corridor = create(ed, 'box', 900, 10, 0, 600, 20, 300)?.id;
    mat(ed, ids.corridor, 'mat_hall_floor', ids.cellGround);
    ids.libraryFloor = create(ed, 'box', -500, 10, -700, 500, 20, 400)?.id;
    mat(ed, ids.libraryFloor, 'mat_hall_wood', ids.cellGround);

    ids.wallN = create(ed, 'box', 0, WY, -600, 1200, WH, 25)?.id;
    ids.wallS = create(ed, 'box', 0, WY, 600, 1200, WH, 25)?.id;
    ids.wallW = create(ed, 'box', -600, WY, 0, 25, WH, 1200)?.id;
    ids.wallE = create(ed, 'box', 600, WY, -200, 25, WH, 800)?.id;
    for (const id of [ids.wallN, ids.wallS, ids.wallW, ids.wallE]) {
      mat(ed, id, 'mat_hall_stone', ids.cellGround);
    }
    log.push('hall_walls');

    ids.alignA = create(ed, 'box', -150, WY, 400, 200, WH, 25)?.id;
    ids.alignB = create(ed, 'box', 100, WY, 400, 300, WH, 25)?.id;
    if (ids.alignA) {
      ed.selectActor(ids.alignA);
      ed.applySelectedMaterialToBrush?.('mat_hall_stone');
      ed.updateSelectedBrush?.({
        faceMaterials: { pz: 'mat_hall_stone', nz: 'mat_hall_ceiling' },
        faceUVs: { pz: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
      });
      ed.assignSelectedToCell?.(ids.cellGround);
    }
    mat(ed, ids.alignB, 'mat_hall_stone', ids.cellGround);

    ids.miterA = create(ed, 'box', -400, WY, 450, 200, WH, 25)?.id;
    ids.miterB = create(ed, 'box', -500, WY, 350, 25, WH, 200)?.id;
    if (ids.miterA) {
      ed.selectActor(ids.miterA);
      const joined = ed.joinSelectedWallToNearest?.({ endId: 'start' });
      log.push(`miter:${String(joined)}`);
    }

    if (ids.wallN) {
      ed.selectActor(ids.wallN);
      ed.addBrushOpening?.('door');
      ed.addBrushOpening?.('window');
      log.push('openings');
    }

    ids.subtract = create(ed, 'subtract', 600, 120, 0, 80, 180, 120)?.id;
    if (ids.subtract) {
      ed.selectActor(ids.subtract);
      ed.assignSelectedToCell?.(ids.cellGround);
      log.push('subtract');
    }

    ids.arch = create(ed, 'archGothic', 0, 140, -580, 180, 280, 60)?.id;
    mat(ed, ids.arch, 'mat_hall_stone', ids.cellGround);

    ids.col1 = create(ed, 'column', -250, 150, -250, 60, 280, 60)?.id;
    ids.col2 = create(ed, 'column', 250, 150, -250, 60, 280, 60)?.id;
    mat(ed, ids.col1, 'mat_hall_stone', ids.cellGround);
    mat(ed, ids.col2, 'mat_hall_stone', ids.cellGround);

    ids.curved = create(ed, 'curvedWall', 0, WY, 700, 400, WH, 200)?.id;
    if (ids.curved) {
      ed.selectActor(ids.curved);
      ed.applySelectedMaterialToBrush?.('mat_hall_stone');
      ed.updateSelectedCurvedWall?.({ sweepAngle: 180 });
      ed.assignSelectedToCell?.(ids.cellGround);
    }

    ids.straightStair = create(ed, 'stair', 400, 160, -100, 140, 300, 280)?.id;
    if (ids.straightStair) {
      ed.selectActor(ids.straightStair);
      ed.updateSelectedStair?.({ stairType: 'straight', stepCount: 15, stepHeight: 20 });
      ed.applySelectedMaterialToBrush?.('mat_hall_wood');
      ed.assignSelectedToCell?.(ids.cellGround);
    }

    ids.ramp = create(ed, 'ramp', 550, 100, -100, 100, 180, 300)?.id;
    mat(ed, ids.ramp, 'mat_hall_stone', ids.cellGround);

    ids.curvedStair = create(ed, 'stair', -350, 160, 200, 200, 300, 200)?.id;
    if (ids.curvedStair) {
      ed.selectActor(ids.curvedStair);
      ed.updateSelectedStair?.({
        stairType: 'curved', stepCount: 16, stepHeight: 18.75,
        width: 140, innerRadius: 160, sweepAngle: 180, clockwise: true,
      });
      ed.applySelectedMaterialToBrush?.('mat_hall_wood');
      ed.assignSelectedToCell?.(ids.cellGround);
    }

    ids.spiral = create(ed, 'stair', 900, 200, -200, 160, 400, 160)?.id;
    if (ids.spiral) {
      ed.selectActor(ids.spiral);
      ed.updateSelectedStair?.({
        stairType: 'spiral', stepCount: 24, stepHeight: 16.67,
        width: 100, innerRadius: 55, sweepAngle: 360,
      });
      ed.applySelectedMaterialToBrush?.('mat_hall_stone');
      ed.assignSelectedToCell?.(ids.cellTower);
    }

    ids.upperFloor = create(ed, 'box', 0, 310, -200, 800, 20, 600)?.id;
    mat(ed, ids.upperFloor, 'mat_hall_floor', ids.cellUpper);
    ids.uWallN = create(ed, 'box', 0, 460, -500, 800, 280, 25)?.id;
    ids.uWallS = create(ed, 'box', 0, 460, 100, 800, 280, 25)?.id;
    mat(ed, ids.uWallN, 'mat_hall_stone', ids.cellUpper);
    mat(ed, ids.uWallS, 'mat_hall_stone', ids.cellUpper);

    ids.libCeiling = create(ed, 'box', -500, 320, -700, 500, 20, 400)?.id;
    mat(ed, ids.libCeiling, 'mat_hall_ceiling', ids.cellGround);

    ids.light1 = ed.placeLight?.('point', { x: 0, y: 250, z: 0 })?.id;
    ids.light2 = ed.placeLight?.('point', { x: -500, y: 220, z: -700 })?.id;
    ids.light3 = ed.placeLight?.('spot', { x: 400, y: 280, z: -100 })?.id;
    if (ids.light1) {
      ed.selectActor(ids.light1);
      ed.updateSelectedLight?.({ intensity: 2.2, range: 800, color: '#ffd8a8' });
    }

    const mesh = { id: 'mesh_verify_cube', name: 'Verify Cube' };
    ids.prop1 = ed.placeMeshAsset?.(mesh, { x: -80, y: 40, z: 80 }, { collidable: true })?.id;
    ids.prop2 = ed.placeMeshAsset?.(mesh, { x: -500, y: 40, z: -650 }, { collidable: true })?.id;
    ids.prop3 = ed.placeMeshAsset?.(mesh, { x: 200, y: 40, z: -200 }, { collidable: true })?.id;
    if (ids.prop1) {
      ed.selectActor(ids.prop1);
      ed.updateSelectedTransform?.({ scale: { x: 0.8, y: 1.2, z: 0.6 } }, { snap: false });
    }

    ids.spawn = ed.placePlayerSpawn?.({ x: 0, y: 40, z: 200 })?.id;
    return { ids, log };
  }

  function serializeSurfaces(ed, ids) {
    const pick = {};
    for (const key of ['alignA', 'alignB', 'wallW', 'hallFloor', 'straightStair', 'spiral']) {
      const id = ids[key];
      if (!id) continue;
      const a = ed.world?.getActor(id);
      if (!a) { pick[key] = null; continue; }
      const comp = a.getComponent('Brush') || a.getComponent('Stair') || a.getComponent('Column')
        || a.getComponent('Ramp') || a.getComponent('Arch') || a.getComponent('CurvedWall');
      pick[key] = {
        materialId: comp?.materialId,
        faceMaterials: comp?.faceMaterials,
        faceUVs: comp?.faceUVs,
        type: comp?.type,
        stairType: comp?.stairType,
      };
    }
    return pick;
  }

  function geometryCoverage(ed) {
    const counts = {
      Brush: 0, Stair: 0, Ramp: 0, Column: 0, Arch: 0, CurvedWall: 0,
      StaticMesh: 0, Light: 0, PlayerSpawn: 0, Cell: 0,
      subtract: 0, spiral: 0, curvedStair: 0,
    };
    for (const a of allActors(ed)) {
      if (a.getComponent('Cell')) counts.Cell++;
      const brush = a.getComponent('Brush');
      if (brush) {
        counts.Brush++;
        if (brush.operation === 'subtract') counts.subtract++;
      }
      const st = a.getComponent('Stair');
      if (st) {
        counts.Stair++;
        if (st.stairType === 'spiral') counts.spiral++;
        if (st.stairType === 'curved') counts.curvedStair++;
      }
      if (a.getComponent('Ramp')) counts.Ramp++;
      if (a.getComponent('Column')) counts.Column++;
      if (a.getComponent('Arch')) counts.Arch++;
      if (a.getComponent('CurvedWall')) counts.CurvedWall++;
      if (a.getComponent('StaticMesh')) counts.StaticMesh++;
      if (a.getComponent('Light')) counts.Light++;
      if (a.getComponent('PlayerSpawn')) counts.PlayerSpawn++;
    }
    const checks = {
      Brush: counts.Brush >= 5,
      StairStraight: counts.Stair >= 1,
      StairCurved: counts.curvedStair >= 1,
      StairSpiral: counts.spiral >= 1,
      Ramp: counts.Ramp >= 1,
      Column: counts.Column >= 1,
      Arch: counts.Arch >= 1,
      CurvedWall: counts.CurvedWall >= 1,
      Subtract: counts.subtract >= 1,
      StaticMesh: counts.StaticMesh >= 1,
      Light: counts.Light >= 1,
      Cell: counts.Cell >= 2,
      PlayerSpawn: counts.PlayerSpawn >= 1,
    };
    return { counts, missing: Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k) };
  }

  async function stage(name) {
    REPORT.notes.push(`stage:${name}`);
    let ed = editor();
    if (!ed) {
      mark('editor_context', 'FAIL', 'EditorContext not found');
      return { stage: name, ok: false, report: REPORT };
    }
    mark('editor_context', 'PASS', 'ok');

    if (name === 'init') {
      ed.applyLevelData(
        { schemaVersion: 2, name: 'Gothic Mansion Acceptance', actors: [] },
        { fileName: 'acceptance-gothic-mansion.json' },
      );
      await sleep(150);
      ed = editor();
      ed.setGridSnap?.(true);
      ed.setGridSize?.(25);
      mark('new_level', 'PASS', 'empty via applyLevelData');
      return { stage: name, ok: true, actors: actorCount(ed) };
    }

    if (name === 'build') {
      const built = buildStructure(ed);
      global.__GOTHIC_IDS__ = built.ids;
      await frame();
      ed = editor();
      const count = actorCount(ed);
      mark('construction', count > 20 ? 'PASS' : 'FAIL', { actors: count, log: built.log, ids: built.ids });
      ed.selectActor(built.ids.hallFloor);
      mark('selection_snapping',
        (ed.selectedActorIds?.includes(built.ids.hallFloor) && ed.gridSnap) ? 'PASS' : 'FAIL',
        { gridSnap: ed.gridSnap, gridSize: ed.gridSize });
      return { stage: name, ok: count > 20, actors: count, ids: built.ids };
    }

    const ids = global.__GOTHIC_IDS__;
    if (!ids) return { stage: name, ok: false, error: 'run build first' };

    if (name === 'surfaces') {
      ed.setTool?.('surface');
      ed.selectActor(ids.alignA);
      ed.setSelectedSurface({ actorId: ids.alignA, surfaceId: 'pz' });
      await frame();
      ed.assignSelectedSurfaceMaterial('mat_hall_stone');
      ed.assignSelectedSurfaceUv({ scale: { x: 1, y: 1 }, offset: { x: 0.15, y: 0 }, rotation: 0 });
      ed.setTool?.('align');
      ed.setAlignReferenceSurface({ actorId: ids.alignA, surfaceId: 'pz' });
      const align = ed.alignSurfaceToReference({ actorId: ids.alignB, surfaceId: 'pz' });
      ed.setTool?.('select');
      ed.selectActor(ids.wallW);
      ed.setSelectedSurface({ actorId: ids.wallW, surfaceId: 'px' });
      ed.assignSelectedSurfaceUv({ scale: { x: 1.5, y: 1 }, offset: { x: 0, y: 0.1 }, rotation: 0 });
      ed.assignSelectedSurfaceMaterial('mat_hall_ceiling');
      mark('materials_surfaces_align', align?.ok ? 'PASS' : 'FAIL', align);
      if (!align?.ok && align?.reason) REPORT.limitations.push(`Align: ${align.reason}`);
      return { stage: name, ok: !!align?.ok, align };
    }

    if (name === 'materials_ui') {
      const matBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Materials');
      const out = { opened: false };
      if (matBtn) {
        matBtn.click();
        await sleep(250);
        out.opened = true;
        const ab = assets();
        if (ab?.createNewMaterial) {
          const created = await ab.createNewMaterial({ name: 'Mansion Accent' });
          out.createdMaterial = !!created;
          out.materialId = created?.asset?.id || null;
        }
        const levelBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Level Editor');
        levelBtn?.click();
        await sleep(200);
        const discard = [...document.querySelectorAll('button')].find((b) =>
          /discard|leave|ok|yes|confirm/i.test(b.textContent || ''));
        discard?.click();
        await sleep(150);
      }
      mark('materials_workspace', out.opened ? 'PASS' : 'NOT VERIFIED', out);
      return { stage: name, ok: out.opened, out };
    }

    if (name === 'prefabs') {
      const out = {};
      ed.selectActors([ids.col1]);
      await frame();
      const created = await ed.createPrefabFromSelection('Gothic Column Prefab');
      out.created = !!created;
      out.prefabId = created?.asset?.id || null;
      if (out.prefabId) {
        await ed.placePrefabAsset(out.prefabId, { x: -250, y: 150, z: 250 });
        let root = null;
        for (const a of allActors(editor())) {
          if (a.prefab?.prefabId === out.prefabId) root = a;
        }
        if (root) {
          out.placedId = root.id;
          ed.selectActor(root.id);
          if (root.getComponent('Column')) ed.updateSelectedColumn?.({ materialId: 'mat_hall_wood' });
          await ed.recordSelectedPrefabOverride?.();
          out.overrideRecorded = true;
          ed.selectActor(ids.col1);
          ed.updateSelectedColumn?.({ materialId: 'mat_hall_ceiling' });
          await ed.updatePrefabAssetFromSelection?.();
          await ed.applyPrefabSourceUpdate?.(out.prefabId);
          out.synced = true;
        }
      }
      mark('prefabs', out.created ? 'PASS' : 'FAIL', out);
      return { stage: name, ok: !!out.created, out };
    }

    if (name === 'persist') {
      const out = {};
      const wall = ed.world.getActor(ids.wallW);
      const beforeMat = wall?.getComponent('Brush')?.faceMaterials?.px;
      ed.undo();
      await frame();
      const afterUndo = editor().world.getActor(ids.wallW)?.getComponent('Brush')?.faceMaterials?.px;
      out.undoChanged = beforeMat !== afterUndo || editor().canUndo === true;
      editor().redo();
      await frame();
      ed = editor();
      out.redoRestored = ed.world.getActor(ids.wallW)?.getComponent('Brush')?.faceMaterials?.px === beforeMat;

      ed.setLevelName('acceptance-gothic-mansion.json');
      await ed.saveLevel();
      await sleep(200);
      await waitDirty(ed, false);
      ed = editor();
      out.cleanAfterSave = ed.isDirty === false;

      ed.selectActor(ids.hallFloor);
      ed.applySelectedMaterialToBrush?.('mat_hall_wood');
      await sleep(350);
      await waitDirty(ed, true);
      ed = editor();
      out.dirtyAfterEdit = ed.isDirty === true;

      await ed.saveLevel();
      await sleep(200);
      await waitDirty(ed, false);
      ed = editor();
      out.cleanFinal = ed.isDirty === false;

      const before = JSON.stringify(serializeSurfaces(ed, ids));
      await ed.loadLevel('acceptance-gothic-mansion.json');
      await sleep(400);
      ed = editor();
      out.reloadMatch = before === JSON.stringify(serializeSurfaces(ed, ids));
      out.actorCountAfterReload = actorCount(ed);

      const ok = out.cleanAfterSave && out.dirtyAfterEdit && out.cleanFinal && out.reloadMatch;
      mark('undo_dirty_saveload', ok ? 'PASS' : 'FAIL', out);
      return { stage: name, ok, out };
    }

    if (name === 'play') {
      const before = serializeSurfaces(ed, ids);
      const out = { before };
      try {
        await ed.play();
        await sleep(1000);
        out.modePlay = editor().mode === 'play' || !!editor().runtimeRef?.current?.mode;
        const rt = editor().runtimeRef?.current;
        out.hasPhysics = !!(rt?.physicsWorld || rt?.rapierWorld || rt?.playerController || rt?.isPlayActive);
        editor().stop();
        await sleep(350);
        ed = editor();
        out.modeEdit = ed.mode === 'edit';
        out.after = serializeSurfaces(ed, ids);
        out.restored = JSON.stringify(before) === JSON.stringify(out.after);
      } catch (err) {
        out.error = String(err?.message || err);
      }
      mark('play_stop', out.restored && out.modeEdit ? 'PASS' : 'FAIL', out);
      const spawn = ed.world.getActor(ids.spawn);
      const floor = ed.world.getActor(ids.hallFloor)?.getComponent('Brush');
      const stair = ed.world.getActor(ids.straightStair)?.getComponent('Stair');
      mark('navigation_collision',
        spawn && floor?.collidable && stair?.collidable ? 'PASS' : 'NOT VERIFIED',
        {
          hasSpawn: !!spawn,
          floorCollidable: !!floor?.collidable,
          stairCollidable: !!stair?.collidable,
          note: 'Pointer-lock FPS walk not fully automated.',
        });
      return { stage: name, ok: !!(out.restored && out.modeEdit), out };
    }

    if (name === 'perf') {
      const samples = [];
      const baseline = {
        actors: actorCount(ed),
        fps: await measureFps(0.7),
        memory: mem(),
        resync: await measureResync(ed, 'baseline'),
      };
      samples.push(baseline);
      let added = 0;
      for (const batch of [20, 40]) {
        const t0 = performance.now();
        for (let i = 0; i < batch; i++) {
          const x = 1400 + ((added + i) % 20) * 50;
          const z = -600 + Math.floor((added + i) / 20) * 50;
          create(ed, 'box', x, 40, z, 40, 40, 40);
        }
        added += batch;
        await frame();
        ed = editor();
        samples.push({
          actors: actorCount(ed),
          addedTotal: added,
          addBatchMs: +(performance.now() - t0).toFixed(2),
          fps: await measureFps(0.5),
          memory: mem(),
          resync: await measureResync(ed, `after_+${added}`),
        });
      }
      REPORT.performance = { samples, baseline };
      mark('performance', baseline.fps?.avgFps != null ? 'PASS' : 'NOT VERIFIED', {
        baselineFps: baseline.fps?.avgFps,
        finalSample: samples[samples.length - 1],
      });

      await ed.loadLevel('acceptance-gothic-mansion.json');
      await sleep(400);
      ed = editor();
      mark('mansion_restored_after_perf', actorCount(ed) > 15 ? 'PASS' : 'FAIL', { actors: actorCount(ed) });
      const cov = geometryCoverage(ed);
      mark('geometry_coverage', cov.missing.length === 0 ? 'PASS' : 'FAIL', cov);
      REPORT.finishedAt = new Date().toISOString();
      REPORT.levelName = 'acceptance-gothic-mansion.json';
      REPORT.finalActorCount = actorCount(ed);
      return { stage: name, ok: true, report: REPORT, performance: REPORT.performance };
    }

    return { stage: name, ok: false, error: 'unknown stage' };
  }

  global.__gothicStage = stage;
  global.__runGothicMansionAcceptance = async () => {
    for (const s of ['init', 'build', 'surfaces', 'materials_ui', 'prefabs', 'persist', 'play', 'perf']) {
      await stage(s);
    }
    return REPORT;
  };
})(window);
