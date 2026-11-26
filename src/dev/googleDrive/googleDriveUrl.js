/**
 * Parse Google Drive folder / file share URLs into id + optional resourceKey.
 */

const FOLDER_RE = /\/(?:folders|drive\/folders)\/([a-zA-Z0-9_-]+)/;
const FILE_RE = /\/(?:file\/d|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/;
const ID_QUERY_RE = /[?&#]id=([a-zA-Z0-9_-]+)/;
const RESOURCE_KEY_RE = /[?&#]resourcekey=([^&#]+)/i;

/**
 * @param {string} input
 * @returns {{ ok: true, kind: 'folder'|'file', id: string, resourceKey: string|null, url: string }
 *   | { ok: false, code: string, error: string }}
 */
export function parseGoogleDriveUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    return { ok: false, code: 'EMPTY_URL', error: 'Paste a Google Drive folder URL' };
  }

  // Bare folder / file id (no scheme, no path separators)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
    return {
      ok: true,
      kind: 'folder',
      id: raw,
      resourceKey: null,
      url: `https://drive.google.com/drive/folders/${raw}`,
    };
  }

  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return { ok: false, code: 'INVALID_URL', error: 'Not a valid Google Drive URL' };
  }

  const href = url.href;
  const resourceKey = (() => {
    const m = RESOURCE_KEY_RE.exec(href);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  })();

  const folder = FOLDER_RE.exec(url.pathname) || FOLDER_RE.exec(href);
  if (folder) {
    return {
      ok: true,
      kind: 'folder',
      id: folder[1],
      resourceKey,
      url: href,
    };
  }

  const file = FILE_RE.exec(href) || ID_QUERY_RE.exec(href);
  if (file) {
    return {
      ok: true,
      kind: 'file',
      id: file[1],
      resourceKey,
      url: href,
    };
  }

  return {
    ok: false,
    code: 'UNSUPPORTED_URL',
    error: 'Could not find a Drive folder or file id in that URL',
  };
}

export function driveOpenInBrowserUrl(folderId, resourceKey = null) {
  const base = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
  return resourceKey
    ? `${base}?resourcekey=${encodeURIComponent(resourceKey)}`
    : base;
}
