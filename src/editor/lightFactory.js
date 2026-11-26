import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { LightComponent } from '../components/LightComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

const TYPE_DEFAULTS = {
  point: { name: 'Point Light', intensity: 1.5, range: 1200, castShadow: true },
  spot: { name: 'Spot Light', intensity: 2, range: 1500, castShadow: true },
  directional: { name: 'Directional Light', intensity: 1.2, range: 0, castShadow: true },
  ambient: { name: 'Ambient Light', intensity: 0.35, range: 0, castShadow: false },
  hemisphere: {
    name: 'Hemisphere Light',
    intensity: 0.6,
    range: 0,
    castShadow: false,
    color: '#b1c4e0',
    groundColor: '#4a4038',
  },
  rectArea: {
    name: 'Rect Area Light',
    intensity: 4,
    range: 0,
    castShadow: false,
    width: 300,
    height: 200,
    color: '#fff5e6',
  },
};

export function createLightActor({
  lightType = 'point',
  name,
  position = { x: 0, y: 200, z: 0 },
  rotation = { x: -45, y: 0, z: 0 },
  color,
  groundColor,
  intensity,
  range,
  castShadow,
  width,
  height,
  gridSize = 25,
  snapY = true,
  ...rest
} = {}) {
  const g = gridSize > 0 ? gridSize : 25;
  const pos = {
    x: snapToGrid(position.x, g),
    y: snapY ? snapToGrid(position.y, g) : position.y,
    z: snapToGrid(position.z, g),
  };

  const preset = TYPE_DEFAULTS[lightType] || TYPE_DEFAULTS.point;
  const rot = lightType === 'ambient' || lightType === 'hemisphere'
    ? { x: 0, y: 0, z: 0 }
    : { ...rotation };

  return new Actor({
    id: createId('actor'),
    name: name || preset.name,
    transform: new Transform({
      position: pos,
      rotation: rot,
    }),
    tags: ['light', lightType],
    components: [
      new LightComponent({
        id: createId('comp'),
        lightType,
        color: color ?? preset.color ?? '#ffffff',
        groundColor: groundColor ?? preset.groundColor,
        intensity: intensity ?? preset.intensity,
        range: range ?? preset.range,
        castShadow: lightType === 'ambient' || lightType === 'hemisphere' || lightType === 'rectArea'
          ? false
          : (castShadow ?? preset.castShadow ?? true),
        width: width ?? preset.width,
        height: height ?? preset.height,
        ...rest,
      }),
    ],
  });
}
