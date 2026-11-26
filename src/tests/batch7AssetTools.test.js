import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  MESH_IMPORT_EXTENSIONS,
  MESH_EXPORT_FORMATS,
  isSupportedMeshImportName,
  formatFromFileName,
  exportMeshRoot,
} from '../assets/meshFormatIO.js';
import { inspectMeshRoot, buildMeshAssetReport, formatBytes } from '../assets/meshInspect.js';
import { simplifySceneRoot, simplifyGeometry } from '../assets/meshSimplify.js';
import {
  generateLodLevelsFromRoot,
  lodLevelsFromAssetIds,
  DEFAULT_LOD_RATIOS,
  DEFAULT_LOD_DISTANCES_EU,
} from '../assets/meshLodGenerate.js';
import {
  describeCompressionSupport,
  VENDOR_DRACO_PATH,
  VENDOR_BASIS_PATH,
  configureGltfLoaderCompression,
} from '../runtime/gltfCompression.js';
import { listLessons } from '../tutorials/lessons/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeBoxScene(segments = 8) {
  const root = new THREE.Group();
  root.name = 'BoxRoot';
  const geo = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, name: 'BoxMat' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Box';
  root.add(mesh);
  return root;
}

describe('Batch 7 format registry', () => {
  it('lists expected import and export formats for Three.js r187', () => {
    expect(MESH_IMPORT_EXTENSIONS).toEqual(
      expect.arrayContaining(['.glb', '.gltf', '.fbx', '.obj', '.stl', '.ply', '.dae', '.usdz']),
    );
    expect(MESH_EXPORT_FORMATS).toEqual(
      expect.arrayContaining(['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz']),
    );
    expect(isSupportedMeshImportName('chair.fbx')).toBe(true);
    expect(isSupportedMeshImportName('chair.max')).toBe(false);
    expect(formatFromFileName('prop.DAE')).toBe('collada');
  });
});

describe('Batch 7 mesh inspection', () => {
  it('counts verts/tris/materials and builds asset reports', () => {
    const root = makeBoxScene(2);
    const stats = inspectMeshRoot(root);
    expect(stats.meshCount).toBe(1);
    expect(stats.materialCount).toBe(1);
    expect(stats.triangles).toBeGreaterThan(0);
    expect(stats.vertices).toBeGreaterThan(0);
    expect(stats.boundingBoxMeters.x).toBeCloseTo(1, 2);

    const report = buildMeshAssetReport({
      id: 'mesh_src',
      name: 'Src',
      path: 'meshes/a.glb',
      meta: { bytes: 2048, relationship: 'source', triangles: stats.triangles },
    }, stats);
    expect(report.bytesLabel).toBe(formatBytes(2048));
    expect(report.relationship).toBe('source');
    expect(report.triangles).toBe(stats.triangles);
  });
});

describe('Batch 7 simplify + LOD', () => {
  it('simplifies non-destructively with before/after counts', async () => {
    const root = makeBoxScene(12);
    const before = inspectMeshRoot(root);
    const result = await simplifySceneRoot(root, 0.4);
    expect(result.root).not.toBe(root);
    expect(result.before.triangles).toBe(before.triangles);
    expect(result.after.triangles).toBeLessThanOrEqual(result.before.triangles);
    expect(result.reduction).toBeGreaterThanOrEqual(0);
    expect(inspectMeshRoot(root).triangles).toBe(before.triangles);
  }, 30000);

  it('simplifyGeometry returns geometry when almost no verts removed', async () => {
    const geo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    const result = await simplifyGeometry(geo, 0.99);
    expect(result.error).toBeNull();
    expect(result.geometry).toBeTruthy();
  });

  it('generates LOD levels and lodLevels payload', async () => {
    const root = makeBoxScene(10);
    const generated = await generateLodLevelsFromRoot(root, {
      ratios: [...DEFAULT_LOD_RATIOS],
      distancesEu: [...DEFAULT_LOD_DISTANCES_EU],
    });
    expect(generated.levels).toHaveLength(3);
    expect(generated.levels[0].isSource).toBe(true);
    expect(generated.levels[0].ratio).toBe(1);
    expect(generated.levels[1].ratio).toBe(0.5);
    expect(generated.levels[2].after.triangles).toBeLessThanOrEqual(
      generated.levels[0].after.triangles,
    );
    const rows = lodLevelsFromAssetIds(['a', 'b', 'c'], DEFAULT_LOD_DISTANCES_EU);
    expect(rows).toEqual([
      { assetId: 'a', distance: 0 },
      { assetId: 'b', distance: 400 },
      { assetId: 'c', distance: 900 },
    ]);
  }, 60000);
});

describe('Batch 7 export (node-safe formats)', () => {
  it('exports OBJ and STL with limitations listed', async () => {
    const root = makeBoxScene(2);
    const obj = await exportMeshRoot(root, 'obj');
    expect(obj.format).toBe('obj');
    expect(String(obj.data)).toContain('v ');
    expect(obj.limitations?.length).toBeGreaterThan(0);

    const stl = await exportMeshRoot(root, 'stl');
    expect(stl.format).toBe('stl');
    expect(stl.limitations[0]).toMatch(/materials/i);
    expect(stl.data).toBeTruthy();
  }, 30000);
});

describe('Batch 7 compression decode vs encode honesty', () => {
  it('reports decode yes / encode deferred', () => {
    const support = describeCompressionSupport();
    expect(support.decode.draco).toBe(true);
    expect(support.decode.meshopt).toBe(true);
    expect(support.decode.ktx2).toBe(true);
    expect(support.encode.draco).toBe(false);
    expect(support.encode.meshopt).toBe(false);
    expect(support.encode.ktx2).toBe(false);
    expect(support.encode.reasonDraco).toMatch(/encoder/i);
  });

  it('bundles decoder/transcoder files under public/vendor', () => {
    const dracoJs = path.join(rootDir, 'public', 'vendor', 'draco', 'gltf', 'draco_decoder.js');
    const basisJs = path.join(rootDir, 'public', 'vendor', 'basis', 'basis_transcoder.js');
    const meshoptJs = path.join(rootDir, 'public', 'vendor', 'meshopt', 'meshopt_decoder.module.js');
    expect(existsSync(dracoJs)).toBe(true);
    expect(existsSync(basisJs)).toBe(true);
    expect(existsSync(meshoptJs)).toBe(true);
    expect(VENDOR_DRACO_PATH).toBe('/vendor/draco/gltf/');
    expect(VENDOR_BASIS_PATH).toBe('/vendor/basis/');
  });

  it('tolerates stub loaders without compression hooks', async () => {
    const stub = {};
    await expect(configureGltfLoaderCompression(stub)).resolves.toBe(stub);
  });
});

describe('Batch 7 Academy + inventory docs', () => {
  it('registers Academy lesson 27', () => {
    const lesson = listLessons().find((l) => l.id === 'asset-tools');
    expect(lesson).toBeTruthy();
    expect(lesson.order).toBe(27);
  });

  it('acceptance doc exists', () => {
    const doc = path.join(rootDir, 'docs', 'ACCEPTANCE_ASSET_TOOLS.md');
    expect(existsSync(doc)).toBe(true);
    const text = readFileSync(doc, 'utf8');
    expect(text).toMatch(/Batch 7/);
    expect(text).toMatch(/encode/i);
  });
});
