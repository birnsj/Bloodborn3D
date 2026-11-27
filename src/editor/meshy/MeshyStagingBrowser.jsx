import { useCallback, useEffect, useState } from 'react';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  listMeshyStaging,
  meshyStagingPreviewUrl,
} from '../../io/meshyClient.js';

function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Browse `.meshy-staging` outputs (refs, job downloads, maps) without importing.
 * Localhost Meshy API only.
 */
export function MeshyStagingBrowser({ notify } = {}) {
  const [path, setPath] = useState('');
  const [listing, setListing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewPath, setPreviewPath] = useState(null);

  const refresh = useCallback(async (nextPath = '') => {
    setBusy(true);
    setError('');
    try {
      const data = await listMeshyStaging(nextPath);
      setListing(data);
      setPath(data.path || '');
      setPreviewPath((prev) => {
        if (!prev) return null;
        const folder = data.path || '';
        if (!folder) return prev; // still under staging root
        return prev === folder || prev.startsWith(`${folder}/`) ? prev : null;
      });
    } catch (err) {
      setError(err.message || String(err));
      setListing(null);
      notify?.(err.message || String(err), { dialog: true });
    } finally {
      setBusy(false);
    }
  }, [notify]);

  useEffect(() => {
    void refresh('');
  }, [refresh]);

  const crumbs = buildCrumbs(path);

  return (
    <details className="bb-meshy-results__staging" {...helpProps('meshy.stagingBrowser')}>
      <summary>Staging files (advanced)</summary>
      <p className="bb-muted">
        Optional peek at the local temp folder
        {' '}
        <code>.meshy-staging</code>
        .
        Prefer
        {' '}
        <strong>Import Model</strong>
        {' '}
        / Import maps so assets show in the Content Browser.
      </p>

      <div className="bb-meshy-staging__toolbar">
        <nav className="bb-meshy-staging__crumbs" aria-label="Staging path">
          {crumbs.map((c) => (
            <button
              key={c.path || 'root'}
              type="button"
              className="bb-btn bb-btn--ghost"
              disabled={busy || c.path === path}
              onClick={() => { void refresh(c.path); }}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={busy}
          onClick={() => { void refresh(path); }}
        >
          {busy ? '…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="bb-meshy-staging__error">{error}</p>}

      {listing?.missing && (
        <p className="bb-muted">No staging folder yet — generate or upload a reference first.</p>
      )}

      {listing && !listing.missing && (
        <ul className="bb-meshy-staging__list">
          {listing.parent != null && (
            <li>
              <button
                type="button"
                className="bb-meshy-staging__row"
                onClick={() => { void refresh(listing.parent); }}
              >
                <span className="bb-meshy-staging__icon">↑</span>
                <span className="bb-meshy-staging__name">..</span>
                <span className="bb-muted">Parent</span>
              </button>
            </li>
          )}
          {(listing.entries || []).map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className="bb-meshy-staging__row"
                onClick={() => {
                  if (entry.kind === 'dir') {
                    void refresh(entry.path);
                    return;
                  }
                  if (entry.previewable) {
                    setPreviewPath(entry.path);
                    return;
                  }
                  window.open(meshyStagingPreviewUrl(entry.path), '_blank', 'noopener');
                }}
              >
                <span className="bb-meshy-staging__icon">
                  {entry.kind === 'dir' ? '▸' : fileGlyph(entry.fileKind)}
                </span>
                {entry.previewable ? (
                  <span className="bb-meshy-staging__thumb">
                    <img src={meshyStagingPreviewUrl(entry.path)} alt="" />
                  </span>
                ) : null}
                <span className="bb-meshy-staging__name">{entry.name}</span>
                <span className="bb-muted">
                  {entry.kind === 'dir' ? 'Folder' : formatBytes(entry.bytes)}
                </span>
              </button>
            </li>
          ))}
          {(listing.entries || []).length === 0 && (
            <li className="bb-muted">Empty folder</li>
          )}
        </ul>
      )}

      {listing?.truncated && (
        <p className="bb-muted">Listing truncated — open a subfolder to see more.</p>
      )}

      {previewPath && (
        <div className="bb-meshy-staging__preview">
          <div className="bb-meshy-staging__preview-head">
            <strong>{previewPath.split('/').pop()}</strong>
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              onClick={() => setPreviewPath(null)}
            >
              Close
            </button>
            <a
              className="bb-btn bb-btn--ghost"
              href={meshyStagingPreviewUrl(previewPath)}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
          <img src={meshyStagingPreviewUrl(previewPath)} alt={previewPath} />
        </div>
      )}
    </details>
  );
}

function buildCrumbs(relPath) {
  const crumbs = [{ label: 'staging', path: '' }];
  if (!relPath) return crumbs;
  const parts = relPath.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

function fileGlyph(fileKind) {
  if (fileKind === 'image') return '▣';
  if (fileKind === 'model') return '◈';
  if (fileKind === 'json') return '{}';
  return '·';
}
