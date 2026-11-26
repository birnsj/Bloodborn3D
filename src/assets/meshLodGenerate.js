/**
 * Batch 7 — automatic LOD generation for Batch 6 StaticMesh lodLevels.
 * Produces simplified scene roots at configurable ratios (non-destructive).
 */
import { simplifySceneRoot } from './meshSimplify.js';

export const DEFAULT_LOD_RATIOS = Object.freeze([1, 0.5, 0.25]);
/** Default distances in editor units (100 eu = 1 m). Level 0 nearest. */
export const DEFAULT_LOD_DISTANCES_EU = Object.freeze([0, 400, 900]);

/**
 * @param {import('three').Object3D} sourceRoot
 * @param {{ ratios?: number[], distancesEu?: number[] }} [options]
 */
export async function generateLodLevelsFromRoot(sourceRoot, options = {}) {
  const ratios = Array.isArray(options.ratios) && options.ratios.length
    ? options.ratios.map((r) => {
      const n = Number(r);
      if (!Number.isFinite(n)) return 0.5;
      // Keep exact 1.0 as "source" level (do not clamp to 0.99).
      if (n >= 1) return 1;
      return Math.min(0.99, Math.max(0.05, n));
    })
    : [...DEFAULT_LOD_RATIOS];
  const distancesEu = Array.isArray(options.distancesEu) && options.distancesEu.length
    ? options.distancesEu
    : [...DEFAULT_LOD_DISTANCES_EU];

  const levels = [];
  for (let i = 0; i < ratios.length; i += 1) {
    const ratio = ratios[i];
    const distance = distancesEu[i] ?? (i === 0 ? 0 : 400 * i);
    if (ratio >= 0.999) {
      // Keep original as L0 without re-simplify
      const { inspectMeshRoot } = await import('./meshInspect.js');
      const stats = inspectMeshRoot(sourceRoot);
      levels.push({
        index: i,
        ratio: 1,
        distance,
        root: sourceRoot.clone(true),
        before: stats,
        after: stats,
        reduction: 0,
        degradation: [],
        isSource: true,
      });
      continue;
    }
    const simplified = await simplifySceneRoot(sourceRoot, ratio);
    levels.push({
      index: i,
      ratio,
      distance,
      root: simplified.root,
      before: simplified.before,
      after: simplified.after,
      reduction: simplified.reduction,
      degradation: simplified.degradation,
      isSource: false,
    });
  }

  return {
    levels,
    ratios,
    distancesEu: levels.map((l) => l.distance),
  };
}

/**
 * Build StaticMesh `lodLevels` field entries from generated registry asset ids.
 */
export function lodLevelsFromAssetIds(assetIds, distancesEu = DEFAULT_LOD_DISTANCES_EU) {
  return (assetIds || [])
    .map((assetId, i) => ({
      assetId,
      distance: distancesEu[i] ?? (i === 0 ? 0 : 400 * i),
    }))
    .filter((row) => row.assetId);
}
