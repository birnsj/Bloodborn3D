/**
 * Generate a representative multi-UV GLB for Batch 8 UV-channel acceptance.
 * UV0 = standard unwrap; UV1 = rotated + scaled differently; UV2 = lightmap-style packed.
 * Does not implement product UV generation — this is a test fixture only.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// GLTFExporter expects browser FileReader for async blob reads.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer?.() ?? blob)
        .then((buf) => {
          this.result = buf;
          this.onloadend?.({ target: this });
        })
        .catch((err) => this.onerror?.(err));
    }
  };
}

function setUvAttr(geo, name, mapper) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const arr = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const [u, v] = mapper(x, y, z, i);
    arr[i * 2] = u;
    arr[i * 2 + 1] = v;
  }
  geo.setAttribute(name, new THREE.BufferAttribute(arr, 2));
}

const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
// UV0 — default box UVs already present as `uv`
setUvAttr(geo, 'uv1', (x, y) => {
  // Rotated / mirrored layout so channel switches are obvious with a striped albedo.
  const u = (y + 0.5) * 2.5;
  const v = (x + 0.5) * 0.5;
  return [u, v];
});
setUvAttr(geo, 'uv2', (x, y, z) => {
  // Compact lightmap-like quadrant packing by face sign.
  const face = Math.abs(x) > 0.49 ? 0 : Math.abs(y) > 0.49 ? 1 : 2;
  const u = ((x + z) * 0.25 + 0.5) * 0.45 + face * 0.33;
  const v = ((y + z) * 0.25 + 0.5) * 0.9;
  return [u, v];
});

const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, name: 'MultiUvMat' });
const mesh = new THREE.Mesh(geo, mat);
mesh.name = 'MultiUvCube';
const root = new THREE.Group();
root.name = 'MultiUvRoot';
root.add(mesh);

const exporter = new GLTFExporter();
const outDir = path.resolve('public/assets/meshes');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'mesh_batch8_multi_uv.glb');

const glb = await new Promise((resolve, reject) => {
  exporter.parse(
    root,
    (result) => resolve(result),
    (err) => reject(err),
    { binary: true },
  );
});

writeFileSync(outPath, Buffer.from(glb));
console.log('Wrote', outPath, 'bytes', glb.byteLength);
