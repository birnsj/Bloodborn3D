import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import * as ParametricFunctions from 'three/addons/geometries/ParametricFunctions.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import {
  normalizePrimitiveMeshFields,
  validatePrimitiveAllocation,
} from '../components/PrimitiveMeshComponent.js';
import { toMeters } from '../core/units.js';
import { disposeOwnedMaterial } from './gpuResources.js';

const DEG = Math.PI / 180;
const fontCache = new Map();

function euToM(v) {
  return toMeters(v);
}

function resolveSegments(f) {
  if (f.displacementSegments > 0 && (f.primitive === 'plane' || f.primitive === 'sphere')) {
    const d = f.displacementSegments;
    return {
      widthSegments: Math.max(f.widthSegments, d),
      heightSegments: Math.max(f.heightSegments, d),
    };
  }
  return {
    widthSegments: f.widthSegments,
    heightSegments: f.heightSegments,
  };
}

function shapeFromProfile(profile) {
  const shape = new THREE.Shape();
  if (!profile.length) {
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    return shape;
  }
  shape.moveTo(euToM(profile[0].x), euToM(profile[0].y));
  for (let i = 1; i < profile.length; i++) {
    shape.lineTo(euToM(profile[i].x), euToM(profile[i].y));
  }
  shape.closePath();
  return shape;
}

