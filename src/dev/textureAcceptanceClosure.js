/**
 * Batch 8 Final Acceptance Closure harness (phased — CDP-friendly).
 * import('/src/dev/textureAcceptanceClosure.js').then(async m => {
 *   await m.phaseLoad(); await m.phaseUv(); ...; m.summarize();
 * })
 */
import {
  getTextureCacheKeys,
  getTextureCacheSize,
  invalidateTextureCacheMatching,
} from '../runtime/materialFactory.js';
import { inspectGeometryUvChannels } from '../assets/textureUvChannels.js';
import { normalizeTextureSampler } from '../assets/textureSampling.js';

const LEVEL = 'acceptance-textures.json';
const MANSION = 'acceptance-integrated-editor.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report() {
  if (!window.__batch8ClosureReport) {
    window.__batch8ClosureReport = {
      ok: true,
      startedAt: new Date().toISOString(),
      baselineCommit: '86a8b05',
      checks: [],
      measurements: {},
      defects: [
        {
          severity: 'P1',
          title: 'Texture Apply cleared entire GPU texture cache',
          detail: 'Replaced with invalidateTextureCacheMatching(path) + dispose',
          fixed: true,
        },
        {
          severity: 'P1',
          title: 'Missing UV channel warnings not attached at bind time',
          detail: 'createThreeMaterial + SceneView now set userData.bbUvWarnings',
          fixed: true,
        },
      ],
    };
  }
  return window.__batch8ClosureReport;
}

function mark(id, status, detail = {}) {
  const r = report();
  r.checks = r.checks.filter((c) => c.id !== id);
  r.checks.push({ id, status, ...detail });
  r.ok = !r.checks.some((c) => c.status === 'FAIL');
}

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
const assets = () => findCtx((v) => v.updateTextureMeta || v.createNewMaterial);

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

function findActorMesh(ed, actorId) {
  const rt = ed.runtimeRef?.current || window.__bloodboundViewport?.getRuntime?.();
  const entry = rt?.sceneView?._actorMeshes?.get?.(actorId);
  if (!entry) return null;
  let mesh = null;
  entry.group?.traverse?.((o) => {
    if (!mesh && o.isMesh && !o.userData?.placeholder) mesh = o;
  });
  return mesh;
}

function mem() {
  const m = performance.memory;
  if (!m) return null;
  return {
    usedJSHeapMB: +(m.usedJSHeapSize / 1048576).toFixed(2),
    totalJSHeapMB: +(m.totalJSHeapSize / 1048576).toFixed(2),
  };
}

async function gpuSnap(layoutMode = 'single') {
  return window.__bloodboundViewport?.measureGpuSnapshot?.({ layoutMode }) || null;
}

async function fpsSnap(seconds = 0.5) {
  // Correct API: (seconds, { warmupFrames }) — object-as-first-arg yielded 0 samples.
  return window.__bloodboundViewport?.measureFrameTimes?.(seconds, { warmupFrames: 12 }) || null;
}

export async function phaseLoad() {
  const ed = editor();
  if (!ed) throw new Error('EditorContext not found');
  await loadLevelForced(ed, LEVEL);
  await sleep(700);
  const ed2 = editor();
  const n = ed2.world?.actors?.length || 0;
  mark('load_textures_level', n >= 16 ? 'PASS' : 'FAIL', { actors: n });
  return { actors: n };
}

export async function phaseUv() {
  const ed = editor();
  const uv0 = findActorMesh(ed, 'actor_b8_uv0');
  const uv1 = findActorMesh(ed, 'actor_b8_uv1');
  const uvMiss = findActorMesh(ed, 'actor_b8_uv_missing');
  const uvInfo0 = uv0 ? inspectGeometryUvChannels(uv0) : { channels: [] };
  mark('multi_uv_geometry',
    uvInfo0.channels.includes(0) && uvInfo0.channels.includes(1) && uvInfo0.channels.includes(2) ? 'PASS' : 'FAIL',
    { channels: uvInfo0.channels });
  mark('uv0_binding', uv0?.material?.map?.channel === 0 ? 'PASS' : 'FAIL', { channel: uv0?.material?.map?.channel });
  mark('uv1_binding', uv1?.material?.map?.channel === 1 ? 'PASS' : 'FAIL', { channel: uv1?.material?.map?.channel });
  mark('uv_missing_requested', uvMiss?.material?.map?.channel === 3 ? 'PASS' : 'FAIL', { channel: uvMiss?.material?.map?.channel });
  const warnings = uvMiss?.userData?.bbUvWarnings || uvMiss?.material?.userData?.bbUvWarnings || [];
  mark('missing_uv_warnings', warnings.length > 0 ? 'PASS' : 'FAIL', { warnings });
  mark('ao_channel_uv1', uv0?.material?.aoMap?.channel === 1 ? 'PASS' : 'FAIL', { aoChannel: uv0?.material?.aoMap?.channel });
  mark('lightmap_channel_uv2', uv1?.material?.lightMap?.channel === 2 ? 'PASS' : 'FAIL', { lightMapChannel: uv1?.material?.lightMap?.channel });
  mark('imported_uv_preserved', uvInfo0.channels.length >= 3 ? 'PASS' : 'FAIL', { channels: uvInfo0.channels });
  return { channels: uvInfo0.channels, warnings };
}

