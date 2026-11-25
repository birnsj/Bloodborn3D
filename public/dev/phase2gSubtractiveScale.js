/**
 * Phase 2G subtractive-scale browser evaluation.
 *
 *   await import('/dev/phase2gSubtractiveScale.js')
 *   await window.__phase2gSubtractiveScale()
 *   await window.__phase2gSubtractiveScale({ quick: true })
 *
 * Temporarily sets globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS per case, then clears it.
 */
(function phase2gSubtractiveScale() {
  const ROOM_COUNTS = [25, 50, 100, 200];
  const DEFAULT_CAPS = [64, 128, 256, 512, 1024];

  function settle(ms = 80) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function gpuSnapshot(runtime) {
    const info = runtime?.sceneView?.renderer?.info;
    if (!info) return null;
    return {
      geometries: info.memory?.geometries ?? null,
      textures: info.memory?.textures ?? null,
      programs: info.programs?.length ?? null,
      drawCalls: info.render?.calls ?? null,
      triangles: info.render?.triangles ?? null,
    };
  }

  async function profileWorld(vp, world, label, cap) {
    globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = cap;
    const runtime = vp.getRuntime();
    const tLoad0 = performance.now();
    runtime.setWorld(world);
    const loadMs = +(performance.now() - tLoad0).toFixed(1);
    await settle(150);

    vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    await settle(100);
    const single = await vp.measureFrameTimes(0.45);
    const gpuSingle = gpuSnapshot(runtime);

    vp.setPrefs({ layoutMode: 'quad' });
    await settle(100);
    const quad = await vp.measureFrameTimes(0.45);
    const gpuQuad = gpuSnapshot(runtime);

    const cutter = world.actors.find((a) => a.tags?.includes('maze-room'))
      || world.actors.find((a) => a.getComponent?.('Brush')?.operation === 'subtract');
    let editMs = null;
    let syncStats = null;
    if (cutter && typeof runtime.syncIncremental === 'function') {
      runtime.sceneView.resetSyncStats?.();
      const before = cutter.transform.toJSON();
      const after = structuredClone(before);
      after.position.x += 25;
      cutter.transform.copyFrom(after);
      const t0 = performance.now();
      runtime.syncIncremental();
      editMs = +(performance.now() - t0).toFixed(2);
      cutter.transform.copyFrom(before);
      runtime.syncIncremental();
      syncStats = runtime.sceneView.getSyncStats?.() || null;
    }

    let playMs = null;
    let playErr = null;
    let colliderHint = null;
    try {
      const tP0 = performance.now();
      await runtime.play();
      playMs = +(performance.now() - tP0).toFixed(1);
      const bodies = runtime.physics?._bodies;
      if (bodies) {
        let n = 0;
        for (const e of bodies.values()) n += e.colliders?.length || 0;
        colliderHint = n;
      }
      await runtime.stop();
      await settle(80);
    } catch (err) {
      playErr = String(err?.message || err);
      try { await runtime.stop(); } catch { /* ignore */ }
    }

    return {
      label,
      cap,
      actors: world.actors.length,
      loadMs,
      single,
      quad,
      gpuSingle,
      gpuQuad,
      editMs,
      syncStats,
      playMs,
      playErr,
      colliderHint,
      meta: world._benchMeta || null,
    };
  }

  window.__phase2gSubtractiveScale = async function phase2gSubtractiveScaleRun(opts = {}) {
    const caps = opts.caps || DEFAULT_CAPS;
    const rooms = opts.rooms || ROOM_COUNTS;
    const includeFlush = opts.includeFlush !== false;
    const quick = Boolean(opts.quick);

    const vp = window.__bloodboundViewport;
    if (!vp?.getRuntime || !vp.measureFrameTimes) {
      throw new Error('__bloodboundViewport bridge missing — open the editor first');
    }

    const [
      { buildRepresentativeWorld, buildFlushWorld },
      { serializeLevel },
      { deserializeLevel },
      { getBrushRenderSolids },
    ] = await Promise.all([
      import('/src/dev/phase2gSubtractiveScaleWorlds.js'),
      import('/src/serialization/LevelSerializer.js'),
      import('/src/serialization/LevelDeserializer.js'),
      import('/src/runtime/brushGeometry.js'),
    ]);

    const useRooms = quick ? [25, 50] : rooms;
    const useCaps = quick ? [64, 256, 1024] : caps;
    const rows = [];
    const prevOverride = globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;

    try {
      for (const n of useRooms) {
        const variants = [];
        if (includeFlush) variants.push(['flush', buildFlushWorld(n)]);
        variants.push(['rep', buildRepresentativeWorld(n)]);

        for (const [kind, world] of variants) {
          const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
          const unc = getBrushRenderSolids(solid.getComponent('Brush'), {
            world,
            actor: solid,
            maxSolids: 1e9,
          });

          for (const cap of useCaps) {
            if (unc.solids.length > cap && !opts.forceOverCap) {
              rows.push({
                label: `${kind}-${n}`,
                cap,
                skipped: true,
                reason: `needs ${unc.solids.length} solids`,
                unconstrainedSolids: unc.solids.length,
              });
              continue;
            }
            const data = serializeLevel(world);
            const clone = deserializeLevel(data, { validateGeometry: false });
            clone._benchMeta = world._benchMeta;
            const row = await profileWorld(vp, clone, `${kind}-${n}`, cap);
            row.unconstrainedSolids = unc.solids.length;
            rows.push(row);
          }
        }
      }
    } finally {
      if (prevOverride == null) delete globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;
      else globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = prevOverride;
      vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
    }

    const report = {
      ok: rows.every((r) => r.skipped || (!r.playErr && r.single)),
      generatedAt: new Date().toISOString(),
      quick,
      rows,
    };
    window.__phase2gScaleReport = report;
    return report;
  };

  console.info('[phase2gSubtractiveScale] ready — await window.__phase2gSubtractiveScale()');
}());
