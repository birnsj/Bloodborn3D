import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { LightComponent } from '../components/LightComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

export function createLightActor({
  lightType = 'point',
  name,
  position = { x: 0, y: 200, z: 0 },
  rotation = { x: -45, y: 0, z: 0 },
  color = '#ffffff',
  intensity = 1.5,
  range = 1200,
  castShadow = true,
  gridSize = 25,
  snapY = true,
} = {}) {
  const g = gridSize > 0 ? gridSize : 25;
  const pos = {
    x: snapToGrid(position.x, g),
    y: snapY ? snapToGrid(position.y, g) : position.y,
    z: snapToGrid(position.z, g),
  };

  const defaults = {
    point: { name: 'Point Light', intensity: 1.5, range: 1200 },
    spot: { name: 'Spot Light', intensity: 2, range: 1500 },
    directional: { name: 'Directional Light', intensity: 1.2, range: 0 },
    ambient: { name: 'Ambient Light', intensity: 0.35, range: 0 },
  };
  const preset = defaults[lightType] || defaults.point;

  return new Actor({
    id: createId('actor'),
    name: name || preset.name,
    transform: new Transform({
      position: pos,
      rotation: { ...rotation },
    }),
    tags: ['light', lightType],
    components: [
      new LightComponent({
        id: createId('comp'),
        lightType,
        color,
        intensity: intensity ?? preset.intensity,
        range: range ?? preset.range,
        castShadow: lightType === 'ambient' ? false : castShadow,
      }),
    ],
  });
}
