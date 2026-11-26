/**
 * Batch 7 — multi-format mesh import/export using official Three.js addons.
 * Foreign formats are normalized to GLB for the production asset pipeline.
 * Source files are preserved separately when the caller stores them.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { USDZLoader } from 'three/addons/loaders/USDZLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { configureGltfLoaderCompression } from '../runtime/gltfCompression.js';
import { inspectMeshRoot } from './meshInspect.js';

export const MESH_IMPORT_EXTENSIONS = Object.freeze([
  '.glb', '.gltf',
  '.fbx',
  '.obj',
  '.stl',
  '.ply',
  '.dae',
  '.usdz',
]);

export const MESH_EXPORT_FORMATS = Object.freeze([
  'glb', 'gltf', 'obj', 'stl', 'ply', 'usdz',
]);

const EXT_FORMAT = {
  '.glb': 'glb',
  '.gltf': 'gltf',
  '.fbx': 'fbx',
  '.obj': 'obj',
  '.stl': 'stl',
  '.ply': 'ply',
  '.dae': 'collada',
  '.usdz': 'usdz',
};

export function extensionOf(name = '') {
  const m = String(name).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isSupportedMeshImportName(name) {
  return MESH_IMPORT_EXTENSIONS.includes(extensionOf(name));
}

export function formatFromFileName(name) {
  return EXT_FORMAT[extensionOf(name)] || null;
}

function defaultMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xb0b8c0, metalness: 0.1, roughness: 0.7 });
}

function wrapGeometryAsScene(geometry, name = 'Mesh') {
  const root = new THREE.Group();
  root.name = name;
  const mesh = new THREE.Mesh(geometry, defaultMaterial());
  mesh.name = name;
  root.add(mesh);
  return root;
}

/**
 * Load a File/Blob into a Three.js Object3D root + diagnostics.
 * @returns {Promise<{ root: THREE.Object3D, format: string, warnings: string[], stats: object, animations: object[] }>}
 */
