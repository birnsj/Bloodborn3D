/**
 * Phase 2G — subtractive rendering optimization: before/after (Node, no WebGL).
 * Run: node scripts/phase2g-subtractive-rendering/runRenderBench.mjs
 *
 * "Before" = per-solid meshes (default). "After" = batched World Solid
 * (globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true). Everything else is identical.
 *
 * Resource counts use Three's monotonically increasing object ids: constructing a
 * probe object before/after a build yields the exact number of Materials /
 * BufferGeometries created in between (including ones later disposed).
 * Draw units = non-empty geometry groups per mesh, the quantity renderer.info
 * counts per pass (browser run confirms real draw calls).
 */
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SceneView } from '../../src/runtime/SceneView.js';
import {
  ROOM_COUNTS,
  buildFlushWorld,
  buildRepresentativeWorld,
} from '../../src/dev/phase2gSubtractiveScaleWorlds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'results');

// Large enough that no benchmark world hits the cap (product limit stays 64).
globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = 4096;

function makeHarness() {
  const view = Object.create(SceneView.prototype);
  view.editMode = true;
  view.maxAnisotropy = 8;
  view.selectedSurface = null;
  view.viewportColors = { subtract: 0xc23b4a, selection: 0xffaa33 };
  view.assetResolver = {
    getMaterialDefinition: (id) => ({ id, baseColor: '#8a8070', roughness: 0.8 }),
    getTextureUrl: () => null,
  };
  view._isActorVisualCurrent = () => true;
  view._refreshSurfaceHighlight = () => {};
  return view;
}

const nextMaterialId = () => new THREE.Material().id;
const nextGeometryId = () => new THREE.BufferGeometry().id;

// Material loading is microtask-only here (no textures), so one macrotask turn drains it.
async function settle() {
  await new Promise((r) => setImmediate(r));
}

function categoryOf(actor) {
  if (actor.tags?.includes('world-solid')) return 'worldSolid';
  if (actor.getComponent('Stair')) return 'stairs';
  if (actor.getComponent('Brush')?.operation === 'subtract') return 'cutters';
  return 'otherAdditive';
}

function measureGroup(group) {
  const geos = new Set();
  const mats = new Set();
  let meshes = 0;
  let drawUnits = 0;
  let triangles = 0;
  group.traverse((obj) => {
    if (!obj.geometry) return;
    geos.add(obj.geometry);
    const m = obj.material;
    for (const mat of Array.isArray(m) ? m : [m]) if (mat) mats.add(mat);
    if (obj.isMesh) {
      meshes += 1;
      const g = obj.geometry;
      const total = g.index ? g.index.count : g.attributes.position.count;
      if (Array.isArray(m) && g.groups.length) {
        for (const grp of g.groups) {
          if (grp.count > 0 && m[grp.materialIndex]?.visible !== false) {
            drawUnits += 1;
            triangles += grp.count / 3;
          }
        }
      } else {
        drawUnits += 1;
        triangles += total / 3;
      }
    } else {
      drawUnits += 1; // LineSegments edge overlays
    }
  });
  return {
    meshes,
    drawUnits,
    triangles: Math.round(triangles),
    liveGeometries: geos.size,
    liveMaterials: mats.size,
  };
}

async function buildVisuals(world, view) {
  const t0 = performance.now();
  let buildSyncMs = 0;
  const groups = [];
  const createdByCategory = {};
  const createdGeoByCategory = {};
  for (const actor of world.actors) {
    const group = new THREE.Group();
    group.userData.actorId = actor.id;
    const m0 = nextMaterialId();
    const g0 = nextGeometryId();
    const s0 = performance.now();
    if (actor.getComponent('Brush')) {
      view._addBrushVisual(group, actor, actor.getComponent('Brush'), 1);
    } else if (actor.getComponent('Stair')) {
      view._addStairVisual(group, actor, actor.getComponent('Stair'), 1);
    } else {
      continue;
    }
    buildSyncMs += performance.now() - s0;
    await settle();
    const cat = categoryOf(actor);
    createdByCategory[cat] = (createdByCategory[cat] || 0) + (nextMaterialId() - m0 - 1);
    createdGeoByCategory[cat] = (createdGeoByCategory[cat] || 0) + (nextGeometryId() - g0 - 1);
    groups.push({ actor, group });
  }
  const buildTotalMs = performance.now() - t0;
  // Sum of per-actor windows: each window excludes the id probes themselves.
  const matCreated = Object.values(createdByCategory).reduce((a, b) => a + b, 0);
  const geoCreated = Object.values(createdGeoByCategory).reduce((a, b) => a + b, 0);
  return { groups, buildSyncMs, buildTotalMs, matCreated, geoCreated, createdByCategory };
}

