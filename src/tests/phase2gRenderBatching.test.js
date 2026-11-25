import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSubtractiveMazeWorld } from '../editor/subtractiveMazeFactory.js';
import {
  createBatchedWorldSolidGeometry,
  createExposedWorldSolidGeometry,
  getBrushRenderSolids,
} from '../runtime/brushGeometry.js';
import { FACE_OUTWARD } from '../runtime/brushBoolean.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';
import { disposeObjectTree } from '../runtime/gpuResources.js';
import {
  isCutterMaterialSharingEnabled,
  isWorldSolidBatchingEnabled,
} from '../runtime/renderExperiments.js';
import { surfaceIdFromHit } from '../runtime/surfaces.js';
import { toMeters } from '../core/units.js';

const { SceneView } = await import('../runtime/SceneView.js');

const FLAGS = ['__BLOODBOUND_BATCH_WORLD_SOLID', '__BLOODBOUND_SHARE_CUTTER_MATERIALS'];
const settle = () => new Promise((r) => setImmediate(r));

function resetFlags() {
  for (const f of FLAGS) delete globalThis[f];
}

function makeView(definitions = {}) {
  const view = Object.create(SceneView.prototype);
  view._syncToken = 1;
  view._actorMeshes = new Map();
  view._actorEpochHighWater = new Map();
  view.selectedActorIds = [];
  view.selectedSurface = null;
  view.geometrySelection = null;
  view.editMode = true;
  view.gridSize = 25;
  view.maxAnisotropy = 8;
  view.root = new THREE.Group();
  view.viewportColors = { subtract: 0xc23b4a, selection: 0xffaa33 };
  view.syncStats = {
    fullSyncs: 0, incrementalSyncs: 0, actorAdds: 0, actorRemoves: 0, actorRebuilds: 0,
    transformUpdates: 0, hierarchyMoves: 0, geometryAllocs: 0, materialAllocs: 0,
  };
  view.assetResolver = {
    getMaterialDefinition: (id) => definitions[id] || { id, baseColor: '#808080' },
    getTextureUrl: () => null,
  };
  view.applyWorldAmbient = () => {};
  view.setSelection = vi.fn();
  view._refreshSurfaceHighlight = vi.fn();
  view._applyEditorOverlayVisibility = vi.fn();
  view._clearGeometryFaceOverlays = () => {};
  view._clearSelectionHelpers = () => {};
  view._createLightGizmo = () => new THREE.Group();
  view._addStaticMeshVisual = () => {};
  for (const key of [
    'clearWorldMeshes', '_createLight', '_stampActorVisual', '_detachChildActorGroups',
    '_isActorVisualCurrent', 'updateActorTransform', 'removeActorVisual', 'rebuildActorVisual',
    '_populateActorComponents', '_syncActorHierarchy', 'resetSyncStats', 'getSyncStats',
    'syncIncremental', 'syncFromWorld', '_addActorVisual', '_addBrushVisual',
    '_addBatchedWorldSolidMesh', '_getSharedCutterMaterials', '_applySurfaceMaterials',
    '_applyBrushMaterials', '_applyHiddenHullFaces', '_addStairVisual',
    '_addConvexBrushVisual', '_addRampVisual', '_addColumnVisual', '_addArchVisual',
    '_addCurvedWallVisual',
  ]) {
    view[key] = SceneView.prototype[key];
  }
  return view;
}

function worldSolidOf(world) {
  return world.actors.find((a) => a.tags?.includes('world-solid'));
}

function worldSolidMeshes(view, world) {
  const solid = worldSolidOf(world);
  const meshes = [];
  view._actorMeshes.get(solid.id).group.traverse((obj) => {
    if (obj.isMesh && obj.userData.actorId === solid.id) meshes.push(obj);
  });
  return meshes;
}

function drawUnits(meshes) {
  let n = 0;
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material) && mesh.geometry.groups.length) {
      n += mesh.geometry.groups.filter((g) => g.count > 0).length;
    } else {
      n += 1;
    }
  }
  return n;
}

/** Position/normal/uv per triangle, sorted, so two geometries compare as triangle sets. */
function triangleSet(geom, offset = { x: 0, y: 0, z: 0 }) {
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  const uv = geom.attributes.uv;
  const idx = geom.index;
  const r = (v) => Math.round(v * 1e4) / 1e4;
  const tris = [];
  for (let i = 0; i < idx.count; i += 3) {
    const verts = [0, 1, 2].map((k) => {
      const v = idx.getX(i + k);
      return [
        r(pos.getX(v) + offset.x), r(pos.getY(v) + offset.y), r(pos.getZ(v) + offset.z),
        r(nor.getX(v)), r(nor.getY(v)), r(nor.getZ(v)),
        r(uv.getX(v)), r(uv.getY(v)),
      ].join(',');
    });
    tris.push(verts.join('|'));
  }
  return tris.sort();
}

