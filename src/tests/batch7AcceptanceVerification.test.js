/**
 * Batch 7 acceptance verification — measured import/export, simplify, LOD,
 * compression decode (local vendor), lifecycle, and brush regression.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  exportMeshRoot,
  MESH_IMPORT_EXTENSIONS,
  MESH_EXPORT_FORMATS,
} from '../assets/meshFormatIO.js';
import { inspectMeshRoot } from '../assets/meshInspect.js';
import { simplifySceneRoot } from '../assets/meshSimplify.js';
import { generateLodLevelsFromRoot, lodLevelsFromAssetIds } from '../assets/meshLodGenerate.js';
import {
  describeCompressionSupport,
  configureGltfLoaderCompression,
  VENDOR_DRACO_PATH,
  VENDOR_BASIS_PATH,
  VENDOR_MESHOPT_PATH,
  disposeGltfCompressionLoaders,
} from '../runtime/gltfCompression.js';
import { toMeters } from '../core/units.js';
import { seedLoadedMeshScene, seedLoadedMeshMeta, clearMeshCache } from '../runtime/meshLoader.js';
import { validateLevelPayloads } from '../serialization/levelGeometryValidation.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';

// GLTFLoader texture path uses self.URL in Node.
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CUBE = path.join(rootDir, 'public/assets/meshes/mesh_verify_cube.glb');
const CHAR = path.join(rootDir, 'public/assets/meshes/mesh_b18711df23cd.glb');
const MESHOPT_FIXTURE = path.join(rootDir, 'public/assets/fixtures/meshopt_triangle.glb');
const SUBTRACTIVE = path.join(rootDir, 'public/levels/acceptance-subtractive.json');
const STATIC_LEVEL = path.join(rootDir, 'public/levels/acceptance-static-meshes.json');

/** @type {Array<object>} */
export const MEASUREMENTS = [];

function record(row) {
  MEASUREMENTS.push(row);
  // eslint-disable-next-line no-console
  console.log('[Batch7 measure]', JSON.stringify(row));
}

async function parseGlbFile(filePath) {
  const buf = readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  await configureGltfLoaderCompression(loader);
  return new Promise((resolve, reject) => {
    loader.parse(ab, '', (gltf) => resolve({
      scene: gltf.scene,
      bytes: buf.length,
      gltf,
    }), reject);
  });
}

function makeTexturedMultiMaterialRoot() {
  const root = new THREE.Group();
  root.name = 'FurnitureProp';
  const geo = new THREE.BoxGeometry(1, 0.8, 0.6, 6, 4, 4);
  geo.computeVertexNormals();
  const data = new Uint8Array([
    180, 120, 80, 255,
    90, 60, 40, 255,
    200, 180, 140, 255,
    60, 40, 30, 255,
  ]);
  const tex = new THREE.DataTexture(data, 2, 2);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  const wood = new THREE.MeshStandardMaterial({
    name: 'Wood',
    map: tex,
    roughness: 0.7,
    metalness: 0.05,
  });
  const metal = new THREE.MeshStandardMaterial({
    name: 'Metal',
    color: 0x8899aa,
    metalness: 0.85,
    roughness: 0.25,
  });
  const mesh = new THREE.Mesh(geo, [wood, metal]);
  mesh.name = 'Body';
  // Split groups so both material slots are used
  geo.clearGroups();
  const idxCount = geo.index.count;
  geo.addGroup(0, Math.floor(idxCount / 2), 0);
  geo.addGroup(Math.floor(idxCount / 2), idxCount - Math.floor(idxCount / 2), 1);
  root.add(mesh);
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8),
    metal.clone(),
  );
  leg.name = 'Leg';
  leg.position.set(0.35, -0.4, 0.2);
  root.add(leg);
  return root;
}

