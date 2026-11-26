/**
 * Pre-Batch 8 performance profiling + post-fix verification.
 * CDP: import('/src/dev/performanceStabilization.js').then(m => m.runPerformanceStabilization())
 *
 * Uses acceptance-integrated-editor.json. Does not mutate acceptance-gothic-mansion.json.
 */
const LEVEL = 'acceptance-integrated-editor.json';

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
    if (!f || d > 160 || found) return;
    if (seen.has(f)) return;
    seen.add(f);
    const p = f.memoizedProps;
    if (p?.value && need(p.value)) {
      found = p.value;
      return;
    }
    walk(f.child, d + 1);
    walk(f.sibling, d + 1);
  }
  walk(fiber);
  return found;
}

const editor = () => findCtx((v) => v.createBrushAtBounds && v.world && v.play);

async function loadLevelForced(ed, name) {
  if (ed.loadLevelUnchecked) return ed.loadLevelUnchecked(name);
  const res = await fetch(`/levels/${name}`);
  if (!res.ok) throw new Error(`fetch ${name}: ${res.status}`);
  const data = await res.json();
  return ed.applyLevelData(data, {
    fileName: name,
    session: { kind: 'project', readOnlyDisk: false, lessonId: null, displayName: name },
    statusMessage: `Loaded ${name}`,
  });
}

function mem() {
  const m = performance.memory;
  if (!m) return null;
  return {
    usedJSHeapMB: +(m.usedJSHeapSize / 1048576).toFixed(2),
    totalJSHeapMB: +(m.totalJSHeapSize / 1048576).toFixed(2),
  };
}

function conditions() {
  const vp = window.__bloodboundViewport;
  const rt = vp?.getRuntime?.();
  const renderer = rt?.sceneView?.renderer;
  const canvas = renderer?.domElement;
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    dpr: window.devicePixelRatio,
    rendererDpr: renderer?.getPixelRatio?.() ?? null,
    canvasCss: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
    canvasBuf: canvas ? { w: canvas.width, h: canvas.height } : null,
    shell: vp?.getShellSize?.() ?? null,
    shadowMap: renderer?.shadowMap ? {
      enabled: renderer.shadowMap.enabled,
      autoUpdate: renderer.shadowMap.autoUpdate,
      type: renderer.shadowMap.type,
    } : null,
    vsyncNote: 'rAF-coupled; averages include compositor. Prefer median/p95.',
    automationNote: 'Cursor browser tab may throttle; warm-up frames discarded.',
  };
}

async function measureLayout(vp, layoutMode, seconds = 0.7) {
  vp.setPrefs({ layoutMode });
  await sleep(180);
  await frame();
  const times = await vp.measureFrameTimes(seconds, { warmupFrames: 18 });
  const gpu = await vp.measureGpuSnapshot();
  return { layoutMode, times, gpu };
}

/**
 * Temporary A/B feature disables for profiling only — always restored.
 */
async function abPassBreakdown(ed, vp) {
  const sv = ed.runtimeRef?.current?.sceneView;
  if (!sv || !vp?.measureGpuSnapshot) return null;

  vp.setPrefs({ layoutMode: 'quad' });
  await sleep(200);

  const rows = [];
  const snapshot = async (label) => {
    const gpu = await vp.measureGpuSnapshot();
    rows.push({ label, ...gpu });
  };

  await snapshot('baseline_quad');

  const prevShadow = sv.renderer.shadowMap.enabled;
  sv.renderer.shadowMap.enabled = false;
  await snapshot('shadows_off');
  sv.renderer.shadowMap.enabled = prevShadow;

  const prevPpPreview = sv.postProcessingPreview;
  sv.postProcessingPreview = false;
  await snapshot('pp_preview_off');
  sv.postProcessingPreview = prevPpPreview;

  const prevAtmo = sv.atmosphere;
  const atmoStub = {
    setPerspectiveVisible() {},
    update() {},
    captureDepth() {},
    applyFogSettings() {},
  };
  sv.atmosphere = atmoStub;
  await snapshot('atmosphere_stubbed');
  sv.atmosphere = prevAtmo;

  const prevOverlays = sv._showEditorOverlays;
  sv._showEditorOverlays = () => false;
  if (sv.gridHelper) sv.gridHelper.visible = false;
  if (sv.gizmo?.root) sv.gizmo.root.visible = false;
  await snapshot('overlays_hidden');
  sv._showEditorOverlays = prevOverlays;
  if (sv.gridHelper) sv.gridHelper.visible = true;
  if (sv.gizmo?.root) sv.gizmo.root.visible = true;

  vp.setPrefs({ layoutMode: 'single' });
  await sleep(120);
  await snapshot('baseline_single');

  return rows;
}