function mazeWorld(cols = 3, rows = 2) {
  const world = createSubtractiveMazeWorld({ cols, rows, showcase: false, seed: 7 });
  const solid = worldSolidOf(world);
  const comp = solid.getComponent('Brush');
  return { world, solid, comp, solids: getBrushRenderSolids(comp, { world, actor: solid }).solids };
}

beforeEach(resetFlags);
afterEach(resetFlags);

describe('Phase 2G rendering integration — flags', () => {
  it('defaults to ON (product path)', () => {
    expect(isWorldSolidBatchingEnabled()).toBe(true);
    expect(isCutterMaterialSharingEnabled()).toBe(true);
  });

  it('keeps the per-solid path when batching is explicitly disabled', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = false;
    const { world } = mazeWorld();
    const view = makeView();
    view.syncFromWorld(world);
    await settle();
    const meshes = worldSolidMeshes(view, world);
    expect(meshes.length).toBeGreaterThan(10);
    expect(meshes.some((m) => m.userData.batchedWorldSolid)).toBe(false);
    expect(meshes.every((m) => m.userData.surfaceScheme === 'grouped')).toBe(true);
  });

  it('batches by default without setting the global', async () => {
    const { world } = mazeWorld(4, 3);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();
    const substrate = worldSolidMeshes(view, world).filter((m) => m.userData.substrateMesh);
    expect(substrate).toHaveLength(1);
    expect(substrate[0].userData.batchedWorldSolid).toBe(true);
  });
});

