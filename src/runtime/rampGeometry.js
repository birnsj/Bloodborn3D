/**
 * Parametric ramp geometry helpers (editor units).
 * Actor origin = center of the ramp's axis-aligned bounds.
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { DEFAULT_RAMP_THICKNESS } from '../components/RampComponent.js';
import { TEXTURE_TILE_EDITOR_UNITS, mapDensityUvArray } from './uvMapping.js';

/**
 * Horizontal run / vertical rise / width axes for a direction.
 */
export function getRampAxes(direction = 'z+') {
  switch (direction) {
    case 'z-':
      return { run: 'z', riseSign: 1, runSign: -1, width: 'x' };
    case 'x+':
      return { run: 'x', riseSign: 1, runSign: 1, width: 'z' };
    case 'x-':
      return { run: 'x', riseSign: 1, runSign: -1, width: 'z' };
    case 'z+':
    default:
      return { run: 'z', riseSign: 1, runSign: 1, width: 'x' };
  }
}

export function getRampAabbSize(ramp) {
  const w = Math.max(1, Number(ramp.width) || 1);
  const len = Math.max(1, Number(ramp.length) || 1);
  const rise = Math.max(1, Number(ramp.rise) || 1);
  const axes = getRampAxes(ramp.direction);
  const size = { x: w, y: rise, z: len };
  if (axes.run === 'x') {
    size.x = len;
    size.z = w;
  }
  return size;
}

/**
 * Six wedge corners in actor-local editor units (convex hull / mesh).
 * Low end at negative run, high end at positive run.
 */
export function getRampWedgeVertices(ramp) {
  const w = Math.max(1, Number(ramp.width) || 1) * 0.5;
  const len = Math.max(1, Number(ramp.length) || 1) * 0.5;
  const rise = Math.max(1, Number(ramp.rise) || 1) * 0.5;
  const axes = getRampAxes(ramp.direction);
  const y0 = -rise;
  const y1 = rise;

  const corners = [];
  // Bottom quad at y0 across full run; top edge only at high end (y1).
  const runLo = -len * axes.runSign;
  const runHi = len * axes.runSign;

  const point = (widthSign, y, run) => {
    const p = { x: 0, y, z: 0 };
    p[axes.width] = widthSign * w;
    p[axes.run] = run;
    return p;
  };

  // Low bottom (2), high bottom (2), high top (2)
  corners.push(point(-1, y0, runLo));
  corners.push(point(1, y0, runLo));
  corners.push(point(-1, y0, runHi));
  corners.push(point(1, y0, runHi));
  corners.push(point(-1, y1, runHi));
  corners.push(point(1, y1, runHi));
  return corners;
}

/**
 * Local rotated-box collider matching the sloped walking surface (not the AABB).
 * Returns half-extents (editor units), local center, and local Euler degrees.
 */
export function getRampSlopeCollider(ramp) {
  const width = Math.max(1, Number(ramp.width) || 1);
  const length = Math.max(1, Number(ramp.length) || 1);
  const rise = Math.max(1, Number(ramp.rise) || 1);
  const thickness = Math.max(1, Number(ramp.thickness) || DEFAULT_RAMP_THICKNESS);
  const hyp = Math.sqrt(length * length + rise * rise);
  const angleRad = Math.atan2(rise, length);
  const angleDeg = (angleRad * 180) / Math.PI;
  const axes = getRampAxes(ramp.direction);

  // Plank sits on the slope midline (AABB center).
  if (axes.run === 'z') {
    return {
      halfSize: {
        x: width * 0.5,
        y: thickness * 0.5,
        z: hyp * 0.5,
      },
      localPosition: { x: 0, y: 0, z: 0 },
      localRotation: {
        x: axes.runSign > 0 ? -angleDeg : angleDeg,
        y: 0,
        z: 0,
      },
    };
  }
  return {
    halfSize: {
      x: hyp * 0.5,
      y: thickness * 0.5,
      z: width * 0.5,
    },
    localPosition: { x: 0, y: 0, z: 0 },
    localRotation: {
      x: 0,
      y: 0,
      z: axes.runSign > 0 ? angleDeg : -angleDeg,
    },
  };
}

export function getRampSlopeAngleDegrees(ramp) {
  const length = Math.max(1, Number(ramp.length) || 1);
  const rise = Math.max(1, Number(ramp.rise) || 1);
  return (Math.atan2(rise, length) * 180) / Math.PI;
}

/**
 * Build a Three.js BufferGeometry for the ramp wedge (meters).
 * Vert order: 0,1 low-bottom; 2,3 high-bottom; 4,5 high-top.
 * UVs: density-tiled at TEXTURE_TILE_EDITOR_UNITS, then actor `ramp.uv` (scale → rot → offset).
 */
export function createRampWedgeGeometry(ramp) {
  const verts = getRampWedgeVertices(ramp);
  const length = Math.max(1, Number(ramp.length) || 1);
  const width = Math.max(1, Number(ramp.width) || 1);
  const rise = Math.max(1, Number(ramp.rise) || 1);
  const hyp = Math.sqrt(length * length + rise * rise);
  const tile = TEXTURE_TILE_EDITOR_UNITS;

  const faces = [
    // bottom
    { i: [0, 2, 1], uv: [[0, 0], [length / tile, 0], [0, width / tile]] },
    { i: [1, 2, 3], uv: [[0, width / tile], [length / tile, 0], [length / tile, width / tile]] },
    // slope (walkable)
    { i: [0, 1, 5], uv: [[0, 0], [width / tile, 0], [width / tile, hyp / tile]] },
    { i: [0, 5, 4], uv: [[0, 0], [width / tile, hyp / tile], [0, hyp / tile]] },
    // high end
    { i: [2, 4, 3], uv: [[0, 0], [0, rise / tile], [width / tile, 0]] },
    { i: [3, 4, 5], uv: [[width / tile, 0], [0, rise / tile], [width / tile, rise / tile]] },
    // left / right sides
    { i: [0, 4, 2], uv: [[0, 0], [hyp / tile, rise / tile], [length / tile, 0]] },
    { i: [1, 3, 5], uv: [[0, 0], [length / tile, 0], [hyp / tile, rise / tile]] },
  ];

  const posOut = [];
  const densityUv = [];
  for (const face of faces) {
    for (let t = 0; t < 3; t += 1) {
      const p = verts[face.i[t]];
      posOut.push(toMeters(p.x), toMeters(p.y), toMeters(p.z));
      densityUv.push(face.uv[t][0], face.uv[t][1]);
    }
  }

  const uvFinal = mapDensityUvArray(densityUv, ramp?.uv);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(posOut, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvFinal, 2));
  geom.computeVertexNormals();
  return geom;
}
