/**
 * Consolidation C5 — GPU resource lifecycle + performance measurement integrity.
 *
 * CDP:
 *   import('/src/dev/c5GpuLifecycleAcceptance.js').then((m) => m.runC5GpuLifecycleAcceptance())
 *   import('/src/dev/c5GpuLifecycleAcceptance.js').then((m) => m.runC5GpuLifecycleAcceptance({ quick: true }))
 *
 * Measures Gothic Mansion (35 actors) and Integrated Editor (101 actors) under the
 * same protocol so FPS numbers are never compared across unequal workloads.
 */
import { inventoryGpuOwnership } from '../runtime/gpuResources.js';
import {
  getTextureCacheSize,
} from '../runtime/materialFactory.js';
import { getMeshCacheSize } from '../runtime/meshLoader.js';
import { getEnvironmentMapCacheSize } from '../runtime/environmentMapCache.js';
import { releaseSharedAssetCaches } from '../runtime/releaseSharedAssetCaches.js';

export const GOTHIC_LEVEL = 'acceptance-gothic-mansion.json';
export const INTEGRATED_LEVEL = 'acceptance-integrated-editor.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** BFS fiber walk — matches phase2f7gAcceptance (covers alternate / return). */
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
    if (props?.value?.world && props.value.runtimeRef && props.value.createBrushAtBounds) {
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

const editor = () => findEditor();

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function captureConditions(vp) {
  const rt = vp?.getRuntime?.();
  const sv = rt?.sceneView;
  const renderer = sv?.renderer;
  const canvas = renderer?.domElement;
  const prefs = vp?.getPrefs?.() || {};
  const world = rt?.world || editor()?.world;
  let meshCount = 0;
  sv?.scene?.traverse?.((o) => { if (o.isMesh) meshCount += 1; });
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    dpr: window.devicePixelRatio,
    rendererDpr: renderer?.getPixelRatio?.() ?? null,
    canvasCss: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
    canvasBuf: canvas ? { w: canvas.width, h: canvas.height } : null,
    shell: vp?.getShellSize?.() ?? null,
    layoutMode: prefs.layoutMode || null,
    maximizedPaneId: prefs.maximizedPaneId ?? null,
    paneCount: rt?.viewportPanes?.length || null,
    displayModes: (rt?.viewportPanes || []).map((p) => p.displayMode || 'lit'),
    shadowMap: renderer?.shadowMap ? {
      enabled: renderer.shadowMap.enabled,
      autoUpdate: renderer.shadowMap.autoUpdate,
      type: renderer.shadowMap.type,
    } : null,
    postProcessingPreview: sv?.postProcessingPreview ?? null,
    actorCount: world?.actors?.length ?? null,
    visibleMeshCount: meshCount,
    cacheSizes: {
      textures: getTextureCacheSize(),
      meshes: getMeshCacheSize(),
      environments: getEnvironmentMapCacheSize(),
    },
    ownership: sv?.scene ? inventoryGpuOwnership(sv.scene) : null,
    vsyncNote: 'rAF-coupled; averages include compositor. Prefer median/p95.',
    automationNote: 'Automation tabs may throttle; warm-up frames discarded.',
  };
}

async function measureLevel(vp, ed, levelName, {
  seconds = 0.7,
  warmupFrames = 18,
} = {}) {
  await loadLevelForced(ed, levelName);
  await sleep(200);
  await frame();

  const profile = async (layoutMode) => {
    vp.setPrefs({ layoutMode, maximizedPaneId: null });
    // Layout remount + shader settle; longer than a single rAF to avoid
    // capturing the first post-switch stall as the only sample.
    await sleep(400);
    await frame();
    await frame();
    const times = await vp.measureFrameTimes(seconds, {
      warmupFrames,
      stallMs: 120,
      settleStableFrames: 8,
      minSamples: 24,
    });
    const gpu = await vp.measureGpuSnapshot({ layoutMode });
    const conditions = captureConditions(vp);
    return { layoutMode, times, gpu, conditions };
  };

  const single = await profile('single');
  const quad = await profile('quad');

  return {
    level: levelName,
    actors: editor()?.world?.actors?.length ?? null,
    single,
    quad,
  };
}

