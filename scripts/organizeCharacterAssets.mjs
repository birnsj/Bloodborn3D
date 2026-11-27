/**
 * One-shot: move CHARACTER DESIGNS Meshy stills into Content Browser
 * Characters/Models, and extract embedded GLB images into Characters/Textures/<name>.
 *
 * Usage: node scripts/organizeCharacterAssets.mjs
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'public/assets/registry.json');
const MESH_DIR = path.join(ROOT, 'public/assets/meshes');
const TEX_DIR = path.join(ROOT, 'public/assets/textures');

const CHARACTER_MESH_IDS = new Set([
  'mesh_c34066cb0284', // Principal Buggelsby
  'mesh_169ce4c7d120', // P-test (same task)
  'mesh_34f557c0b8ee', // Beauty Pageant Queen
  'mesh_b18711df23cd', // Plague Doctor
]);

function sanitizeSegment(name) {
  return String(name || 'Character')
    .replace(/\.jpe?g$/i, '')
    .replace(/\.png$/i, '')
    .replace(/\.glb$/i, '')
    .trim()
    .replace(/[^\w .+-]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 48)
    .trim() || 'Character';
}

function parseGlb(buf) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB');
  }
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLen).toString('utf8'));
  let offset = jsonStart + jsonLen;
  // Pad to 4-byte alignment if needed (chunk header follows JSON chunk).
  while (offset % 4 !== 0) offset += 1;
  if (offset + 8 > buf.length) return { json, bin: Buffer.alloc(0) };
  const binLen = buf.readUInt32LE(offset);
  const bin = buf.subarray(offset + 8, offset + 8 + binLen);
  return { json, bin };
}

function extForImageBytes(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return '.png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg';
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'RIFF') return '.webp';
  return '.bin';
}

function extractImagesFromGlb(buf) {
  const { json, bin } = parseGlb(buf);
  const images = Array.isArray(json.images) ? json.images : [];
  const views = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  const out = [];
  images.forEach((img, index) => {
    if (img.uri && String(img.uri).startsWith('data:')) {
      const m = String(img.uri).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;
      const bytes = Buffer.from(m[2], 'base64');
      out.push({
        index,
        name: img.name || `image_${index}`,
        bytes,
        ext: extForImageBytes(bytes),
      });
      return;
    }
    if (img.bufferView == null) return;
    const view = views[img.bufferView];
    if (!view) return;
    const start = (view.byteOffset || 0);
    const end = start + (view.byteLength || 0);
    const bytes = Buffer.from(bin.subarray(start, end));
    out.push({
      index,
      name: img.name || `image_${index}`,
      bytes,
      ext: extForImageBytes(bytes),
    });
  });
  return out;
}

async function main() {
  const raw = await fs.readFile(REGISTRY, 'utf8');
  const registry = JSON.parse(raw);
  registry.folders = Array.isArray(registry.folders) ? registry.folders : [];
  registry.folderMeta = registry.folderMeta && typeof registry.folderMeta === 'object'
    ? registry.folderMeta
    : {};
  registry.assets = Array.isArray(registry.assets) ? registry.assets : [];

  const ensureFolder = (folderPath) => {
    if (!registry.folders.includes(folderPath)) {
      registry.folders.push(folderPath);
    }
  };

  ensureFolder('Characters');
  ensureFolder('Characters/Models');
  ensureFolder('Characters/Textures');
  registry.folderMeta.Characters = { kind: 'category' };

  const moved = [];
  const texturesCreated = [];

  for (const asset of registry.assets) {
    if (!CHARACTER_MESH_IDS.has(asset.id) || asset.kind !== 'mesh') continue;

    const modelFolder = 'Characters/Models';
    asset.folder = modelFolder;
    asset.tags = Array.from(new Set([...(asset.tags || []), 'character', 'meshy', 'ai-generated']));
    asset.updatedAt = Date.now();
    moved.push({ id: asset.id, name: asset.name, folder: modelFolder });

    const meshAbs = path.join(MESH_DIR, path.basename(asset.path || ''));
    let glb;
    try {
      glb = await fs.readFile(meshAbs);
    } catch {
      console.warn(`Missing mesh file for ${asset.id}: ${meshAbs}`);
      continue;
    }

    let images = [];
    try {
      images = extractImagesFromGlb(glb);
    } catch (err) {
      console.warn(`Could not extract images from ${asset.id}: ${err.message}`);
      continue;
    }

    const texFolder = `Characters/Textures/${sanitizeSegment(asset.name)}`;
    ensureFolder(texFolder);

    for (const image of images) {
      const id = `tex_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const fileName = `${id}${image.ext}`;
      const relPath = `textures/${fileName}`;
      const abs = path.join(TEX_DIR, fileName);
      await fs.mkdir(TEX_DIR, { recursive: true });
      await fs.writeFile(abs, image.bytes);

      const originalsDir = path.join(TEX_DIR, 'originals');
      await fs.mkdir(originalsDir, { recursive: true });
      await fs.copyFile(abs, path.join(originalsDir, fileName));

      const label = `${sanitizeSegment(asset.name)} ${image.name || `Map ${image.index + 1}`}`;
      const entry = {
        id,
        kind: 'texture',
        name: label,
        folder: texFolder,
        path: relPath,
        originalName: `${image.name || `image_${image.index}`}${image.ext}`,
        tags: ['character', 'meshy', 'extracted', 'ai-generated', `from:${asset.id}`],
        meta: {
          format: image.ext.replace('.', ''),
          bytes: image.bytes.length,
          sourceMeshId: asset.id,
          extractedFromGlb: true,
          imageIndex: image.index,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      registry.assets.push(entry);
      texturesCreated.push({ id, name: label, folder: texFolder, bytes: image.bytes.length });
    }
  }

  await fs.writeFile(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

  console.log('Moved meshes:');
  for (const m of moved) console.log(`  ${m.id} → ${m.folder} (${m.name})`);
  console.log(`Extracted textures: ${texturesCreated.length}`);
  for (const t of texturesCreated) console.log(`  ${t.id} → ${t.folder} (${t.name}, ${t.bytes} B)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
