import { writeFileSync } from 'node:fs';
import { World } from '../src/core/World.js';
import { Actor } from '../src/core/Actor.js';
import { Transform } from '../src/core/Transform.js';
import { BrushComponent } from '../src/components/BrushComponent.js';
import { PrimitiveMeshComponent } from '../src/components/PrimitiveMeshComponent.js';
import { StaticMeshComponent } from '../src/components/StaticMeshComponent.js';
import { LightComponent } from '../src/components/LightComponent.js';
import { PlayerSpawnComponent } from '../src/components/PlayerSpawnComponent.js';
import { createId } from '../src/core/ids.js';
import { applyPivotPreset } from '../src/rules/pivotEdit.js';
import { applyActorLocalPivotDelta } from '../src/core/contentOffset.js';

const world = new World({ name: 'Acceptance — Pivot Editing', mapMode: 'additive' });

function brush({ name, pos, size, operation = 'add', tags = [], rot = null }) {
  const a = new Actor({
    id: createId('actor'),
    name,
    transform: new Transform({ position: pos, rotation: rot || { x: 0, y: 0, z: 0 } }),
    tags: ['brush', ...tags],
    components: [
      new BrushComponent({
        id: createId('comp'),
        size,
        operation,
        color: operation === 'subtract' ? '#c44' : '#8a9099',
      }),
    ],
  });
  world.addActor(a);
  return a;
}

function prim({ name, pos, primitive = 'box', w = 80, h = 80, d = 80 }) {
  const a = new Actor({
    id: createId('actor'),
    name,
    transform: new Transform({ position: pos }),
    tags: ['primitive'],
    components: [
      new PrimitiveMeshComponent({
        id: createId('comp'),
        primitive,
        width: w,
        height: h,
        depth: d,
        collidable: true,
        collisionType: 'box',
      }),
    ],
  });
  world.addActor(a);
  return a;
}

brush({
  name: 'Floor',
  pos: { x: 0, y: -12.5, z: 0 },
  size: { x: 800, y: 25, z: 800 },
  tags: ['floor'],
});

const door = brush({
  name: 'Door (hinge pivot)',
  pos: { x: -200, y: 100, z: 0 },
  size: { x: 12, y: 200, z: 90 },
  tags: ['door'],
});
applyPivotPreset(door, world, 'faceNx');

const table = prim({
  name: 'Table (bottom pivot)',
  pos: { x: 100, y: 40, z: 80 },
  w: 120,
  h: 80,
  d: 80,
});
applyPivotPreset(table, world, 'bottomCenter');

const crate = prim({
  name: 'Crate (custom pivot)',
  pos: { x: 220, y: 40, z: -60 },
  w: 60,
  h: 60,
  d: 60,
});
applyActorLocalPivotDelta(crate, { x: 0, y: -30, z: 0 }, world);

const parent = prim({
  name: 'Parent Prop',
  pos: { x: -80, y: 50, z: 160 },
  w: 100,
  h: 40,
  d: 60,
});
const child = prim({
  name: 'Child Prop',
  pos: { x: 0, y: 50, z: 0 },
  w: 40,
  h: 40,
  d: 40,
});
child.parentId = parent.id;

brush({
  name: 'Wall',
  pos: { x: 0, y: 100, z: -250 },
  size: { x: 400, y: 200, z: 25 },
  tags: ['wall'],
});
brush({
  name: 'Subtractive Opening',
  pos: { x: 0, y: 90, z: -250 },
  size: { x: 80, y: 140, z: 40 },
  operation: 'subtract',
  tags: ['opening'],
});

const cube = new Actor({
  id: createId('actor'),
  name: 'Static Cube',
  transform: new Transform({ position: { x: 300, y: 50, z: 200 } }),
  tags: ['mesh', 'prop'],
  components: [
    new StaticMeshComponent({
      id: createId('comp'),
      assetId: 'mesh_verify_cube',
      collidable: true,
      collisionType: 'box',
    }),
  ],
});
world.addActor(cube);
applyPivotPreset(cube, world, 'bottomCenter', {
  getMeshBoundsMeters: () => ({ x: 1, y: 1, z: 1 }),
  getMeshBoundsCenterMeters: () => ({ x: 0, y: 0, z: 0 }),
});

world.addActor(new Actor({
  id: createId('actor'),
  name: 'Room Light',
  transform: new Transform({ position: { x: 0, y: 280, z: 0 } }),
  tags: ['light'],
  components: [
    new LightComponent({
      id: createId('comp'),
      lightType: 'point',
      color: '#fff4e0',
      intensity: 2.2,
      range: 1200,
      castShadow: true,
    }),
  ],
}));

world.addActor(new Actor({
  id: createId('actor'),
  name: 'Player Spawn',
  transform: new Transform({ position: { x: 0, y: 0, z: 280 } }),
  tags: ['spawn', 'gameplay'],
  components: [
    new PlayerSpawnComponent({
      id: createId('comp'),
      eyeHeight: 160,
      moveSpeed: 450,
    }),
  ],
}));

const json = world.toJSON();
json.name = 'Acceptance — Pivot Editing';
json.schemaVersion = 2;
writeFileSync('public/levels/acceptance-pivot-editing.json', `${JSON.stringify(json, null, 2)}\n`);
console.log('wrote acceptance-pivot-editing.json actors=', world.actors.length);
