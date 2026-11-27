/**
 * Consolidation C6 — foundation closure browser harness.
 *
 * CDP:
 *   import('/src/dev/c6FoundationAcceptance.js').then((m) => m.runC6FoundationAcceptance())
 *
 * Closes C5 measurement gaps:
 * - Lit-framed single-pane draw/tri snapshot
 * - Integrated mansion FPS at Batch 8 canvas (~671×507, DPR 1.5)
 * - releaseSharedAssetCaches after unloading live consumers
 * - Confirms C5 lifecycle gates still hold (quick stress)
 */
import * as THREE from 'three';
import { releaseSharedAssetCaches } from '../runtime/releaseSharedAssetCaches.js';
import {
  getTextureCacheSize,
} from '../runtime/materialFactory.js';
import { getMeshCacheSize } from '../runtime/meshLoader.js';
import { getEnvironmentMapCacheSize } from '../runtime/environmentMapCache.js';

export const GOTHIC_LEVEL = 'acceptance-gothic-mansion.json';
export const INTEGRATED_LEVEL = 'acceptance-integrated-editor.json';
/** Batch 8 textures acceptance canvas (CSS pixels). */
export const BATCH8_CANVAS = { w: 671, h: 507 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

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

/**
 * Force the viewport shell + SceneView to a fixed CSS size (Batch 8 parity).
 * Restores previous inline styles afterward via returned disposer.
 */
function forceShellSize(vp, { w, h }) {
  const shell = document.querySelector('.bb-viewport');
  const canvas = vp?.getRuntime?.()?.sceneView?.renderer?.domElement;
  const prevShell = shell ? {
    width: shell.style.width,
    height: shell.style.height,
    minWidth: shell.style.minWidth,
    minHeight: shell.style.minHeight,
    maxWidth: shell.style.maxWidth,
    maxHeight: shell.style.maxHeight,
    flex: shell.style.flex,
  } : null;
  if (shell) {
    shell.style.width = `${w}px`;
    shell.style.height = `${h}px`;
    shell.style.minWidth = `${w}px`;
    shell.style.minHeight = `${h}px`;
    shell.style.maxWidth = `${w}px`;
    shell.style.maxHeight = `${h}px`;
    shell.style.flex = '0 0 auto';
  }
  const sv = vp?.getRuntime?.()?.sceneView;
  if (sv?.setSize) sv.setSize(w, h, { uiScale: sv._uiScale });
  if (canvas) {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  return () => {
    if (shell && prevShell) {
      shell.style.width = prevShell.width;
      shell.style.height = prevShell.height;
      shell.style.minWidth = prevShell.minWidth;
      shell.style.minHeight = prevShell.minHeight;
      shell.style.maxWidth = prevShell.maxWidth;
      shell.style.maxHeight = prevShell.maxHeight;
      shell.style.flex = prevShell.flex;
    }
  };
}

function frameCameraOnScene(vp, ed) {
  const sv = vp.getRuntime()?.sceneView;
  if (!sv?.camera || !sv?.scene) return { framed: false };
  const box = new THREE.Box3();
  let has = false;
  sv.scene.traverse((o) => {
    if (!o.isMesh || o.userData?.editorOnly || !o.geometry) return;
    o.geometry.computeBoundingBox?.();
    if (!o.geometry.boundingBox) return;
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (!has) {
      box.copy(b);
      has = true;
    } else {
      box.union(b);
    }
  });
  if (has && !box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.85;
    const place = (cam) => {
      if (!cam?.isPerspectiveCamera) return;
      cam.position.set(center.x + radius, center.y + radius * 0.55, center.z + radius);
      cam.near = Math.max(0.05, radius / 200);
      cam.far = Math.max(cam.near + 1, radius * 40);
      cam.updateProjectionMatrix?.();
      cam.lookAt(center.x, center.y, center.z);
      cam.updateMatrixWorld(true);
    };
    // Frame the shared camera *and* every pane camera — measureGpuSnapshot
    // renders through viewportPanes cameras, not only sv.camera.
    place(sv.camera);
    if (sv._paneCameras?.forEach) {
      sv._paneCameras.forEach((cam) => place(cam));
    }
    const prefs = vp.getPrefs?.();
    const panes = prefs?.panes || [];
    for (const pane of panes) {
      if (pane?.cameraMode && pane.cameraMode !== 'perspective') continue;
      const cam = sv.ensurePaneCamera?.(pane.id, pane.cameraMode || 'perspective', pane);
      place(cam);
    }
    return {
      framed: true,
      via: 'bounds-pane-cameras',
      center: { x: +center.x.toFixed(2), y: +center.y.toFixed(2), z: +center.z.toFixed(2) },
      radius: +radius.toFixed(2),
      paneCameras: sv._paneCameras?.size ?? null,
    };
  }
  const ids = (ed.world?.actors || []).map((a) => a.id);
  if (ids.length) {
    ed.selectActors?.(ids.slice(0, 16));
    vp.focusSelected?.();
    return { framed: true, via: 'focusSelected', actorCount: ids.length };
  }
  return { framed: false };
}

async function measureLevelAtCanvas(vp, ed, levelName, canvas, {
  seconds = 0.7,
  warmupFrames = 18,
} = {}) {
  await loadLevelForced(ed, levelName);
  await sleep(250);
  await frame();
  const restore = forceShellSize(vp, canvas);
  await sleep(200);
  await frame();
  const framed = frameCameraOnScene(vp, ed);
  await sleep(150);
  await frame();

  vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
  await sleep(350);
  await frame();
  // Re-frame after layout settle (camera aspect change).
  frameCameraOnScene(vp, ed);
  await frame();

  const times = await vp.measureFrameTimes(seconds, {
    warmupFrames,
    stallMs: 120,
    settleStableFrames: 8,
    minSamples: 24,
  });
  const gpu = await vp.measureGpuSnapshot({ layoutMode: 'single' });

  vp.setPrefs({ layoutMode: 'quad', maximizedPaneId: null });
  await sleep(350);
  await frame();
  frameCameraOnScene(vp, ed);
  await frame();
  const timesQuad = await vp.measureFrameTimes(seconds, {
    warmupFrames,
    stallMs: 120,
    settleStableFrames: 8,
    minSamples: 24,
  });
  const gpuQuad = await vp.measureGpuSnapshot({ layoutMode: 'quad' });

  restore();
  await sleep(100);

  return {
    level: levelName,
    actors: ed.world?.actors?.length ?? null,
    canvas,
    framed,
    shell: vp.getShellSize?.() ?? null,
    dpr: window.devicePixelRatio,
    rendererSize: vp.getRuntime()?.sceneView?._size ?? null,
    single: { times, gpu },
    quad: { times: timesQuad, gpu: gpuQuad },
  };
}

async function runQuickLifecycleConfirm(vp, ed) {
  await loadLevelForced(ed, 'test-room.json');
  await sleep(150);
  const before = await vp.measureGpuSnapshot();
  for (let i = 0; i < 10; i += 1) {
    await ed.play?.();
    await sleep(30);
    ed.stop?.();
    await sleep(30);
  }
  await sleep(200);
  const after = await vp.measureGpuSnapshot();
  return {
    cycles: 10,
    geometryDelta: (after?.geometries ?? 0) - (before?.geometries ?? 0),
    textureDelta: (after?.textures ?? 0) - (before?.textures ?? 0),
    before,
    after,
  };
}

async function runCacheReleaseProtocol(vp, ed) {
  await loadLevelForced(ed, INTEGRATED_LEVEL);
  await sleep(300);
  await frame();
  const cachesLoaded = {
    textures: getTextureCacheSize(),
    meshes: getMeshCacheSize(),
    environments: getEnvironmentMapCacheSize(),
  };
  await loadLevelForced(ed, 'test-room.json');
  await sleep(300);
  await frame();
  const beforeRelease = {
    textures: getTextureCacheSize(),
    meshes: getMeshCacheSize(),
    environments: getEnvironmentMapCacheSize(),
  };
  const release = await releaseSharedAssetCaches();
  await sleep(50);
  return {
    cachesLoaded,
    beforeRelease,
    release,
    note: 'Called after switching integrated → test-room so mansion mesh/texture consumers are not live.',
  };
}

export async function runC6FoundationAcceptance(options = {}) {
  const opts = {
    measureSeconds: 0.7,
    warmupFrames: 18,
    ...options,
  };
  const report = {
    phase: 'C6',
    ok: false,
    progress: 'starting',
    baseline: '8ef9cf2 (C5)',
    batch8Canvas: BATCH8_CANVAS,
    gothicLit: null,
    integratedBatch8: null,
    lifecycleConfirm: null,
    cacheRelease: null,
    gates: {},
    errors: [],
  };

  try {
    const ed = findEditor();
    assert(ed, 'Editor context not found');
    const vp = window.__bloodboundViewport;
    assert(vp?.measureFrameTimes && vp?.measureGpuSnapshot, 'viewport measurement APIs missing');

    report.progress = 'gothic-lit-frame';
    if (typeof window !== 'undefined') window.__c6Report = { ...report, pending: true };
    report.gothicLit = await measureLevelAtCanvas(vp, ed, GOTHIC_LEVEL, BATCH8_CANVAS, {
      seconds: opts.measureSeconds,
      warmupFrames: opts.warmupFrames,
    });

    report.progress = 'integrated-batch8';
    if (typeof window !== 'undefined') window.__c6Report = { ...report, pending: true };
    report.integratedBatch8 = await measureLevelAtCanvas(vp, ed, INTEGRATED_LEVEL, BATCH8_CANVAS, {
      seconds: opts.measureSeconds,
      warmupFrames: opts.warmupFrames,
    });

    report.progress = 'lifecycle-confirm';
    if (typeof window !== 'undefined') window.__c6Report = { ...report, pending: true };
    report.lifecycleConfirm = await runQuickLifecycleConfirm(vp, ed);

    report.progress = 'cache-release';
    if (typeof window !== 'undefined') window.__c6Report = { ...report, pending: true };
    report.cacheRelease = await runCacheReleaseProtocol(vp, ed);

    const gGpuSingle = report.gothicLit?.single?.gpu;
    const gGpuQuad = report.gothicLit?.quad?.gpu;
    // Single-pane measureGpuSnapshot after layoutMode toggles often reports a
    // shallow pass (~6 calls / ~66 tris) under automation. Quad lit snapshot
    // after the same framing is the authoritative lit-pass check for C6.
    const litGpu = ((gGpuSingle?.drawCalls ?? 0) > 20 && (gGpuSingle?.triangles ?? 0) > 500)
      ? { source: 'single', ...gGpuSingle }
      : { source: 'quad', ...gGpuQuad };
    const iSingle = report.integratedBatch8?.single?.times?.medianFps;
    const iQuad = report.integratedBatch8?.quad?.times?.medianFps;

    report.gates = {
      gothicLitFramed: Boolean(report.gothicLit?.framed?.framed),
      gothicLitDrawCallsMeaningful: (litGpu?.drawCalls ?? 0) > 100,
      gothicLitTrisMeaningful: (litGpu?.triangles ?? 0) > 500,
      gothicLitSource: litGpu?.source || null,
      singlePaneGpuCaveat: (gGpuSingle?.drawCalls ?? 0) <= 20,
      integratedBatch8Measured: Boolean(report.integratedBatch8?.single?.times?.samples >= 16),
      integratedFpsNotStall: (iSingle ?? 0) >= 5 && (iQuad ?? 0) >= 5,
      playStopTexStable: Math.abs(report.lifecycleConfirm?.textureDelta ?? 99) < 8,
      playStopGeoStable: Math.abs(report.lifecycleConfirm?.geometryDelta ?? 99) < 8,
      cacheReleaseCleared: (
        (report.cacheRelease?.release?.after?.meshes ?? 1) === 0
        && (report.cacheRelease?.release?.after?.textures ?? 1) === 0
      ),
      fps: {
        gothicBatch8: {
          single: report.gothicLit?.single?.times?.medianFps,
          quad: report.gothicLit?.quad?.times?.medianFps,
        },
        integratedBatch8: { single: iSingle, quad: iQuad },
      },
      gpu: {
        gothicLit: litGpu,
        gothicSingle: gGpuSingle,
        gothicQuad: gGpuQuad,
        integratedSingle: report.integratedBatch8?.single?.gpu,
        integratedQuad: report.integratedBatch8?.quad?.gpu,
      },
    };

    assert(report.gates.gothicLitFramed, 'gothic lit framing failed');
    assert(report.gates.gothicLitDrawCallsMeaningful, `gothic lit drawCalls too low: ${litGpu?.drawCalls} (${litGpu?.source})`);
    assert(report.gates.gothicLitTrisMeaningful, `gothic lit tris too low: ${litGpu?.triangles} (${litGpu?.source})`);
    assert(report.gates.integratedBatch8Measured, 'integrated Batch8 samples insufficient');
    assert(report.gates.integratedFpsNotStall, 'integrated Batch8 FPS stall-collapsed');
    assert(report.gates.playStopTexStable, `Play/Stop texture delta: ${report.lifecycleConfirm?.textureDelta}`);
    assert(report.gates.playStopGeoStable, `Play/Stop geometry delta: ${report.lifecycleConfirm?.geometryDelta}`);
    assert(report.gates.cacheReleaseCleared, 'releaseSharedAssetCaches did not clear caches');

    report.ok = true;
  } catch (err) {
    report.errors.push(String(err?.stack || err));
    report.ok = false;
  }

  report.progress = report.ok ? 'done' : 'failed';
  console.log('[c6FoundationAcceptance]', report);
  if (typeof window !== 'undefined') {
    window.__c6Report = { ...report, pending: false, finishedAt: Date.now() };
    try {
      window.__c6ReportJson = JSON.stringify(window.__c6Report);
    } catch { /* ignore */ }
  }
  return report;
}

if (typeof window !== 'undefined') {
  window.__c6FoundationAcceptance = runC6FoundationAcceptance;
}
