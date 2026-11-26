/**
 * Batch 7 — local GLTF compression decoder wiring (DRACO / Meshopt / KTX2).
 * Decoders are served from /vendor/* (copied from three/examples/jsm/libs).
 * No CDN. Compression *authoring* (encode) is deferred — no Draco/Basis/meshopt encoders are shipped.
 */
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Runtime WASM paths under public/ (bundled locally — no CDN). */
export const VENDOR_DRACO_PATH = '/vendor/draco/gltf/';
export const VENDOR_BASIS_PATH = '/vendor/basis/';
export const VENDOR_MESHOPT_PATH = '/vendor/meshopt/meshopt_decoder.module.js';

let dracoLoader = null;
let ktx2Loader = null;
let ktx2ConfiguredForRenderer = false;
let meshoptReady = false;

export function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(VENDOR_DRACO_PATH);
  }
  return dracoLoader;
}

/**
 * @param {import('three').WebGLRenderer} [renderer]
 */
export function getKtx2Loader(renderer = null) {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(VENDOR_BASIS_PATH);
  }
  if (renderer && !ktx2ConfiguredForRenderer) {
    try {
      ktx2Loader.detectSupport(renderer);
      ktx2ConfiguredForRenderer = true;
    } catch {
      // Headless / test environments may lack WebGL extensions.
    }
  }
  return ktx2Loader;
}

export async function ensureMeshoptDecoder() {
  if (meshoptReady) return MeshoptDecoder;
  if (typeof MeshoptDecoder.ready?.then === 'function') {
    await MeshoptDecoder.ready;
  }
  meshoptReady = true;
  return MeshoptDecoder;
}

/**
 * Attach compression loaders to a GLTFLoader instance.
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTFLoader} loader
 * @param {{ renderer?: import('three').WebGLRenderer }} [options]
 */
export async function configureGltfLoaderCompression(loader, options = {}) {
  if (!loader) return loader;
  // Tests may inject stubs without compression hooks — skip gracefully.
  if (typeof loader.setDRACOLoader === 'function') {
    loader.setDRACOLoader(getDracoLoader());
  }
  try {
    if (typeof loader.setMeshoptDecoder === 'function') {
      const decoder = await ensureMeshoptDecoder();
      loader.setMeshoptDecoder(decoder);
    }
  } catch (err) {
    console.warn('[BloodBound] Meshopt decoder unavailable', err);
  }
  try {
    if (typeof loader.setKTX2Loader === 'function') {
      loader.setKTX2Loader(getKtx2Loader(options.renderer || null));
    }
  } catch (err) {
    console.warn('[BloodBound] KTX2 loader unavailable', err);
  }
  return loader;
}

export function describeCompressionSupport() {
  return {
    decode: {
      draco: true,
      meshopt: true,
      ktx2: true,
      paths: {
        draco: VENDOR_DRACO_PATH,
        basis: VENDOR_BASIS_PATH,
        meshopt: VENDOR_MESHOPT_PATH,
      },
    },
    encode: {
      draco: false,
      reasonDraco: 'No Draco encoder shipped with Three.js r187 or this repo.',
      meshopt: false,
      reasonMeshopt: 'meshoptimizer encoder is transitive only; not a declared dependency — authoring deferred.',
      ktx2: false,
      reasonKtx2: 'No Basis Universal encoder bundled locally.',
    },
  };
}

/** Dispose shared decoder loaders (tests / teardown). */
export function disposeGltfCompressionLoaders() {
  try { dracoLoader?.dispose?.(); } catch { /* ignore */ }
  try { ktx2Loader?.dispose?.(); } catch { /* ignore */ }
  dracoLoader = null;
  ktx2Loader = null;
  ktx2ConfiguredForRenderer = false;
  meshoptReady = false;
}
