/**
 * Procedural staircase geometry (editor units).
 * Straight: box solids (existing).
 * Curved / spiral: shared annular-wedge step generator.
 * Actor origin = geometric center (straight AABB center / curved spiral axis mid-height).
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { getRampAxes } from './rampGeometry.js';
import { createBrushBoxGeometry } from './brushGeometry.js';
import { TEXTURE_TILE_EDITOR_UNITS, mapDensityUvArray } from './uvMapping.js';
import { STAIR_WEDGE_SURFACE_IDS, applySurfaceGroups } from './surfaces.js';

export function isCurvedStair(stair) {
  const t = stair?.stairType || 'straight';
  return t === 'curved' || t === 'spiral';
}

export function getStairAabbSize(stair) {
  if (isCurvedStair(stair)) {
    const outer = Math.max(1, (Number(stair.innerRadius) || 0) + (Number(stair.width) || 1));
    const rise = Math.max(1, (Number(stair.stepCount) || 1) * (Number(stair.stepHeight) || 1));
    const diam = outer * 2;
    return { x: diam, y: rise, z: diam };
  }
  const width = Math.max(1, Number(stair.width) || 1);
  const length = Math.max(1, (Number(stair.stepCount) || 1) * (Number(stair.treadDepth) || 1));
  const rise = Math.max(1, (Number(stair.stepCount) || 1) * (Number(stair.stepHeight) || 1));
  const axes = getRampAxes(stair.direction);
  const size = { x: width, y: rise, z: length };
  if (axes.run === 'x') {
    size.x = length;
    size.z = width;
  }
  return size;
}

/**
 * One solid per step for straight stairs: { kind:'box', center, size, index }.
 */
export function getStairStepSolids(stair) {
  const count = Math.max(1, Math.round(Number(stair.stepCount) || 1));
  const width = Math.max(1, Number(stair.width) || 1);
  const stepH = Math.max(1, Number(stair.stepHeight) || 1);
  const tread = Math.max(1, Number(stair.treadDepth) || 1);
  const axes = getRampAxes(stair.direction);
  const totalRise = count * stepH;
  const totalLen = count * tread;
  const solids = [];

  for (let i = 0; i < count; i += 1) {
    const stepRise = (i + 1) * stepH;
    const runCenter = (-totalLen * 0.5 + tread * 0.5 + i * tread) * axes.runSign;
    const yCenter = -totalRise * 0.5 + stepRise * 0.5;

    const center = { x: 0, y: yCenter, z: 0 };
    const size = { x: width, y: stepRise, z: tread };
    center[axes.run] = runCenter;
    if (axes.run === 'x') {
      size.x = tread;
      size.z = width;
    }
    solids.push({ kind: 'box', center, size, role: 'step', index: i });
  }
  return solids;
}

/**
 * Curved / spiral wedge steps (shared generator).
 * Each step is an annular sector prism from the ground plane up to its tread.
 * @returns {Array<{ kind:'wedge', index, vertices: Array<{x,y,z}>, angles, radii }>}
 */
export function getCurvedStairSteps(stair) {
  const count = Math.max(1, Math.round(Number(stair.stepCount) || 1));
  const stepH = Math.max(1, Number(stair.stepHeight) || 1);
  const inner = Math.max(0, Number(stair.innerRadius) || 0);
  const width = Math.max(1, Number(stair.width) || 1);
  const outer = inner + width;
  const sweep = Math.max(1, Number(stair.sweepAngle) || 180);
  const wind = stair.clockwise === false ? 1 : -1; // CW = decreasing yaw in Y-up right-handed
  const start = (Number(stair.startAngle) || 0) * (Math.PI / 180);
  const totalRise = count * stepH;
  const delta = (sweep * Math.PI / 180) / count;
  const steps = [];

  for (let i = 0; i < count; i += 1) {
    const a0 = start + i * delta * wind;
    const a1 = start + (i + 1) * delta * wind;
    const y0 = -totalRise * 0.5;
    const y1 = -totalRise * 0.5 + (i + 1) * stepH;
    const vertices = annularSectorVertices(inner, outer, a0, a1, y0, y1);
    steps.push({
      kind: 'wedge',
      index: i,
      role: 'step',
      vertices,
      angles: { a0, a1 },
      radii: { inner, outer },
      y0,
      y1,
    });
  }
  return steps;
}

/** Unified step list for render + physics. */
export function getStairSteps(stair) {
  if (isCurvedStair(stair)) return getCurvedStairSteps(stair);
  return getStairStepSolids(stair);
}