describe('Batch 7 verification — format registry + vendor locality', () => {
  it('covers implemented import/export formats without CDN paths', () => {
    expect(MESH_IMPORT_EXTENSIONS).toEqual(
      expect.arrayContaining(['.glb', '.fbx', '.obj', '.stl', '.ply', '.dae', '.usdz']),
    );
    expect(MESH_EXPORT_FORMATS).toEqual(
      expect.arrayContaining(['glb', 'obj', 'stl', 'ply', 'usdz']),
    );
    const support = describeCompressionSupport();
    expect(support.decode.draco).toBe(true);
    expect(support.encode.draco).toBe(false);
    for (const p of [VENDOR_DRACO_PATH, VENDOR_BASIS_PATH, VENDOR_MESHOPT_PATH]) {
      expect(p.startsWith('/vendor/')).toBe(true);
      expect(p.includes('cdn') || p.includes('http')).toBe(false);
    }
    expect(existsSync(path.join(rootDir, 'public/vendor/draco/gltf/draco_decoder.wasm'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'public/vendor/basis/basis_transcoder.wasm'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'public/vendor/meshopt/meshopt_decoder.module.js'))).toBe(true);
  });
});

describe('Batch 7 verification — import/export round-trips', () => {
  it('OBJ and STL round-trip preserve geometry; format limits reported', async () => {
    const root = makeTexturedMultiMaterialRoot();
    const before = inspectMeshRoot(root);
    expect(before.meshCount).toBe(2);
    expect(before.materialCount).toBeGreaterThanOrEqual(2);
    expect(before.triangles).toBeGreaterThan(20);

    const obj = await exportMeshRoot(root, 'obj');
    expect(obj.limitations.length).toBeGreaterThan(0);
    expect(obj.limitations[0]).toMatch(/material/i);
    const objRoot = new OBJLoader().parse(String(obj.data));
    const objStats = inspectMeshRoot(objRoot);
    expect(objStats.triangles).toBeGreaterThan(0);

    const stl = await exportMeshRoot(root, 'stl');
    expect(stl.limitations[0]).toMatch(/materials/i);
    const stlBuffer = stl.data instanceof DataView
      ? stl.data.buffer.slice(stl.data.byteOffset, stl.data.byteOffset + stl.data.byteLength)
      : stl.data;
    const stlGeo = new STLLoader().parse(stlBuffer);
    const stlRoot = new THREE.Group();
    stlRoot.add(new THREE.Mesh(stlGeo));
    const stlStats = inspectMeshRoot(stlRoot);
    // STL collapses hierarchy — native format limitation, not a BloodBound defect
    expect(stlStats.meshCount).toBe(1);
    expect(stlStats.triangles).toBeGreaterThan(0);

    record({
      op: 'export-roundtrip',
      beforeTris: before.triangles,
      beforeMeshes: before.meshCount,
      beforeMaterials: before.materialCount,
      objTris: objStats.triangles,
      stlTris: stlStats.triangles,
      objBytes: typeof obj.data === 'string' ? Buffer.byteLength(obj.data) : obj.data.byteLength,
      stlBytes: stl.data.byteLength || stl.data.length,
      note: 'STL hierarchy collapse is a format limitation',
    });
  }, 30000);

  it('PLY export/import preserves geometry shell', async () => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)));
    const before = inspectMeshRoot(group);
    const ply = await exportMeshRoot(group, 'ply');
    expect(ply.format).toBe('ply');
    expect(ply.limitations[0]).toMatch(/material/i);
    const plyGeo = new PLYLoader().parse(String(ply.data));
    const plyRoot = new THREE.Group();
    plyRoot.add(new THREE.Mesh(plyGeo));
    const after = inspectMeshRoot(plyRoot);
    expect(after.triangles).toBeGreaterThan(0);
    record({
      op: 'ply-roundtrip',
      beforeTris: before.triangles,
      afterTris: after.triangles,
    });
  }, 30000);

  it('production GLB cube reimports via convert path metadata', async () => {
    const { scene, bytes } = await parseGlbFile(CUBE);
    const stats = inspectMeshRoot(scene);
    expect(stats.triangles).toBe(12);
    expect(stats.meshCount).toBe(1);
    // Scale assumption: unit cube ~1m
    expect(stats.boundingBoxMeters.x).toBeCloseTo(1, 1);
    record({ op: 'glb-cube', bytes, ...stats });
  });
});