async function measureWorldSolidRebuild(world, view, runs = 5) {
  const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const group = new THREE.Group();
    const t0 = performance.now();
    view._addBrushVisual(group, solid, solid.getComponent('Brush'), 1);
    times.push(performance.now() - t0);
    await settle();
    group.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose?.();
    });
  }
  times.sort((a, b) => a - b);
  return +times[Math.floor(times.length / 2)].toFixed(2);
}

async function runMode(world, batched, shareCutters = false) {
  globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = batched;
  globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS = shareCutters;
  const view = makeHarness();
  const built = await buildVisuals(world, view);

  const zero = () => ({ meshes: 0, drawUnits: 0, triangles: 0, liveGeometries: 0, liveMaterials: 0 });
  const total = zero();
  const globalMats = new Set();
  const globalGeos = new Set();
  const byCategory = {};
  let ws = null;
  for (const { actor, group } of built.groups) {
    group.traverse((o) => {
      if (o.geometry) globalGeos.add(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat) globalMats.add(mat);
    });
    const m = measureGroup(group);
    const cat = categoryOf(actor);
    byCategory[cat] = byCategory[cat] || zero();
    for (const k of Object.keys(total)) {
      total[k] += m[k];
      byCategory[cat][k] += m[k];
    }
    if (cat === 'worldSolid') ws = m;
  }
  total.liveMaterials = globalMats.size;
  total.liveGeometries = globalGeos.size;
  for (const [cat, n] of Object.entries(built.createdByCategory)) {
    byCategory[cat].materialsCreated = n;
  }
  const rebuildMs = await measureWorldSolidRebuild(world, view);
  for (const { group } of built.groups) {
    group.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose?.();
    });
  }
  return {
    all: total,
    byCategory,
    worldSolid: ws,
    materialsCreated: built.matCreated,
    geometriesCreated: built.geoCreated,
    buildSyncMs: +built.buildSyncMs.toFixed(1),
    buildTotalMs: +built.buildTotalMs.toFixed(1),
    worldSolidRebuildMs: rebuildMs,
  };
}

const pct = (before, after) => (before > 0 ? +(((before - after) / before) * 100).toFixed(1) : 0);

function reduction(before, after) {
  return {
    materialsCreatedPct: pct(before.materialsCreated, after.materialsCreated),
    liveMaterialsPct: pct(before.all.liveMaterials, after.all.liveMaterials),
    worldSolidMaterialsPct: pct(before.worldSolid?.liveMaterials, after.worldSolid?.liveMaterials),
    drawUnitsPct: pct(before.all.drawUnits, after.all.drawUnits),
    worldSolidDrawUnitsPct: pct(before.worldSolid?.drawUnits, after.worldSolid?.drawUnits),
    geometriesCreatedPct: pct(before.geometriesCreated, after.geometriesCreated),
  };
}

async function main() {
  const rows = [];
  for (const rooms of ROOM_COUNTS) {
    for (const [kind, make] of [['flush', buildFlushWorld], ['rep', buildRepresentativeWorld]]) {
      const world = make(rooms);
      // baseline: shipped behavior; batched: step 1; batchedShared: step 1 + shared cutter wireframes.
      const baseline = await runMode(world, false, false);
      const batched = await runMode(world, true, false);
      const batchedShared = await runMode(world, true, true);
      rows.push({
        label: `${kind}-${rooms}`,
        actors: world.actors.length,
        rooms: world._benchMeta?.roomCount,
        baseline,
        batched,
        batchedShared,
        reductionBatched: reduction(baseline, batched),
        reductionBatchedShared: reduction(baseline, batchedShared),
      });
      console.error(`${kind}-${rooms} done`);
    }
  }
  delete globalThis.__BLOODBOUND_BATCH_WORLD_SOLID;
  delete globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS;
  delete globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'node-render-bench.json');
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(JSON.stringify({ wrote: out, rows: rows.length }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
