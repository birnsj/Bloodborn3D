/**
 * Phase 2G rendering integration regressions:
 * - World Solid surface picking (grouped, not box faceIndex/2)
 * - Per-face UV on clipped exposed geometry
 * - Indexed grouped UV transforms each shared vertex once
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSubtractiveMazeWorld } from '../editor/subtractiveMazeFactory.js';
import {
  createBatchedWorldSolidGeometry,
  createExposedWorldSolidGeometry,
  getBrushRenderSolids,
} from '../runtime/brushGeometry.js';
import { FACE_OUTWARD } from '../runtime/brushBoolean.js';
import { semanticFaceKeyFromSurfaceId, surfaceIdFromHit } from '../runtime/surfaces.js';
import { applyFaceUvsToGeometry, composeActorUv, normalizeActorUv } from '../runtime/uvMapping.js';
import { toMeters } from '../core/units.js';

function mazeSolids(cols = 3, rows = 2) {
  const world = createSubtractiveMazeWorld({ cols, rows, showcase: false, seed: 11 });
  const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
  const comp = solid.getComponent('Brush');
  const { solids } = getBrushRenderSolids(comp, { world, actor: solid });
  return { world, solid, comp, solids };
}

describe('Phase 2G — World Solid picking', () => {
  it('createExposedWorldSolidGeometry stamps grouped surfaceIds', () => {
    const { comp, solids } = mazeSolids();
    let solid = null;
    let geom = null;
    for (const s of solids) {
      const bias = {
        origin: {
          x: s.center.x - s.size.x / 2,
          y: s.center.y - s.size.y / 2,
          z: s.center.z - s.size.z / 2,
        },
      };
      const g = createExposedWorldSolidGeometry(s, solids, comp.size, comp.uv, bias, null);
      if (g) {
        solid = s;
        geom = g;
        break;
      }
    }
    expect(solid).toBeTruthy();
    expect(geom.userData.surfaceScheme).toBe('grouped');
    expect(geom.userData.surfaceIds.length).toBe(geom.groups.length);
    expect(geom.userData.surfaceIds.length).toBeGreaterThan(0);
    expect(new Set(geom.userData.surfaceIds).size).toBe(geom.userData.surfaceIds.length);

    const mesh = new THREE.Mesh(
      geom,
      geom.userData.surfaceIds.map(() => new THREE.MeshBasicMaterial()),
    );
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = geom.userData.surfaceIds;

    let checked = 0;
    for (const g of geom.groups) {
      if (!g.count) continue;
      for (let i = g.start; i < g.start + g.count; i += 3) {
        const tri = i / 3;
        const sid = surfaceIdFromHit(mesh, tri);
        expect(sid).toBe(geom.userData.surfaceIds[g.materialIndex]);
        const face = semanticFaceKeyFromSurfaceId(sid);
        const v = geom.index.getX(i);
        const n = geom.attributes.normal;
        const out = FACE_OUTWARD[face];
        expect([n.getX(v), n.getY(v), n.getZ(v)]).toEqual([out.x, out.y, out.z]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    geom.dispose();
  });

  it('batched World Solid picking matches every triangle to its panel surface id', () => {
    const { comp, solids } = mazeSolids(4, 3);
    const geom = createBatchedWorldSolidGeometry(solids, comp.size, comp.uv, null);
    const mesh = new THREE.Mesh(
      geom,
      geom.userData.surfaceIds.map(() => new THREE.MeshBasicMaterial()),
    );
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = geom.userData.surfaceIds;
    let ok = 0;
    for (const g of geom.groups) {
      for (let i = g.start; i < g.start + g.count; i += 3) {
        expect(surfaceIdFromHit(mesh, i / 3)).toBe(geom.userData.surfaceIds[g.materialIndex]);
        ok += 1;
      }
    }
    expect(ok).toBe(geom.index.count / 3);
    geom.dispose();
  });
});

describe('Phase 2G — clipped face UV assignment', () => {
  it('applies a per-face UV override on exposed World Solid geometry via grouped scheme', () => {
    const { comp, solids } = mazeSolids();
    // Prefer a solid that exposes +Y (floor/ceiling patch).
    let target = null;
    let bias = null;
    for (const s of solids) {
      const b = {
        origin: {
          x: s.center.x - s.size.x / 2,
          y: s.center.y - s.size.y / 2,
          z: s.center.z - s.size.z / 2,
        },
      };
      const g = createExposedWorldSolidGeometry(s, solids, comp.size, comp.uv, b, null);
      if (!g) continue;
      const py = g.groups.find((grp) => {
        const sid = g.userData.surfaceIds[grp.materialIndex];
        return semanticFaceKeyFromSurfaceId(sid) === 'py' && grp.count > 0;
      });
      if (py) {
        target = s;
        bias = b;
        g.dispose();
        break;
      }
      g.dispose();
    }
    expect(target).toBeTruthy();

    const plain = createExposedWorldSolidGeometry(target, solids, comp.size, comp.uv, bias, null);
    const edited = createExposedWorldSolidGeometry(
      target,
      solids,
      comp.size,
      comp.uv,
      bias,
      { py: { scale: { x: 2, y: 2 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    );
    let pyHits = 0;
    for (const g of plain.groups) {
      if (!g.count) continue;
      const sid = plain.userData.surfaceIds[g.materialIndex];
      const isPy = semanticFaceKeyFromSurfaceId(sid) === 'py';
      const seen = new Set();
      for (let i = g.start; i < g.start + g.count; i += 1) {
        const v = plain.index.getX(i);
        if (seen.has(v)) continue;
        seen.add(v);
        if (isPy) {
          expect(edited.attributes.uv.getX(v)).toBeCloseTo(plain.attributes.uv.getX(v) * 2, 4);
          pyHits += 1;
        } else {
          expect(edited.attributes.uv.getX(v)).toBeCloseTo(plain.attributes.uv.getX(v), 5);
          expect(edited.attributes.uv.getY(v)).toBeCloseTo(plain.attributes.uv.getY(v), 5);
        }
      }
    }
    expect(pyHits).toBeGreaterThan(0);
    plain.dispose();
    edited.dispose();
  });
});

describe('Phase 2G — indexed grouped UV transforms once per vertex', () => {
  it('does not double-compose shared quad vertices', () => {
    // One indexed quad (2 triangles, 4 vertices) in a single surface group.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const index = [0, 1, 2, 0, 2, 3];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(index);
    geom.addGroup(0, 6, 0);
    geom.userData.surfaceIds = ['py'];

    applyFaceUvsToGeometry(geom, {
      py: { scale: { x: 2, y: 2 }, offset: { x: 0, y: 0 }, rotation: 0 },
    }, { scheme: 'grouped' });

    const uv = geom.attributes.uv;
    // Vertex 0 is referenced by both triangles; scale must apply exactly once → 0*2=0.
    expect(uv.getX(0)).toBeCloseTo(0, 5);
    expect(uv.getX(1)).toBeCloseTo(2, 5);
    expect(uv.getX(2)).toBeCloseTo(2, 5);
    expect(uv.getY(2)).toBeCloseTo(2, 5);
    expect(uv.getX(3)).toBeCloseTo(0, 5);
    expect(uv.getY(3)).toBeCloseTo(2, 5);

    // Applying again should compose once more (2 → 4), not 8 from a prior double-bug residue.
    applyFaceUvsToGeometry(geom, {
      py: { scale: { x: 2, y: 2 }, offset: { x: 0, y: 0 }, rotation: 0 },
    }, { scheme: 'grouped' });
    expect(uv.getX(1)).toBeCloseTo(4, 5);
    expect(uv.getY(2)).toBeCloseTo(4, 5);

    // Sanity: composeActorUv itself.
    const n = normalizeActorUv({ scale: { x: 2, y: 2 } });
    expect(composeActorUv(1, 1, n)).toEqual([2, 2]);

    geom.dispose();
  });
});

describe('Phase 2G — meters helper still used by batched centers', () => {
  it('keeps toMeters available for brush-local solid centers', () => {
    expect(toMeters(100)).toBe(1);
  });
});
