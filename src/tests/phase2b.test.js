import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { LightComponent } from '../components/LightComponent.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import {
  createMaterialDefinition,
  normalizeMaterialDefinition,
  createBrushUvState,
} from '../materials/MaterialDefinition.js';
import {
  normalizeRegistry,
  findAsset,
  ASSET_KINDS,
} from '../assets/AssetRegistry.js';
import {
  validateMeshScale,
  metersToEditorSize,
  toCatalogAsset,
} from '../assets/assetCatalog.js';
import {
  EDITOR_UNITS_PER_METER,
  toMeters,
  toEditorUnits,
} from '../core/units.js';
import { TEXTURE_TILE_EDITOR_UNITS, TARGET_TEXEL_DENSITY } from '../runtime/brushGeometry.js';
import { SetBrushMaterialCommand, SetLightPropertiesCommand } from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 2B materials', () => {
  it('creates and normalizes engine-neutral material definitions', () => {
    const mat = createMaterialDefinition({
      name: 'Wall',
      baseColor: '#aabbcc',
      baseColorMapId: 'tex_1',
      roughness: 0.4,
      metalness: 0.1,
      opacity: 0.9,
      uvScale: { x: 2, y: 2 },
    });
    expect(mat.id).toMatch(/^mat/);
    expect(mat.transparent).toBe(true);
    expect(normalizeMaterialDefinition(mat)).toMatchObject({
      name: 'Wall',
      baseColorMapId: 'tex_1',
      roughness: 0.4,
    });
  });

  it('serializes brush material references and UV state', () => {
    const world = new World({ name: 'Mats', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'actor_wall',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [
        new BrushComponent({
          id: 'comp_wall',
          size: { x: 300, y: 300, z: 20 },
          materialId: 'mat_concrete',
          faceMaterials: { py: 'mat_trim' },
          uv: createBrushUvState({ scale: { x: 1, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 90 }),
        }),
      ],
    }));

    const json = serializeLevel(world);
    const brush = json.actors[0].components[0];
    expect(brush.materialId).toBe('mat_concrete');
    expect(brush.faceMaterials.py).toBe('mat_trim');
    expect(brush.uv.rotation).toBe(90);

    const restored = deserializeLevel(json);
    const again = serializeLevel(restored);
    expect(again).toEqual(json);
  });

  it('documents architectural texel density targets', () => {
    expect(TEXTURE_TILE_EDITOR_UNITS).toBe(100);
    expect(TARGET_TEXEL_DENSITY).toBeCloseTo(2048, 5);
  });
});

describe('Phase 2B asset registry + scale', () => {
  it('keeps persistent asset IDs independent of paths', () => {
    const registry = normalizeRegistry({
      assets: [
        {
          id: 'mesh_abc',
          kind: ASSET_KINDS.mesh,
          name: 'Crate',
          path: 'meshes/mesh_abc.glb',
          originalName: 'crate.glb',
        },
      ],
    });
    const entry = findAsset(registry, 'mesh_abc');
    expect(entry.path).toContain('meshes/');
    const catalog = toCatalogAsset(entry);
    expect(catalog.id).toBe('mesh_abc');
    expect(catalog.type).toBe('mesh');

    // Path change must not change ID
    entry.path = 'meshes/relocated/mesh_abc.glb';
    expect(findAsset(registry, 'mesh_abc').id).toBe('mesh_abc');
  });

  it('converts meters ↔ editor units without arbitrary mesh rescale', () => {
    expect(EDITOR_UNITS_PER_METER).toBe(100);
    expect(toMeters(300)).toBe(3);
    expect(toEditorUnits(1.5)).toBe(150);
    expect(metersToEditorSize({ x: 1, y: 2, z: 0.5 })).toEqual({ x: 100, y: 200, z: 50 });

    const ok = validateMeshScale({
      unitAssumption: 'meters',
      editorUnitsPerMeter: 100,
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
    });
    expect(ok.ok).toBe(true);

    const warn = validateMeshScale({
      unitAssumption: 'centimeters',
      boundingBoxMeters: { x: 100, y: 100, z: 100 },
    });
    expect(warn.ok).toBe(false);
    expect(warn.warnings.length).toBeGreaterThan(0);
  });

  it('serializes StaticMesh asset references', () => {
    const world = new World({ name: 'Props', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'actor_prop',
      name: 'Crate',
      transform: new Transform({
        position: { x: 100, y: 50, z: -50 },
        scale: { x: 1, y: 1, z: 1 },
      }),
      components: [
        new StaticMeshComponent({
          id: 'comp_mesh',
          assetId: 'mesh_abc',
          collidable: true,
          collisionType: 'box',
        }),
      ],
    }));

    const json = serializeLevel(world);
    expect(json.actors[0].components[0]).toMatchObject({
      type: 'StaticMesh',
      assetId: 'mesh_abc',
      collisionType: 'box',
    });
    const restored = deserializeLevel(json);
    expect(restored.getActor('actor_prop').getComponent('StaticMesh').assetId).toBe('mesh_abc');
  });
});

