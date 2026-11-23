import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

/**
 * Place an imported mesh asset as a level actor.
 * Position is editor units (center on construction plane by default).
 */
export function createStaticMeshActor({
  assetId,
  name = 'Static Mesh',
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  scale = { x: 1, y: 1, z: 1 },
  gridSize = 25,
  collidable = false,
  collisionType = 'none',
} = {}) {
  if (!assetId) throw new Error('assetId required');

  const pos = {
    x: snapToGrid(position.x, gridSize),
    y: snapToGrid(position.y, gridSize),
    z: snapToGrid(position.z, gridSize),
  };

  return new Actor({
    id: createId('actor'),
    name,
    transform: new Transform({ position: pos, rotation: { ...rotation }, scale: { ...scale } }),
    tags: ['mesh', 'prop'],
    components: [
      new StaticMeshComponent({
        id: createId('comp'),
        assetId,
        collidable,
        collisionType: collidable ? (collisionType || 'box') : 'none',
      }),
    ],
  });
}
