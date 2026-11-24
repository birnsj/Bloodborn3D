/**
 * Face-ID continuity across hull rebuilds (Phase 2F.0).
 * Rejects ambiguous cases that would discard material/UV assignments.
 */

import { dot, faceArea, faceNormal, normalizeGeometry } from './convexBrush.js';

/**
 * Assign old face IDs to new faces.
 *
 * @param {object} oldGeometry
 * @param {object} newGeometry  faces may have temporary ids
 * @param {{ faceMaterials?: object|null, faceUVs?: object|null }} [maps]
 * @returns {{
 *   ok: true,
 *   faces: { id, loop, proj }[],
 *   lineage: { faces: Record<string,string|null>, droppedFaces: string[] },
 *   faceMaterials: object|null,
 *   faceUVs: object|null,
 *   nextFace: number,
 * } | { ok: false, code: string, message: string }}
 */
export function assignFaceLineage(oldGeometry, newGeometry, maps = {}) {
  const oldG = normalizeGeometry(oldGeometry);
  const newG = normalizeGeometry(newGeometry);
  if (!oldG || !newG) {
    return { ok: false, code: 'TOPOLOGY', message: 'Invalid geometry for lineage.' };
  }

  const oldFaces = oldG.faces;
  const candidates = newG.faces.map((f, index) => ({
    index,
    loop: [...f.loop],
    proj: f.proj,
    normal: faceNormal(newG, f),
    area: faceArea(newG, f),
    tempId: f.id,
  }));

  const claimedOld = new Set();
  const assignment = new Array(candidates.length).fill(null); // old face or null

  // Score matrix: candidate i vs old face j
  const scores = candidates.map((cand) => oldFaces.map((old) => {
    const shared = countShared(cand.loop, old.loop);
    if (shared < 2) return -1;
    const oldN = faceNormal(oldG, old);
    const align = dot(cand.normal, oldN);
    if (align < 0.5) return -1;
    // Prefer more shared verts, then alignment, then area overlap proxy.
    return shared * 10 + align + Math.min(cand.area, faceArea(oldG, old)) * 1e-6;
  }));

  // Greedy: best score first, deterministic by candidate index then old id.
  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < oldFaces.length; j += 1) {
      if (scores[i][j] >= 0) {
        pairs.push({ i, j, score: scores[i][j], oldId: oldFaces[j].id });
      }
    }
  }
  pairs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.i !== b.i) return a.i - b.i;
    return a.oldId.localeCompare(b.oldId, 'en');
  });

  // Track how many new faces claim each old face (for split copy).
  const oldClaimCount = new Map();
  for (const pair of pairs) {
    if (assignment[pair.i] != null) continue;
    // Allow multiple new faces to inherit from same old (split) — largest keeps id,
    // others get new ids + material copy. First claim (highest score) keeps the id.
    if (!claimedOld.has(pair.j)) {
      assignment[pair.i] = { kind: 'keep', oldId: oldFaces[pair.j].id, oldIndex: pair.j };
      claimedOld.add(pair.j);
      oldClaimCount.set(pair.j, 1);
    } else {
      assignment[pair.i] = { kind: 'split', oldId: oldFaces[pair.j].id, oldIndex: pair.j };
      oldClaimCount.set(pair.j, (oldClaimCount.get(pair.j) || 0) + 1);
    }
  }

  // Ambiguity: a faceMaterials/faceUVs key whose old face was not claimed AND no split
  // received it — that would discard an assignment. Reject.
  const faceMaterials = maps.faceMaterials && typeof maps.faceMaterials === 'object'
    ? { ...maps.faceMaterials }
    : null;
  const faceUVs = maps.faceUVs && typeof maps.faceUVs === 'object'
    ? structuredClone(maps.faceUVs)
    : null;

  const droppedFaces = [];
  for (let j = 0; j < oldFaces.length; j += 1) {
    if (!claimedOld.has(j)) {
      droppedFaces.push(oldFaces[j].id);
      const id = oldFaces[j].id;
      const hadMat = Boolean(faceMaterials?.[id]);
      const hadUv = Boolean(faceUVs?.[id]);
      if (hadMat || hadUv) {
        // Check whether any new face could plausibly have taken it (score was ≥0 for someone).
        const hadPlausible = scores.some((row) => row[j] >= 0);
        if (hadPlausible) {
          return {
            ok: false,
            code: 'AMBIGUOUS_LINEAGE',
            message: `Face "${id}" has material/UV overrides but lineage could not assign them uniquely.`,
          };
        }
        // No plausible successor — drop the maps for that face (face gone entirely).
        if (faceMaterials) delete faceMaterials[id];
        if (faceUVs) delete faceUVs[id];
      }
    }
  }

  let nextFace = Math.max(oldG.nextFace, newG.nextFace);
  const lineageFaces = {};
  const outFaces = [];
  const nextMaterials = faceMaterials ? { ...faceMaterials } : {};
  const nextUVs = faceUVs ? structuredClone(faceUVs) : {};

  // For splits: sort by area descending so largest keeps id (already first via score),
  // remaining get new ids + copied maps.
  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    const asg = assignment[i];
    let id;
    let proj = cand.proj;
    if (!asg) {
      id = `f${nextFace}`;
      nextFace += 1;
      lineageFaces[id] = null;
      proj = dominantProj(cand.normal);
    } else if (asg.kind === 'keep') {
      id = asg.oldId;
      lineageFaces[id] = asg.oldId;
      proj = oldFaces[asg.oldIndex].proj || proj;
    } else {
      // split copy
      id = `f${nextFace}`;
      nextFace += 1;
      lineageFaces[id] = asg.oldId;
      proj = oldFaces[asg.oldIndex].proj || proj;
      if (faceMaterials?.[asg.oldId]) nextMaterials[id] = faceMaterials[asg.oldId];
      if (faceUVs?.[asg.oldId]) nextUVs[id] = structuredClone(faceUVs[asg.oldId]);
    }
    outFaces.push({ id, loop: cand.loop, proj });
  }

  // Drop map keys for fully dropped faces (already handled) and ensure no stale keys.
  const liveIds = new Set(outFaces.map((f) => f.id));
  for (const key of Object.keys(nextMaterials)) {
    if (!liveIds.has(key)) delete nextMaterials[key];
  }
  for (const key of Object.keys(nextUVs)) {
    if (!liveIds.has(key)) delete nextUVs[key];
  }

  return {
    ok: true,
    faces: outFaces,
    lineage: { faces: lineageFaces, droppedFaces },
    faceMaterials: Object.keys(nextMaterials).length ? nextMaterials : null,
    faceUVs: Object.keys(nextUVs).length ? nextUVs : null,
    nextFace,
  };
}

function countShared(a, b) {
  const set = new Set(b);
  let n = 0;
  for (const id of a) if (set.has(id)) n += 1;
  return n;
}

function dominantProj(normal) {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ax >= ay && ax >= az) return normal[0] >= 0 ? 'px' : 'nx';
  if (ay >= ax && ay >= az) return normal[1] >= 0 ? 'py' : 'ny';
  return normal[2] >= 0 ? 'pz' : 'nz';
}
