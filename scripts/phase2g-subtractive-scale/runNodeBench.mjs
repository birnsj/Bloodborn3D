/**
 * Phase 2G — subtractive geometry scalability evaluation (Node).
 * Run: node scripts/phase2g-subtractive-scale/runNodeBench.mjs
 *
 * Does not permanently change MAX_SUBTRACT_SOLIDS (stays 64). Uses explicit
 * maxSolids / temporary globalThis override only inside this process.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOM_COUNTS,
  SOLID_CAPS,
  buildRepresentativeWorld,
  buildFlushWorld,
  worldToLevelData,
} from '../../src/dev/phase2gSubtractiveScaleWorlds.js';
import { getBrushBaseSolids, createExposedWorldSolidGeometry, getBrushRenderSolids } from '../../src/runtime/brushGeometry.js';
import { applyWorldSubtraction, pointInsideAnySolid, solidToAabb } from '../../src/runtime/brushBoolean.js';
import { serializeLevel } from '../../src/serialization/LevelSerializer.js';
import { deserializeLevel } from '../../src/serialization/LevelDeserializer.js';
import { PhysicsWorld } from '../../src/runtime/PhysicsWorld.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'results');

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function timeMs(fn, runs = 3) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return {
    min: +Math.min(...samples).toFixed(2),
    median: +median(samples).toFixed(2),
    max: +Math.max(...samples).toFixed(2),
  };
}

function worldSolid(world) {
  return world.actors.find((a) => a.tags?.includes('world-solid'));
}

function measureCarve(world, maxSolids) {
  const solid = worldSolid(world);
  const base = getBrushBaseSolids(solid.getComponent('Brush'));
  let last = null;
  const timing = timeMs(() => {
    last = applyWorldSubtraction(base.solids, solid, world, { maxSolids });
  }, 5);
  return {
    ok: !last.exceeded,
    solidCount: last.exceeded ? null : last.solids.length,
    wouldNeed: last.solidCount,
    offendingCutterId: last.offendingCutterId || null,
    carveMs: timing,
  };
}

function measureMesh(world, maxSolids) {
  const solid = worldSolid(world);
  const brush = solid.getComponent('Brush');
  let solids = [];
  let meshes = 0;
  let tris = 0;
  let bytes = 0;
  const timing = timeMs(() => {
    solids = getBrushRenderSolids(brush, { world, actor: solid, maxSolids }).solids;
    meshes = 0;
    tris = 0;
    bytes = 0;
    for (const s of solids) {
      const geom = createExposedWorldSolidGeometry(
        s,
        solids,
        brush.size,
        brush.uv,
        {
          origin: {
            x: s.center.x - s.size.x * 0.5,
            y: s.center.y - s.size.y * 0.5,
            z: s.center.z - s.size.z * 0.5,
          },
        },
        brush.faceUVs,
      );
      if (!geom) continue;
      meshes += 1;
      const idx = geom.index?.count ?? 0;
      tris += idx / 3;
      bytes += (geom.attributes.position?.array?.byteLength || 0)
        + (geom.attributes.normal?.array?.byteLength || 0)
        + (geom.attributes.uv?.array?.byteLength || 0)
        + (geom.index?.array?.byteLength || 0);
      geom.dispose();
    }
  }, 3);
  return {
    solidCount: solids.length,
    meshes,
    triangles: Math.round(tris),
    geometryBytes: bytes,
    geometryKB: +(bytes / 1024).toFixed(1),
    meshGenMs: timing,
  };
}

function measureEditLatency(world, maxSolids) {
  const solid = worldSolid(world);
  const base = getBrushBaseSolids(solid.getComponent('Brush'));
  const cutter = world.actors.find((a) => a.tags?.includes('maze-room'))
    || world.actors.find((a) => a.getComponent('Brush')?.operation === 'subtract');
  if (!cutter) return null;
  const before = { ...cutter.transform.position };
  const timing = timeMs(() => {
    cutter.transform.position = { ...before, x: before.x + 25 };
    applyWorldSubtraction(base.solids, solid, world, { maxSolids });
    cutter.transform.position = { ...before };
    applyWorldSubtraction(base.solids, solid, world, { maxSolids });
  }, 5);
  return { moveCutterRecarveMs: timing };
}

async function measurePhysics(world, maxSolids) {
  const solid = worldSolid(world);
  const brush = solid.getComponent('Brush');
  const { solids } = getBrushRenderSolids(brush, { world, actor: solid, maxSolids });

  // Temporary override so PhysicsWorld / getBrushRenderSolids use the bench cap.
  const prev = globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS;
  globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = maxSolids;
  const physics = new PhysicsWorld();
  const t0 = performance.now();
  await physics.init();
  physics.buildFromWorld(world);
  const initMs = +(performance.now() - t0).toFixed(2);
  let colliderCount = 0;
  for (const entry of physics._bodies.values()) {
    colliderCount += entry.colliders?.length || 0;
  }
  const bodyCount = physics._bodies.size;
  physics.dispose();
  globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS = prev;

  return {
    bodyCount,
    colliderCount,
    worldSolidColliders: solids.length,
    physicsInitMs: initMs,
  };
}

function measureSerialize(world) {
  const data = worldToLevelData(world);
  const json = JSON.stringify(data);
  const ser = timeMs(() => {
    JSON.stringify(serializeLevel(world));
  }, 3);
  const parsed = JSON.parse(json);
  const de = timeMs(() => {
    deserializeLevel(parsed, { validateGeometry: false });
  }, 3);
  return {
    actors: world.actors.length,
    jsonBytes: json.length,
    jsonKB: +(json.length / 1024).toFixed(1),
    serializeMs: ser,
    deserializeMs: de,
  };
}

/**
 * Correctness: room centers must be empty of solids; a point deep in the outer
 * shell (below floor of first room) should be solid; stairs must exist when asked.
 */