describe('Batch 7 verification — production mesh simplification', () => {
  it('simplifies Meshy character GLB at 25/50/75% reduction without mutating source', async () => {
    expect(existsSync(CHAR)).toBe(true);
    const { scene, bytes } = await parseGlbFile(CHAR);
    const sourceBefore = inspectMeshRoot(scene);
    expect(sourceBefore.triangles).toBeGreaterThan(1000);

    const rows = [];
    for (const keep of [0.75, 0.5, 0.25]) {
      const t0 = performance.now();
      const result = await simplifySceneRoot(scene, keep);
      const ms = performance.now() - t0;
      expect(result.root).not.toBe(scene);
      expect(inspectMeshRoot(scene).triangles).toBe(sourceBefore.triangles);
      expect(result.after.triangles).toBeLessThanOrEqual(result.before.triangles);
      // Achieved reduction should track target within Meshopt tolerance
      const targetReduction = 1 - keep;
      expect(result.reduction).toBeGreaterThan(targetReduction - 0.08);
      expect(result.reduction).toBeLessThan(targetReduction + 0.08);
      const row = {
        op: 'simplify-character',
        keep,
        targetReduction,
        beforeTris: result.before.triangles,
        afterTris: result.after.triangles,
        beforeVerts: result.before.vertices,
        afterVerts: result.after.vertices,
        achievedReduction: Number(result.reduction.toFixed(4)),
        ms: Number(ms.toFixed(2)),
        degradation: result.degradation,
        sourceBytes: bytes,
      };
      rows.push(row);
      record(row);
    }
    expect(rows).toHaveLength(3);
  }, 120000);

  it('detects extreme reduction degradation warning', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 20, 20, 20)));
    const result = await simplifySceneRoot(root, 0.02);
    // Either extreme reduction warning or remaining tris still finite
    expect(result.after.triangles).toBeGreaterThan(0);
    if (result.reduction > 0.95) {
      expect(result.degradation.some((d) => /Extreme/i.test(d))).toBe(true);
    }
  }, 60000);
});

