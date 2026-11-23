import { describe, expect, it } from 'vitest';
import {
  classifySurface,
  selectPlacementHit,
  snapPlacementPosition,
  computePlacePose,
  defaultFootprintAt,
  isEmbeddedInSolids,
  SURFACE_KIND,
} from '../editor/creation/surfacePlacement.js';
import {
  commitCreatePlacement,
  previewBoundsForPayload,
} from '../editor/creation/commitCreatePlacement.js';
import { WALL_MODULE_SIZE } from '../core/units.js';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { AddActorsCommand } from '../editor/history/commands.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createRampFromBounds } from '../editor/rampFactory.js';
import { createStaticMeshActor } from '../editor/meshFactory.js';
import { createPlayerSpawnActor } from '../editor/spawnFactory.js';
import { createLightActor } from '../editor/lightFactory.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

function hit({ y, ny = 1, actorId = 'a', brushKind = null, tags = [], distance = 1 }) {
  return {
    actorId,
    distance,
    point: { x: 0, y, z: 0 },
    normal: { x: 0, y: ny, z: 0 },
    brushKind,
    tags,
    locked: false,
    visible: true,
  };
}

describe('surface placement filtering', () => {
  it('classifies floors, walls, and ceilings', () => {
    expect(classifySurface(hit({ y: 0, ny: 1, brushKind: 'floor' }))).toBe(SURFACE_KIND.support);
    expect(classifySurface(hit({ y: 100, ny: 0, brushKind: 'wall' }))).toBe(SURFACE_KIND.wall);
    expect(classifySurface(hit({ y: 300, ny: -1, brushKind: 'ceiling' }))).toBe(SURFACE_KIND.ceiling);
  });

  it('skips ceiling undersides so tabletops win under a ceiling', () => {
    const hits = [
      hit({ y: 300, ny: -1, actorId: 'ceiling', brushKind: 'ceiling', distance: 1 }),
      hit({ y: 90, ny: 1, actorId: 'table', tags: ['prop'], distance: 2 }),
      hit({ y: 10, ny: 1, actorId: 'floor', brushKind: 'floor', distance: 3 }),
    ];
    const { hit: chosen, candidates } = selectPlacementHit(hits, { placement: 'upright' });
    expect(chosen.actorId).toBe('table');
    expect(candidates.map((c) => c.actorId)).toEqual(['table', 'floor']);
  });

  it('cycles candidates and prefers walls for wall placement', () => {
    const hits = [
      hit({ y: 90, ny: 1, actorId: 'table', distance: 1 }),
      hit({ y: 150, ny: 0, actorId: 'wall', brushKind: 'wall', distance: 1.5 }),
    ];
    const wall = selectPlacementHit(hits, { placement: 'wall' });
    expect(wall.hit.actorId).toBe('wall');
    const cycled = selectPlacementHit(
      [
        hit({ y: 90, ny: 1, actorId: 'table', distance: 1 }),
        hit({ y: 10, ny: 1, actorId: 'floor', brushKind: 'floor', distance: 2 }),
      ],
      { placement: 'upright', candidateIndex: 1 },
    );
    expect(cycled.hit.actorId).toBe('floor');
  });

  it('snaps XZ while preserving surface elevation', () => {
    const snapped = snapPlacementPosition(
      { x: 37, y: 88.5, z: 12 },
      { gridSize: 25, gridSnap: true, snapY: false },
    );
    expect(snapped).toEqual({ x: 25, y: 88.5, z: 0 });
    const free = snapPlacementPosition(
      { x: 37, y: 88.5, z: 12 },
      { gridSnap: false },
    );
    expect(free).toEqual({ x: 37, y: 88.5, z: 12 });
  });

  it('computes upright pose on support and wall yaw', () => {
    const floorPose = computePlacePose(
      hit({ y: 20, ny: 1, brushKind: 'floor' }),
      { placement: 'upright', gridSnap: true, gridSize: 25, lightLift: 0 },
    );
    expect(floorPose.valid).toBe(true);
    expect(floorPose.position.y).toBe(20);

    const wallPose = computePlacePose(
      {
        ...hit({ y: 150, ny: 0, brushKind: 'wall' }),
        normal: { x: 1, y: 0, z: 0 },
        point: { x: -200, y: 150, z: 10 },
      },
      { placement: 'wall', gridSnap: false, halfHeight: 5 },
    );
    expect(wallPose.valid).toBe(true);
    expect(wallPose.rotation.y).toBeCloseTo(90, 5);
  });

  it('rejects embedded centers', () => {
    expect(isEmbeddedInSolids(
      { x: 0, y: 50, z: 0 },
      [{ actorId: 'box', min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 100, z: 50 }, collidable: true }],
    )).toBe(true);
    expect(isEmbeddedInSolids(
      { x: 0, y: 50, z: 0 },
      [{ actorId: 'support', min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 40, z: 50 } }],
      { supportActorId: 'support' },
    )).toBe(false);
  });

  it('builds default footprints', () => {
    const fp = defaultFootprintAt('floor', { x: 100, y: 0, z: 100 }, 25);
    expect(fp.min.x).toBeLessThan(fp.max.x);
  });
});

