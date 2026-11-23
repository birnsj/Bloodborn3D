/**
 * Client for the development-only level file API.
 * Uses Vite middleware under /api/levels — not localStorage.
 */

export async function listLevels() {
  const res = await fetch('/api/levels');
  if (!res.ok) {
    throw new Error(`Failed to list levels: ${res.status}`);
  }
  const data = await res.json();
  return data.levels || [];
}

export async function loadLevelFile(name) {
  const res = await fetch(`/api/levels?name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load level: ${res.status}`);
  }
  return res.json();
}

export async function saveLevelFile(name, levelData) {
  const res = await fetch(`/api/levels?name=${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(levelData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save level: ${res.status}`);
  }
  return res.json();
}
