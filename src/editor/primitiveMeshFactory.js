import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  PrimitiveMeshComponent,
  normalizePrimitiveType,
  validatePrimitiveAllocation,
} from '../components/PrimitiveMeshComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';

const TYPE_DEFAULTS = {
  box: { name: 'Box', width: 100, height: 100, depth: 100 },
  plane: { name: 'Plane', width: 200, height: 200, widthSegments: 48, heightSegments: 48, displacementSegments: 48 },
  circle: { name: 'Circle', radius: 80 },
  sphere: { name: 'Sphere', radius: 50, widthSegments: 48, heightSegments: 32 },
  capsule: { name: 'Capsule', radius: 30, length: 80 },
  cylinder: { name: 'Cylinder', radiusTop: 40, radiusBottom: 40, height: 100 },
  cone: { name: 'Cone', radius: 40, height: 100 },
  ring: { name: 'Ring', radius: 80, tube: 40 },
  torus: { name: 'Torus', radius: 50, tube: 15 },
  torusKnot: { name: 'Torus Knot', radius: 40, tube: 10 },
  tetrahedron: { name: 'Tetrahedron', radius: 50 },
  octahedron: { name: 'Octahedron', radius: 50 },
  dodecahedron: { name: 'Dodecahedron', radius: 50 },
  icosahedron: { name: 'Icosahedron', radius: 50 },
  roundedBox: { name: 'Rounded Box', width: 100, height: 100, depth: 100, tube: 12 },
  shape: { name: 'Shape', curveSegments: 16 },
  extrude: { name: 'Extrude', extrudeDepth: 40 },
  lathe: { name: 'Lathe', radialSegments: 24 },
  tube: { name: 'Tube', tubeRadius: 12, tubularSegments: 64 },
  convex: { name: 'Convex Hull', collisionType: 'convex' },
  text: { name: 'Text', text: 'BloodBound', textSize: 40, textHeight: 8 },
  parametric: { name: 'Parametric', parametricFn: 'klein', radius: 20 },
};

/**
 * Place a native/procedural geometry prop (Batch 5).
 * Not a brush — excluded from subtractive CSG.
 */
export function createPrimitiveMeshActor({
  primitive = 'box',
  name,
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  scale = { x: 1, y: 1, z: 1 },
  gridSize = 25,
  snapY = true,
  materialId = null,
  ...rest
} = {}) {
  const type = normalizePrimitiveType(primitive);
  const preset = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.box;
  const g = gridSize > 0 ? gridSize : 25;
  const pos = {
    x: snapToGrid(position.x, g),
    y: snapY ? snapToGrid(position.y, g) : position.y,
    z: snapToGrid(position.z, g),
  };

  // Planes / shapes default flat on XZ (like floors).
  let rot = { ...rotation };
  if ((type === 'plane' || type === 'circle' || type === 'ring' || type === 'shape')
    && rotation?.x == null) {
    rot = { x: -90, y: 0, z: 0 };
  }

  const fields = {
    primitive: type,
    ...preset,
    ...rest,
    materialId: materialId ?? rest.materialId ?? null,
  };
  const check = validatePrimitiveAllocation(fields);
  if (!check.ok) {
    throw new Error(check.message || 'Invalid primitive parameters');
  }

  return new Actor({
    id: createId('actor'),
    name: name || preset.name || type,
    transform: new Transform({
      position: pos,
      rotation: rot,
      scale: { ...scale },
    }),
    tags: ['primitive', 'prop', type],
    components: [
      new PrimitiveMeshComponent({
        id: createId('comp'),
        ...fields,
      }),
    ],
  });
}

export function defaultPrimitiveFootprint(primitive, gridSize = 25) {
  const type = normalizePrimitiveType(primitive);
  const preset = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.box;
  const w = preset.width || (preset.radius ? preset.radius * 2 : 100) || 100;
  const d = preset.depth || (preset.radius ? preset.radius * 2 : 100) || 100;
  const h = preset.height || preset.length || (preset.radius ? preset.radius * 2 : 100) || 100;
  const g = gridSize > 0 ? gridSize : 25;
  return {
    size: {
      x: Math.max(g, w),
      y: Math.max(g, h),
      z: Math.max(g, d),
    },
  };
}
