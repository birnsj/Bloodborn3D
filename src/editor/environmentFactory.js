import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { EnvironmentComponent } from '../components/EnvironmentComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

const TYPE_DEFAULTS = {
  water2: {
    name: 'Water 2',
    width: 600,
    height: 600,
    color: '#001e0f',
    flowSpeed: 0.04,
    reflectivity: 0.1,
  },
  water: {
    name: 'Water',
    width: 600,
    height: 600,
    color: '#001e0f',
    distortionScale: 3.7,
  },
  reflector: {
    name: 'Mirror',
    width: 300,
    height: 400,
    color: '#8899aa',
    textureResolution: 512,
  },
  refractor: {
    name: 'Refractor',
    width: 300,
    height: 400,
    color: '#a8c8d8',
    textureResolution: 512,
  },
  decal: {
    name: 'Decal',
    width: 80,
    height: 80,
    color: '#ffffff',
    decalSize: { x: 80, y: 80, z: 40 },
  },
  sprite: {
    name: 'Billboard',
    width: 100,
    height: 100,
    color: '#ffffff',
    sizeAttenuation: true,
  },
  sky: {
    name: 'Sky',
    width: 10000,
    height: 10000,
    turbidity: 10,
    rayleigh: 2,
    elevation: 12,
    azimuth: 180,
  },
};

export function createEnvironmentActor({
  envType = 'water2',
  name,
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: -90, y: 0, z: 0 },
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

  const preset = TYPE_DEFAULTS[envType] || TYPE_DEFAULTS.water2;
  // Water lies in XZ; mirrors/refractors/decals default upright on walls (identity rot).
  let rot = { ...rotation };
  if (envType === 'water' || envType === 'water2') {
    rot = { x: -90, y: 0, z: 0 };
  } else if (envType === 'sky') {
    rot = { x: 0, y: 0, z: 0 };
    pos.y = 0;
  } else if (envType === 'sprite') {
    rot = { x: 0, y: 0, z: 0 };
  } else if (envType === 'reflector' || envType === 'refractor' || envType === 'decal') {
    rot = rotation?.x != null ? { ...rotation } : { x: 0, y: 0, z: 0 };
  }

  return new Actor({
    id: createId('actor'),
    name: name || preset.name,
    transform: new Transform({
      position: pos,
      rotation: rot,
    }),
    tags: ['environment', envType],
    components: [
      new EnvironmentComponent({
        id: createId('comp'),
        envType,
        width: rest.width ?? preset.width,
        height: rest.height ?? preset.height,
        color: rest.color ?? preset.color,
        ...preset,
        ...rest,
      }),
    ],
  });
}
