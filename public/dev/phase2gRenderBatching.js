/**
 * Phase 2G subtractive rendering experiment — browser before/after.
 *
 *   await import('/dev/phase2gRenderBatching.js')
 *   await window.__phase2gRenderBatching({ rooms: [25, 50], kinds: ['flush', 'rep'] })
 *
 * For each world, three modes are rendered from the same full scene sync:
 *   baseline       shipped per-solid meshes
 *   batched        World Solid batched (__BLOODBOUND_BATCH_WORLD_SOLID)
 *   batchedShared  batched + shared cutter wireframe materials
 *
 * Frame cost is measured with synchronous render loops + gl.finish(), so it is not
 * distorted by requestAnimationFrame throttling in a background automation tab.
 * Pixel comparison is against the baseline render of the same camera pose.
 */
(function phase2gRenderBatching() {
  const MODES = {
    baseline: { batch: false, share: false },
    batched: { batch: true, share: false },
    batchedShared: { batch: true, share: true },
  };

  const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const round = (n, d = 2) => (n == null ? null : +n.toFixed(d));

  function setFlags({ batch, share }) {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = batch;
    globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS = share;
  }

  /** Walk prototypes to a base class by name (Three classes are not exposed globally). */
  function baseClass(instance, name) {
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto.constructor?.name !== name) proto = Object.getPrototypeOf(proto);
    return proto?.constructor || null;
  }

  function makeIdProbes(sceneView) {
    let Material = null;
    let Geometry = null;
    let Texture = null;
    sceneView.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      Material = Material || (m && baseClass(m, 'Material'));
      Geometry = Geometry || baseClass(o.geometry, 'BufferGeometry');
      Texture = Texture || (m?.map && baseClass(m.map, 'Texture'));
    });
    return {
      material: () => (Material ? new Material().id : null),
      geometry: () => (Geometry ? new Geometry().id : null),
      texture: () => (Texture ? new Texture().id : null),
    };
  }

  function sceneStats(sceneView) {
    const mats = new Set();
    const geos = new Set();
    const texs = new Set();
    let meshes = 0;
    let drawUnits = 0;
    sceneView.root.traverse((o) => {
      if (!o.geometry) return;
      geos.add(o.geometry);
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m) continue;
        mats.add(m);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          if (m[k]) texs.add(m[k]);
        }
      }
      if (o.isMesh) {
        meshes += 1;
        if (Array.isArray(o.material) && o.geometry.groups.length) {
          drawUnits += o.geometry.groups.filter((g) => g.count > 0).length;
        } else {
          drawUnits += 1;
        }
      } else {
        drawUnits += 1;
      }
    });
    return {
      meshes,
      drawUnits,
      liveMaterials: mats.size,
      liveGeometries: geos.size,
      liveTextureObjects: texs.size,
    };
  }

  function frameCost(runtime, gl, quad, runs = 12) {
    const sv = runtime.sceneView;
    const draw = () => {
      if (quad && runtime.viewportPanes?.length) sv.renderViewports(runtime.viewportPanes);
      else sv.render(sv.camera);
    };
    draw(); // warm programs / uploads
    gl.finish();
    const times = [];
    for (let i = 0; i < runs; i += 1) {
      const t0 = performance.now();
      draw();
      gl.finish();
      times.push(performance.now() - t0);
    }
    const info = sv.renderer.info.render;
    return {
      medianMs: round(median(times)),
      minMs: round(Math.min(...times)),
      lastPassCalls: info.calls,
      lastPassTriangles: info.triangles,
    };
  }

  function readFrame(sv, cam, gl) {
    sv.render(cam);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { w, h, buf };
  }

  function diffFrames(a, b) {
    if (!a || !b || a.w !== b.w || a.h !== b.h) return { comparable: false };
    let sum = 0;
    let diff = 0;
    let maxDelta = 0;
    const n = a.w * a.h;
    for (let i = 0; i < n; i += 1) {
      const o = i * 4;
      const d = Math.max(
        Math.abs(a.buf[o] - b.buf[o]),
        Math.abs(a.buf[o + 1] - b.buf[o + 1]),
        Math.abs(a.buf[o + 2] - b.buf[o + 2]),
      );
      sum += d;
      if (d > 8) diff += 1;
      if (d > maxDelta) maxDelta = d;
    }
    return {
      comparable: true,
      pixels: n,
      meanAbsDelta: round(sum / n, 4),
      pctPixelsOver8: round((diff / n) * 100, 4),
      maxDelta,
    };
  }

  /** Camera poses inside / above the map so walls, floors and ceilings are all in frame. */
  function poses(world) {
    const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
    const size = solid.getComponent('Brush').size;
    const p = solid.transform.position;
    const rooms = world.actors.filter((a) => a.tags?.includes('maze-room'));
    const r0 = rooms[0]?.transform.position || { x: p.x, y: 150, z: p.z };
    const rMid = rooms[Math.floor(rooms.length / 2)]?.transform.position || r0;
    const m = (v) => v / 100;
    return [
      {
        name: 'overview',
        pos: [m(p.x), m(p.y + Math.max(size.x, size.z) * 0.55), m(p.z + Math.max(size.x, size.z) * 0.45)],
        look: [m(p.x), m(p.y), m(p.z)],
      },
      { name: 'room0-x', pos: [m(r0.x), 1.6, m(r0.z)], look: [m(r0.x + 400), 1.6, m(r0.z)] },
      { name: 'roomMid-z', pos: [m(rMid.x), 1.6, m(rMid.z)], look: [m(rMid.x), 1.2, m(rMid.z + 400)] },
    ];
  }

  function cameraFor(sv, pose) {
    const cam = sv.camera.clone();
    cam.position.set(...pose.pos);
    cam.lookAt(...pose.look);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix?.();
    return cam;
  }

  /** Surface id the hit normal implies (world-space outward normal → face key). */
  function faceKeyFromNormal(n) {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return n.x > 0 ? 'px' : 'nx';
    if (ay >= ax && ay >= az) return n.y > 0 ? 'py' : 'ny';
    return n.z > 0 ? 'pz' : 'nz';
  }

  function pickAudit(sv, world, cams) {
    const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
    let hits = 0;
    let correct = 0;
    let missing = 0;
    for (const cam of cams) {
      for (let ix = -4; ix <= 4; ix += 1) {
        for (let iy = -4; iy <= 4; iy += 1) {
          const nx = ix * 0.2;
          const ny = iy * 0.2;
          const surf = sv.pickSurface(nx, ny, cam);
          const hit = sv.pickWorldHits(nx, ny, cam).find((h) => !h.editorOnly);
          if (!surf || surf.actorId !== solid.id || !hit || hit.actorId !== solid.id) continue;
          hits += 1;
          if (!surf.surfaceId) missing += 1;
          else if (surf.surfaceId === faceKeyFromNormal(hit.normal)) correct += 1;
        }
      }
    }
    return { hits, correct, missing, correctPct: hits ? round((correct / hits) * 100, 1) : null };
  }

  async function measureMode({ vp, runtime, gl, world, modeName, referenceFrames, gameReference }) {
    const sv = runtime.sceneView;
    setFlags(MODES[modeName]);

    // Full sync = build all visuals + async material loads. Count what it allocates.
    const probes = makeIdProbes(sv);
    const mat0 = probes.material();
    const geo0 = probes.geometry();
    const tex0 = probes.texture();
    const memBefore = { ...sv.renderer.info.memory };
    const t0 = performance.now();
    runtime.setWorld(world);
    const syncMs = performance.now() - t0;
    await settle(700);
    // Build a fresh probe set from the new scene in case the first world had no textures.
    const probes2 = makeIdProbes(sv);
    const mat1 = probes2.material() ?? probes.material();
    const geo1 = probes2.geometry() ?? probes.geometry();
    const tex1 = probes2.texture() ?? probes.texture();

    vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    await settle(120);
    const single = frameCost(runtime, gl, false);
    const infoSingle = { ...sv.renderer.info.render };
    const memAfter = { ...sv.renderer.info.memory };

    vp.setPrefs({ layoutMode: 'quad' });
    await settle(200);
    const quad = frameCost(runtime, gl, true);
    vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    await settle(120);

    // Edit latency: cutter nudge → incremental sync (rebuilds World Solid) → render.
    const cutter = world.actors.find((a) => a.tags?.includes('maze-room'))
      || world.actors.find((a) => a.getComponent?.('Brush')?.operation === 'subtract');
    const syncOnly = [];
    const syncRender = [];
    for (let i = 0; i < 5; i += 1) {
      const before = cutter.transform.toJSON();
      const after = structuredClone(before);
      after.position.x += 25;
      cutter.transform.copyFrom(after);
      sv.resetSyncStats?.();
      const s0 = performance.now();
      runtime.syncIncremental();
      const s1 = performance.now();
      sv.render(sv.camera);
      gl.finish();
      const s2 = performance.now();
      syncOnly.push(s1 - s0);
      syncRender.push(s2 - s0);
      cutter.transform.copyFrom(before);
      runtime.syncIncremental();
      await settle(30);
    }
    const editStats = sv.getSyncStats?.() || null;
    await settle(300);

    const cams = poses(world).map((p) => cameraFor(sv, p));
    const frames = cams.map((cam) => readFrame(sv, cam, gl));
    const diffs = referenceFrames ? frames.map((f, i) => diffFrames(referenceFrames[i], f)) : null;
    const pick = pickAudit(sv, world, cams);

    // Game-view render (no editor overlays). Edit-mode cutter fills are coplanar with
    // exposed faces, so edit-mode pixel diffs are dominated by overlay z-fighting.
    sv.setEditMode(false);
    runtime.setWorld(world);
    await settle(900);
    const gameFrames = cams.map((cam) => readFrame(sv, cam, gl));
    const gameDiffs = gameReference ? gameFrames.map((f, i) => diffFrames(gameReference[i], f)) : null;
    sv.setEditMode(true);
    runtime.setWorld(world);
    await settle(400);

    let playMs = null;
    let colliders = null;
    let playErr = null;
    try {
      const p0 = performance.now();
      await runtime.play();
      playMs = round(performance.now() - p0, 1);
      let n = 0;
      for (const e of runtime.physics?._bodies?.values?.() || []) n += e.colliders?.length || 0;
      colliders = n;
      await runtime.stop();
      await settle(100);
    } catch (err) {
      playErr = String(err?.message || err);
      try { await runtime.stop(); } catch { /* ignore */ }
    }

    const live = sceneStats(sv);
    return {
      mode: modeName,
      created: {
        materials: mat1 != null && mat0 != null ? mat1 - mat0 - 1 : null,
        geometries: geo1 != null && geo0 != null ? geo1 - geo0 - 1 : null,
        textureObjects: tex1 != null && tex0 != null ? tex1 - tex0 - 1 : null,
      },
      live,
      gpu: {
        geometries: memAfter.geometries,
        textures: memAfter.textures,
        geometriesDelta: memAfter.geometries - memBefore.geometries,
        texturesDelta: memAfter.textures - memBefore.textures,
        drawCalls: infoSingle.calls,
        triangles: infoSingle.triangles,
      },
      syncMs: round(syncMs, 1),
      single,
      quad,
      edit: {
        syncOnlyMedianMs: round(median(syncOnly)),
        syncPlusRenderMedianMs: round(median(syncRender)),
        stats: editStats,
      },
      play: { ms: playMs, colliders, err: playErr },
      pixelDiffVsBaseline: diffs,
      gameViewPixelDiffVsBaseline: gameDiffs,
      pick,
      heapMB: performance.memory ? round(performance.memory.usedJSHeapSize / 1048576, 1) : null,
      _frames: frames,
      _gameFrames: gameFrames,
    };
  }

  window.__phase2gRenderBatching = async function run(opts = {}) {
    const vp = window.__bloodboundViewport;
    if (!vp?.getRuntime) throw new Error('__bloodboundViewport bridge missing — open the editor first');
    const runtime = vp.getRuntime();
    const gl = runtime.sceneView.renderer.getContext();
    const rooms = opts.rooms || [25, 50, 100, 200];
    const kinds = opts.kinds || ['flush', 'rep'];
    const modes = opts.modes || Object.keys(MODES);

    const { buildFlushWorld, buildRepresentativeWorld } = await import('/src/dev/phase2gSubtractiveScaleWorlds.js');
    const prevCap = globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;
    globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = 4096;

    const results = [];
    try {
      for (const n of rooms) {
        for (const kind of kinds) {
          const world = kind === 'flush' ? buildFlushWorld(n) : buildRepresentativeWorld(n);
          let reference = null;
          let gameRef = null;
          const row = { label: `${kind}-${n}`, rooms: world._benchMeta?.roomCount, actors: world.actors.length, modes: {} };
          for (const modeName of modes) {
            const r = await measureMode({
              vp, runtime, gl, world, modeName, referenceFrames: reference, gameReference: gameRef,
            });
            if (!reference) reference = r._frames;
            if (!gameRef) gameRef = r._gameFrames;
            delete r._frames;
            delete r._gameFrames;
            row.modes[modeName] = r;
          }
          results.push(row);
          window.__renderBatchingPartial = results;
        }
      }
    } finally {
      delete globalThis.__BLOODBOUND_BATCH_WORLD_SOLID;
      delete globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS;
      if (prevCap == null) delete globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;
      else globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = prevCap;
      vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    }
    window.__renderBatchingReport = { generatedAt: new Date().toISOString(), results };
    return window.__renderBatchingReport;
  };

  console.info('[phase2gRenderBatching] ready — await window.__phase2gRenderBatching()');
}());