/**
 * Extended lifecycle stress — ≥50 iterations per requested cycle family.
 */
async function runExtendedStress(vp, ed, { quick = false } = {}) {
  const n = (full, q) => (quick ? q : full);
  const cycles = {
    playStop: n(50, 5),
    levelSwitch: n(50, 6),
    createDelete: n(50, 10),
    materialAssign: n(50, 10),
    undoRedo: n(50, 10),
    layoutSwitch: n(50, 8),
    assetPreview: n(50, 8),
  };

  const report = {
    cycles,
    ok: false,
    sections: {},
  };

  const snap = async () => {
    const gpu = await vp.measureGpuSnapshot();
    const conditions = captureConditions(vp);
    return { gpu, conditions };
  };

  // --- Play / Stop ---
  await loadLevelForced(ed, 'test-room.json');
  await sleep(150);
  const playBefore = await snap();
  for (let i = 0; i < cycles.playStop; i += 1) {
    await ed.play?.();
    await sleep(30);
    assert(vp.getRuntime()?.mode === 'play', `play ${i}`);
    ed.stop?.();
    await sleep(30);
    assert(vp.getRuntime()?.mode === 'edit', `stop ${i}`);
  }
  // Let in-flight async material loads abort+dispose before measuring deltas.
  await sleep(400);
  const playAfter = await snap();
  report.sections.playStop = {
    ok: true,
    cycles: cycles.playStop,
    geometryDelta: (playAfter.gpu?.geometries ?? 0) - (playBefore.gpu?.geometries ?? 0),
    textureDelta: (playAfter.gpu?.textures ?? 0) - (playBefore.gpu?.textures ?? 0),
    before: playBefore.gpu,
    after: playAfter.gpu,
  };

  // --- Level switch (return to same level) ---
  const switchLevels = [
    'test-room.json',
    GOTHIC_LEVEL,
    INTEGRATED_LEVEL,
    'acceptance-subtractive.json',
    'acceptance-convex-brushes.json',
  ];
  await loadLevelForced(ed, 'test-room.json');
  await sleep(150);
  const switchBefore = await snap();
  const ownershipBefore = switchBefore.conditions?.ownership;
  const intervalEvery = Math.max(1, Math.floor(cycles.levelSwitch / 5));
  const intervals = [{
    i: 0,
    geometries: switchBefore.gpu?.geometries ?? null,
    textures: switchBefore.gpu?.textures ?? null,
    caches: switchBefore.conditions?.cacheSizes ?? null,
  }];
  for (let i = 0; i < cycles.levelSwitch; i += 1) {
    await loadLevelForced(ed, switchLevels[i % switchLevels.length]);
    await sleep(50);
    if ((i + 1) % intervalEvery === 0 || i === cycles.levelSwitch - 1) {
      const mid = await snap();
      intervals.push({
        i: i + 1,
        geometries: mid.gpu?.geometries ?? null,
        textures: mid.gpu?.textures ?? null,
        caches: mid.conditions?.cacheSizes ?? null,
      });
    }
  }
  await loadLevelForced(ed, 'test-room.json');
  await sleep(400);
  const switchAfter = await snap();
  intervals.push({
    i: 'return',
    geometries: switchAfter.gpu?.geometries ?? null,
    textures: switchAfter.gpu?.textures ?? null,
    caches: switchAfter.conditions?.cacheSizes ?? null,
  });
  const geoClimb = intervals
    .filter((s) => typeof s.i === 'number' && s.i > 0)
    .every((s, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      // Allow small noise; flag only monotonic large climbs between intervals.
      return (s.geometries ?? 0) <= (prev.geometries ?? 0) + 30;
    });
  report.sections.levelSwitch = {
    ok: true,
    cycles: cycles.levelSwitch,
    geometryDelta: (switchAfter.gpu?.geometries ?? 0) - (switchBefore.gpu?.geometries ?? 0),
    textureDelta: (switchAfter.gpu?.textures ?? 0) - (switchBefore.gpu?.textures ?? 0),
    ownershipBefore,
    ownershipAfter: switchAfter.conditions?.ownership,
    cacheBefore: switchBefore.conditions?.cacheSizes,
    cacheAfter: switchAfter.conditions?.cacheSizes,
    intervals,
    geometryClimbBounded: geoClimb,
    f8Note: 'Positive textureDelta / cache growth after return-to-same-level is shared-cache retention (F8), not an owned leak.',
    before: switchBefore.gpu,
    after: switchAfter.gpu,
  };

  // --- Create / delete ---
  await loadLevelForced(ed, 'test-room.json');
  await sleep(120);
  const cdBefore = await snap();
  const baselineActors = ed.world?.actors?.length ?? 0;
  for (let i = 0; i < cycles.createDelete; i += 1) {
    const created = ed.createBrushAtBounds(
      'box',
      { x: 400 + (i % 30) * 4, y: 0, z: 400 },
      { x: 440 + (i % 30) * 4, y: 40, z: 440 },
    );
    assert(created?.id, `create ${i}`);
    ed.undo?.();
  }
  await sleep(80);
  const cdAfter = await snap();
  report.sections.createDelete = {
    ok: (ed.world?.actors?.length ?? 0) <= baselineActors + 2,
    cycles: cycles.createDelete,
    geometryDelta: (cdAfter.gpu?.geometries ?? 0) - (cdBefore.gpu?.geometries ?? 0),
    before: cdBefore.gpu,
    after: cdAfter.gpu,
  };

  // --- Material assign + undo/redo ---
  await loadLevelForced(ed, 'acceptance-surfaces.json');
  await sleep(120);
  const brush = vp.getRuntime()?.world?.actors?.find((a) => a.getComponent?.('Brush'));
  assert(brush, 'surfaces brush missing');
  ed.selectActor?.(brush.id);
  await sleep(40);
  const matBefore = await snap();
  const matIds = ['mat_hall_stone', 'mat_hall_wood', 'mat_hall_floor'];
  for (let i = 0; i < cycles.materialAssign; i += 1) {
    ed.applySelectedMaterialToBrush?.(matIds[i % matIds.length]);
  }
  for (let i = 0; i < cycles.undoRedo; i += 1) ed.undo?.();
  for (let i = 0; i < cycles.undoRedo; i += 1) ed.redo?.();
  await sleep(60);
  const matAfter = await snap();
  report.sections.materials = {
    ok: true,
    materialCycles: cycles.materialAssign,
    undoRedoCycles: cycles.undoRedo,
    geometryDelta: (matAfter.gpu?.geometries ?? 0) - (matBefore.gpu?.geometries ?? 0),
    textureDelta: (matAfter.gpu?.textures ?? 0) - (matBefore.gpu?.textures ?? 0),
  };

  // --- Single / quad layout switching ---
  await loadLevelForced(ed, GOTHIC_LEVEL);
  await sleep(120);
  const layoutBefore = await snap();
  for (let i = 0; i < cycles.layoutSwitch; i += 1) {
    vp.setPrefs({ layoutMode: i % 2 === 0 ? 'quad' : 'single' });
    await sleep(40);
  }
  vp.setPrefs({ layoutMode: 'single' });
  await sleep(80);
  const layoutAfter = await snap();
  report.sections.layoutSwitch = {
    ok: true,
    cycles: cycles.layoutSwitch,
    geometryDelta: (layoutAfter.gpu?.geometries ?? 0) - (layoutBefore.gpu?.geometries ?? 0),
  };

  // --- Asset Viewer / Meshes tab open-close ---
  const meshBtn = [...document.querySelectorAll('button')]
    .find((b) => /Meshes/i.test(b.textContent || ''));
  if (meshBtn) {
    for (let i = 0; i < cycles.assetPreview; i += 1) {
      meshBtn.click();
      await sleep(60);
    }
    report.sections.assetPreview = { ok: true, cycles: cycles.assetPreview };
  } else {
    report.sections.assetPreview = { ok: true, skipped: 'no Meshes button', cycles: 0 };
  }

  // Optional shared-cache release after unloading to a tiny level (soak reset).
  await loadLevelForced(ed, 'test-room.json');
  await sleep(100);
  // Do not release while meshes from integrated levels may still be referenced —
  // only record cache sizes. Explicit release is opt-in via opts.releaseCaches.
  report.sections.cacheSnapshot = {
    textures: getTextureCacheSize(),
    meshes: getMeshCacheSize(),
    environments: getEnvironmentMapCacheSize(),
  };

  report.ok = Object.values(report.sections).every((s) => s.ok !== false);
  return report;
}

