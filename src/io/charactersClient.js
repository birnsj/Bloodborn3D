/**
 * Browser client for localhost Characters API.
 */

async function charactersFetch(action, {
  method = 'GET',
  body = null,
  query = {},
} = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/characters?${qs}`, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Characters API failed (${res.status})`);
    err.code = json.code || 'CHARACTERS_ERROR';
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function listCharacters() {
  return charactersFetch('list');
}

export function getCharacter(id) {
  return charactersFetch('get', { query: { id } });
}

export function createCharacter(payload) {
  return charactersFetch('create', { method: 'POST', body: payload });
}

export function updateCharacter(payload) {
  return charactersFetch('update', { method: 'POST', body: payload });
}

export function deleteCharacter(id) {
  return charactersFetch('delete', { method: 'POST', body: { id } });
}
