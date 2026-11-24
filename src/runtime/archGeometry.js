/**
 * Parametric freestanding arch mesh + collider helpers (editor units).
 * Local: X width, Y up, Z depth. Actor origin = AABB center.
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import {
  DEFAULT_ARCH_DEPTH,
  DEFAULT_ARCH_OPENING_HEIGHT,
  DEFAULT_ARCH_OPENING_WIDTH,
  DEFAULT_ARCH_RESOLUTION,
  DEFAULT_ARCH_RISE,
  DEFAULT_ARCH_THICKNESS,
} from '../components/ArchComponent.js';
import {
  TEXTURE_TILE_EDITOR_UNITS,
  applyFaceUvsToGeometry,
  mapDensityUvArray,
} from './uvMapping.js';
import {
  ARCH_SURFACE_IDS,
  regroupTrianglesBySurface,
} from './surfaces.js';

const TILE = TEXTURE_TILE_EDITOR_UNITS;

function dims(arch) {
  const openingWidth = Math.max(1, Number(arch.openingWidth) || DEFAULT_ARCH_OPENING_WIDTH);
  const openingHeight = Math.max(1, Number(arch.openingHeight) || DEFAULT_ARCH_OPENING_HEIGHT);
  const archRise = Math.max(1, Number(arch.archRise) || DEFAULT_ARCH_RISE);
  const thickness = Math.max(1, Number(arch.thickness) || DEFAULT_ARCH_THICKNESS);
  const depth = Math.max(1, Number(arch.depth) || DEFAULT_ARCH_DEPTH);
  const res = Math.max(4, Math.min(64, Math.round(Number(arch.curveResolution) || DEFAULT_ARCH_RESOLUTION)));
  const archType = arch.archType === 'gothic' ? 'gothic' : 'roman';
  return { openingWidth, openingHeight, archRise, thickness, depth, res, archType };
}

export function getArchAabbSize(arch) {
  const d = dims(arch);
  return {
    x: d.openingWidth + d.thickness * 2,
    y: d.openingHeight + d.archRise + d.thickness,
    z: d.depth,
  };
}

/** Roman circular arc: Y above spring for x in [-halfW, halfW]. */
export function sampleRomanArchY(x, halfW, rise) {
  const hw = Math.max(1e-6, halfW);
  const r = Math.max(1e-6, rise);
  // cy is center Y relative to spring line (usually negative for semicircle rise=hw)
  const cy = (r * r - hw * hw) / (2 * r);
  const R = Math.hypot(hw, -cy); // distance from center (0,cy) to spring (±hw,0)
  // Actually R = sqrt(hw^2 + cy^2) since spring y=0: sqrt(hw^2 + (0-cy)^2)
  const radius = Math.sqrt(hw * hw + cy * cy);
  const under = radius * radius - x * x;
  if (under <= 0) return 0;
  return Math.sqrt(under) + cy;
}

export function sampleGothicArchY(x, halfW, rise) {
  const hw = Math.max(1e-6, halfW);
  const cx = (rise * rise - hw * hw) / (2 * hw);
  const radius = Math.hypot(cx + hw, 0);
  if (radius < 1e-6) {
    return rise * Math.max(0, 1 - (x / hw) * (x / hw));
  }
  if (x <= 0) {
    const dx = x - cx;
    const under = radius * radius - dx * dx;
    return under > 0 ? Math.sqrt(under) : 0;
  }
  const dx = x + cx;
  const under = radius * radius - dx * dx;
  return under > 0 ? Math.sqrt(under) : 0;
}

export function sampleArchProfileY(x, halfW, rise, archType) {
  if (archType === 'gothic') return sampleGothicArchY(x, halfW, rise);
  return sampleRomanArchY(x, halfW, rise);
}

/** Local Y of spring line relative to actor origin (AABB center). */
export function getArchLocalLayout(arch) {
  const d = dims(arch);
  const aabb = getArchAabbSize(arch);
  const yBottom = -aabb.y * 0.5;
  const springY = yBottom + d.openingHeight;
  const crownY = springY + d.archRise;
  const topY = crownY + d.thickness;
  const halfInnerW = d.openingWidth * 0.5;
  const halfOuterW = halfInnerW + d.thickness;
  const halfD = d.depth * 0.5;
  return {
    ...d,
    aabb,
    yBottom,
    springY,
    crownY,
    topY,
    halfInnerW,
    halfOuterW,
    halfD,
  };
}

/**
 * Collider pieces: left/right piers (cuboids) + arch ring segments (cuboids along curve).
 */
