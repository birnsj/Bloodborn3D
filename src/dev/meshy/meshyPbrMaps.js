/**
 * Node-only: inspect Meshy Image-to-3D PBR / texture maps from completed jobs
 * (staging meta + --all-assets downloads). No generation credits.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MESHY_MAP_SLOTS,
  classifyMeshyMapFileName,
  normalizeMeshyTextureUrls,
} from './meshyPbrMapTypes.js';

export {
  MESHY_MAP_SLOTS,
  classifyMeshyMapFileName,
  normalizeMeshyTextureUrls,
} from './meshyPbrMapTypes.js';

/**
 * Scan a downloaded task folder (+ meta.json) for available maps.
 * @param {string} taskDir absolute path
 */
export async function inspectMeshyTaskMaps(taskDir) {
  const result = {
    ok: true,
    taskDir,
    fromMeta: {},
    fromFiles: {},
    skipped: [],
    embeddedInGlb: false,
    maps: [],
  };

  const metaPath = path.join(taskDir, 'meta.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    const task = meta.task || meta;
    result.fromMeta = normalizeMeshyTextureUrls(task.texture_urls || meta.texture_urls);
    if (Array.isArray(meta.skipped)) {
      result.skipped = meta.skipped;
      result.embeddedInGlb = meta.skipped.some(
        (s) => String(s?.reason || '').includes('embedded'),
      );
    }
  } catch {
    // meta optional
  }

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const slot = classifyMeshyMapFileName(ent.name);
      if (!slot) continue;
      const st = await fs.stat(full).catch(() => null);
      result.fromFiles[slot] = {
        path: full,
        fileName: ent.name,
        bytes: st?.size ?? null,
      };
    }
  }
  await walk(taskDir);

  for (const slot of MESHY_MAP_SLOTS) {
    const file = result.fromFiles[slot.id] || null;
    const url = result.fromMeta[slot.id] || null;
    if (!file && !url) continue;
    result.maps.push({
      id: slot.id,
      label: slot.label,
      gltf: slot.gltf,
      localPath: file?.path || null,
      fileName: file?.fileName || null,
      bytes: file?.bytes ?? null,
      remoteUrl: url,
      source: file ? 'file' : 'url',
    });
  }

  return result;
}

/**
 * List maps for a staging models/<taskId> directory (and optional all-assets subfolder).
 * @param {string} stagingRoot
 * @param {string} taskId
 */
export async function listStagingMeshyMaps(stagingRoot, taskId) {
  const candidates = [
    path.join(stagingRoot, 'models', taskId, 'all-assets'),
    path.join(stagingRoot, 'models', taskId),
  ];
  let best = null;
  for (const dir of candidates) {
    try {
      await fs.access(dir);
    } catch {
      continue;
    }
    const inspected = await inspectMeshyTaskMaps(dir);
    if (!best || inspected.maps.length > best.maps.length) {
      best = inspected;
    }
  }
  if (!best) {
    return {
      ok: true,
      taskId,
      maps: [],
      embeddedInGlb: false,
      note: 'No downloaded task folder found — run Fetch PBR maps (free download of existing assets).',
    };
  }
  const rootResolved = path.resolve(stagingRoot);
  const maps = best.maps.map((m) => {
    let relativePath = null;
    if (m.localPath) {
      const abs = path.resolve(m.localPath);
      if (abs.startsWith(rootResolved)) {
        relativePath = path.relative(rootResolved, abs).replace(/\\/g, '/');
      }
    }
    return { ...m, relativePath };
  });
  return {
    ok: true,
    taskId,
    maps,
    embeddedInGlb: best.embeddedInGlb,
    skipped: best.skipped,
    taskDir: best.taskDir,
  };
}
