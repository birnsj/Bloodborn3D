import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { ASSET_KINDS, listByKind } from '../../assets/AssetRegistry.js';
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  updateCharacter,
} from '../../io/charactersClient.js';
import { MeshyModelPreview } from '../meshy/MeshyModelPreview.jsx';
import {
  getCharactersUiState,
  setCharactersSelection,
  subscribeCharactersUi,
} from './charactersUiStore.js';

/**
 * Characters v0 — library of character docs pointing at mesh assets + bind-pose preview.
 */
export function CharactersWorkspace() {
  const { registry, refreshRegistry } = useAssetBrowser();
  const { prompt, confirm, alert } = useEditorDialogs();
  const [index, setIndex] = useState({ characters: [] });
  const selectedId = useSyncExternalStore(
    subscribeCharactersUi,
    () => getCharactersUiState().selectedId,
    () => null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listCharacters();
      setIndex(result.index || { characters: [] });
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listCharacters();
        if (!cancelled) {
          setIndex(result.index || { characters: [] });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || String(err));
      }
      if (!cancelled) void refreshRegistry?.();
    })();
    return () => { cancelled = true; };
  }, [refreshRegistry]);

  const meshes = useMemo(
    () => listByKind(registry, ASSET_KINDS.mesh),
    [registry],
  );

  const selected = useMemo(
    () => (index.characters || []).find((c) => c.id === selectedId) || null,
    [index.characters, selectedId],
  );

  const meshAsset = useMemo(
    () => (selected ? meshes.find((m) => m.id === selected.meshAssetId) : null),
    [selected, meshes],
  );

  const previewUrl = meshAsset?.path ? `/assets/${meshAsset.path}` : null;

  const onSelect = (id) => {
    setCharactersSelection(id);
  };

  const onNew = async () => {
    if (!meshes.length) {
      await alert('Import a mesh (or Meshy Auto-rig → Import) before creating a character.');
      return;
    }
    const name = await prompt('Character name', {
      title: 'New Character',
      initialValue: 'Character',
    });
    if (!name) return;
    const meshId = meshes[0].id;
    setBusy(true);
    try {
      const result = await createCharacter({
        name,
        meshAssetId: meshId,
      });
      await refresh();
      setCharactersSelection(result.character.id);
    } catch (err) {
      await alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    if (!selected) return;
    const name = await prompt('Character name', {
      title: 'Rename Character',
      initialValue: selected.name,
    });
    if (!name || name === selected.name) return;
    setBusy(true);
    try {
      await updateCharacter({ id: selected.id, name });
      await refresh();
    } catch (err) {
      await alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onChangeMesh = async (meshAssetId) => {
    if (!selected || !meshAssetId) return;
    setBusy(true);
    try {
      await updateCharacter({ id: selected.id, meshAssetId });
      await refresh();
    } catch (err) {
      await alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    const ok = await confirm(`Delete character “${selected.name}”? The mesh asset is kept.`, {
      title: 'Delete Character',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteCharacter(selected.id);
      setCharactersSelection(null);
      await refresh();
    } catch (err) {
      await alert(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bb-workspace bb-characters" {...helpProps('workspace.characters')}>
      <aside className="bb-characters__list">
        <div className="bb-characters__list-head">
          <h2>Characters</h2>
          <button
            type="button"
            className="bb-btn bb-btn--primary"
            disabled={busy}
            onClick={() => { void onNew(); }}
          >
            New
          </button>
        </div>
        {error && <p className="bb-muted is-bad">{error}</p>}
        <ul className="bb-characters__items">
          {(index.characters || []).length === 0 ? (
            <li className="bb-muted">No characters yet. Auto-rig a Meshy character or New from a mesh.</li>
          ) : (index.characters || []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`bb-characters__item${c.id === selectedId ? ' is-active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="bb-characters__detail">
        {selected ? (
          <>
            <div className="bb-characters__detail-head">
              <h3>{selected.name}</h3>
              <div className="bb-characters__detail-actions">
                <button type="button" className="bb-btn" disabled={busy} onClick={() => { void onRename(); }}>
                  Rename
                </button>
                <button type="button" className="bb-btn bb-btn--ghost" disabled={busy} onClick={() => { void onDelete(); }}>
                  Delete
                </button>
              </div>
            </div>
            <label className="bb-field">
              <span className="bb-field-caption">Mesh asset</span>
              <select
                className="bb-select"
                disabled={busy}
                value={selected.meshAssetId}
                onChange={(e) => { void onChangeMesh(e.target.value); }}
              >
                {meshes.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            {selected.heightMeters != null && (
              <p className="bb-muted">
                Height
                {' '}
                {selected.heightMeters}
                {' '}
                m
              </p>
            )}
            {selected.meshyRigTaskId && (
              <p className="bb-muted">
                Meshy rig task
                {' '}
                {selected.meshyRigTaskId.slice(0, 12)}
                …
              </p>
            )}
            <p className="bb-muted">
              Bind-pose preview only — Animation workspace will play clips later.
            </p>
            <div className="bb-characters__preview">
              {previewUrl ? (
                <MeshyModelPreview url={previewUrl} />
              ) : (
                <div className="bb-muted">Mesh asset missing from Content Browser.</div>
              )}
            </div>
          </>
        ) : (
          <div className="bb-muted bb-characters__empty">
            Select a character or create one from a Content Browser mesh / Meshy Auto-rig import.
          </div>
        )}
      </section>
    </div>
  );
}