describe('placement commit + undo', () => {
  it('drag-placing a ramp creates a Ramp actor, not a subtract brush', async () => {
    const world = new World({ name: 'ramp-place' });
    const created = [];
    const api = {
      gridSize: 25,
      gridSnap: true,
      createBrushAtBounds: (kind, min, max) => {
        const actor = kind === 'ramp'
          ? createRampFromBounds({ min, max, gridSize: 25 })
          : createBrushFromBounds({
            kind: kind === 'subtract' ? 'box' : kind,
            min,
            max,
            gridSize: 25,
            operation: kind === 'subtract' ? 'subtract' : 'add',
          });
        created.push({ kind, actor });
        world.addActor(actor);
        return actor;
      },
      placeLight: () => null,
      placePlayerSpawn: () => null,
      createCell: () => null,
      placeMeshAsset: () => null,
      placePrefabAsset: async () => null,
    };

    const actor = await commitCreatePlacement(
      { action: 'mode', tool: 'ramp', toolId: 'ramp', placement: 'footprint' },
      { valid: true, position: { x: 0, y: 0, z: 0 } },
      api,
    );
    expect(created[0].kind).toBe('ramp');
    expect(actor.getComponent('Ramp')).toBeTruthy();
    expect(actor.getComponent('Brush')).toBeFalsy();
  });

  it('places light/mesh via commit helper and supports undo', async () => {
    const world = new World({ name: 'place' });
    const history = new HistoryStack();

    const placeViaCommand = (actor, label) => {
      history.execute(new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label,
      }));
      return world.getActor(actor.id);
    };

    const api = {
      gridSize: 25,
      gridSnap: true,
      createBrushAtBounds: (kind, min, max) => {
        const actor = createBrushFromBounds({ kind, min, max, gridSize: 25 });
        return placeViaCommand(actor, 'brush');
      },
      placeLight: (type, position) => {
        const actor = createLightActor({ lightType: type, position, gridSize: 25, snapY: false });
        return placeViaCommand(actor, 'light');
      },
      placePlayerSpawn: (position) => {
        const actor = createPlayerSpawnActor({ position, gridSize: 25, snapY: false });
        return placeViaCommand(actor, 'spawn');
      },
      createCell: () => null,
      placeMeshAsset: (asset, position) => {
        const actor = createStaticMeshActor({
          assetId: asset.id,
          name: asset.name,
          position,
          gridSize: 25,
          snapY: false,
        });
        return placeViaCommand(actor, 'mesh');
      },
      placePrefabAsset: async () => null,
    };

    const light = await commitCreatePlacement(
      { action: 'place', placeKind: 'light', lightType: 'point', placement: 'upright' },
      { valid: true, position: { x: 50, y: 120, z: 25 } },
      api,
    );
    expect(light).toBeTruthy();
    expect(light.transform.position.y).toBe(120);

    const mesh = await commitCreatePlacement(
      { action: 'asset', assetId: 'mesh.crate', assetKind: 'mesh', placement: 'upright' },
      { valid: true, position: { x: 0, y: 90, z: 0 } },
      api,
    );
    expect(mesh.transform.position.y).toBe(90);

    expect(history.canUndo).toBe(true);
    history.undo();
    expect(world.getActor(mesh.id)).toBeFalsy();
    history.undo();
    expect(world.getActor(light.id)).toBeFalsy();
    history.redo();
    expect(world.getActor(light.id)).toBeTruthy();

    const json = serializeLevel(world);
    const again = deserializeLevel(json);
    expect(again.actors.some((a) => a.getComponent('Light'))).toBe(true);
  });

  it('previewBoundsForPayload matches stair drop footprint', () => {
    const bounds = previewBoundsForPayload(
      { action: 'mode', tool: 'stair', toolId: 'stair' },
      { x: 100, y: 50, z: -25 },
      25,
    );
    expect(bounds).toBeTruthy();
    expect(bounds.kind).toBe('stair');
    expect(bounds.min.y).toBe(50);
    expect(bounds.max.y).toBe(50 + WALL_MODULE_SIZE);
    expect(bounds.min.x).toBeLessThan(bounds.max.x);
    expect(bounds.min.z).toBeLessThan(bounds.max.z);
  });
});
