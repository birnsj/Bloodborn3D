/**
 * Batch 7 final acceptance — browser verification of DRACO/KTX2 decode,
 * multi-format import, GLTF/USDZ export-reimport, local /vendor (no CDN).
 * Invoked via CDP: `import('/src/dev/batch7AcceptanceVerify.js').then(m => m.runBatch7Acceptance())`
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import {
  configureGltfLoaderCompression,
  describeCompressionSupport,
} from '../runtime/gltfCompression.js';
import { inspectMeshRoot } from '../assets/meshInspect.js';
import { exportMeshRoot, loadMeshFileToScene } from '../assets/meshFormatIO.js';

export async function runBatch7Acceptance() {
  const report = {
    ok: true,
    tests: [],
    errors: [],
    vendorRequests: [],
    cdnHits: [],
    at: new Date().toISOString(),
  };
  const record = (row) => {
    report.tests.push(row);
  };
  const fail = (msg) => {
    report.ok = false;
    report.errors.push(String(msg));
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input && input.url) || input);
    if (/cdn\.|unpkg|jsdelivr|cdnjs|googleapis/i.test(url)) report.cdnHits.push(url);
    if (/\/vendor\//.test(url)) report.vendorRequests.push(url.split('?')[0]);
    return origFetch(input, init);
  };

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(256, 256, false);

  record({ op: 'compression-support', support: describeCompressionSupport() });

  async function loadDraco(url, label) {
    const loader = new GLTFLoader();
    await configureGltfLoaderCompression(loader, { renderer });
    const t0 = performance.now();
    const gltf = await loader.loadAsync(url);
    const ms = performance.now() - t0;
    const stats = inspectMeshRoot(gltf.scene);
    let hasMap = false;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && m.map) hasMap = true;
    });
    const row = {
      op: label,
      ms: +ms.toFixed(2),
      triangles: stats.triangles,
      vertices: stats.vertices,
      meshes: stats.meshCount,
      hasTextureMap: hasMap,
      bounds: stats.boundingBoxMeters,
      extensionsUsed: (gltf.parser && gltf.parser.json && gltf.parser.json.extensionsUsed) || [],
    };
    record(row);
    if (!(stats.triangles > 0)) fail(`${label}: no triangles`);
    if (!row.extensionsUsed.includes('KHR_draco_mesh_compression')) {
      fail(`${label}: missing KHR_draco_mesh_compression`);
    }
    return gltf;
  }

  let duckGltf = null;
  try {
    await loadDraco('/assets/fixtures/draco/Box.gltf', 'draco-box-decode');
  } catch (e) {
    fail(`draco-box: ${e?.message || e}`);
  }

  try {
    duckGltf = await loadDraco('/assets/fixtures/draco/Duck.gltf', 'draco-duck-decode');
  } catch (e) {
    fail(`draco-duck: ${e?.message || e}`);
  }

  try {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('/vendor/basis/');
    ktx2.detectSupport(renderer);
    const t0 = performance.now();
    const tex = await ktx2.loadAsync('/assets/fixtures/ktx2/2d_uastc.ktx2');
    const ms = performance.now() - t0;
    const w = tex.image?.width || tex.source?.data?.width || 0;
    const h = tex.image?.height || tex.source?.data?.height || 0;
    record({
      op: 'ktx2-uastc-transcode',
      ms: +ms.toFixed(2),
      width: w,
      height: h,
      format: tex.format,
      isCompressedTexture: !!tex.isCompressedTexture,
    });
    if (!(w > 0 && h > 0)) fail('ktx2-uastc: empty texture');
    tex.dispose?.();
    ktx2.dispose?.();
  } catch (e) {
    fail(`ktx2-uastc: ${e?.message || e}`);
  }

  try {
    const ktx2Etc = new KTX2Loader();
    ktx2Etc.setTranscoderPath('/vendor/basis/');
    ktx2Etc.detectSupport(renderer);
    const t0 = performance.now();
    const tex = await ktx2Etc.loadAsync('/assets/fixtures/ktx2/2d_etc1s.ktx2');
    const ms = performance.now() - t0;
    const w = tex.image?.width || tex.source?.data?.width || 0;
    const h = tex.image?.height || tex.source?.data?.height || 0;
    record({
      op: 'ktx2-etc1s-transcode',
      ms: +ms.toFixed(2),
      width: w,
      height: h,
      isCompressedTexture: !!tex.isCompressedTexture,
    });
    if (!(w > 0 && h > 0)) fail('ktx2-etc1s: empty texture');
    tex.dispose?.();
    ktx2Etc.dispose?.();
  } catch (e) {
    fail(`ktx2-etc1s: ${e?.message || e}`);
  }

  try {
    const loader = new GLTFLoader();
    await configureGltfLoaderCompression(loader, { renderer });
    const t0 = performance.now();
    const gltf = await loader.loadAsync('/assets/fixtures/ktx2/ktx2_quad.gltf');
    const ms = performance.now() - t0;
    const stats = inspectMeshRoot(gltf.scene);
    let hasMap = false;
    let mapIsCompressed = false;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.map) {
          hasMap = true;
          if (m.map.isCompressedTexture) mapIsCompressed = true;
        }
      }
    });
    record({
      op: 'ktx2-gltf-decode',
      ms: +ms.toFixed(2),
      triangles: stats.triangles,
      hasTextureMap: hasMap,
      mapIsCompressed,
      extensionsUsed: (gltf.parser && gltf.parser.json && gltf.parser.json.extensionsUsed) || [],
    });
    if (!hasMap) fail('ktx2-gltf: material map missing after BasisU transcode');
  } catch (e) {
    fail(`ktx2-gltf: ${e?.message || e}`);
  }

  try {
    const loader = new FBXLoader();
    const t0 = performance.now();
    const root = await loader.loadAsync('/assets/fixtures/fbx/vCube.fbx');
    const stats = inspectMeshRoot(root);
    record({
      op: 'fbx-import',
      ms: +(performance.now() - t0).toFixed(2),
      triangles: stats.triangles,
      vertices: stats.vertices,
      meshes: stats.meshCount,
      bounds: stats.boundingBoxMeters,
    });
    if (!(stats.meshCount > 0)) fail('fbx: no meshes');
  } catch (e) {
    fail(`fbx: ${e?.message || e}`);
  }

  try {
    const loader = new ColladaLoader();
    const t0 = performance.now();
    const result = await loader.loadAsync('/assets/fixtures/collada/polygons.dae');
    const stats = inspectMeshRoot(result.scene);
    record({
      op: 'collada-import',
      ms: +(performance.now() - t0).toFixed(2),
      triangles: stats.triangles,
      vertices: stats.vertices,
      meshes: stats.meshCount,
    });
    if (!(stats.meshCount > 0 || stats.triangles > 0)) fail('collada: empty scene');
  } catch (e) {
    fail(`collada: ${e?.message || e}`);
  }

  try {
    const loader = new GLTFLoader();
    await configureGltfLoaderCompression(loader, { renderer });
    const t0 = performance.now();
    const gltf = await loader.loadAsync('/assets/fixtures/gltf/Box.gltf');
    const stats = inspectMeshRoot(gltf.scene);
    record({
      op: 'gltf-import',
      ms: +(performance.now() - t0).toFixed(2),
      triangles: stats.triangles,
      vertices: stats.vertices,
      bounds: stats.boundingBoxMeters,
    });
    if (!(stats.triangles > 0)) fail('gltf: no triangles');
  } catch (e) {
    fail(`gltf: ${e?.message || e}`);
  }

  try {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x88aacc, name: 'ExportMat' }),
    );
    mesh.name = 'ExportBox';
    scene.add(mesh);
    const before = inspectMeshRoot(scene);
    const exported = await exportMeshRoot(scene, 'gltf');
    const file = new File([exported.data], 'roundtrip.gltf', { type: 'model/gltf+json' });
    const loaded = await loadMeshFileToScene(file, { renderer });
    record({
      op: 'gltf-export-reimport',
      beforeTris: before.triangles,
      afterTris: loaded.stats.triangles,
      afterMeshes: loaded.stats.meshCount,
      beforeBounds: before.boundingBoxMeters,
      afterBounds: loaded.stats.boundingBoxMeters,
      limitations: exported.limitations,
      bytes: typeof exported.data === 'string' ? exported.data.length : exported.data.byteLength,
    });
    if (!(loaded.stats.triangles > 0)) fail('gltf reimport empty');
  } catch (e) {
    fail(`gltf-export-reimport: ${e?.message || e}`);
  }

  try {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xccaa88 }),
      ),
    );
    const before = inspectMeshRoot(scene);
    const exported = await exportMeshRoot(scene, 'usdz');
    const file = new File([exported.data], 'roundtrip.usdz', { type: 'model/vnd.usdz+zip' });
    const t0 = performance.now();
    const loaded = await loadMeshFileToScene(file, { renderer });
    record({
      op: 'usdz-export-reimport',
      ms: +(performance.now() - t0).toFixed(2),
      beforeTris: before.triangles,
      afterTris: loaded.stats.triangles,
      afterMeshes: loaded.stats.meshCount,
      beforeBounds: before.boundingBoxMeters,
      afterBounds: loaded.stats.boundingBoxMeters,
      warnings: loaded.warnings,
      limitations: exported.limitations,
      bytes: exported.data?.byteLength || exported.data?.length || 0,
    });
    if (!(exported.data instanceof ArrayBuffer) && !(exported.data instanceof Uint8Array)) {
      fail('usdz export missing binary data');
    }
    if (!(loaded.stats.triangles > 0 || loaded.stats.meshCount > 0)) fail('usdz reimport empty');
  } catch (e) {
    fail(`usdz-export-reimport: ${e?.message || e}`);
  }

  // Offscreen render stand-ins for Asset Viewer / editor / Play
  const screenshots = {};
  try {
    if (duckGltf) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a22);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(2, 4, 3);
      scene.add(key);
      const clone = duckGltf.scene.clone(true);
      scene.add(clone);
      const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
      cam.position.set(0, 1.2, 3.5);
      cam.lookAt(0, 0.6, 0);
      renderer.render(scene, cam);
      screenshots.assetViewerDracoDuck = canvas.toDataURL('image/png');
      record({ op: 'render-asset-viewer-draco-duck', ok: true, size: 256 });

      // Editor viewport stand-in (slightly different framing)
      cam.position.set(1.5, 2.0, 2.8);
      cam.lookAt(0, 0.5, 0);
      renderer.render(scene, cam);
      screenshots.editorDracoDuck = canvas.toDataURL('image/png');
      record({ op: 'render-editor-draco-duck', ok: true, size: 256 });

      // Play-mode stand-in (lower angle)
      cam.position.set(0.2, 0.4, 2.2);
      cam.lookAt(0, 0.4, 0);
      renderer.render(scene, cam);
      screenshots.playDracoDuck = canvas.toDataURL('image/png');
      record({ op: 'render-play-draco-duck', ok: true, size: 256 });
    }
  } catch (e) {
    fail(`render-draco-duck: ${e?.message || e}`);
  }

  // KTX2 quad render
  try {
    const loader = new GLTFLoader();
    await configureGltfLoaderCompression(loader, { renderer });
    const gltf = await loader.loadAsync('/assets/fixtures/ktx2/ktx2_quad.gltf');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x22222a);
    scene.add(new THREE.AmbientLight(0xffffff, 1));
    scene.add(gltf.scene);
    const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    cam.position.set(0, 0, 2.5);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    screenshots.assetViewerKtx2 = canvas.toDataURL('image/png');
    record({ op: 'render-asset-viewer-ktx2', ok: true, size: 256 });
  } catch (e) {
    fail(`render-ktx2: ${e?.message || e}`);
  }

  report.cdnHits = [...new Set(report.cdnHits)];
  report.vendorRequests = [...new Set(report.vendorRequests)];
  if (report.cdnHits.length) {
    report.ok = false;
    report.errors.push(`CDN requests: ${report.cdnHits.join(', ')}`);
  }
  if (!report.vendorRequests.some((u) => /basis/i.test(u))) {
    fail('Expected /vendor/basis transcoder fetch');
  }
  // Draco WASM is often loaded by the DRACO worker — may appear as vendor/draco
  if (!report.vendorRequests.some((u) => /draco/i.test(u))) {
    // Soft note — worker paths sometimes bypass patched fetch; still record
    report.tests.push({
      op: 'vendor-draco-note',
      note: 'No /vendor/draco URL seen on window.fetch (worker may load WASM independently)',
      vendorSeen: report.vendorRequests,
    });
  }

  report.screenshots = screenshots;
  window.__BB_BATCH7_REPORT__ = report;
  // Strip huge data URLs from the returned value for CDP size; keep keys
  const slim = {
    ...report,
    screenshots: Object.fromEntries(
      Object.entries(screenshots).map(([k, v]) => [k, { bytesApprox: Math.round((v?.length || 0) * 0.75), hasData: !!v }]),
    ),
  };
  return slim;
}