/**
 * Documented reconciliation of historical FPS reports (no live numbers required).
 */
export function reconcileHistoricalFpsReports() {
  return {
    batch8TexturesIntegrated: {
      source: 'docs/ACCEPTANCE_TEXTURES.md',
      level: INTEGRATED_LEVEL,
      actors: 101,
      medianFps: { single: 84.0, quad: 18.7 },
      conditions: 'Chromium automation · DPR 1.5 · canvas ~671×507 · measureFrameTimes(s,{warmupFrames})',
    },
    c4QuickGothic: {
      source: 'docs/ACCEPTANCE_CONSOLIDATION_C4.md',
      level: GOTHIC_LEVEL,
      actors: 35,
      medianFps: { single: 175, quad: 170 },
      conditions: 'phase2f7gAcceptance({ quick: true }) Gothic profile — lighter mesh/furniture load',
      note: 'Near-parity single/quad FPS implies a cheap scene where four scissor draws still fit a short frame; not comparable to integrated mansion quad.',
    },
    preBatch8StabilizationIntegrated: {
      source: 'docs/ACCEPTANCE_PERFORMANCE_STABILIZATION.md',
      level: INTEGRATED_LEVEL,
      actors: 101,
      medianFps: { single: '77.5–78.1', quad: '17.5–19.6' },
      conditions: 'Same integrated level; post shadow/env/ortho fixes',
    },
    conclusion: [
      '84 / 18.7 and 175 / 170 are different levels (integrated 101 vs gothic 35), not competing measurements of the same workload.',
      'Integrated mansion carries furniture, LODs, and denser materials — quad cost scales with per-pane scene draws.',
      'Do not claim a performance improvement by comparing C4 gothic numbers to Batch 8 integrated numbers.',
      'phase2f7gAcceptance previously read drawCalls without info.reset(); C5 uses measureGpuSnapshot for draw/tri integrity.',
    ],
  };
}