export function getArchColliderSolids(arch) {
  const L = getArchLocalLayout(arch);
  const solids = [];

  // Left pier
  solids.push({
    center: {
      x: -(L.halfInnerW + L.thickness * 0.5),
      y: L.yBottom + (L.openingHeight + L.archRise + L.thickness) * 0.5,
      z: 0,
    },
    size: {
      x: L.thickness,
      y: L.openingHeight + L.archRise + L.thickness,
      z: L.depth,
    },
    role: 'pier',
  });
  // Right pier
  solids.push({
    center: {
      x: L.halfInnerW + L.thickness * 0.5,
      y: L.yBottom + (L.openingHeight + L.archRise + L.thickness) * 0.5,
      z: 0,
    },
    size: {
      x: L.thickness,
      y: L.openingHeight + L.archRise + L.thickness,
      z: L.depth,
    },
    role: 'pier',
  });

  // Arch ring / lintel segments from spring to outer top, following extrados/intrados
  const n = L.res;
  for (let i = 0; i < n; i += 1) {
    const t0 = -1 + (i / n) * 2;
    const t1 = -1 + ((i + 1) / n) * 2;
    const x0 = t0 * L.halfInnerW;
    const x1 = t1 * L.halfInnerW;
    const xm = (x0 + x1) * 0.5;
    const span = Math.abs(x1 - x0);
    const innerY = L.springY + sampleArchProfileY(xm, L.halfInnerW, L.archRise, L.archType);
    // Outer curve: same profile but scaled to outer half-width, plus thickness above crown conceptually
    const outerXm = (xm / L.halfInnerW) * L.halfOuterW;
    const outerRise = L.archRise + L.thickness;
    const outerY = L.springY + sampleArchProfileY(
      outerXm,
      L.halfOuterW,
      outerRise,
      L.archType,
    );
    // Fill from max(innerY, spring) up to topY for this slice — use outerY as bottom of fill above opening
    const yLo = Math.max(innerY, L.springY);
    const yHi = Math.max(yLo + 1, Math.min(L.topY, Math.max(outerY, L.crownY + L.thickness * 0.5)));
    // Prefer fill from intrados to flat top for solid crown
    const fillLo = innerY;
    const fillHi = L.topY;
    const h = fillHi - fillLo;
    if (h < 1 || span < 0.5) continue;
    solids.push({
      center: { x: xm, y: fillLo + h * 0.5, z: 0 },
      size: { x: Math.max(1, span), y: h, z: L.depth },
      role: 'arch',
    });
  }

  return solids;
}

/**
 * Build continuous arch mesh with open passage (meters).
 * Rectangular outer envelope with a procedurally arched inner hole.
 */
export function createArchGeometry(arch) {
  const L = getArchLocalLayout(arch);

  // Shape must be in meters (same as ExtrudeGeometry depth) — not editor units.
  const shape = new THREE.Shape();
  // Outer rectangle (CCW in XY)
  shape.moveTo(toMeters(-L.halfOuterW), toMeters(L.yBottom));
  shape.lineTo(toMeters(L.halfOuterW), toMeters(L.yBottom));
  shape.lineTo(toMeters(L.halfOuterW), toMeters(L.topY));
  shape.lineTo(toMeters(-L.halfOuterW), toMeters(L.topY));
  shape.lineTo(toMeters(-L.halfOuterW), toMeters(L.yBottom));

  // Passage hole — THREE expects opposite winding
  const hole = new THREE.Path();
  hole.moveTo(toMeters(-L.halfInnerW), toMeters(L.yBottom));
  hole.lineTo(toMeters(-L.halfInnerW), toMeters(L.springY));
  for (let i = 0; i <= L.res; i += 1) {
    const t = -1 + (i / L.res) * 2;
    const x = t * L.halfInnerW;
    const y = L.springY + sampleArchProfileY(x, L.halfInnerW, L.archRise, L.archType);
    hole.lineTo(toMeters(x), toMeters(y));
  }
  hole.lineTo(toMeters(L.halfInnerW), toMeters(L.springY));
  hole.lineTo(toMeters(L.halfInnerW), toMeters(L.yBottom));
  hole.lineTo(toMeters(-L.halfInnerW), toMeters(L.yBottom));
  shape.holes.push(hole);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: toMeters(L.depth),
    bevelEnabled: false,
    curveSegments: L.res,
    steps: 1,
  });
  extrude.translate(0, 0, -toMeters(L.depth) * 0.5);

  const pos = extrude.attributes.position;
  const densityUv = [];
  for (let i = 0; i < pos.count; i += 1) {
    const xEu = pos.getX(i) * 100;
    const yEu = pos.getY(i) * 100;
    const zEu = pos.getZ(i) * 100;
    if (Math.abs(Math.abs(zEu) - L.halfD) < L.depth * 0.35) {
      densityUv.push(xEu / TILE, yEu / TILE);
    } else {
      densityUv.push(xEu / TILE, zEu / TILE);
    }
  }
  const uvs = mapDensityUvArray(densityUv, arch?.uv);
  extrude.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Indexed extrusions → triangle soup so surface groups stay stable.
  const geom = extrude.index ? extrude.toNonIndexed() : extrude;
  if (geom !== extrude) extrude.dispose();
  geom.computeVertexNormals();
  const halfD = toMeters(L.halfD);
  const halfInner = toMeters(L.halfInnerW);
  regroupTrianglesBySurface(geom, ARCH_SURFACE_IDS, (i0, i1, i2, getPos) => {
    const a = getPos(i0);
    const b = getPos(i1);
    const c = getPos(i2);
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    const e1x = b[0] - a[0];
    const e1y = b[1] - a[1];
    const e1z = b[2] - a[2];
    const e2x = c[0] - a[0];
    const e2y = c[1] - a[1];
    const e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (Math.abs(nz) > 0.7) return nz > 0 ? 'front' : 'back';
    if (ny > 0.7) return 'top';
    if (ny < -0.7) return 'bottom';
    const radial = Math.hypot(cx, 0); // in XY of shape before extrude; after extrude X is width
    const distFromAxis = Math.abs(cx);
    if (distFromAxis < halfInner * 1.05 && Math.abs(cz) < halfD * 0.95) {
      return 'passage';
    }
    void cy;
    return 'outer';
  });
  applyFaceUvsToGeometry(geom, arch?.faceUVs, {
    scheme: 'grouped',
    surfaceIds: geom.userData.surfaceIds,
  });
  return geom;
}