function annularSectorVertices(rIn, rOut, a0, a1, y0, y1) {
  const corner = (r, a, y) => ({
    x: Math.cos(a) * r,
    y,
    z: Math.sin(a) * r,
  });
  // Bottom then top: inner-a0, outer-a0, outer-a1, inner-a1
  return [
    corner(rIn, a0, y0),
    corner(rOut, a0, y0),
    corner(rOut, a1, y0),
    corner(rIn, a1, y0),
    corner(rIn, a0, y1),
    corner(rOut, a0, y1),
    corner(rOut, a1, y1),
    corner(rIn, a1, y1),
  ];
}

/**
 * Build Three.js geometry group for a stair actor.
 * Straight steps use density-tiled brush UVs + actor `stair.uv`.
 * Curved/spiral wedges density-tile by tread/riser arc lengths, then the same actor UV.
 */
export function createStairGeometry(stair) {
  const group = new THREE.Group();
  const steps = getStairSteps(stair);

  for (const step of steps) {
    if (step.kind === 'wedge') {
      const geom = createWedgeStepGeometry(step, stair);
      const mesh = new THREE.Mesh(geom);
      mesh.userData.stepIndex = step.index;
      group.add(mesh);
    } else {
      const geom = createBrushBoxGeometry(step.size, stair?.uv, stair?.faceUVs);
      const mesh = new THREE.Mesh(geom);
      mesh.position.set(
        toMeters(step.center.x),
        toMeters(step.center.y),
        toMeters(step.center.z),
      );
      mesh.userData.stepIndex = step.index;
      group.add(mesh);
    }
  }
  return group;
}

/**
 * Wedge step mesh in actor-local meters (vertices already absolute in actor space).
 */
export function createWedgeStepGeometry(step, stair) {
  const v = step.vertices;
  // Indices: bottom, top, sides (radial a0, radial a1, inner arc, outer arc)
  // Two tris per semantic surface (matches STAIR_WEDGE_SURFACE_IDS order).
  const faces = [
    // bottom (down)
    [0, 2, 1], [0, 3, 2],
    // top tread (up)
    [4, 5, 6], [4, 6, 7],
    // radial face a0
    [0, 1, 5], [0, 5, 4],
    // radial face a1
    [3, 7, 6], [3, 6, 2],
    // inner wall
    [0, 4, 7], [0, 7, 3],
    // outer wall
    [1, 2, 6], [1, 6, 5],
  ];

  const width = Math.max(1, Number(stair?.width) || 1);
  const arcLen = Math.abs(step.angles.a1 - step.angles.a0)
    * ((step.radii.inner + step.radii.outer) * 0.5);
  const rise = Math.max(1e-3, step.y1 - step.y0);
  const tile = TEXTURE_TILE_EDITOR_UNITS;

  const pos = [];
  const densityUv = [];
  const surfacePerVert = [];
  for (let f = 0; f < faces.length; f += 1) {
    const tri = faces[f];
    const surfaceId = STAIR_WEDGE_SURFACE_IDS[(f / 2) | 0];
    for (const vi of tri) {
      const p = v[vi];
      pos.push(toMeters(p.x), toMeters(p.y), toMeters(p.z));
      surfacePerVert.push(surfaceId);
    }
    if (f < 2) {
      densityUv.push(0, 0, width / tile, 0, 0, arcLen / tile);
    } else if (f === 2) {
      densityUv.push(0, 0, width / tile, 0, width / tile, arcLen / tile);
    } else if (f === 3) {
      densityUv.push(0, 0, width / tile, arcLen / tile, 0, arcLen / tile);
    } else if (f < 8) {
      densityUv.push(0, 0, width / tile, 0, width / tile, rise / tile);
    } else {
      densityUv.push(0, 0, arcLen / tile, 0, arcLen / tile, rise / tile);
    }
  }

  const uvFinal = mapDensityUvArray(densityUv, stair?.uv, stair?.faceUVs, surfacePerVert);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvFinal, 2));
  geom.userData.surfaceIds = applySurfaceGroups(
    geom,
    STAIR_WEDGE_SURFACE_IDS.map((surfaceId) => ({ surfaceId, triCount: 2 })),
  );
  geom.computeVertexNormals();
  return geom;
}

/** Flat Float32Array of meters for Rapier convexHull (local space). */
export function wedgeVerticesToMetersFlat(vertices, scale = { x: 1, y: 1, z: 1 }) {
  const out = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i += 1) {
    const p = vertices[i];
    out[i * 3] = toMeters(p.x * (scale.x || 1));
    out[i * 3 + 1] = toMeters(p.y * (scale.y || 1));
    out[i * 3 + 2] = toMeters(p.z * (scale.z || 1));
  }
  return out;
}