async function memoryCycles(ed, vp) {
  const report = { cycles: [], gcSupported: typeof performance.measureUserAgentSpecificMemory === 'function' };
  const cube = { id: 'mesh_verify_cube', name: 'Verify Cube', meta: {} };

  const snap = (label) => {
    const rt = ed.runtimeRef?.current;
    const info = rt?.sceneView?.renderer?.info;
    report.cycles.push({
      label,
      heap: mem(),
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      actors: ed.world?.actors?.length ?? 0,
    });
  };

  snap('start');

  // Place/delete churn
  for (let i = 0; i < 20; i += 1) {
    const a = ed.placeMeshAsset?.(cube, { x: 1500 + i * 20, y: 50, z: 0 }, { collidable: false });
    if (a) {
      ed.selectActor(a.id);
      ed.deleteSelected?.();
    }
  }
  await frame();
  ed = editor();
  snap('after_place_delete_20');

  // Layout switch churn
  for (const mode of ['quad', 'dual-h', 'single', 'quad', 'single']) {
    vp.setPrefs({ layoutMode: mode });
    await sleep(80);
  }
  snap('after_layout_switch');

  // Play/Stop
  await ed.play?.();
  await sleep(400);
  ed = editor();
  ed.stop?.();
  await sleep(300);
  ed = editor();
  snap('after_play_stop');

  // Undo/redo noise
  const tmp = ed.placeMeshAsset?.(cube, { x: 1600, y: 50, z: 50 }, { collidable: false });
  if (tmp) {
    ed.selectActor(tmp.id);
    ed.updateSelectedTransform?.({ position: { x: 1625, y: 50, z: 50 } }, { snap: true });
    ed.undo?.();
    ed.redo?.();
    ed.selectActor(tmp.id);
    ed.deleteSelected?.();
  }
  await frame();
  ed = editor();
  snap('after_undo_redo');

  // Force GC hint if available (Chrome --js-flags=--expose-gc only)
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    await sleep(50);
    snap('after_gc');
  }

  const first = report.cycles[0]?.heap?.usedJSHeapMB;
  const last = report.cycles[report.cycles.length - 1]?.heap?.usedJSHeapMB;
  report.deltaMB = first != null && last != null ? +(last - first).toFixed(2) : null;
  return report;
}

async function syncProfile(ed) {
  const rt = ed.runtimeRef?.current;
  const sv = rt?.sceneView;
  if (!sv) return null;
  const statsBefore = { ...(sv.syncStats || {}) };

  const timeOp = async (label, fn) => {
    const t0 = performance.now();
    await fn();
    await frame();
    return { label, ms: +(performance.now() - t0).toFixed(2) };
  };

  const rows = [];
  const actors = ed.world?.actors || [];
  const brush = actors.find((a) => a.getComponent?.('Brush') && a.getComponent('Brush').operation !== 'subtract');
  const mesh = actors.find((a) => a.getComponent?.('StaticMesh'));
  const light = actors.find((a) => a.getComponent?.('Light'));

  if (brush) {
    rows.push(await timeOp('select_brush', () => { ed.selectActor(brush.id); }));
    rows.push(await timeOp('transform_nudge', () => {
      ed.selectActor(brush.id);
      const p = brush.transform?.position || { x: 0, y: 0, z: 0 };
      ed.updateSelectedTransform?.({ position: { x: p.x + 25, y: p.y, z: p.z } }, { snap: true });
      ed.updateSelectedTransform?.({ position: { ...p } }, { snap: true });
    }));
    rows.push(await timeOp('material_assign', () => {
      ed.selectActor(brush.id);
      ed.applySelectedMaterialToBrush?.('mat_hall_wood');
    }));
  }
  if (mesh) {
    rows.push(await timeOp('pivot_preset', () => {
      ed.selectActor(mesh.id);
      ed.applyPivotPresetToSelected?.('bottomCenter');
    }));
  }
  if (light) {
    rows.push(await timeOp('light_intensity', () => {
      ed.selectActor(light.id);
      ed.updateSelectedLight?.({ intensity: 2.1 });
    }));
  }
  rows.push(await timeOp('place_delete', () => {
    const a = ed.placeMeshAsset?.(
      { id: 'mesh_verify_cube', name: 'Verify Cube' },
      { x: 1700, y: 50, z: 0 },
      { collidable: false },
    );
    if (a) {
      ed.selectActor(a.id);
      ed.deleteSelected?.();
    }
  }));
  rows.push(await timeOp('undo_redo', () => {
    ed.undo?.();
    ed.redo?.();
  }));

  const statsAfter = { ...(sv.syncStats || {}) };
  return {
    ops: rows,
    syncStatsDelta: {
      fullSyncs: (statsAfter.fullSyncs || 0) - (statsBefore.fullSyncs || 0),
      incrementalSyncs: (statsAfter.incrementalSyncs || 0) - (statsBefore.incrementalSyncs || 0),
      actorRebuilds: (statsAfter.actorRebuilds || 0) - (statsBefore.actorRebuilds || 0),
      transformUpdates: (statsAfter.transformUpdates || 0) - (statsBefore.transformUpdates || 0),
    },
  };
}