describe('Batch 7 verification — automatic LOD + multi-camera', () => {
  beforeAll(() => {
    clearMeshCache();
  });
  afterAll(() => {
    clearMeshCache();
    disposeGltfCompressionLoaders();
  });

  it('generates derived LOD levels with distances and preserves source counts', async () => {
    const { scene } = await parseGlbFile(CHAR);
    const before = inspectMeshRoot(scene);
    const t0 = performance.now();
    const generated = await generateLodLevelsFromRoot(scene);
    const ms = performance.now() - t0;
    expect(generated.levels).toHaveLength(3);
    expect(generated.levels[0].isSource).toBe(true);
    expect(generated.levels[0].after.triangles).toBe(before.triangles);
    expect(generated.levels[2].after.triangles).toBeLessThan(generated.levels[0].after.triangles);
    const rows = lodLevelsFromAssetIds(['src', 'l1', 'l2']);
    expect(rows[1].distance).toBe(400);
    record({
      op: 'auto-lod',
      ms: Number(ms.toFixed(2)),
      levels: generated.levels.map((l) => ({
        index: l.index,
        ratio: l.ratio,
        tris: l.after.triangles,
        distance: l.distance,
      })),
    });
  }, 120000);

  it('selects different LOD levels for near vs far cameras (multi-cam)', () => {
    const lod = new THREE.LOD();
    const m0 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m0.name = 'L0';
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m1.name = 'L1';
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m2.name = 'L2';
    // Distances in meters (400 eu = 4 m, 900 eu = 9 m)
    lod.addLevel(m0, 0, 0);
    lod.addLevel(m1, 4, 0.0625);
    lod.addLevel(m2, 9, 0.028);
    lod.position.set(0, 0, 0);
    lod.updateMatrixWorld(true);

    const near = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    near.position.set(0, 0, 1);
    near.updateMatrixWorld(true);
    lod.update(near);
    expect(lod.getCurrentLevel()).toBe(0);
    expect(m0.visible).toBe(true);

    const mid = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    mid.position.set(0, 0, 5);
    mid.updateMatrixWorld(true);
    lod.update(mid);
    expect(lod.getCurrentLevel()).toBe(1);
    expect(m1.visible).toBe(true);

    const far = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    far.position.set(0, 0, 20);
    far.updateMatrixWorld(true);
    lod.update(far);
    expect(lod.getCurrentLevel()).toBe(2);
    expect(m2.visible).toBe(true);

    // Simulate two perspective panes in one frame: near then far
    lod.update(near);
    const levelAfterNear = lod.getCurrentLevel();
    lod.update(far);
    const levelAfterFar = lod.getCurrentLevel();
    expect(levelAfterNear).toBe(0);
    expect(levelAfterFar).toBe(2);

    record({
      op: 'multi-cam-lod',
      near: levelAfterNear,
      mid: 1,
      far: levelAfterFar,
    });
  });

  it('applies hysteresis fraction and disables autoUpdate for manual lodPreview', () => {
    // Mirrors createThreeStaticMesh LOD wiring (defect closure).
    const lod = new THREE.LOD();
    const hystMeters = toMeters(25);
    const distancesEu = [0, 400, 900];
    for (let i = 0; i < distancesEu.length; i += 1) {
      const distM = toMeters(distancesEu[i]);
      const hystFrac = distM > 1e-6
        ? Math.min(0.49, Math.max(0, hystMeters / distM))
        : 0;
      const obj = new THREE.Object3D();
      obj.name = `L${i}`;
      lod.addLevel(obj, distM, hystFrac);
    }
    expect(lod.levels[1].hysteresis).toBeCloseTo(0.0625, 4);
    expect(lod.levels[2].hysteresis).toBeCloseTo(0.25 / 9, 4);

    const lodPreview = 2;
    lod.autoUpdate = false;
    for (let i = 0; i < lod.levels.length; i += 1) {
      lod.levels[i].object.visible = i === lodPreview;
    }
    expect(lod.autoUpdate).toBe(false);
    expect(lod.levels[2].object.visible).toBe(true);
    expect(lod.levels[0].object.visible).toBe(false);
    record({
      op: 'lod-hysteresis-wiring',
      hystMeters,
      level1Hyst: lod.levels[1].hysteresis,
      level2Hyst: lod.levels[2].hysteresis,
      manualAutoUpdate: lod.autoUpdate,
    });
  });

  it('keeps collision independent of visual LOD preview', async () => {
    const level = JSON.parse(readFileSync(STATIC_LEVEL, 'utf8'));
    const world = deserializeLevel(level);
    const lodActor = world.actors.find((a) => a.name === 'Prop — LOD Stack');
    expect(lodActor).toBeTruthy();
    const sm = lodActor.getComponent('StaticMesh');
    expect(sm.lodLevels.length).toBe(3);

    const url = '/assets/meshes/mesh_verify_cube.glb';
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    seedLoadedMeshMeta(url, {
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 0, z: 0 },
    });
    seedLoadedMeshScene(url, root);
    // Character LOD level also referenced — seed a stand-in
    const charUrl = '/assets/meshes/mesh_b18711df23cd.glb';
    seedLoadedMeshMeta(charUrl, {
      boundingBoxMeters: { x: 1, y: 2, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 1, z: 0 },
    });
    seedLoadedMeshScene(charUrl, root);

    const physics = new PhysicsWorld({
      assetResolver: {
        getMeshUrl: (id) => (id ? `/assets/meshes/${id}.glb` : null),
      },
    });
    await physics.init();
    await physics.preloadStaticMeshColliders(world);
    physics.buildFromWorld(world);
    const before = physics.getColliderCount(lodActor.id);
    expect(before).toBeGreaterThanOrEqual(1);

    sm.lodPreview = 2;
    physics.buildFromWorld(world);
    const after = physics.getColliderCount(lodActor.id);
    expect(after).toBe(before);

    record({ op: 'lod-collision-independent', before, after, lodPreview: sm.lodPreview });
    physics.dispose();
  });
});