function curveFromPath(path, closed) {
  const pts = path.map((p) => new THREE.Vector3(euToM(p.x), euToM(p.y), euToM(p.z)));
  if (pts.length < 2) {
    pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  }
  return closed
    ? new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
    : new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

function parametricFn(id) {
  switch (id) {
    case 'mobius':
      return ParametricFunctions.mobius;
    case 'mobius3d':
      return ParametricFunctions.mobius3d;
    case 'plane':
      return ParametricFunctions.plane;
    case 'klein':
    default:
      return ParametricFunctions.klein;
  }
}

/**
 * Build a BufferGeometry in meters from a normalized PrimitiveMesh definition.
 * @returns {THREE.BufferGeometry}
 */
export function buildPrimitiveGeometry(fields) {
  const f = normalizePrimitiveMeshFields(fields);
  const check = validatePrimitiveAllocation(f);
  if (!check.ok) {
    throw new Error(check.message || 'Primitive allocation rejected');
  }
  const segs = resolveSegments(f);

  switch (f.primitive) {
    case 'box':
      return new THREE.BoxGeometry(
        euToM(f.width),
        euToM(f.height),
        euToM(f.depth),
        f.widthSegments,
        f.heightSegments,
        f.depthSegments,
      );
    case 'plane':
      return new THREE.PlaneGeometry(
        euToM(f.width),
        euToM(f.height),
        segs.widthSegments,
        segs.heightSegments,
      );
    case 'circle':
      return new THREE.CircleGeometry(
        euToM(f.radius),
        f.radialSegments,
        f.phiStart * DEG,
        f.phiLength * DEG,
      );
    case 'sphere':
      return new THREE.SphereGeometry(
        euToM(f.radius),
        segs.widthSegments,
        segs.heightSegments,
        f.phiStart * DEG,
        f.phiLength * DEG,
        f.thetaStart * DEG,
        Math.min(180, f.thetaLength) * DEG,
      );
    case 'capsule':
      return new THREE.CapsuleGeometry(
        euToM(f.radius),
        euToM(f.length),
        Math.max(1, Math.round(f.heightSegments / 2)),
        f.radialSegments,
      );
    case 'cylinder':
      return new THREE.CylinderGeometry(
        euToM(f.radiusTop),
        euToM(f.radiusBottom),
        euToM(f.height),
        f.radialSegments,
        f.heightSegments,
        f.openEnded,
        f.phiStart * DEG,
        f.phiLength * DEG,
      );
    case 'cone':
      return new THREE.ConeGeometry(
        euToM(f.radius),
        euToM(f.height),
        f.radialSegments,
        f.heightSegments,
        f.openEnded,
        f.phiStart * DEG,
        f.phiLength * DEG,
      );
    case 'ring':
      return new THREE.RingGeometry(
        euToM(Math.min(f.radius * 0.55, f.tube)),
        euToM(f.radius),
        f.radialSegments,
        Math.max(1, f.heightSegments),
        f.phiStart * DEG,
        f.phiLength * DEG,
      );
    case 'torus':
      return new THREE.TorusGeometry(
        euToM(f.radius),
        euToM(f.tube),
        f.radialSegments,
        f.tubularSegments,
        f.phiLength * DEG,
      );
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(
        euToM(f.radius),
        euToM(f.tube),
        f.tubularSegments,
        f.radialSegments,
        f.p,
        f.q,
      );
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(euToM(f.radius), f.detail);
    case 'octahedron':
      return new THREE.OctahedronGeometry(euToM(f.radius), f.detail);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(euToM(f.radius), f.detail);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(euToM(f.radius), f.detail);
    case 'roundedBox':
      return new RoundedBoxGeometry(
        euToM(f.width),
        euToM(f.height),
        euToM(f.depth),
        f.radiusSegments,
        euToM(Math.min(f.tube, Math.min(f.width, f.height, f.depth) * 0.45)),
      );
    case 'shape':
      return new THREE.ShapeGeometry(shapeFromProfile(f.profile), f.curveSegments);
    case 'extrude':
      return new THREE.ExtrudeGeometry(shapeFromProfile(f.profile), {
        depth: euToM(f.extrudeDepth),
        bevelEnabled: f.bevelEnabled,
        bevelThickness: euToM(f.bevelThickness),
        bevelSize: euToM(f.bevelSize),
        bevelOffset: euToM(f.bevelOffset),
        bevelSegments: f.bevelSegments,
        curveSegments: f.curveSegments,
      });
    case 'lathe': {
      const pts = f.profile.map((p) => new THREE.Vector2(euToM(Math.abs(p.x)), euToM(p.y)));
      return new THREE.LatheGeometry(
        pts,
        f.radialSegments,
        f.phiStart * DEG,
        Math.min(360, f.phiLength) * DEG,
      );
    }
    case 'tube': {
      const curve = curveFromPath(f.path, f.closed);
      return new THREE.TubeGeometry(
        curve,
        f.tubularSegments,
        euToM(f.tubeRadius),
        f.radialSegments,
        f.closed,
      );
    }
    case 'convex': {
      const pts = f.points.map((p) => new THREE.Vector3(euToM(p.x), euToM(p.y), euToM(p.z)));
      return new ConvexGeometry(pts);
    }
    case 'parametric': {
      const fn = parametricFn(f.parametricFn);
      const geo = new ParametricGeometry(fn, f.parametricSlices, f.parametricStacks);
      // ParametricFunctions are unit-scale — scale to ~1 m radius prop.
      geo.scale(euToM(f.radius), euToM(f.radius), euToM(f.radius));
      return geo;
    }
    case 'text':
      throw new Error('TextGeometry requires async font load — use buildPrimitiveGeometryAsync');
    default:
      return new THREE.BoxGeometry(euToM(100), euToM(100), euToM(100));
  }
}

export async function loadPrimitiveFont(fontId = 'helvetiker_regular') {
  const id = String(fontId || 'helvetiker_regular');
  if (fontCache.has(id)) return fontCache.get(id);
  const url = `/assets/fonts/${id}.typeface.json`;
  const pending = new Promise((resolve, reject) => {
    const loader = new FontLoader();
    loader.load(
      url,
      (font) => {
        fontCache.set(id, Promise.resolve(font));
        resolve(font);
      },
      undefined,
      (err) => {
        fontCache.delete(id);
        reject(err || new Error(`Failed to load font ${id}`));
      },
    );
  });
  fontCache.set(id, pending);
  return pending;
}

export async function buildPrimitiveGeometryAsync(fields) {
  const f = normalizePrimitiveMeshFields(fields);
  if (f.primitive !== 'text') return buildPrimitiveGeometry(f);
  const check = validatePrimitiveAllocation(f);
  if (!check.ok) throw new Error(check.message || 'Primitive allocation rejected');
  const font = await loadPrimitiveFont(f.fontId);
  return new TextGeometry(f.text || ' ', {
    font,
    size: euToM(f.textSize),
    height: euToM(f.textHeight),
    curveSegments: f.curveSegments,
    bevelEnabled: f.bevelEnabled,
    bevelThickness: euToM(f.bevelThickness),
    bevelSize: euToM(f.bevelSize),
    bevelOffset: euToM(f.bevelOffset),
    bevelSegments: f.bevelSegments,
  });
}

/**
 * Build a disposable Three.js mesh group for a PrimitiveMesh component.
 * @returns {Promise<{ root: THREE.Object3D, mesh: THREE.Mesh, dispose: () => void }>}
 */
export async function createThreePrimitiveFromComponent(comp, {
  resolveTextureUrl: _resolveTextureUrl = null,
  fallbackColor = 0x8a9099,
} = {}) {
  const f = normalizePrimitiveMeshFields(comp);
  const geometry = await buildPrimitiveGeometryAsync(f);
  geometry.computeVertexNormals();

  let material;
  let ownedMaterial = true;
  // Material resolution uses caller-supplied `_resolvedMaterial` / SceneView factory.
  // Do not fetch material JSON here — that path was never wired and left unused locals.

  if (comp._resolvedMaterial) {
    material = comp._resolvedMaterial;
    ownedMaterial = Boolean(comp._ownedMaterial);
  } else {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(fallbackColor),
      roughness: 0.55,
      metalness: 0.08,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = f.castShadow;
  mesh.receiveShadow = f.receiveShadow;
  mesh.name = `Primitive_${f.primitive}`;

  const root = new THREE.Group();
  root.name = 'PrimitiveMeshRoot';
  root.add(mesh);

  return {
    root,
    mesh,
    dispose: () => {
      geometry.dispose();
      if (ownedMaterial) disposeOwnedMaterial(material);
    },
  };
}

/**
 * Preferred builder used by SceneView — accepts async material from createThreeMaterial.
 */
export async function createThreePrimitiveVisual(comp, {
  createMaterial = null,
  fallbackColor = 0x8a9099,
} = {}) {
  const f = normalizePrimitiveMeshFields(comp);
  const geometry = await buildPrimitiveGeometryAsync(f);
  geometry.computeVertexNormals();

  let material;
  let owned = true;
  if (typeof createMaterial === 'function' && f.materialId) {
    try {
      material = await createMaterial(f.materialId);
      owned = true;
    } catch (err) {
      console.warn('[BloodBound] primitive material failed', f.materialId, err);
      material = null;
    }
  }
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(fallbackColor),
      roughness: 0.55,
      metalness: 0.08,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = f.castShadow;
  mesh.receiveShadow = f.receiveShadow;
  mesh.userData.pickable = true;
  mesh.name = `Primitive_${f.primitive}`;

  const root = new THREE.Group();
  root.name = 'PrimitiveMeshRoot';
  root.userData.bbPrimitive = true;
  root.add(mesh);

  return {
    root,
    mesh,
    dispose: () => {
      geometry.dispose();
      if (owned) disposeOwnedMaterial(material);
    },
  };
}

/**
 * Extract world-local vertex positions (meters) for convex / trimesh colliders.
 */
export function primitiveGeometryPositionsMeters(geometry) {
  const pos = geometry?.attributes?.position;
  if (!pos) return [];
  const out = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  return out;
}