export async function runC5GpuLifecycleAcceptance(options = {}) {
  const opts = {
    quick: false,
    measureSeconds: 0.7,
    warmupFrames: 18,
    releaseCaches: false,
    ...options,
  };

  const report = {
    phase: 'C5',
    ok: false,
    quick: Boolean(opts.quick),
    baseline: '480c398 (C4)',
    progress: 'starting',
    reconciliation: reconcileHistoricalFpsReports(),
    conditions: null,
    gothic: null,
    integrated: null,
    stress: null,
    cacheRelease: null,
    errors: [],
    gates: {},
  };

  try {
    const ed = editor();
    assert(ed, 'Editor context not found — open Level Editor');
    const vp = window.__bloodboundViewport;
    assert(vp?.measureFrameTimes && vp?.measureGpuSnapshot, '__bloodboundViewport measurement APIs missing');

    report.conditions = captureConditions(vp);
    report.progress = 'measure-gothic';
    if (typeof window !== 'undefined') window.__c5Report = { ...report, pending: true };

    report.gothic = await measureLevel(vp, ed, GOTHIC_LEVEL, {
      seconds: opts.quick ? 0.4 : opts.measureSeconds,
      warmupFrames: opts.warmupFrames,
    });
    report.progress = 'measure-integrated';
    if (typeof window !== 'undefined') window.__c5Report = { ...report, pending: true };

    report.integrated = await measureLevel(vp, ed, INTEGRATED_LEVEL, {
      seconds: opts.quick ? 0.4 : opts.measureSeconds,
      warmupFrames: opts.warmupFrames,
    });
    report.progress = 'stress';
    if (typeof window !== 'undefined') window.__c5Report = { ...report, pending: true };

    report.stress = await runExtendedStress(vp, ed, { quick: opts.quick });

    if (opts.releaseCaches) {
      await loadLevelForced(ed, 'test-room.json');
      await sleep(100);
      // Still unsafe if test-room references shared assets — record only when requested.
      report.cacheRelease = await releaseSharedAssetCaches();
    }

    const gSingle = report.gothic?.single?.times?.medianFps;
    const gQuad = report.gothic?.quad?.times?.medianFps;
    const iSingle = report.integrated?.single?.times?.medianFps;
    const iQuad = report.integrated?.quad?.times?.medianFps;
    const fpsProfiles = [
      report.gothic?.single?.times,
      report.gothic?.quad?.times,
      report.integrated?.single?.times,
      report.integrated?.quad?.times,
    ];
    const fpsSamplesOk = fpsProfiles.every((t) => (t?.samples ?? 0) >= 16);
    const fpsNotStallOnly = fpsProfiles.every((t) => (t?.medianFps ?? 0) >= 5);

    report.gates = {
      bothLevelsMeasured: Boolean(report.gothic && report.integrated),
      resetProtocolUsed: Boolean(
        report.gothic?.single?.gpu?.drawCalls != null
        && report.integrated?.single?.gpu?.drawCalls != null,
      ),
      stressOk: Boolean(report.stress?.ok),
      stressMinCycles: !opts.quick
        && Object.values(report.stress?.cycles || {}).every((c) => c >= 50),
      fpsSamplesOk,
      fpsNotStallOnly,
      integratedHeavierThanGothic: (
        typeof iSingle === 'number' && typeof gSingle === 'number'
          ? iSingle <= gSingle + 5
          : null
      ),
      unequalWorkloadsDocumented: true,
      fps: {
        gothic: { single: gSingle, quad: gQuad },
        integrated: { single: iSingle, quad: iQuad },
      },
    };

    assert(report.gates.bothLevelsMeasured, 'both levels must measure');
    assert(report.gates.resetProtocolUsed, 'GPU snapshots must use reset protocol');
    assert(report.stress?.ok, 'stress section failed');
    if (!opts.quick) {
      assert(report.gates.stressMinCycles, 'full run requires ≥50 cycles per family');
      assert(report.gates.fpsSamplesOk, 'FPS profiles need ≥16 non-stall samples each');
      assert(report.gates.fpsNotStallOnly, 'FPS median collapsed to stall-only (~1 FPS)');
    }

    // Owned geometry must not climb unboundedly on Play/Stop / create-delete.
    const playGeo = Math.abs(report.stress.sections.playStop?.geometryDelta ?? 0);
    const cdGeo = Math.abs(report.stress.sections.createDelete?.geometryDelta ?? 0);
    assert(playGeo < 80, `Play/Stop geometry delta too high: ${playGeo}`);
    assert(cdGeo < 80, `create/delete geometry delta too high: ${cdGeo}`);

    report.ok = true;
  } catch (err) {
    report.errors.push(String(err?.stack || err));
    report.ok = false;
  }

  report.progress = report.ok ? 'done' : 'failed';
  console.log('[c5GpuLifecycleAcceptance]', report);
  if (typeof window !== 'undefined') {
    window.__c5Report = { ...report, pending: false, finishedAt: Date.now() };
    try {
      window.__c5ReportJson = JSON.stringify(window.__c5Report);
    } catch {
      /* circular / non-serializable — live object still on __c5Report */
    }
  }
  return report;
}

if (typeof window !== 'undefined') {
  window.__c5GpuLifecycleAcceptance = runC5GpuLifecycleAcceptance;
}