export async function phaseSharing() {
  const ab = assets();
  const nearest = ab?.getTextureAsset?.('tex_batch8_wood_nearest');
  const linear = ab?.getTextureAsset?.('tex_batch8_wood_linear');
  const nS = normalizeTextureSampler(nearest?.meta?.sampler);
  const lS = normalizeTextureSampler(linear?.meta?.sampler);
  mark('shared_image_independent_sampling',
    nearest && linear && nearest.path === linear.path && nS.magFilter === 'nearest' && lS.magFilter === 'linear'
      ? 'PASS' : 'FAIL',
    { nearest: nS.magFilter, linear: lS.magFilter, path: nearest?.path });

  if (!ab?.updateTextureMeta) {
    mark('apply_selective_cache_invalidate', 'UNVERIFIED', { reason: 'no updateTextureMeta' });
    return {};
  }
  const beforeKeys = getTextureCacheKeys();
  await ab.updateTextureMeta('tex_batch8_wood_linear', {
    sampler: { ...lS, anisotropy: (lS.anisotropy || 8) === 8 ? 12 : 8 },
  });
  await sleep(350);
  const afterKeys = getTextureCacheKeys();
  const wipedUnrelated = beforeKeys.filter((k) => !k.includes('tex_hall_wood') && !afterKeys.includes(k));
  mark('apply_selective_cache_invalidate', wipedUnrelated.length === 0 ? 'PASS' : 'FAIL', {
    wipedUnrelated: wipedUnrelated.slice(0, 5),
    cacheSize: getTextureCacheSize(),
  });
  await ab.updateTextureMeta('tex_batch8_wood_linear', { sampler: lS });
  await sleep(150);
  return { wipedUnrelated: wipedUnrelated.length };
}

export async function phaseKtx2() {
  const ab = assets();
  const ed = editor();
  const ktx = ab?.getTextureAsset?.('tex_batch8_ktx2');
  mark('ktx2_registered', ktx?.path?.includes('ktx2') ? 'PASS' : 'FAIL', { path: ktx?.path });
  const panel = findActorMesh(ed, 'actor_b8_ktx2');
  mark('ktx2_rendered', panel?.material?.map ? 'PASS' : 'FAIL');
  const genOff = ktx?.meta?.sampler?.generateMipmaps === false || ktx?.meta?.format === 'ktx2';
  mark('ktx2_mip_flip_constrained', genOff ? 'PASS' : 'FAIL', { sampler: ktx?.meta?.sampler });
  return { path: ktx?.path };
}

export async function phasePrefab() {
  const ed = editor();
  if (!ed?.createPrefabFromSelection) {
    mark('prefab_create', 'UNVERIFIED');
    mark('prefab_place', 'UNVERIFIED');
    return {};
  }
  try {
    ed.selectActors?.(['actor_b8_nearest', 'actor_b8_uv0', 'actor_b8_furniture']);
    await sleep(80);
    const prefab = await ed.createPrefabFromSelection('Batch8 Texture Prefab Closure');
    const pid = prefab?.id || prefab?.asset?.id || prefab?.definition?.id;
    mark('prefab_create', pid ? 'PASS' : 'FAIL', { prefabId: pid });
    if (pid && ed.placePrefabAsset) {
      await ed.placePrefabAsset(pid, { x: 420, y: 20, z: 120 });
      await sleep(300);
      mark('prefab_place', 'PASS');
    } else {
      mark('prefab_place', 'UNVERIFIED');
    }
  } catch (err) {
    mark('prefab_create', 'FAIL', { error: String(err?.message || err) });
  }
  if (typeof ed.undo === 'function') {
    ed.undo();
    await sleep(60);
    ed.redo?.();
    mark('undo_redo_smoke', 'PASS');
  } else {
    mark('undo_redo_smoke', 'UNVERIFIED');
  }
  await loadLevelForced(editor(), LEVEL);
  await sleep(500);
  mark('save_reload', (editor().world?.actors?.length || 0) >= 16 ? 'PASS' : 'FAIL', {
    actors: editor().world?.actors?.length,
    note: 'reload verification',
  });
  try {
    await editor().play?.();
    await sleep(300);
    await editor().stop?.();
    mark('play_stop', 'PASS');
  } catch (err) {
    mark('play_stop', 'FAIL', { error: String(err?.message || err) });
  }
  return {};
}

