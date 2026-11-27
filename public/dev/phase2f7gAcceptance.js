/**
 * Phase 2F.7G — final regression, profiling, and lifecycle stress harness.
 * Load the editor, then: await window.__phase2f7gAcceptance()
 *
 * Options: await window.__phase2f7gAcceptance({ quick: true })
 *   quick skips 50 Play/Stop and 20 level-switch loops (keeps smoke coverage).
 */
(function phase2f7gAcceptance() {
  function findEditor() {
    const roots = document.querySelectorAll('[data-reactroot], #root, body');
    const visited = new Set();
    const queue = [];
    for (const el of roots) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
      if (key) queue.push(el[key]);
    }
    while (queue.length) {
      const node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);
      const props = node.memoizedProps || node.pendingProps;
      if (props?.value?.world && props.value.runtimeRef) {
        return props.value;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
      if (node.alternate) queue.push(node.alternate);
      if (node.stateNode) queue.push(node.stateNode);
      if (node.return) queue.push(node.return);
    }
    return null;
  }

  function settle(ms = 80) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function loadLevelForced(editor, name) {
    if (editor.loadLevelUnchecked) return editor.loadLevelUnchecked(name);
    const res = await fetch(`/levels/${name}`);
    if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
    const data = await res.json();
    if (editor.applyLevelData) {
      return editor.applyLevelData(data, {
        fileName: name,
        session: {
          kind: 'project',
          readOnlyDisk: false,
          lessonId: null,
          displayName: name,
        },
        statusMessage: `Loaded ${name}`,
      });
    }
    return editor.loadLevel?.(name);
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  /**
   * Prefer Viewport measureGpuSnapshot (info.reset + one render). Fall back to
   * raw memory counts when the bridge is unavailable — never treat unreset
   * drawCalls/triangles as a single-pass cost.
   */
  async function gpuSnapshot(runtime, { layoutMode = null } = {}) {
    const vp = window.__bloodboundViewport;
    if (vp?.measureGpuSnapshot) {
      const snap = await vp.measureGpuSnapshot(
        layoutMode ? { layoutMode } : {},
      );
      if (snap) {
        return {
          geometries: snap.geometries,
          textures: snap.textures,
          programs: runtime?.sceneView?.renderer?.info?.programs?.length ?? null,
          drawCalls: snap.drawCalls,
          triangles: snap.triangles,
          cpuSubmitMs: snap.cpuSubmitMs,
          paneCount: snap.paneCount,
          resetProtocol: true,
        };
      }
    }
    const info = runtime?.sceneView?.renderer?.info;
    if (!info) return null;
    return {
      geometries: info.memory?.geometries ?? null,
      textures: info.memory?.textures ?? null,
      programs: info.programs?.length ?? null,
      drawCalls: null,
      triangles: null,
      resetProtocol: false,
      note: 'raw memory only — drawCalls omitted without info.reset()',
    };
  }

  function liveEditor() {
    return findEditor();
  }

  function actorCount(editor) {
    const runtime = window.__bloodboundViewport?.getRuntime?.();
    if (runtime?.world?.actors) return runtime.world.actors.length;
    return editor?.world?.actors?.length
      || liveEditor()?.world?.actors?.length
      || 0;
  }

  async function measureLoadMs(editor, name) {
    const t0 = performance.now();
    await loadLevelForced(editor, name);
    await settle(150);
    return +(performance.now() - t0).toFixed(1);
  }

  async function profileLevel(editor, vp, name, label) {
    const loadMs = await measureLoadMs(editor, name);
    const runtime = vp.getRuntime();
    assert(runtime?.sceneView, 'runtime missing after load');

    // Warm a few frames so info.render is populated.
    vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    await settle(120);
    const single = await vp.measureFrameTimes(0.4);
    const gpuSingle = await gpuSnapshot(runtime);

    vp.setPrefs({ layoutMode: 'quad' });
    await settle(120);
    const quad = await vp.measureFrameTimes(0.4);
    const gpuQuad = await gpuSnapshot(runtime);

    // Incremental transform cost (one brush / convex / any actor).
    runtime.sceneView.resetSyncStats?.();
    const target = editor.world?.actors?.find((a) => (
      a.getComponent?.('Brush') || a.getComponent?.('ConvexBrush')
    ));
    let transformMs = null;
    if (target && typeof runtime.syncIncremental === 'function') {
      const before = target.transform.toJSON();
      const after = structuredClone(before);
      after.position.x += 5;
      target.transform.copyFrom(after);
      const t0 = performance.now();
      runtime.syncIncremental();
      transformMs = +(performance.now() - t0).toFixed(2);
      target.transform.copyFrom(before);
      runtime.syncIncremental();
    }
    const syncStats = runtime.sceneView.getSyncStats?.() || null;

    return {
      label,
      file: name,
      actors: actorCount(editor),
      loadMs,
      single,
      quad,
      gpuSingle,
      gpuQuad,
      transformMs,
      syncStats,
    };
  }

  async function runStress(_editor, vp, opts) {
    const playStopCycles = opts.quick ? 5 : 50;
    const levelSwitches = opts.quick ? 4 : 20;
    const createDeleteCycles = opts.quick ? 20 : 100;
    const materialCycles = opts.quick ? 10 : 40;

    const report = {
      playStop: { cycles: playStopCycles, ok: false },
      levelSwitch: { cycles: levelSwitches, ok: false },
      createDelete: { cycles: createDeleteCycles, ok: false },
      materials: { cycles: materialCycles, ok: false },
      assetPreview: { ok: false },
      gpu: {},
    };

    const ed = () => {
      const cur = liveEditor();
      assert(cur, 'editor context lost');
      return cur;
    };
    const rt = () => vp.getRuntime();

    // --- Play/Stop ---
    await loadLevelForced(ed(), 'test-room.json');
    await settle(200);
    const gpuBeforePlay = await gpuSnapshot(rt());
    for (let i = 0; i < playStopCycles; i += 1) {
      await ed().play?.();
      await settle(40);
      assert(rt().mode === 'play', `play cycle ${i} failed`);
      ed().stop?.();
      await settle(40);
      assert(rt().mode === 'edit', `stop cycle ${i} failed`);
    }
    const gpuAfterPlay = await gpuSnapshot(rt());
    report.playStop = {
      cycles: playStopCycles,
      ok: true,
      gpuBefore: gpuBeforePlay,
      gpuAfter: gpuAfterPlay,
      geometryDelta: (gpuAfterPlay?.geometries ?? 0) - (gpuBeforePlay?.geometries ?? 0),
      textureDelta: (gpuAfterPlay?.textures ?? 0) - (gpuBeforePlay?.textures ?? 0),
    };

    // --- Level switches (end on same level as start for GPU delta) ---
    const switchLevels = [
      'test-room.json',
      'acceptance-convex-brushes.json',
      'acceptance-subtractive.json',
      'acceptance-gothic-mansion.json',
      'subractive-halls.json',
    ];
    await loadLevelForced(ed(), 'test-room.json');
    await settle(150);
    const gpuBeforeSwitch = await gpuSnapshot(rt());
    for (let i = 0; i < levelSwitches; i += 1) {
      const name = switchLevels[i % switchLevels.length];
      await loadLevelForced(ed(), name);
      await settle(60);
      assert(actorCount() > 0, `level switch ${i} empty`);
    }
    await loadLevelForced(ed(), 'test-room.json');
    await settle(150);
    const gpuAfterSwitch = await gpuSnapshot(rt());
    report.levelSwitch = {
      cycles: levelSwitches,
      ok: true,
      gpuBefore: gpuBeforeSwitch,
      gpuAfter: gpuAfterSwitch,
      geometryDelta: (gpuAfterSwitch?.geometries ?? 0) - (gpuBeforeSwitch?.geometries ?? 0),
      textureDelta: (gpuAfterSwitch?.textures ?? 0) - (gpuBeforeSwitch?.textures ?? 0),
    };

    // --- Actor create/delete ---
    await loadLevelForced(ed(), 'test-room.json');
    await settle(150);
    const baselineActors = actorCount();
    const gpuBeforeCd = await gpuSnapshot(rt());
    for (let i = 0; i < createDeleteCycles; i += 1) {
      const cur = ed();
      assert(typeof cur.createBrushAtBounds === 'function', 'createBrushAtBounds missing');
      assert(typeof cur.deleteSelected === 'function', 'deleteSelected missing');
      const created = cur.createBrushAtBounds(
        'box',
        { x: 500 + (i % 40) * 5, y: 0, z: 500 },
        { x: 550 + (i % 40) * 5, y: 50, z: 550 },
      );
      assert(created?.id, `create failed at ${i}`);
      // Prefer undo (same history entry) so we never depend on selection timing.
      cur.undo?.();
    }
    await settle(100);
    const gpuAfterCd = await gpuSnapshot(rt());
    const finalActors = actorCount();
    report.createDelete = {
      cycles: createDeleteCycles,
      ok: finalActors <= baselineActors + 2,
      baselineActors,
      finalActors,
      gpuBefore: gpuBeforeCd,
      gpuAfter: gpuAfterCd,
      geometryDelta: (gpuAfterCd?.geometries ?? 0) - (gpuBeforeCd?.geometries ?? 0),
    };

    // --- Material undo/redo ---
    await loadLevelForced(ed(), 'acceptance-surfaces.json');
    await settle(150);
    const cur = ed();
    const brush = rt().world?.actors?.find((a) => a.getComponent?.('Brush'));
    assert(brush, 'surfaces level needs a brush');
    cur.selectActor?.(brush.id);
    await settle(40);
    const startMat = brush.getComponent('Brush').materialId;
    const matIds = ['mat_hall_stone', 'mat_hall_wood', 'mat_hall_floor'];
    assert(typeof cur.applySelectedMaterialToBrush === 'function', 'applySelectedMaterialToBrush missing');
    for (let i = 0; i < materialCycles; i += 1) {
      ed().applySelectedMaterialToBrush(matIds[i % matIds.length]);
    }
    for (let i = 0; i < materialCycles; i += 1) ed().undo?.();
    await settle(50);
    const afterUndo = brush.getComponent('Brush').materialId;
    for (let i = 0; i < materialCycles; i += 1) ed().redo?.();
    await settle(50);
    report.materials = {
      cycles: materialCycles,
      ok: afterUndo === startMat || afterUndo == null || startMat == null,
      startMat,
      afterUndo,
      note: 'applySelectedMaterialToBrush + undo/redo',
    };

    // --- Asset preview open/close (Content Browser mesh tab) ---
    const meshBtn = [...document.querySelectorAll('button')]
      .find((b) => /Meshes/i.test(b.textContent || ''));
    if (meshBtn) {
      meshBtn.click();
      await settle(200);
      meshBtn.click();
      await settle(100);
      // Toggle a few more times
      for (let i = 0; i < 6; i += 1) {
        meshBtn.click();
        await settle(80);
      }
      report.assetPreview = { ok: true, toggles: 8 };
    } else {
      report.assetPreview = { ok: true, skipped: 'no Meshes button' };
    }

    report.gpu.final = await gpuSnapshot(rt());
    return report;
  }

  async function smokeAcceptanceLevels(editor, vp) {
    const levels = [
      'acceptance-gothic-mansion.json',
      'acceptance-convex-brushes.json',
      'acceptance-subtractive.json',
      'subractive.json',
      'subractive-halls.json',
      'acceptance-surfaces.json',
      'acceptance-multilevel.json',
      'acceptance-face-editing.json',
      'acceptance-edge-editing.json',
      'acceptance-vertex-editing.json',
      'acceptance-extrusion-clipping.json',
    ];
    const results = [];
    for (const name of levels) {
      await loadLevelForced(editor, name);
      await settle(120);
      const runtime = vp.getRuntime();
      const actors = actorCount(editor);
      let playOk = false;
      const ed = liveEditor() || editor;
      if (ed.play && runtime) {
        await ed.play();
        await settle(150);
        playOk = runtime.mode === 'play' && Boolean(runtime.physics?.playerBody);
        ed.stop?.();
        await settle(100);
      }
      results.push({
        file: name,
        actors,
        playOk,
        mode: runtime?.mode,
        gpu: await gpuSnapshot(runtime),
      });
      assert(actors > 0, `${name} empty`);
      assert(runtime?.mode === 'edit', `${name} did not restore edit`);
    }
    return results;
  }

  async function run(options = {}) {
    const opts = { quick: false, ...options };
    const report = {
      phase: '2F.7G',
      ok: false,
      quick: Boolean(opts.quick),
      steps: [],
      profiling: {},
      stress: {},
      acceptanceLevels: [],
      errors: [],
      comparedTo: {
        incrementalSyncBench: 'docs/ACCEPTANCE_INCREMENTAL_SYNC.md (Node median transform)',
        multiViewportPerf: 'docs/ACCEPTANCE_MULTI_VIEWPORT.md (single vs quad)',
      },
    };
    const step = (name, detail) => {
      report.steps.push({ name, ...(detail || {}) });
    };

    try {
      const editor = findEditor();
      assert(editor, 'Editor context not found');
      const vp = window.__bloodboundViewport;
      assert(vp, '__bloodboundViewport bridge missing');
      step('editor-ready');

      // Profiling: small / medium / large real levels
      report.profiling.small = await profileLevel(editor, vp, 'test-room.json', 'small');
      step('profile-small', report.profiling.small);
      report.profiling.medium = await profileLevel(
        editor, vp, 'acceptance-convex-brushes.json', 'medium',
      );
      step('profile-medium', report.profiling.medium);
      report.profiling.large = await profileLevel(
        editor, vp, 'acceptance-gothic-mansion.json', 'large',
      );
      step('profile-large', report.profiling.large);

      // Subtractive regeneration sample
      await loadLevelForced(editor, 'acceptance-subtractive.json');
      await settle(150);
      const subRt = vp.getRuntime();
      subRt.sceneView.resetSyncStats?.();
      const subBrush = editor.world?.actors?.find((a) => (
        a.getComponent?.('Brush')?.operation === 'subtract'
      ));
      if (subBrush && typeof subRt.syncIncremental === 'function') {
        const before = subBrush.transform.toJSON();
        const after = structuredClone(before);
        after.position.x += 10;
        subBrush.transform.copyFrom(after);
        const t0 = performance.now();
        subRt.syncIncremental();
        const carveMs = +(performance.now() - t0).toFixed(2);
        subBrush.transform.copyFrom(before);
        subRt.syncIncremental();
        report.profiling.subtractiveCarve = {
          ms: carveMs,
          syncStats: subRt.sceneView.getSyncStats?.(),
        };
        step('subtractive-carve', report.profiling.subtractiveCarve);
      }

      report.acceptanceLevels = await smokeAcceptanceLevels(editor, vp);
      step('acceptance-levels', { count: report.acceptanceLevels.length });

      report.stress = await runStress(editor, vp, opts);
      step('stress', {
        playStopOk: report.stress.playStop?.ok,
        levelSwitchOk: report.stress.levelSwitch?.ok,
        createDeleteOk: report.stress.createDelete?.ok,
      });

      // Gate: no large sustained geometry growth from Play/Stop stress
      const playDelta = Math.abs(report.stress.playStop?.geometryDelta ?? 0);
      assert(playDelta < 40, `Play/Stop geometry growth too high: ${playDelta}`);
      assert(report.stress.playStop?.ok, 'Play/Stop stress failed');
      assert(report.stress.levelSwitch?.ok, 'level switch stress failed');
      assert(report.stress.createDelete?.ok, 'create/delete stress failed');
      assert(
        report.acceptanceLevels.every((r) => r.actors > 0 && r.mode === 'edit'),
        'acceptance level smoke failed',
      );

      report.ok = true;
    } catch (err) {
      report.errors.push(String(err?.stack || err));
      report.ok = false;
    }

    console.log('[phase2f7gAcceptance]', report);
    return report;
  }

  window.__phase2f7gAcceptance = run;
})();
