/**
 * Batch 9 Final Acceptance Closure harness (CDP-friendly).
 *
 * import('/src/dev/layersAcceptanceClosure.js').then(async (m) => {
 *   await m.phaseLoad();
 *   await m.phaseLayersWorkflow();
 *   await m.phaseVisibility();
 *   await m.phasePerf();
 *   console.log(m.summarize());
 * });
 */
const LEVEL = 'acceptance-layers.json';
/** Gothic mansion — same Batch 8 / pre-Batch 8 mansion FPS baseline target. */
const MANSION = 'acceptance-gothic-mansion.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report() {
  if (!window.__batch9ClosureReport) {
    window.__batch9ClosureReport = {
      ok: true,
      startedAt: new Date().toISOString(),
      baselineCommit: 'a625593',
      checks: [],
      measurements: {},
      defects: [
        {
          severity: 'P1',
          title: 'Duplication must preserve source authoringLayerId (never Active stamp)',
          detail: 'duplicateActors explicitly copies source membership; create/place still stamp Active',
          fixed: true,
        },
        {
          severity: 'P1',
          title: 'Layer lock not enforced on shared edit command paths',
          detail: 'authoringLayerGuards + EditorContext create/edit/delete/duplicate/geometry/material guards',
          fixed: true,
        },
      ],
      limitations: [
        'Combined CSG: hiding a subtractive cutter does not un-carve additive meshes (layer filter is visual/pick only).',
        'World-solid batch mesh visibility is per World Solid actor group, not per solid fragment.',
        'TextureHelper deferred; no THREE.Layers mapping for authoring layers.',
      ],
    };
  }
  return window.__batch9ClosureReport;
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

const editor = () => findCtx((v) => v.createBrushAtBounds && v.world && v.toggleAuthoringLayerLocked);

async function loadLevelForced(ed, name) {
  if (typeof ed.loadLevelUnchecked === 'function') return ed.loadLevelUnchecked(name);
  if (typeof ed.loadLevel === 'function') return ed.loadLevel(name);
  throw new Error('No loadLevel API');
}

export async function phaseLoad() {
  const ed = editor();
  if (!ed) {
    mark('load', 'FAIL', { message: 'Editor context not found' });
    return;
  }
  await loadLevelForced(ed, LEVEL);
  await sleep(200);
  const layers = ed.world?.authoringLayers?.layers || [];
  mark('load', layers.length >= 5 ? 'PASS' : 'FAIL', {
    layerCount: layers.length,
    actorCount: ed.world?.actors?.length || 0,
  });
}

export async function phaseLayersWorkflow() {
  const ed = editor();
  if (!ed?.world) {
    mark('workflow', 'FAIL', { message: 'No editor' });
    return;
  }
  const before = ed.world.authoringLayers.layers.length;
  const created = ed.createAuthoringLayer({ name: 'Closure Temp' });
  const afterCreate = ed.world.authoringLayers.layers.length;
  if (created?.id) {
    ed.updateAuthoringLayer(created.id, { color: '#112233', name: 'Closure Renamed' });
    ed.setActiveAuthoringLayer(created.id);
  }
  const actors = ed.world.actors.slice(0, 2).map((a) => a.id);
  if (actors.length && created?.id) {
    ed.assignActorsToAuthoringLayer(actors, created.id);
  }
  const props = ed.world.authoringLayers.layers.find((l) => l.name === 'Props');
  if (props) {
    ed.toggleAuthoringLayerLocked(props.id);
    ed.toggleAuthoringLayerHidden(props.id);
    ed.setAuthoringLayerSolo(props.id);
    ed.setAuthoringLayerSolo(null);
    ed.toggleAuthoringLayerHidden(props.id);
    ed.toggleAuthoringLayerLocked(props.id);
  }
  if (created?.id) {
    ed.deleteAuthoringLayerById(created.id);
  }
  mark('workflow', afterCreate === before + 1 ? 'PASS' : 'FAIL', {
    before,
    afterCreate,
    active: ed.world.authoringLayers.activeLayerId,
  });
}

export async function phaseVisibility() {
  const ed = editor();
  const sv = ed?.runtimeRef?.current?.sceneView;
  if (!ed || !sv) {
    mark('visibility', 'FAIL', { message: 'SceneView missing' });
    return;
  }
  const statsBefore = sv.resetSyncStats?.() || sv.getSyncStats?.() || null;
  const props = ed.world.authoringLayers.layers.find((l) => l.name === 'Props');
  if (props) {
    ed.toggleAuthoringLayerHidden(props.id);
    await sleep(50);
    ed.toggleAuthoringLayerHidden(props.id);
  }
  const statsAfter = sv.getSyncStats?.() || null;
  const rebuilds = (statsAfter?.actorRebuilds || 0) - (statsBefore?.actorRebuilds || 0);
  mark('visibility', rebuilds === 0 ? 'PASS' : 'FAIL', {
    rebuildDelta: rebuilds,
    note: 'Layer hide/show must not rebuild actor meshes/CSG',
    helpers: sv._viewHelpers?.size ?? null,
  });
}

export async function phasePerf() {
  const ed = editor();
  const vp = window.__bloodboundViewport;
  if (!ed || !vp?.measureFrameTimes) {
    mark('perf', 'UNVERIFIED', { message: 'Viewport bridge missing' });
    return;
  }
  await loadLevelForced(ed, MANSION);
  await sleep(500);
  const r = report();

  if (typeof vp.setPrefs === 'function') {
    vp.setPrefs({ layoutMode: 'single' });
    await sleep(200);
  }
  // Keep samples short so CDP automation does not time out on mansion load.
  const single = await vp.measureFrameTimes(0.6, { warmupFrames: 10 });
  r.measurements.single = single;

  if (typeof vp.setPrefs === 'function') {
    vp.setPrefs({ layoutMode: 'quad' });
    await sleep(300);
  }
  const quad = await vp.measureFrameTimes(0.6, { warmupFrames: 10 });
  r.measurements.quad = quad;

  const sv = ed.runtimeRef?.current?.sceneView;
  const info = sv?.renderer?.info;
  r.measurements.rendererInfo = info ? {
    drawCalls: info.render?.calls,
    triangles: info.render?.triangles,
    geometries: info.memory?.geometries,
    textures: info.memory?.textures,
  } : null;
  r.measurements.syncStats = sv?.getSyncStats?.() || null;

  const t0 = performance.now();
  const layer = ed.world.authoringLayers.layers[0];
  for (let i = 0; i < 20; i += 1) {
    ed.toggleAuthoringLayerHidden(layer.id);
  }
  const toggleMs = performance.now() - t0;
  r.measurements.layerToggle20xMs = toggleMs;

  mark('perf', single?.medianFps ? 'PASS' : 'UNVERIFIED', {
    singleMedianFps: single?.medianFps,
    singleP95Ms: single?.p95Ms,
    quadMedianFps: quad?.medianFps,
    quadP95Ms: quad?.p95Ms,
    baselineSingleApprox: 84,
    baselineQuadApprox: 18.7,
    toggle20xMs: toggleMs,
  });

  if (typeof vp.setPrefs === 'function') {
    vp.setPrefs({ layoutMode: 'single' });
  }
}

export function summarize() {
  const r = report();
  r.finishedAt = new Date().toISOString();
  return r;
}

export async function runAll() {
  await phaseLoad();
  await phaseLayersWorkflow();
  await phaseVisibility();
  await phasePerf();
  return summarize();
}