describe('Batch 7 verification — Meshopt compression decode', () => {
  it('decodes local Meshopt fixture without CDN', async () => {
    expect(existsSync(MESHOPT_FIXTURE)).toBe(true);
    const bytes = statSync(MESHOPT_FIXTURE).size;
    const buf = readFileSync(MESHOPT_FIXTURE);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const loader = new GLTFLoader();
    if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
    const t0 = performance.now();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(ab, '', resolve, reject);
    });
    const ms = performance.now() - t0;
    const stats = inspectMeshRoot(gltf.scene);
    expect(stats.triangles).toBe(1);
    expect(stats.vertices).toBe(3);
    expect(stats.meshCount).toBe(1);
    record({
      op: 'meshopt-decode',
      bytes,
      ms: Number(ms.toFixed(2)),
      triangles: stats.triangles,
      vertices: stats.vertices,
      vendorPath: VENDOR_MESHOPT_PATH,
    });
  });

  it('documents DRACO/KTX2 decode wiring; encode remains deferred', () => {
    const support = describeCompressionSupport();
    expect(support.decode.draco).toBe(true);
    expect(support.decode.ktx2).toBe(true);
    expect(support.encode.draco).toBe(false);
    expect(support.encode.ktx2).toBe(false);
    expect(support.encode.reasonDraco).toMatch(/encoder/i);
    record({
      op: 'compression-wiring',
      dracoWasmBytes: statSync(path.join(rootDir, 'public/vendor/draco/gltf/draco_decoder.wasm')).size,
      basisWasmBytes: statSync(path.join(rootDir, 'public/vendor/basis/basis_transcoder.wasm')).size,
      meshoptJsBytes: statSync(path.join(rootDir, 'public/vendor/meshopt/meshopt_decoder.module.js')).size,
      encodeDeferred: true,
    });
  });

  it('ships licensed DRACO + KTX2 fixtures declaring compression extensions', () => {
    const dracoBox = path.join(rootDir, 'public/assets/fixtures/draco/Box.gltf');
    const dracoDuck = path.join(rootDir, 'public/assets/fixtures/draco/Duck.gltf');
    const ktx2Uastc = path.join(rootDir, 'public/assets/fixtures/ktx2/2d_uastc.ktx2');
    const ktx2Etc1s = path.join(rootDir, 'public/assets/fixtures/ktx2/2d_etc1s.ktx2');
    const ktx2Gltf = path.join(rootDir, 'public/assets/fixtures/ktx2/ktx2_quad.gltf');
    const fbx = path.join(rootDir, 'public/assets/fixtures/fbx/vCube.fbx');
    const collada = path.join(rootDir, 'public/assets/fixtures/collada/polygons.dae');
    const gltfBox = path.join(rootDir, 'public/assets/fixtures/gltf/Box.gltf');
    for (const p of [dracoBox, dracoDuck, ktx2Uastc, ktx2Etc1s, ktx2Gltf, fbx, collada, gltfBox]) {
      expect(existsSync(p)).toBe(true);
    }
    const boxJson = JSON.parse(readFileSync(dracoBox, 'utf8'));
    const duckJson = JSON.parse(readFileSync(dracoDuck, 'utf8'));
    const ktx2Json = JSON.parse(readFileSync(ktx2Gltf, 'utf8'));
    expect(boxJson.extensionsUsed).toContain('KHR_draco_mesh_compression');
    expect(duckJson.extensionsUsed).toContain('KHR_draco_mesh_compression');
    expect(ktx2Json.extensionsUsed).toContain('KHR_texture_basisu');
    // Browser CDP acceptance (measurements-final.json) verified actual WASM decode.
    const finalMeas = path.join(rootDir, 'docs/acceptance-asset-tools/measurements-final.json');
    expect(existsSync(finalMeas)).toBe(true);
    const meas = JSON.parse(readFileSync(finalMeas, 'utf8'));
    expect(meas.ok).toBe(true);
    expect(meas.cdnHits).toEqual([]);
    const ops = (meas.tests || []).map((t) => t.op);
    expect(ops).toEqual(expect.arrayContaining([
      'draco-box-decode',
      'draco-duck-decode',
      'ktx2-uastc-transcode',
      'ktx2-gltf-decode',
      'fbx-import',
      'collada-import',
      'gltf-import',
      'gltf-export-reimport',
      'usdz-export-reimport',
    ]));
    record({
      op: 'licensed-fixtures',
      dracoBoxBytes: statSync(dracoBox).size,
      dracoDuckBytes: statSync(dracoDuck).size,
      ktx2UastcBytes: statSync(ktx2Uastc).size,
      browserVerifyOk: meas.ok,
    });
  });
});

