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

export async function importTextureFile(file) {
  const res = await fetch(
    `/api/assets?action=import-texture&name=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Texture import failed: ${res.status}`);
  }
  return res.json();
}

export async function importMeshFile(file) {
  const res = await fetch(
    `/api/assets?action=import-mesh&name=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Mesh import failed: ${res.status}`);
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
