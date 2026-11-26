import { describe, expect, it } from 'vitest';
import {
  PrimitiveMeshComponent,
  PRIMITIVE_TYPES,
  normalizePrimitiveMeshFields,
  primitiveMeshAuthorableSnapshot,
  validatePrimitiveAllocation,
  PRIMITIVE_MAX_VERTICES,
} from '../components/PrimitiveMeshComponent.js';
import { createPrimitiveMeshActor } from '../editor/primitiveMeshFactory.js';
import { createComponentFromJSON, getRegisteredComponentTypes } from '../components/componentRegistry.js';
import { SetPrimitiveMeshPropertiesCommand } from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { World } from '../core/World.js';
import { CREATION_CATEGORIES } from '../editor/creation/creationTools.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { buildPrimitiveGeometry } from '../runtime/createThreePrimitive.js';

describe('Batch 5 PrimitiveMeshComponent', () => {
  it('registers PrimitiveMesh component type', () => {
    expect(getRegisteredComponentTypes()).toContain('PrimitiveMesh');
  });

  it('normalizes every primitive type with defaults', () => {
    for (const primitive of PRIMITIVE_TYPES) {
      const n = normalizePrimitiveMeshFields({ primitive });
      expect(n.primitive).toBe(primitive);
      expect(n.width).toBeGreaterThan(0);
      expect(n.radialSegments).toBeGreaterThanOrEqual(3);
    }
  });

  it('round-trips through component JSON', () => {
    const comp = new PrimitiveMeshComponent({
      primitive: 'torus',
      radius: 60,
      tube: 12,
      materialId: 'mat_batch1_metal',
    });
    const again = createComponentFromJSON(comp.toJSON());
    expect(again.type).toBe('PrimitiveMesh');
    expect(again.primitive).toBe('torus');
    expect(again.radius).toBe(60);
    expect(again.materialId).toBe('mat_batch1_metal');
  });

  it('creates actors tagged as props (not brushes)', () => {
    const actor = createPrimitiveMeshActor({
      primitive: 'sphere',
      position: { x: 25, y: 0, z: 50 },
    });
    expect(actor.tags).toContain('primitive');
    expect(actor.tags).toContain('prop');
    expect(actor.tags).toContain('sphere');
    expect(actor.getComponent('Brush')).toBeFalsy();
    expect(actor.getComponent('PrimitiveMesh').primitive).toBe('sphere');
  });

  it('rejects over-budget segment density', () => {
    const ok = validatePrimitiveAllocation({
      primitive: 'plane',
      widthSegments: 64,
      heightSegments: 64,
    });
    expect(ok.ok).toBe(true);
    const worse = validatePrimitiveAllocation({
      primitive: 'box',
      widthSegments: 128,
      heightSegments: 128,
      depthSegments: 128,
    });
    expect(worse.ok).toBe(false);
    expect(worse.estimate).toBeGreaterThan(PRIMITIVE_MAX_VERTICES);
  });

  it('builds BufferGeometry for sync primitives', () => {
    for (const primitive of PRIMITIVE_TYPES) {
      if (primitive === 'text') continue;
      const geo = buildPrimitiveGeometry({ primitive });
      expect(geo.attributes.position.count).toBeGreaterThan(0);
      geo.dispose();
    }
  });

  it('supports undo of primitive property edits', () => {
    const world = new World({ name: 'Prim' });
    const actor = createPrimitiveMeshActor({ primitive: 'box' });
    world.addActor(actor);
    const comp = actor.getComponent('PrimitiveMesh');
    const before = primitiveMeshAuthorableSnapshot(comp);
    const after = { ...before, width: 250, height: 180 };
    const history = new HistoryStack();
    history.execute(new SetPrimitiveMeshPropertiesCommand({
      world,
      actorId: actor.id,
      before,
      after,
      label: 'Edit box',
    }));
    expect(comp.width).toBe(250);
    history.undo();
    expect(comp.width).toBe(before.width);
    history.redo();
    expect(comp.height).toBe(180);
  });

  it('exposes primitive tools on the Geometry creation category', () => {
    const geo = CREATION_CATEGORIES.find((c) => c.id === 'geometry');
    expect(geo).toBeTruthy();
    const prims = geo.tools.filter((t) => t.placeKind === 'primitive').map((t) => t.primitive);
    expect(prims).toEqual(expect.arrayContaining([
      'box', 'sphere', 'cylinder', 'extrude', 'lathe', 'tube', 'text', 'convex',
    ]));
    // Existing brush tools remain.
    expect(geo.tools.some((t) => t.tool === 'wall')).toBe(true);
    expect(geo.tools.some((t) => t.tool === 'subtract')).toBe(true);
  });

  it('round-trips through level JSON without schema bump', () => {
    const world = new World({ name: 'Prim Level' });
    world.addActor(createPrimitiveMeshActor({
      primitive: 'extrude',
      position: { x: 0, y: 0, z: 0 },
      materialId: 'mat_batch2_standard',
    }));
    world.addActor(createPrimitiveMeshActor({
      primitive: 'plane',
      displacementSegments: 48,
      position: { x: 200, y: 0, z: 0 },
    }));
    const data = serializeLevel(world);
    expect(data.schemaVersion).toBeLessThanOrEqual(3);
    const loaded = deserializeLevel(data, { validateGeometry: false });
    const prims = loaded.actors.filter((a) => a.getComponent('PrimitiveMesh'));
    expect(prims).toHaveLength(2);
    expect(prims[0].getComponent('PrimitiveMesh').primitive).toBe('extrude');
    expect(prims[1].getComponent('PrimitiveMesh').displacementSegments).toBe(48);
  });
});
