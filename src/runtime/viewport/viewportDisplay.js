import * as THREE from 'three';
import { normalizeDisplayMode } from './viewportPrefs.js';

/**
 * Temporarily override materials/lights for one display-mode render pass.
 * Call restoreDisplayMode after renderer.render.
 *
 * Wireframe uses silhouette EdgesGeometry overlays — not material.wireframe —
 * so brushes don't show triangulation diagonals / moiré soup.
 */
export function applyDisplayMode(scene, lights, mode) {
  const display = normalizeDisplayMode(mode);
  const state = {
    display,
    materials: [],
    lights: [],
    edgesVisible: [],
    objectVisibility: [],
    noop: false,
  };

  // Lit uses authored materials/lights — skip the full scene traverse.
  // Non-lit modes still walk the scene; restoreDisplayMode is a no-op for this state.
  if (display === 'lit') {
    state.noop = true;
    return state;
  }

  if (lights) {
    for (const light of lights) {
      if (!light) continue;
      state.lights.push({ light, intensity: light.intensity, visible: light.visible });
      if (display === 'unlit' || display === 'wireframe') {
        light.intensity = 0;
        if ('visible' in light) light.visible = false;
      }
    }
  }

  scene.traverse((obj) => {
    if (obj.userData?.viewportEdgesOverlay) {
      state.edgesVisible.push({ obj, visible: obj.visible });
      obj.visible = display === 'solid-edges' || display === 'wireframe';
      return;
    }

    // Light range spheres etc. become unreadable noise in wireframe.
    if (obj.userData?.denseWireHelper) {
      state.objectVisibility.push({ obj, visible: obj.visible });
      if (display === 'wireframe') obj.visible = false;
      return;
    }

    if (!obj.isMesh && !obj.isLineSegments && !obj.isLine) return;
    if (obj.userData?.editorOnly) return;

    if (display === 'wireframe' && obj.isMesh) {
      state.objectVisibility.push({ obj, visible: obj.visible });
      obj.visible = false;
      return;
    }

    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const mat of mats) {
      if (!mat) continue;
      state.materials.push({
        mat,
        wireframe: mat.wireframe,
        color: mat.color?.clone?.() || null,
        map: mat.map,
        emissive: mat.emissive?.clone?.() || null,
        emissiveMap: mat.emissiveMap,
        envMapIntensity: mat.envMapIntensity,
        flatShading: mat.flatShading,
      });

      if (display === 'unlit') {
        mat.wireframe = false;
        if (mat.emissive) {
          if (mat.color) mat.emissive.copy(mat.color);
          else mat.emissive.setHex(0xffffff);
        }
        if (mat.map && 'emissiveMap' in mat) mat.emissiveMap = mat.map;
      } else if (display === 'textured') {
        mat.wireframe = false;
        if (mat.emissive && mat.color) {
          mat.emissive.copy(mat.color).multiplyScalar(0.35);
        }
      } else if (display === 'solid-edges') {
        mat.wireframe = false;
      } else {
        // lit — leave as authored; ensure wireframe off if we toggled earlier in same frame
        mat.wireframe = false;
      }
    }
  });

  return state;
}

export function restoreDisplayMode(state) {
  if (!state) return;
  for (const entry of state.lights) {
    entry.light.intensity = entry.intensity;
    if ('visible' in entry.light) entry.light.visible = entry.visible;
  }
  for (const entry of state.materials) {
    const { mat } = entry;
    mat.wireframe = entry.wireframe;
    if (entry.color && mat.color) mat.color.copy(entry.color);
    if ('map' in mat) mat.map = entry.map;
    if (entry.emissive && mat.emissive) mat.emissive.copy(entry.emissive);
    if ('emissiveMap' in mat) mat.emissiveMap = entry.emissiveMap;
    if ('envMapIntensity' in mat && entry.envMapIntensity != null) {
      mat.envMapIntensity = entry.envMapIntensity;
    }
    if ('flatShading' in mat && entry.flatShading != null) {
      mat.flatShading = entry.flatShading;
    }
  }
  for (const entry of state.edgesVisible) {
    entry.obj.visible = entry.visible;
  }
  for (const entry of state.objectVisibility || []) {
    entry.obj.visible = entry.visible;
  }
}

/** Ensure a mesh has a sibling EdgesGeometry overlay tagged for solid-edges / wireframe. */
export function ensureEdgesOverlay(mesh, parentGroup) {
  if (!mesh?.isMesh || !mesh.geometry) return null;
  if (mesh.userData.viewportEdgesOverlayChild) return mesh.userData.viewportEdgesOverlayChild;
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xc8d0d8, transparent: true, opacity: 0.9 }),
  );
  line.userData.viewportEdgesOverlay = true;
  line.userData.editorOnly = true;
  line.visible = false;
  line.position.copy(mesh.position);
  line.quaternion.copy(mesh.quaternion);
  line.scale.copy(mesh.scale);
  const host = parentGroup || mesh.parent;
  if (host) host.add(line);
  else mesh.add(line);
  mesh.userData.viewportEdgesOverlayChild = line;
  return line;
}
