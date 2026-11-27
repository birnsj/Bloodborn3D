import { isWorldSolidActor } from '../brushBoolean.js';
import { setEnvironmentPerspectiveVisible } from '../createThreeEnvironment.js';
import { disposeObjectTree, disposeOwnedMaterial } from '../gpuResources.js';
import { isAdditiveBrushActor, isSubtractBrushActor } from '../actorVisualFingerprint.js';

export const EDIT_FILL_BASE_INTENSITY = 0.06;
export const EDIT_FILL2_BASE_INTENSITY = 0.03;

export const DEFAULT_VIEWPORT_COLORS = {
  background: 0x0e1218,
  gridMajor: 0x4a5568,
  gridMinor: 0x2a3038,
  selection: 0xffcc33,
  subtract: 0xc23b4a,
};

/**
 * Hide ViewHelper −X/−Y/−Z sprites. Three.js draws them as black discs at
 * opacity 0.2; against the editor grid they look like soft alpha artifacts.
 * @param {import('three/addons/helpers/ViewHelper.js').ViewHelper} helper
 */
export function hideViewHelperNegativeAxes(helper) {
  if (!helper?.traverse) return;
  helper.traverse((obj) => {
    const t = obj.userData?.type;
    if (t === 'negX' || t === 'negY' || t === 'negZ') {
      obj.visible = false;
    }
  });
}

/**
 * Three.js adapter: builds and syncs visual representation of a World.
 * Gameplay logic does not live here.
 */


export function distPointToSegment2D(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function closestParamOnSegment2D(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return 0;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  return Math.max(0, Math.min(1, t));
}

export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (typeof child.userData?.bbEnvDispose === 'function') {
      try { child.userData.bbEnvDispose(); } catch { /* ignore */ }
      child.userData.bbEnvDispose = null;
    }
    if (typeof child.userData?.bbPrimitiveDispose === 'function') {
      try { child.userData.bbPrimitiveDispose(); } catch { /* ignore */ }
      child.userData.bbPrimitiveDispose = null;
    }
    // Light holders own shadow-map RTs via createThreeLight dispose (C5).
    if (typeof child.userData?.bbLightDispose === 'function') {
      try { child.userData.bbLightDispose(); } catch { /* ignore */ }
      child.userData.bbLightDispose = null;
    }
    // Decal mesh may be parented under a brush/static mesh host.
    if (child.userData?.bbDecalDetached && child.parent) {
      child.parent.remove(child);
    }
  });
  disposeObjectTree(obj);
}

export function setEnvironmentSurfacesPerspectiveVisible(scene, perspective) {
  scene?.traverse((obj) => {
    if (obj.userData?.bbEnvPerspectiveMesh || obj.userData?.bbEnvOrthoMesh || obj.userData?.bbPlaceableSky) {
      setEnvironmentPerspectiveVisible(obj, perspective);
    }
  });
}

export function disposeMaterial(mat) {
  disposeOwnedMaterial(mat);
}

export function createEmptySyncStats() {
  return {
    fullSyncs: 0,
    incrementalSyncs: 0,
    actorAdds: 0,
    actorRemoves: 0,
    actorRebuilds: 0,
    transformUpdates: 0,
    hierarchyMoves: 0,
    geometryAllocs: 0,
    materialAllocs: 0,
  };
}

export function carveRoleForActor(actor) {
  if (isWorldSolidActor(actor)) return 'world-solid';
  if (isSubtractBrushActor(actor)) return 'subtract';
  if (isAdditiveBrushActor(actor)) return 'additive';
  return null;
}

/** Count owned geometries / materials under a group (excludes nested actor roots). */
export function countOwnedResources(group, actorId) {
  let geometries = 0;
  let materials = 0;
  const seenGeo = new Set();
  const seenMat = new Set();
  group?.traverse?.((obj) => {
    if (obj.userData?.actorId && obj.userData.actorId !== actorId && obj !== group) {
      return;
    }
    if (obj.geometry && !seenGeo.has(obj.geometry)) {
      seenGeo.add(obj.geometry);
      geometries += 1;
    }
    const mats = obj.material
      ? (Array.isArray(obj.material) ? obj.material : [obj.material])
      : [];
    for (const mat of mats) {
      if (!mat || seenMat.has(mat)) continue;
      seenMat.add(mat);
      materials += 1;
    }
  });
  return { geometries, materials };
}

/** Darken a CSS hex for cut-face fallback tinting. */
export function darkenHex(hex, amount = 0.1) {
  const raw = String(hex || '#888888').replace('#', '');
  if (raw.length !== 6) return hex;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n)) return hex;
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