export async function runPerformanceStabilization() {
  const report = {
    startedAt: new Date().toISOString(),
    level: LEVEL,
    ok: true,
    conditions: null,
    instrumentationNotes: [
      'renderer.info accumulates across shadow maps, depth prepasses, PP, and prior frames unless info.reset() is called.',
      'measureGpuSnapshot resets info then issues one renderViewports/render pass.',
      'FPS from rAF includes browser compositing; median/p95 preferred over average.',
      'Integrated baseline (8b4ded6) used avg FPS without warm-up or info.reset — not directly comparable without caveats.',
    ],
    baselineDocumented: {
      commit: '8b4ded6',
      singleFps: 70.1,
      singleFrameMs: 14.3,
      quadFps: 14.5,
      quadFrameMs: 68.8,
      drawCalls: 4186,
      triangles: 123325,
      heapDeltaMB: 39.9,
      note: 'Draw calls were cumulative (no info.reset); heap included intentional LOD/prefab asset growth.',
    },
    layouts: {},
    abBreakdown: null,
    syncProfile: null,
    memory: null,
    acceptanceSmoke: {},
    defects: [],
  };

  try {
    let ed = editor();
    if (!ed) throw new Error('EditorContext not found');
    const vp = window.__bloodboundViewport;
    if (!vp?.measureFrameTimes) throw new Error('__bloodboundViewport bridge missing');

    await loadLevelForced(ed, LEVEL);
    await sleep(500);
    ed = editor();
    report.conditions = conditions();
    report.actorCount = ed.world?.actors?.length ?? 0;

    report.layouts.single = await measureLayout(vp, 'single', 0.75);
    report.layouts.dual = await measureLayout(vp, 'dual-h', 0.55);
    report.layouts.quad = await measureLayout(vp, 'quad', 0.75);

    report.abBreakdown = await abPassBreakdown(ed, vp);
    ed = editor();
    report.syncProfile = await syncProfile(ed);
    ed = editor();
    report.memory = await memoryCycles(ed, vp);

    // Acceptance smoke: save/reload + play/stop
    ed = editor();
    ed.setLevelName?.(LEVEL);
    await ed.saveLevel?.();
    await sleep(200);
    await loadLevelForced(ed, LEVEL);
    await sleep(400);
    ed = editor();
    report.acceptanceSmoke.reloadActors = ed.world?.actors?.length ?? 0;
    await ed.play?.();
    await sleep(600);
    ed = editor();
    report.acceptanceSmoke.playMode = ed.mode;
    ed.stop?.();
    await sleep(300);
    ed = editor();
    report.acceptanceSmoke.stopMode = ed.mode;
    report.acceptanceSmoke.actorsAfterStop = ed.world?.actors?.length ?? 0;

    const quadMedianFps = report.layouts.quad?.times?.medianFps ?? 0;
    report.targets = {
      singleMaintain: (report.layouts.single?.times?.medianFps ?? 0) >= 55,
      quadTarget30: quadMedianFps >= 30,
      quadMedianFps,
      singleMedianFps: report.layouts.single?.times?.medianFps ?? 0,
    };
    if (!report.targets.quadTarget30) {
      report.defects.push({
        severity: 'P3',
        title: 'Quad viewport median FPS below provisional 30 FPS target',
        detail: `medianFps=${quadMedianFps}; remaining cost is N scissor scene draws (expected with independent cameras)`,
        fixed: false,
      });
    }

    vp.setPrefs({ layoutMode: 'single' });
  } catch (err) {
    report.ok = false;
    report.fatal = String(err?.stack || err?.message || err);
  }

  report.finishedAt = new Date().toISOString();
  window.__PERFORMANCE_STABILIZATION__ = report;
  return report;
}

export default runPerformanceStabilization;