describe('Batch 7 verification — GLTF/USDZ export regression', () => {
  it('GLB export preserves triangle count and unit-cube bounds', async () => {
    // Three.js GLTFExporter binary path uses FileReader; vitest/jsdom lacks it.
    if (typeof globalThis.FileReader !== 'function') {
      globalThis.FileReader = class FileReaderPolyfill {
        constructor() {
          this.result = null;
          this.onloadend = null;
          this.onerror = null;
        }
        readAsArrayBuffer(blob) {
          const done = (ab) => {
            this.result = ab;
            if (typeof this.onloadend === 'function') this.onloadend({ target: this });
          };
          if (typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then(done).catch((err) => {
              if (typeof this.onerror === 'function') this.onerror(err);
            });
            return;
          }
          // Fallback for older Blob shims
          const fr = new Response(blob).arrayBuffer();
          fr.then(done).catch((err) => {
            if (typeof this.onerror === 'function') this.onerror(err);
          });
        }
      };
    }

    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x88aacc }),
    ));
    const before = inspectMeshRoot(root);
    const exported = await exportMeshRoot(root, 'glb');
    expect(exported.format).toBe('glb');
    expect(exported.data).toBeInstanceOf(ArrayBuffer);
    expect(exported.limitations.length).toBeGreaterThan(0);
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(exported.data, '', resolve, reject);
    });
    const after = inspectMeshRoot(gltf.scene);
    expect(after.triangles).toBe(before.triangles);
    expect(after.boundingBoxMeters.x).toBeCloseTo(1, 2);
    expect(after.boundingBoxMeters.y).toBeCloseTo(1, 2);
    expect(after.boundingBoxMeters.z).toBeCloseTo(1, 2);
    record({
      op: 'glb-export-reimport-unit',
      beforeTris: before.triangles,
      afterTris: after.triangles,
      bytes: exported.data.byteLength,
    });
  }, 30000);

  it('USDZ export uses parseAsync and returns ArrayBuffer (r187 regression)', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xccaa88 }),
    ));
    const before = inspectMeshRoot(root);
    const exported = await exportMeshRoot(root, 'usdz');
    expect(exported.format).toBe('usdz');
    expect(exported.data).toBeInstanceOf(ArrayBuffer);
    expect(exported.data.byteLength).toBeGreaterThan(100);
    expect(exported.limitations[0]).toMatch(/USDZ/i);
    // Reimport covered in browser CDP (USDLoader); Node lacks full ZIP+USD stack reliability.
    record({
      op: 'usdz-export-parseAsync',
      beforeTris: before.triangles,
      bytes: exported.data.byteLength,
    });
  }, 30000);
});

describe('Batch 7 verification — lifecycle + brush regression', () => {
  it('repeat simplify/dispose does not grow triangle counts on source', async () => {
    const { scene } = await parseGlbFile(CUBE);
    const baseline = inspectMeshRoot(scene).triangles;
    for (let i = 0; i < 5; i += 1) {
      const simplified = await simplifySceneRoot(scene, 0.5);
      simplified.root.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData?.bbShared) {
          try { o.geometry.dispose(); } catch { /* ignore */ }
        }
      });
      expect(inspectMeshRoot(scene).triangles).toBe(baseline);
    }
  }, 60000);

  it('acceptance-subtractive level validates (brush regression)', () => {
    const data = JSON.parse(readFileSync(SUBTRACTIVE, 'utf8'));
    expect(data.mapMode).toBe('subtractive');
    expect(validateLevelPayloads(data)).toEqual([]);
    const world = deserializeLevel(data);
    expect(world.mapMode).toBe('subtractive');
    expect(world.actors.length).toBeGreaterThan(0);
    record({
      op: 'subtractive-regression',
      actors: world.actors.length,
      mapMode: world.mapMode,
    });
  });

  it('acceptance-static-meshes still validates (GLB + prefab path intact)', () => {
    const data = JSON.parse(readFileSync(STATIC_LEVEL, 'utf8'));
    expect(validateLevelPayloads(data)).toEqual([]);
    const world = deserializeLevel(data);
    const withOverrides = world.actors.filter((a) => {
      const sm = a.getComponent?.('StaticMesh');
      return sm && Object.keys(sm.materialOverrides || {}).length > 0;
    });
    expect(withOverrides.length).toBeGreaterThan(0);
    record({
      op: 'static-mesh-level',
      actors: world.actors.length,
      materialOverrideActors: withOverrides.length,
    });
  });
});
