import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { PlayerSpawnComponent } from '../components/PlayerSpawnComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

/**
 * Place a PlayerSpawn actor (Play-mode start). Position in editor units.
 */
export function createPlayerSpawnActor({
  name = 'Player Spawn',
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  gridSize = 25,
  snapY = true,
  eyeHeight = 160,
  moveSpeed = 450,
} = {}) {
  const pos = {
    x: snapToGrid(position.x, gridSize),
    y: snapY ? snapToGrid(position.y, gridSize) : position.y,
    z: snapToGrid(position.z, gridSize),
  };

  return new Actor({
    id: createId('actor'),
    name,
    transform: new Transform({
      position: pos,
      rotation: { ...rotation },
    }),
    tags: ['spawn', 'gameplay'],
    components: [
      new PlayerSpawnComponent({
        id: createId('comp'),
        eyeHeight,
        moveSpeed,
      }),
    ],
  });
}
