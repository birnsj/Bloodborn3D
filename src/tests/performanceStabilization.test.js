import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDisplayMode, restoreDisplayMode } from '../editor/viewport/viewportDisplay.js';
import * as THREE from 'three';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('performance stabilization artifacts', () => {
  it('ships profiling harness, acceptance doc, and screenshots', () => {
    expect(existsSync(path.join(rootDir, 'src/dev/performanceStabilization.js'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'docs/ACCEPTANCE_PERFORMANCE_STABILIZATION.md'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'docs/acceptance-performance-stabilization/01-quad-after-stabilization.png'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'public/levels/acceptance-integrated-editor.json'))).toBe(true);
    const level = JSON.parse(
      readFileSync(path.join(rootDir, 'public/levels/acceptance-integrated-editor.json'), 'utf8'),
    );
    expect(level.actors.length).toBeGreaterThanOrEqual(35);
  });

  it('lit display short-circuit does not mutate materials', () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshStandardMaterial({ color: 0x112233, wireframe: false });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    const before = mat.uuid;
    const state = applyDisplayMode(scene, [], 'lit');
    expect(state.noop).toBe(true);
    restoreDisplayMode(state);
    expect(mat.uuid).toBe(before);
    expect(mat.wireframe).toBe(false);
  });
});