export async function loadMeshFileToScene(file, { renderer = null } = {}) {
  if (!file) throw new Error('No file');
  const format = formatFromFileName(file.name);
  if (!format) throw new Error(`Unsupported mesh format: ${file.name}`);

  const warnings = [];
  const url = URL.createObjectURL(file);
  try {
    let root = null;
    let animations = [];

    if (format === 'glb' || format === 'gltf') {
      const loader = new GLTFLoader();
      await configureGltfLoaderCompression(loader, { renderer });
      const gltf = await loader.loadAsync(url);
      root = gltf.scene || gltf.scenes?.[0];
      animations = gltf.animations || [];
      if (gltf.userData) {
        // Surface unknown extensions when present
      }
    } else if (format === 'fbx') {
      const loader = new FBXLoader();
      root = await loader.loadAsync(url);
      warnings.push('FBX: animations, blend shapes, and some material channels may not map 1:1 to BloodBound materials.');
    } else if (format === 'obj') {
      const loader = new OBJLoader();
      // Sidecar MTL is not auto-fetched from a lone File drop — report clearly.
      warnings.push('OBJ: accompanying MTL/textures are not auto-linked from a single-file drop; materials may be placeholders.');
      root = await loader.loadAsync(url);
    } else if (format === 'stl') {
      const loader = new STLLoader();
      const geometry = await loader.loadAsync(url);
      geometry.computeVertexNormals();
      root = wrapGeometryAsScene(geometry, file.name.replace(/\.[^.]+$/, '') || 'STL');
      warnings.push('STL: no materials or UVs in format; a default standard material is assigned.');
    } else if (format === 'ply') {
      const loader = new PLYLoader();
      const geometry = await loader.loadAsync(url);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      root = wrapGeometryAsScene(geometry, file.name.replace(/\.[^.]+$/, '') || 'PLY');
      warnings.push('PLY: material slots are limited; vertex colors (if any) are preserved on geometry attributes.');
    } else if (format === 'collada') {
      const loader = new ColladaLoader();
      const result = await loader.loadAsync(url);
      root = result.scene;
      animations = result.animations || [];
      warnings.push('Collada: some lights/cameras/controllers are ignored; meshes and basic materials are kept.');
    } else if (format === 'usdz') {
      const loader = new USDZLoader();
      root = await loader.loadAsync(url);
      warnings.push('USDZ: support follows Three.js USDZLoader limits (static mesh / material subset).');
    }

    if (!root) throw new Error(`Failed to parse ${format.toUpperCase()} file`);
    const stats = inspectMeshRoot(root);
    return { root, format, warnings, stats, animations };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export a scene root to an ArrayBuffer / string for download or upload.
 */
export async function exportMeshRoot(root, format = 'glb', {
  binary = true,
  trs = false,
  onlyVisible = true,
} = {}) {
  if (!root) throw new Error('Nothing to export');
  const fmt = String(format || 'glb').toLowerCase();

  if (fmt === 'glb' || fmt === 'gltf') {
    const exporter = new GLTFExporter();
    const options = {
      binary: fmt === 'glb' || binary,
      onlyVisible,
      trs,
      embedImages: true,
    };
    const result = await exporter.parseAsync(root, options);
    if (result instanceof ArrayBuffer) {
      return {
        format: 'glb',
        mime: 'model/gltf-binary',
        extension: '.glb',
        data: result,
        limitations: ['Animations optional; Draco/Meshopt compression not applied on export (encode deferred).'],
      };
    }
    const json = typeof result === 'string' ? result : JSON.stringify(result);
    return {
      format: 'gltf',
      mime: 'model/gltf+json',
      extension: '.gltf',
      data: json,
      limitations: ['External buffer/image URIs may be embedded; compression encode deferred.'],
    };
  }

  if (fmt === 'obj') {
    const exporter = new OBJExporter();
    const text = exporter.parse(root);
    return {
      format: 'obj',
      mime: 'text/plain',
      extension: '.obj',
      data: text,
      limitations: ['Materials exported as basic OBJ/MTL references may be incomplete; no binary textures.'],
    };
  }

  if (fmt === 'stl') {
    const exporter = new STLExporter();
    const data = exporter.parse(root, { binary: true });
    return {
      format: 'stl',
      mime: 'application/octet-stream',
      extension: '.stl',
      data,
      limitations: ['STL drops materials, UVs, and hierarchy (single triangulated shell).'],
    };
  }

  if (fmt === 'ply') {
    const exporter = new PLYExporter();
    const data = await new Promise((resolve, reject) => {
      exporter.parse(root, (result) => resolve(result), { binary: false }, reject);
    });
    return {
      format: 'ply',
      mime: 'text/plain',
      extension: '.ply',
      data,
      limitations: ['PLY export focuses on geometry; material slots are not preserved.'],
    };
  }

  if (fmt === 'usdz') {
    const exporter = new USDZExporter();
    const data = await exporter.parse(root);
    return {
      format: 'usdz',
      mime: 'model/vnd.usdz+zip',
      extension: '.usdz',
      data,
      limitations: ['USDZExporter subset of materials/textures; verify on target viewers.'],
    };
  }

  throw new Error(`Unsupported export format: ${format}`);
}

/**
 * Convert an imported File to a production GLB ArrayBuffer (non-destructive to source).
 */
export async function convertMeshFileToGlb(file, options = {}) {
  const loaded = await loadMeshFileToScene(file, options);
  const exported = await exportMeshRoot(loaded.root, 'glb');
  return {
    ...loaded,
    glb: exported.data,
    exportLimitations: exported.limitations,
  };
}

/** Trigger a browser download for export results. */
export function downloadExportedMesh(exported, fileName = 'export') {
  if (!exported?.data) return;
  const blob = exported.data instanceof ArrayBuffer || exported.data instanceof Uint8Array
    ? new Blob([exported.data], { type: exported.mime })
    : new Blob([exported.data], { type: exported.mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}${exported.extension || ''}`;
  a.click();
  URL.revokeObjectURL(url);
}