describe('Phase 2B lighting', () => {
  it('serializes extended light properties', () => {
    const world = new World({ name: 'Lights', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'actor_spot',
      name: 'Spot',
      transform: new Transform({
        position: { x: 0, y: 250, z: 0 },
        rotation: { x: -60, y: 15, z: 0 },
      }),
      components: [
        new LightComponent({
          id: 'comp_light',
          lightType: 'spot',
          color: '#ffd0a0',
          intensity: 2.5,
          range: 1400,
          castShadow: true,
          shadowMapSize: 2048,
          spotAngle: 35,
          spotPenumbra: 0.3,
        }),
      ],
    }));

    const json = serializeLevel(world);
    const light = json.actors[0].components[0];
    expect(light).toMatchObject({
      type: 'Light',
      lightType: 'spot',
      castShadow: true,
      shadowMapSize: 2048,
      spotAngle: 35,
    });
    expect(serializeLevel(deserializeLevel(json))).toEqual(json);
  });
});

describe('Phase 2B backward compatibility', () => {
  it('loads previously saved test-room without material/mesh fields', () => {
    const raw = readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8');
    const world = deserializeLevel(JSON.parse(raw));
    const floorBrush = world.getActor('actor_floor').getComponent('Brush');
    expect(floorBrush.materialId).toBeNull();
    expect(floorBrush.uv).toBeTruthy();
    expect(floorBrush.size).toEqual({ x: 600, y: 20, z: 600 });

    const light = world.getActor('actor_light_main').getComponent('Light');
    expect(light.lightType).toBe('point');
    // Fixture public/levels/test-room.json persists castShadow:true on the main point light.
    expect(light.castShadow).toBe(true);

    // Round-trip still valid after loading legacy level
    const again = serializeLevel(world);
    expect(deserializeLevel(again).actors.length).toBe(world.actors.length);
  });
});

describe('Phase 2B history commands', () => {
  it('undoes brush material assignment', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const actor = new Actor({
      id: 'a1',
      name: 'Wall',
      components: [new BrushComponent({ id: 'c1', materialId: null })],
    });
    world.addActor(actor);
    const history = new HistoryStack();
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'a1',
      before: { materialId: null },
      after: { materialId: 'mat_x' },
    }));
    expect(actor.getComponent('Brush').materialId).toBe('mat_x');
    history.undo();
    expect(actor.getComponent('Brush').materialId).toBeNull();
  });

  it('undoes light property edits', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const actor = new Actor({
      id: 'a1',
      name: 'Light',
      components: [new LightComponent({ id: 'c1', intensity: 1 })],
    });
    world.addActor(actor);
    const history = new HistoryStack();
    history.execute(new SetLightPropertiesCommand({
      world,
      actorId: 'a1',
      before: { intensity: 1 },
      after: { intensity: 3 },
    }));
    expect(actor.getComponent('Light').intensity).toBe(3);
    history.undo();
    expect(actor.getComponent('Light').intensity).toBe(1);
  });
});