describe('createBatchedWorldSolidGeometry', () => {
  it('contains exactly the triangles of every per-solid exposed geometry', () => {
    const { comp, solids } = mazeWorld(4, 3);
    const expected = [];
    for (const solid of solids) {
      const bias = {
        origin: {
          x: solid.center.x - solid.size.x / 2,
          y: solid.center.y - solid.size.y / 2,
          z: solid.center.z - solid.size.z / 2,
        },
      };
      const part = createExposedWorldSolidGeometry(solid, solids, comp.size, comp.uv, bias, null);
      if (!part) continue;
      expected.push(...triangleSet(part, {
        x: toMeters(solid.center.x), y: toMeters(solid.center.y), z: toMeters(solid.center.z),
      }));
      part.dispose();
    }
    const merged = createBatchedWorldSolidGeometry(solids, comp.size, comp.uv, null);
    expect(expected.length).toBeGreaterThan(100);
    expect(triangleSet(merged)).toEqual(expected.sort());
    merged.dispose();
  });

  it('groups triangles by semantic face and each triangle faces its surface id', () => {
    const { comp, solids } = mazeWorld(4, 3);
    const geom = createBatchedWorldSolidGeometry(solids, comp.size, comp.uv, null);
    expect(geom.userData.surfaceIds).toEqual(FACE_KEYS);
    expect(geom.groups.length).toBeLessThanOrEqual(6);
    const nor = geom.attributes.normal;
    const mesh = new THREE.Mesh(geom, FACE_KEYS.map(() => new THREE.MeshBasicMaterial()));
    mesh.userData.surfaceIds = geom.userData.surfaceIds;
    mesh.userData.surfaceScheme = 'grouped';

    let checked = 0;
    for (const g of geom.groups) {
      for (let i = g.start; i < g.start + g.count; i += 3) {
        const tri = i / 3;
        const surfaceId = surfaceIdFromHit(mesh, tri);
        expect(surfaceId).toBe(FACE_KEYS[g.materialIndex]);
        const v = geom.index.getX(i);
        const out = FACE_OUTWARD[surfaceId];
        expect([nor.getX(v), nor.getY(v), nor.getZ(v)]).toEqual([out.x, out.y, out.z]);
        checked += 1;
      }
    }
    expect(checked).toBe(geom.index.count / 3);
  });

  it('applies a per-face UV override to that face only', () => {
    const { comp, solids } = mazeWorld(3, 2);
    const plain = createBatchedWorldSolidGeometry(solids, comp.size, comp.uv, null);
    const edited = createBatchedWorldSolidGeometry(
      solids, comp.size, comp.uv, { py: { scale: { x: 2, y: 2 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    );
    const pyIndex = FACE_KEYS.indexOf('py');
    let pyChecked = 0;
    for (const g of plain.groups) {
      for (let i = g.start; i < g.start + g.count; i += 1) {
        const v = plain.index.getX(i);
        const du = edited.attributes.uv.getX(v) - plain.attributes.uv.getX(v);
        if (g.materialIndex === pyIndex) {
          expect(edited.attributes.uv.getX(v)).toBeCloseTo(plain.attributes.uv.getX(v) * 2, 4);
          pyChecked += 1;
        } else {
          expect(du).toBe(0);
        }
      }
    }
    expect(pyChecked).toBeGreaterThan(0);
  });

  it('returns null when nothing is exposed', () => {
    const { comp } = mazeWorld();
    const lone = [{ center: { x: 0, y: 0, z: 0 }, size: { ...comp.size }, role: 'solid' }];
    expect(createBatchedWorldSolidGeometry(lone, comp.size, comp.uv, null)).toBeNull();
  });
});

describe('SceneView batched World Solid visual', () => {
  it('draws the World Solid as one mesh with at most six draw units', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const { world } = mazeWorld(4, 3);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();

    const meshes = worldSolidMeshes(view, world);
    const substrate = meshes.filter((m) => m.userData.substrateMesh);
    expect(substrate).toHaveLength(1);
    expect(substrate[0].userData.batchedWorldSolid).toBe(true);
    expect(substrate[0].userData.surfaceScheme).toBe('grouped');
    expect(substrate[0].material).toHaveLength(6);
    expect(drawUnits(substrate)).toBeLessThanOrEqual(6);
  });

  it('allocates far fewer materials and draw units than per-solid meshes', async () => {
    const { world } = mazeWorld(5, 4);

    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = false;
    const base = makeView();
    base.syncFromWorld(world);
    await settle();
    const baseMeshes = worldSolidMeshes(base, world).filter((m) => m.userData.substrateMesh);
    const baseMats = new Set(baseMeshes.flatMap((m) => m.material));

    delete globalThis.__BLOODBOUND_BATCH_WORLD_SOLID;
    const batched = makeView();
    batched.syncFromWorld(world);
    await settle();
    const batchedMeshes = worldSolidMeshes(batched, world).filter((m) => m.userData.substrateMesh);
    const batchedMats = new Set(batchedMeshes.flatMap((m) => m.material));

    expect(batchedMats.size).toBe(6);
    expect(baseMats.size).toBeGreaterThan(batchedMats.size * 10);
    expect(drawUnits(batchedMeshes)).toBeLessThan(drawUnits(baseMeshes) / 10);
    // Same surfaces drawn: only the batching changed.
    const triCount = (meshes) => meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
    expect(triCount(batchedMeshes)).toBe(triCount(baseMeshes));
  });

  it('keeps per-face materials: overridden faces get their material, others the default', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const { world, comp } = mazeWorld(3, 2);
    comp.materialId = 'mat_wall';
    comp.faceMaterials = { py: 'mat_floor', ny: 'mat_ceiling' };
    const view = makeView({
      mat_wall: { id: 'mat_wall', baseColor: '#aa0000' },
      mat_floor: { id: 'mat_floor', baseColor: '#00aa00' },
      mat_ceiling: { id: 'mat_ceiling', baseColor: '#0000aa' },
    });
    view.syncFromWorld(world);
    await settle();

    const mesh = worldSolidMeshes(view, world).find((m) => m.userData.batchedWorldSolid);
    const colorOf = (key) => `#${mesh.material[FACE_KEYS.indexOf(key)].color.getHexString()}`;
    expect(colorOf('py')).toBe('#00aa00');
    expect(colorOf('ny')).toBe('#0000aa');
    for (const key of ['px', 'nx', 'pz', 'nz']) expect(colorOf(key)).toBe('#aa0000');
  });

  it('paints a surface highlight on the selected face material only', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const { world, solid } = mazeWorld(3, 2);
    const view = makeView();
    view.viewportColors = { subtract: 0xc23b4a, selection: 0xffaa33 };
    view.syncFromWorld(world);
    await settle();

    // Same traversal the real highlight uses; binds to the batched mesh's surface ids.
    view._paintSurfaceHighlight = SceneView.prototype._paintSurfaceHighlight;
    view._restoreSurfaceEmissives = SceneView.prototype._restoreSurfaceEmissives;
    view._paintSurfaceHighlight({ actorId: solid.id, surfaceId: 'py' }, 0xffaa33, 0.5);

    const mesh = worldSolidMeshes(view, world).find((m) => m.userData.batchedWorldSolid);
    const lit = mesh.material.map((m) => m.userData._bbSurfaceHighlight === true);
    expect(lit).toEqual(FACE_KEYS.map((k) => k === 'py'));
    view._restoreSurfaceEmissives();
    expect(mesh.material.some((m) => m.userData._bbSurfaceHighlight)).toBe(false);
  });

  it('rebuilds the batched mesh when a cutter moves (incremental sync) with no full sync', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const { world } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();
    const before = worldSolidMeshes(view, world).find((m) => m.userData.batchedWorldSolid);
    const beforeTris = before.geometry.index.count;

    const cutter = world.actors.find((a) => a.tags?.includes('maze-room'));
    cutter.transform.position = { ...cutter.transform.position, y: cutter.transform.position.y + 50 };
    view.resetSyncStats();
    view.syncIncremental(world);
    await settle();

    const after = worldSolidMeshes(view, world).find((m) => m.userData.batchedWorldSolid);
    expect(view.getSyncStats().fullSyncs).toBe(0);
    expect(after).not.toBe(before);
    expect(after.geometry.index.count).not.toBe(beforeTris);
  });

  it('disposes the batched geometry and materials exactly once on teardown', async () => {
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const { world, solid } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();

    const group = view._actorMeshes.get(solid.id).group;
    const mesh = group.children.find((c) => c.userData.batchedWorldSolid);
    const geomSpy = vi.spyOn(mesh.geometry, 'dispose');
    const matSpies = mesh.material.map((m) => vi.spyOn(m, 'dispose'));
    disposeObjectTree(group);
    expect(geomSpy).toHaveBeenCalledTimes(1);
    for (const spy of matSpies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not change the collision solids', () => {
    const { world, solid, comp } = mazeWorld(4, 3);
    const before = getBrushRenderSolids(comp, { world, actor: solid }).solids;
    globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true;
    const after = getBrushRenderSolids(comp, { world, actor: solid }).solids;
    expect(after).toEqual(before);
  });
});

