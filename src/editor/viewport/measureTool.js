/**
 * Middle-mouse hold measuring tape (edit mode).
 * Distances are authored in editor units (100 eu = 1 m); display unit is a preference.
 */

import * as THREE from 'three';
import { toMeters } from '../../core/units.js';

/** @typedef {'editor' | 'meters' | 'centimeters' | 'millimeters' | 'feet' | 'inches'} MeasureDisplayUnit */

export const MEASURE_DISPLAY_UNITS = [
  { id: 'editor', label: 'Editor units', short: 'eu' },
  { id: 'meters', label: 'Meters', short: 'm' },
  { id: 'centimeters', label: 'Centimeters', short: 'cm' },
  { id: 'millimeters', label: 'Millimeters', short: 'mm' },
  { id: 'feet', label: 'Feet', short: 'ft' },
  { id: 'inches', label: 'Inches', short: 'in' },
];

const UNIT_IDS = new Set(MEASURE_DISPLAY_UNITS.map((u) => u.id));

/** @type {MeasureDisplayUnit} */
export const DEFAULT_MEASURE_DISPLAY_UNIT = 'meters';

export function normalizeMeasureDisplayUnit(value) {
  return UNIT_IDS.has(value) ? value : DEFAULT_MEASURE_DISPLAY_UNIT;
}

export function distanceEditorUnits(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(
    Number(b.x) - Number(a.x),
    Number(b.y) - Number(a.y),
    Number(b.z) - Number(a.z),
  );
}

/** Convert an editor-unit length into the display unit. */
export function convertEditorDistance(editorUnits, unitId = DEFAULT_MEASURE_DISPLAY_UNIT) {
  const eu = Math.max(0, Number(editorUnits) || 0);
  const unit = normalizeMeasureDisplayUnit(unitId);
  const meters = eu / 100;
  switch (unit) {
    case 'editor':
      return eu;
    case 'centimeters':
      return eu; // 1 eu = 1 cm
    case 'millimeters':
      return eu * 10;
    case 'feet':
      return meters / 0.3048;
    case 'inches':
      return meters / 0.0254;
    case 'meters':
    default:
      return meters;
  }
}

export function formatMeasureDistance(editorUnits, unitId = DEFAULT_MEASURE_DISPLAY_UNIT) {
  const unit = normalizeMeasureDisplayUnit(unitId);
  const value = convertEditorDistance(editorUnits, unit);
  const short = MEASURE_DISPLAY_UNITS.find((u) => u.id === unit)?.short || 'm';
  let text;
  if (unit === 'editor' || unit === 'millimeters') {
    text = Math.round(value).toLocaleString();
  } else if (unit === 'centimeters') {
    text = (Math.round(value * 10) / 10).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  } else if (unit === 'inches') {
    text = (Math.round(value * 100) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } else {
    text = (Math.round(value * 1000) / 1000).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }
  return `${text} ${short}`;
}

/**
 * World hit under the cursor, or construction-plane fallback (editor units).
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function pickMeasurePoint(sceneView, nx, ny, camera, planeYEditor = 0) {
  if (!sceneView) return null;
  const hits = sceneView.pickWorldHits?.(nx, ny, camera) || [];
  const solid = hits.find((h) => h?.point && !h.editorOnly);
  if (solid?.point) {
    return { x: solid.point.x, y: solid.point.y, z: solid.point.z };
  }
  if (hits[0]?.point) {
    return { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z };
  }
  return sceneView.pickConstructionPoint?.(nx, ny, planeYEditor, camera) || null;
}

/**
 * Project an editor-unit point into shell-local CSS pixels for the active pane.
 * @returns {{ x: number, y: number } | null}
 */
export function projectEditorPointToShell(pointEu, camera, paneRect) {
  if (!pointEu || !camera || !paneRect) return null;
  const v = new THREE.Vector3(
    toMeters(pointEu.x),
    toMeters(pointEu.y),
    toMeters(pointEu.z),
  );
  v.project(camera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
  if (v.z < -1 || v.z > 1) return null;
  const u = v.x * 0.5 + 0.5;
  const t = -v.y * 0.5 + 0.5;
  return {
    x: paneRect.x + u * paneRect.width,
    y: paneRect.y + t * paneRect.height,
  };
}

/**
 * Screen-space pan (Shift+MMB) — meters on camera right / up.
 * Matches OrbitControls screenSpacePanning feel; panSpeed is the settings multiplier.
 */
export function panCameraByPixels(camera, target, dx, dy, clientHeight, panSpeed = 2) {
  if (!camera || !target) return;
  const h = Math.max(1, Number(clientHeight) || 1);
  const speed = Number(panSpeed);
  const mul = (Number.isFinite(speed) && speed > 0 ? speed : 2) * 2;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3();
  if (camera.isOrthographicCamera) {
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const frustum = camera.top - camera.bottom || camera.userData.frustumSize || 12;
    const dist = (frustum / h) * mul;
    const offset = right.multiplyScalar(-dx * dist).add(up.multiplyScalar(dy * dist));
    camera.position.add(offset);
    target.add(offset);
    return;
  }
  up.set(0, 1, 0);
  const dist = camera.position.distanceTo(target);
  const step = (dist / h) * mul;
  const offset = right.multiplyScalar(-dx * step).addScaledVector(up, dy * step);
  camera.position.add(offset);
  target.add(offset);
}

export function buildMeasureOverlay(startEu, endEu, camera, paneRect, unitId) {
  if (!startEu || !endEu) return null;
  const a = projectEditorPointToShell(startEu, camera, paneRect);
  const b = projectEditorPointToShell(endEu, camera, paneRect);
  if (!a || !b) return null;
  const dist = distanceEditorUnits(startEu, endEu);
  return {
    x0: a.x,
    y0: a.y,
    x1: b.x,
    y1: b.y,
    label: formatMeasureDistance(dist, unitId),
    distanceEu: dist,
  };
}
