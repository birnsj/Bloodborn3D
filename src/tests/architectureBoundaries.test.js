/**
 * Consolidation C2 — architectural boundary regression.
 * Detects core→runtime/editor and runtime→editor imports (direct + transitive).
 * No external dependency-analysis package — walks relative ESM imports via fs.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = ROOT;

const IMPORT_RE = /(?:import|export)\s+(?:[^'"\n]+from\s+)?['"](\.[^'"]+)['"]/g;

function listJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  }
  return null;
}

function collectImports(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(text))) specs.push(m[1]);
  return specs
    .map((spec) => resolveImport(file, spec))
    .filter(Boolean);
}

function layerOf(file) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  if (rel.startsWith('core/')) return 'core';
  if (rel.startsWith('runtime/')) return 'runtime';
  if (rel.startsWith('editor/')) return 'editor';
  return 'other';
}

function walkTransitive(entryFiles, { stopLayers = [] } = {}) {
  const seen = new Set();
  const queue = [...entryFiles];
  const edges = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const layer = layerOf(file);
    if (stopLayers.includes(layer) && !entryFiles.includes(file)) continue;
    for (const dep of collectImports(file)) {
      edges.push([file, dep]);
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return { seen, edges };
}

function rel(file) {
  return path.relative(SRC, file).replace(/\\/g, '/');
}

describe('architecture boundaries (C2)', () => {
  const coreFiles = listJsFiles(path.join(SRC, 'core'));
  const runtimeFiles = listJsFiles(path.join(SRC, 'runtime'));

  it('core must not import runtime or editor (direct)', () => {
    const violations = [];
    for (const file of coreFiles) {
      for (const dep of collectImports(file)) {
        const layer = layerOf(dep);
        if (layer === 'runtime' || layer === 'editor') {
          violations.push(`${rel(file)} → ${rel(dep)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('runtime must not import editor (direct)', () => {
    const violations = [];
    for (const file of runtimeFiles) {
      for (const dep of collectImports(file)) {
        if (layerOf(dep) === 'editor') {
          violations.push(`${rel(file)} → ${rel(dep)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('core transitive closure stays out of runtime/editor', () => {
    const { edges } = walkTransitive(coreFiles);
    const violations = edges
      .filter(([, to]) => {
        const layer = layerOf(to);
        return layer === 'runtime' || layer === 'editor';
      })
      .map(([from, to]) => `${rel(from)} → ${rel(to)}`);
    expect(violations).toEqual([]);
  });

  it('runtime transitive closure stays out of editor', () => {
    const { edges } = walkTransitive(runtimeFiles);
    const violations = edges
      .filter(([, to]) => layerOf(to) === 'editor')
      .map(([from, to]) => `${rel(from)} → ${rel(to)}`);
    expect(violations).toEqual([]);
  });

  it('World imports post-processing normalization from core', () => {
    const world = fs.readFileSync(path.join(SRC, 'core/World.js'), 'utf8');
    expect(world).toMatch(/from ['"]\.\/postprocessing\/postProcessingState\.js['"]/);
    expect(world).not.toMatch(/from ['"].*runtime\/postprocessing/);
  });

  it('standalone player closure avoids editor, ui, tutorials and React', () => {
    const playerFiles = listJsFiles(path.join(SRC, 'player'));
    expect(playerFiles.length).toBeGreaterThan(0);
    const { seen } = walkTransitive(playerFiles);
    const violations = [];
    for (const file of seen) {
      const r = rel(file);
      if (/^(editor|ui|tutorials)\//.test(r)) violations.push(`player reaches ${r}`);
      const text = fs.readFileSync(file, 'utf8');
      if (/from ['"]react(-dom)?(\/[^'"]*)?['"]/.test(text)) violations.push(`${r} imports React`);
    }
    expect(violations).toEqual([]);
  });

  it('SceneView does not import editor modules', () => {
    const sceneViewDir = path.join(SRC, 'runtime/sceneView');
    const sceneView = [path.join(SRC, 'runtime/SceneView.js'), ...fs.readdirSync(sceneViewDir).map((f) => path.join(sceneViewDir, f))]
      .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(sceneView).not.toMatch(/from ['"][^'"]*editor\//);
  });
});