function verifyCorrectness(world, maxSolids) {
  const solid = worldSolid(world);
  const brush = solid.getComponent('Brush');
  const { solids, exceeded } = getBrushRenderSolids(brush, { world, actor: solid, maxSolids });
  if (exceeded) {
    return { ok: false, reason: 'carve exceeded cap — incomplete geometry', solidCount: solids.length };
  }

  const issues = [];
  const rooms = world.actors.filter((a) => a.tags?.includes('maze-room'));
  const sample = rooms.filter((_, i) => i % Math.max(1, Math.floor(rooms.length / 8)) === 0).slice(0, 8);
  for (const room of sample) {
    const p = room.transform.position;
    const local = {
      x: p.x - solid.transform.position.x,
      y: p.y + 150 - solid.transform.position.y,
      z: p.z - solid.transform.position.z,
    };
    if (pointInsideAnySolid(local, solids)) {
      issues.push(`room ${room.name} center still solid`);
    }
  }

  // Point near world-solid corner shell should remain solid.
  const box = solidToAabb({
    center: { x: 0, y: 0, z: 0 },
    size: brush.size,
  });
  const shellProbe = {
    x: box.min.x + 10,
    y: box.min.y + 10,
    z: box.min.z + 10,
  };
  if (!pointInsideAnySolid(shellProbe, solids)) {
    issues.push('outer shell corner not solid');
  }

  const stairs = world.actors.filter((a) => a.tags?.includes('bench-stair'));
  return {
    ok: issues.length === 0,
    issues,
    sampledRooms: sample.length,
    stairActors: stairs.length,
    solidCount: solids.length,
    approxVolumeEu3: solids.reduce((n, s) => n + s.size.x * s.size.y * s.size.z, 0),
  };
}

async function benchVariant(label, world) {
  const meta = world._benchMeta || {};
  const unconstrained = measureCarve(world, 1e9);
  const byCap = {};
  for (const cap of SOLID_CAPS) {
    const carve = measureCarve(world, cap);
    const fits = carve.ok;
    byCap[cap] = {
      fits,
      ...carve,
      mesh: fits ? measureMesh(world, cap) : null,
      edit: fits ? measureEditLatency(world, cap) : null,
      physics: fits ? await measurePhysics(world, cap) : null,
      correctness: fits ? verifyCorrectness(world, cap) : { ok: false, reason: 'over cap' },
    };
  }

  // Full unconstrained mesh/physics for bottleneck analysis when over every listed cap.
  const fullMesh = measureMesh(world, 1e9);
  const fullPhys = unconstrained.ok ? await measurePhysics(world, 1e9) : null;
  const fullEdit = measureEditLatency(world, 1e9);
  const io = measureSerialize(world);

  return {
    label,
    meta: {
      ...meta,
      actors: world.actors.length,
      cutters: meta.cutters
        ?? world.actors.filter((a) => a.getComponent('Brush')?.operation === 'subtract').length,
    },
    unconstrainedSolids: unconstrained.solidCount ?? unconstrained.wouldNeed,
    unconstrainedCarveMs: unconstrained.carveMs,
    fullMesh,
    fullPhys,
    fullEdit,
    io,
    byCap,
  };
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    permanentLimit: 64,
    caps: SOLID_CAPS,
    roomCounts: ROOM_COUNTS,
    notes: [
      'Carve / mesh / physics measured with temporary maxSolids; MAX_SUBTRACT_SOLIDS remains 64.',
      'Representative worlds include corridors, upper floors, window punches, shafts, additive stairs.',
      'Flush worlds are the maze-only baseline (lower fragmentation).',
    ],
    flush: [],
    representative: [],
  };

  for (const rooms of ROOM_COUNTS) {
    console.error(`flush ${rooms}…`);
    results.flush.push(await benchVariant(`flush-${rooms}`, buildFlushWorld(rooms)));
    console.error(`representative ${rooms}…`);
    results.representative.push(
      await benchVariant(`rep-${rooms}`, buildRepresentativeWorld(rooms)),
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'node-bench.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({
    wrote: outPath,
    summary: [...results.flush, ...results.representative].map((r) => ({
      label: r.label,
      solids: r.unconstrainedSolids,
      carveMs: r.unconstrainedCarveMs.median,
      meshMs: r.fullMesh.meshGenMs.median,
      meshes: r.fullMesh.meshes,
      tris: r.fullMesh.triangles,
      physMs: r.fullPhys?.physicsInitMs,
      colliders: r.fullPhys?.colliderCount,
      jsonKB: r.io.jsonKB,
      fits: Object.fromEntries(
        SOLID_CAPS.map((c) => [c, r.byCap[c].fits]),
      ),
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
