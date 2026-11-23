import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Soft studio IBL so MeshStandardMaterial roughness/metalness read as shine.
 * Safe to call once per renderer/scene pair.
 */
export function installStudioEnvironment(renderer, scene, { intensity = 0.55 } = {}) {
  if (!renderer || !scene) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return env;
}
