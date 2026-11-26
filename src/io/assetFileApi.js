/**
 * Client for the development-only project asset API (/api/assets).
 */

export async function fetchAssetRegistry() {
  const res = await fetch('/api/assets?action=registry');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load asset registry: ${res.status}`);
  }
  return res.json();
}

export async function fetchMaterialDefinition(id) {
  const res = await fetch(`/api/assets?action=material&id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load material: ${res.status}`);
  }
  return res.json();
}

export async function importTextureFile(file, {
  name = null,
  tags = [],
} = {}) {
  const qs = new URLSearchParams({
    action: 'import-texture',
    name: file.name || 'import.png',
  });
  if (name) qs.set('assetName', name);
  if (tags?.length) qs.set('tags', tags.join(','));
  const res = await fetch(`/api/assets?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Texture import failed: ${res.status}`);
  }
  return res.json();
}

/** Overwrite an existing registered texture's bytes (keeps id/path). */
export async function replaceTextureFile(id, file) {
  const res = await fetch(
    `/api/assets?action=replace-texture&id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Texture replace failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Import a mesh into the registry.
 * @param {Blob|File} fileOrBlob production GLB/GLTF bytes (or legacy direct upload)
 * @param {{ fileName?: string, assetName?: string, tags?: string[], meta?: object }} [options]
 */
export async function importMeshFile(fileOrBlob, options = {}) {
  const fileName = options.fileName || fileOrBlob?.name || 'import.glb';
  const qs = new URLSearchParams({
    action: 'import-mesh',
    name: fileName,
  });
  if (options.assetName) qs.set('assetName', options.assetName);
  if (options.tags?.length) qs.set('tags', options.tags.join(','));
  if (options.meta && typeof options.meta === 'object') {
    qs.set('meta', JSON.stringify(options.meta));
  }
  const res = await fetch(`/api/assets?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fileOrBlob,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mesh import failed: ${res.status}`);
  }
  return res.json();
}

/** Store the pre-normalization source file alongside a mesh asset (non-destructive). */
export async function storeMeshSourceOriginal(assetId, file, { extension = null } = {}) {
  const ext = extension || (file?.name ? file.name.match(/(\.[^.]+)$/)?.[1] : null) || '.bin';
  const qs = new URLSearchParams({
    action: 'mesh-source',
    id: assetId,
    ext,
  });
  const res = await fetch(`/api/assets?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mesh source store failed: ${res.status}`);
  }
  return res.json();
}

/** Patch mesh asset meta (derived links, inspect stats) without replacing bytes. */
export async function patchMeshAssetMeta(assetId, metaPatch = {}) {
  const res = await fetch(
    `/api/assets?action=patch-mesh-meta&id=${encodeURIComponent(assetId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: metaPatch }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mesh meta patch failed: ${res.status}`);
  }
  return res.json();
}

/** Patch texture asset meta (sampler / transform) without replacing bytes. */
export async function patchTextureAssetMeta(assetId, metaPatch = {}) {
  const res = await fetch(
    `/api/assets?action=patch-texture-meta&id=${encodeURIComponent(assetId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: metaPatch }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Texture meta patch failed: ${res.status}`);
  }
  return res.json();
}

/** Upload a browser-baked PNG thumbnail for a mesh asset. */
export async function uploadMeshPreview(id, blob) {
  const res = await fetch(
    `/api/assets?action=mesh-preview&id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mesh preview upload failed: ${res.status}`);
  }
  return res.json();
}

/** Upload a browser-captured PNG thumbnail for a material asset. */
export async function uploadMaterialPreview(id, blob) {
  const res = await fetch(
    `/api/assets?action=material-preview&id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Material preview upload failed: ${res.status}`);
  }
  return res.json();
}

export async function createMaterial(definition) {
  const res = await fetch('/api/assets?action=create-material', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Create material failed: ${res.status}`);
  }
  return res.json();
}

/** Bake sphere PNGs for materials that still use the diagonal swatch fallback. */
export async function bakeMissingMaterialPreviews() {
  const res = await fetch('/api/assets?action=bake-missing-material-previews', {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Material preview bake failed: ${res.status}`);
  }
  return res.json();
}

export async function updateMaterial(id, definition) {
  const res = await fetch(`/api/assets?action=material&id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Update material failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchPrefabDefinition(id) {
  const res = await fetch(`/api/assets?action=prefab&id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load prefab: ${res.status}`);
  }
  return res.json();
}

export async function createPrefab(definition) {
  const res = await fetch('/api/assets?action=create-prefab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Create prefab failed: ${res.status}`);
  }
  return res.json();
}

export async function updatePrefab(id, definition) {
  const res = await fetch(`/api/assets?action=prefab&id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(definition || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Update prefab failed: ${res.status}`);
  }
  return res.json();
}

/** Public URL for a registry-relative asset path. */
export function publicAssetUrl(relPath) {
  if (!relPath) return null;
  if (relPath.startsWith('http') || relPath.startsWith('/') || relPath.startsWith('blob:')) {
    return relPath;
  }
  return `/assets/${relPath.replace(/^assets\//, '')}`;
}
