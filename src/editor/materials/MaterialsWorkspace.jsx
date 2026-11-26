import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconSearch } from '../../ui/icons.jsx';
import { ASSET_KINDS, listByKind } from '../../assets/AssetRegistry.js';
import { toCatalogAsset } from '../../assets/assetCatalog.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { AssetThumbnail } from '../assets/AssetThumbnail.jsx';
import { MaterialPreviewCanvas } from '../assets/MeshPreviewCanvas.jsx';
import { useLayout } from '../layout/LayoutContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import { MaterialDefinitionForm } from './MaterialDefinitionForm.jsx';
import { PbrGeneratorPanel } from './PbrGeneratorPanel.jsx';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftForDuplicate,
  materialDraftToSavePayload,
} from './materialDraft.js';
import { registerSaveAllModule } from '../saveAllRegistry.js';

const PREVIEW_SHAPES = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'cube', label: 'Cube' },
  { id: 'plane', label: 'Plane' },
];

/**
 * Phase 2E.4 — Materials workspace.
 * Draft edits stay local until Save; Cancel restores the persisted baseline.
 * Does not touch level undo/redo or level dirty tracking.
 */
export function MaterialsWorkspace() {
  const {
    registry,
    revision,
    materialDefs,
    selectedAssetId,
    selectAsset,
    createNewMaterial,
    duplicateMaterial,
    saveMaterialDefinition,
    getMaterialDefinition,
    assetResolver,
    notify,
    setStatus,
  } = useAssetBrowser();
  const { setWorkspaceLeaveGuard } = useLayout();
  const { confirm } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();

  const [baseline, setBaseline] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewShape, setPreviewShape] = useState('sphere');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [pbrOpen, setPbrOpen] = useState(false);
  const loadTokenRef = useRef(0);

  const dirty = isMaterialDraftDirty(baseline, draft);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const materials = useMemo(() => {
    const entries = listByKind(registry, ASSET_KINDS.material);
    const q = libraryQuery.trim().toLowerCase();
    return entries
      .map((entry) => toCatalogAsset(entry, materialDefs[entry.id] || null))
      .filter((asset) => {
        if (!q) return true;
        return (
          asset.name.toLowerCase().includes(q)
          || asset.id.toLowerCase().includes(q)
          || (asset.tags || []).some((t) => String(t).toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [registry, materialDefs, revision, libraryQuery]);

  const selectedMaterialId = useMemo(() => {
    const entry = listByKind(registry, ASSET_KINDS.material)
      .find((a) => a.id === selectedAssetId);
    return entry?.id || materials[0]?.id || null;
  }, [registry, selectedAssetId, materials]);

  const confirmDiscardDraft = useCallback(async (actionLabel = 'Continue') => {
    if (!dirtyRef.current) return true;
    return confirm(
      `This material has unsaved changes. ${actionLabel} and discard them?`,
      {
        title: 'Unsaved material',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'warning',
      },
    );
  }, [confirm]);

  useEffect(() => {
    setWorkspaceLeaveGuard(async () => confirmDiscardDraft('Leave Materials'));
    return () => setWorkspaceLeaveGuard(null);
  }, [setWorkspaceLeaveGuard, confirmDiscardDraft]);

  useEffect(() => {
    if (!selectedMaterialId) {
      setBaseline(null);
      setDraft(null);
      return undefined;
    }
    const token = ++loadTokenRef.current;
    setLoading(true);
    getMaterialDefinition(selectedMaterialId).then((def) => {
      if (token !== loadTokenRef.current) return;
      const cloned = cloneMaterialDraft(def);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(def));
      setLoading(false);
    }).catch((err) => {
      if (token !== loadTokenRef.current) return;
      setLoading(false);
      notify(err.message || 'Failed to load material');
    });
    return undefined;
  }, [selectedMaterialId, getMaterialDefinition, notify]);

  const selectMaterial = useCallback(async (id) => {
    if (id === selectedMaterialId) return;
    if (!(await confirmDiscardDraft('Switch material'))) return;
    selectAsset(id);
  }, [selectedMaterialId, confirmDiscardDraft, selectAsset]);

  const onCreate = useCallback(async () => {
    if (!(await confirmDiscardDraft('Create a new material'))) return;
    try {
      setStatus('Creating material…');
      const result = await createNewMaterial({ name: 'New Material', baseColor: '#8a9099' });
      selectAsset(result.asset.id);
    } catch (err) {
      notify(err.message || 'Create failed');
    }
  }, [confirmDiscardDraft, createNewMaterial, selectAsset, notify, setStatus]);

  const onDuplicate = useCallback(async () => {
    if (!selectedMaterialId || !baseline) return;
    if (!(await confirmDiscardDraft('Duplicate this material'))) return;
    try {
      setStatus('Duplicating material…');
      const result = await duplicateMaterial(selectedMaterialId);
      selectAsset(result.asset.id);
    } catch (err) {
      notify(err.message || 'Duplicate failed');
    }
  }, [
    selectedMaterialId,
    baseline,
    confirmDiscardDraft,
    duplicateMaterial,
    selectAsset,
    notify,
    setStatus,
  ]);

  const onCancel = useCallback(() => {
    if (!baseline) return;
    setDraft(cloneMaterialDraft(baseline));
    setStatus('Material edits discarded.');
  }, [baseline, setStatus]);

  const onSave = useCallback(async () => {
    if (!draft?.id || !dirty) return;
    const payload = materialDraftToSavePayload(draft);
    if (!payload) return;
    setSaving(true);
    try {
      const saved = await saveMaterialDefinition(draft.id, payload);
      const cloned = cloneMaterialDraft(saved);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(saved));
      setStatus(`Saved material ${saved.name}.`);
    } catch (err) {
      notify(err.message || 'Save failed');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [draft, dirty, saveMaterialDefinition, notify, setStatus]);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Content module for File → Save All (layout is excluded).
  useEffect(() => registerSaveAllModule({
    id: 'material-draft',
    label: 'Material',
    isDirty: () => dirtyRef.current,
    save: async () => {
      await onSaveRef.current?.();
    },
  }), []);

  const getTextureUrl = assetResolver?.getTextureUrl;
  const canGeneratePbr = Boolean(baseline?.baseColorMapId);

  const openPbrGenerator = useCallback(async () => {
    if (!canGeneratePbr) return;
    if (!(await confirmDiscardDraft('Open PBR generator'))) return;
    // Ensure draft matches saved baseline so Apply reads stable UV / maps.
    if (baseline) setDraft(cloneMaterialDraft(baseline));
    setPbrOpen(true);
  }, [canGeneratePbr, confirmDiscardDraft, baseline]);

  const onPbrApplied = useCallback((saved) => {
    const cloned = cloneMaterialDraft(saved);
    setBaseline(cloned);
    setDraft(cloneMaterialDraft(saved));
    setPbrOpen(false);
  }, []);

  if (pbrOpen && baseline) {
    return (
      <div className="bb-workspace bb-materials-workspace bb-materials-workspace--pbr">
        <PbrGeneratorPanel
          material={baseline}
          onClose={() => setPbrOpen(false)}
          onApplied={onPbrApplied}
        />
      </div>
    );
  }

  return (
    <div className="bb-workspace bb-materials-workspace">
      <aside className="bb-materials-workspace__library bb-panel-chrome">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Material Library</span>
        </div>
        <div className="bb-materials-workspace__library-toolbar">
          <div className="bb-search">
            <span className="bb-search__icon"><IconSearch /></span>
            <input
              className="bb-input bb-input--search"
              placeholder="Search materials"
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              aria-label="Search materials"
            />
          </div>
          <div className="bb-field-row" style={{ gap: 6 }}>
            <button type="button" className="bb-btn" onClick={onCreate}>
              New
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={!selectedMaterialId}
              onClick={onDuplicate}
            >
              Duplicate
            </button>
          </div>
        </div>
        <div className="bb-materials-workspace__list" role="list">
          {materials.length === 0 ? (
            <p className="bb-muted" style={{ padding: 12 }}>No materials found.</p>
          ) : materials.map((asset) => {
            const active = asset.id === selectedMaterialId;
            return (
              <button
                key={asset.id}
                type="button"
                role="listitem"
                className={`bb-materials-workspace__tile${active ? ' is-active' : ''}`}
                onClick={() => { void selectMaterial(asset.id); }}
                onContextMenu={(event) => {
                  openFromEvent(event, [
                    {
                      id: 'open',
                      label: 'Open',
                      onSelect: () => { void selectMaterial(asset.id); },
                    },
                    {
                      id: 'duplicate',
                      label: 'Duplicate',
                      onSelect: async () => {
                        if (!(await confirmDiscardDraft('Duplicate this material'))) return;
                        try {
                          setStatus('Duplicating material…');
                          const result = await duplicateMaterial(asset.id);
                          selectAsset(result.asset.id);
                        } catch (err) {
                          notify(err.message || 'Duplicate failed');
                        }
                      },
                    },
                  ]);
                }}
              >
                <AssetThumbnail asset={asset} size={40} />
                <span className="bb-materials-workspace__tile-meta">
                  <span className="bb-materials-workspace__tile-name">{asset.name}</span>
                  <span className="bb-muted">{asset.id}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="bb-materials-workspace__editor bb-panel-chrome">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">
            {draft?.name || 'Material'}
            {dirty ? ' •' : ''}
          </span>
          <div className="bb-field-row" style={{ gap: 6 }}>
            <button
              type="button"
              className="bb-btn"
              disabled={!canGeneratePbr || saving || loading}
              onClick={() => { void openPbrGenerator(); }}
              {...helpProps('materials.pbrGenerator', canGeneratePbr ? null : 'Requires a base-color texture')}
              title={canGeneratePbr
                ? 'Generate normal and roughness maps from the base-color texture'
                : 'Requires a base-color texture'}
            >
              Generate PBR Maps
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={!dirty || saving || loading}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--primary"
              disabled={!dirty || saving || loading}
              onClick={() => { void onSave(); }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="bb-panel-chrome__body bb-materials-workspace__editor-body">
          {loading && <p className="bb-muted">Loading material…</p>}
          {!loading && !draft && (
            <p className="bb-muted">Select or create a material to edit.</p>
          )}
          {!loading && draft && (
            <>
              <p className="bb-muted">
                Edits stay in this draft until Save. Cancel restores the last saved asset.
                Level Undo/Redo is not used for material assets.
              </p>
              <MaterialDefinitionForm
                draft={draft}
                onChange={setDraft}
                disabled={saving}
              />
            </>
          )}
        </div>
      </section>

      <section className="bb-materials-workspace__preview bb-panel-chrome">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Preview</span>
          <div className="bb-seg" role="group" aria-label="Preview shape">
            {PREVIEW_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                className={`bb-btn bb-btn--icon${previewShape === shape.id ? ' bb-btn--active' : ''}`}
                title={shape.label}
                onClick={() => setPreviewShape(shape.id)}
              >
                {shape.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bb-panel-chrome__body bb-materials-workspace__preview-body">
          {draft ? (
            <div className="bb-materials-workspace__preview-stage">
              <MaterialPreviewCanvas
                definition={draft}
                color={draft.baseColor}
                getTextureUrl={getTextureUrl || null}
                shape={previewShape}
              />
            </div>
          ) : (
            <p className="bb-muted">Preview appears when a material is selected.</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Exported for tests — duplicate payload builder re-export. */
export { materialDraftForDuplicate };