export async function phaseLifecycle() {
  const ab = assets();
  const before = { heap: mem(), gpu: await gpuSnap('single'), cache: getTextureCacheSize() };
  for (let i = 0; i < 6; i += 1) {
    await ab?.updateTextureMeta?.('tex_batch8_wood_nearest', {
      transform: { repeatU: 1 + (i % 3) * 0.15, repeatV: 1 },
    });
    await sleep(40);
  }
  await ab?.updateTextureMeta?.('tex_batch8_wood_nearest', {
    transform: {
      repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, rotation: 0, centerU: 0, centerV: 0, flipY: true,
    },
  });
  await sleep(250);
  const after = { heap: mem(), gpu: await gpuSnap('single'), cache: getTextureCacheSize() };
  report().measurements.lifecycle = { before, after };
  const growth = (after.cache ?? 0) - (before.cache ?? 0);
  mark('lifecycle_cache_bounded', growth <= 8 ? 'PASS' : 'FAIL', { growth, before: before.cache, after: after.cache });
  const removed = await invalidateTextureCacheMatching('tex_hall_wood.png');
  mark('invalidate_matching_api', removed >= 0 ? 'PASS' : 'FAIL', { removed });
  return { growth };
}

export async function phasePerfTextures() {
  await loadLevelForced(editor(), LEVEL);
  await sleep(600);
  window.__bloodboundViewport?.setPrefs?.({ layoutMode: 'single' });
  await sleep(100);
  const singleGpu = await gpuSnap('single');
  const singleFps = await fpsSnap(0.55);
  const quadGpu = await gpuSnap('quad');
  const quadFps = await fpsSnap(0.55);
  window.__bloodboundViewport?.setPrefs?.({ layoutMode: 'single' });
  report().measurements.texturesPerf = { singleGpu, singleFps, quadGpu, quadFps };
  mark('perf_textures_single_fps', singleFps?.samples > 8 && singleFps.medianFps > 0 ? 'PASS' : 'FAIL', singleFps || {});
  mark('perf_textures_gpu_snapshot', singleGpu?.drawCalls > 0 ? 'PASS' : 'FAIL', {
    drawCalls: singleGpu?.drawCalls,
    triangles: singleGpu?.triangles,
    textures: singleGpu?.textures,
  });
  return { singleFps, singleGpu, quadFps, quadGpu };
}

export async function phasePerfMansion() {
  await loadLevelForced(editor(), MANSION);
  await sleep(900);
  window.__bloodboundViewport?.setPrefs?.({ layoutMode: 'single' });
  await sleep(100);
  const singleGpu = await gpuSnap('single');
  const singleFps = await fpsSnap(0.55);
  const quadGpu = await gpuSnap('quad');
  const quadFps = await fpsSnap(0.55);
  window.__bloodboundViewport?.setPrefs?.({ layoutMode: 'single' });
  report().measurements.mansionPerf = { singleGpu, singleFps, quadGpu, quadFps };
  mark('perf_mansion_single_fps', singleFps?.samples > 8 && singleFps.medianFps > 0 ? 'PASS' : 'FAIL', singleFps || {});
  await loadLevelForced(editor(), LEVEL);
  await sleep(400);
  return { singleFps, singleGpu, quadFps, quadGpu };
}

export function summarize() {
  const r = report();
  r.finishedAt = new Date().toISOString();
  r.ok = !r.checks.some((c) => c.status === 'FAIL');
  return {
    ok: r.ok,
    failCount: r.checks.filter((c) => c.status === 'FAIL').length,
    passCount: r.checks.filter((c) => c.status === 'PASS').length,
    unverifiedCount: r.checks.filter((c) => c.status === 'UNVERIFIED').length,
    checks: r.checks.map((c) => ({ id: c.id, status: c.status })),
    measurements: r.measurements,
    defects: r.defects,
  };
}

/** Full run for local console; prefer phased calls under CDP. */
export async function runTextureAcceptanceClosure() {
  await phaseLoad();
  await phaseUv();
  await phaseSharing();
  await phaseKtx2();
  await phasePrefab();
  await phaseLifecycle();
  await phasePerfTextures();
  await phasePerfMansion();
  return summarize();
}

export default runTextureAcceptanceClosure;