describe('Shared cutter wireframe materials', () => {
  it('shares one fill + one line material across all cutters by default', async () => {
    const { world } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();

    const fills = new Set();
    const lines = new Set();
    let cutters = 0;
    for (const actor of world.actors) {
      if (actor.getComponent('Brush')?.operation !== 'subtract') continue;
      cutters += 1;
      view._actorMeshes.get(actor.id).group.traverse((obj) => {
        if (obj.userData?.brushOperation === 'subtract') fills.add(obj.material);
        else if (obj.isLineSegments && obj.userData?.editorOnly) lines.add(obj.material);
      });
    }
    expect(cutters).toBeGreaterThan(5);
    expect(fills.size).toBe(1);
    expect(lines.size).toBe(1);
  });

  it('uses polygonOffset on the cutter fill so coplanar faces do not z-fight', async () => {
    const { world } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();
    const fill = view._getSharedCutterMaterials().fill;
    expect(fill.polygonOffset).toBe(true);
    expect(fill.polygonOffsetFactor).toBe(-1);
    expect(fill.polygonOffsetUnits).toBe(-1);
    expect(fill.depthWrite).toBe(false);
  });

  it('actor teardown leaves the shared materials alive; view.dispose frees them', async () => {
    const { world } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();

    const shared = view._getSharedCutterMaterials();
    const fillSpy = vi.spyOn(shared.fill, 'dispose');
    const lineSpy = vi.spyOn(shared.line, 'dispose');
    const cutter = world.actors.find((a) => a.getComponent('Brush')?.operation === 'subtract');
    disposeObjectTree(view._actorMeshes.get(cutter.id).group);
    expect(fillSpy).not.toHaveBeenCalled();
    expect(lineSpy).not.toHaveBeenCalled();
  });

  it('tracks the viewport subtract color', () => {
    const view = makeView();
    expect(view._getSharedCutterMaterials().fill.color.getHex()).toBe(0xc23b4a);
    view.viewportColors.subtract = 0x112233;
    expect(view._getSharedCutterMaterials().fill.color.getHex()).toBe(0x112233);
    expect(view._getSharedCutterMaterials().line.color.getHex()).toBe(0x112233);
  });

  it('falls back to per-cutter materials when sharing is disabled', async () => {
    globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS = false;
    const { world } = mazeWorld(3, 2);
    const view = makeView();
    view.syncFromWorld(world);
    await settle();
    const fills = new Set();
    for (const actor of world.actors) {
      if (actor.getComponent('Brush')?.operation !== 'subtract') continue;
      view._actorMeshes.get(actor.id).group.traverse((obj) => {
        if (obj.userData?.brushOperation === 'subtract') fills.add(obj.material);
      });
    }
    expect(fills.size).toBeGreaterThan(5);
  });
});
