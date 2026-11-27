import { useCallback, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { findAsset } from '../../assets/AssetRegistry.js';
import { publicAssetUrl } from '../../io/assetFileApi.js';
import { loadGltfScene } from '../../runtime/meshLoader.js';
import { exportMeshRoot } from '../../assets/meshFormatIO.js';
import {
  generateLodLevelsFromRoot,
  lodLevelsFromAssetIds,
  DEFAULT_LOD_DISTANCES_EU,
} from '../../assets/meshLodGenerate.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  STATIC_MESH_COLLISION_TYPES,
  STATIC_MESH_INSTANCING,
  staticMeshAuthorableSnapshot,
} from '../../components/StaticMeshComponent.js';

export function StaticMeshDetailsSection({
  staticMesh,
  actorId,
  disabled,
  materials,
  updateSelectedStaticMesh,
}) {
  const { getStaticMeshSlots, getStaticMeshTriangleCounts } = useEditor();
  const {
    registry,
    importDerivedMeshGlb,
    notify,
  } = useAssetBrowser();
  const [lodBusy, setLodBusy] = useState(false);
  const discovered = actorId ? (getStaticMeshSlots?.(actorId) || []) : [];
  const triangleCounts = actorId ? (getStaticMeshTriangleCounts?.(actorId) || []) : [];
  const overrideKeys = Object.keys(staticMesh.materialOverrides || {});
  const slotKeys = [...new Set([
    ...discovered.map((s) => s.key),
    ...overrideKeys,
  ])];
  const lodLevels = Array.isArray(staticMesh.lodLevels) ? staticMesh.lodLevels : [];
  const collisionOn = staticMesh.collidable && staticMesh.collisionType !== 'none';

  const generateAutoLod = useCallback(async () => {
    if (!staticMesh.assetId || lodBusy) return;
    const meshAsset = findAsset(registry, staticMesh.assetId);
    const path = meshAsset?.path;
    if (!path) {
      notify?.('Mesh asset path not found — open Content Browser and ensure the mesh is registered.');
      return;
    }
    setLodBusy(true);
    try {
      const loaded = await loadGltfScene(publicAssetUrl(path));
      if (!loaded?.scene) throw new Error('Failed to load mesh for LOD generation');
      const generated = await generateLodLevelsFromRoot(loaded.scene);
      const assetIds = [];
      for (const level of generated.levels) {
        if (level.isSource) {
          assetIds.push(staticMesh.assetId);
          continue;
        }
        const exported = await exportMeshRoot(level.root, 'glb');
        const derived = await importDerivedMeshGlb(exported.data, {
          name: `${meshAsset.name || staticMesh.assetId} LOD${level.index}`,
          sourceAssetId: staticMesh.assetId,
          tags: ['derived', 'lod'],
          meta: {
            lodGenerated: true,
            lodIndex: level.index,
            lodRatio: level.ratio,
            lodDistanceEu: level.distance,
            triangles: level.after.triangles,
            vertices: level.after.vertices,
            derivedFrom: staticMesh.assetId,
          },
        });
        assetIds.push(derived.id);
      }
      updateSelectedStaticMesh({
        lodLevels: lodLevelsFromAssetIds(assetIds, DEFAULT_LOD_DISTANCES_EU),
        lodPreview: -1,
      });
      notify?.(`Auto LOD assigned (${assetIds.length} levels). Source mesh preserved; collision unchanged.`);
    } catch (err) {
      notify?.(err?.message || String(err));
    } finally {
      setLodBusy(false);
    }
  }, [
    staticMesh.assetId,
    lodBusy,
    registry,
    importDerivedMeshGlb,
    notify,
    updateSelectedStaticMesh,
  ]);

  return (
    <Collapsible title="Static Mesh" storageKey="details.staticMesh" defaultOpen>
      <div {...helpProps('details.staticMesh')}>
        <p className="bb-muted">
          Imported mesh prop (Batch 6). Collision uses asset bounds or mesh geometry.
          Material overrides do not modify the GLB on disk.
        </p>
        <p className="bb-muted">Asset ID: {staticMesh.assetId || '—'}</p>
        {triangleCounts.length > 0 && (
          <p className="bb-muted">
            Triangles / LOD:{' '}
            {triangleCounts.map((row, i) => {
              const n = typeof row === 'number' ? row : row?.triangles;
              return `L${i}=${n ?? '?'}`;
            }).join(', ')}
          </p>
        )}

        <Collapsible title="Collision" storageKey="details.staticMesh.collision" defaultOpen>
          <div {...helpProps('details.staticMesh.collision')}>
          <label className="bb-field">
            <span className="bb-field__label">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(staticMesh.collidable)}
                onChange={(e) => {
                  const on = e.target.checked;
                  updateSelectedStaticMesh({
                    collidable: on,
                    collisionType: on
                      ? (staticMesh.collisionType === 'none' ? 'auto' : staticMesh.collisionType)
                      : staticMesh.collisionType,
                  });
                }}
              />
              {' '}Collidable
            </span>
          </label>
          <label className="bb-field">
            <span className="bb-field__label">Collision type</span>
            <select
              className="bb-select"
              disabled={disabled || !staticMesh.collidable}
              value={staticMesh.collisionType || 'none'}
              onChange={(e) => {
                const collisionType = e.target.value;
                updateSelectedStaticMesh({
                  collisionType,
                  collidable: collisionType !== 'none',
                });
              }}
            >
              {STATIC_MESH_COLLISION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <p className="bb-muted">
            Auto → box from asset AABB. Convex/trimesh need the mesh loaded (Play after viewport load).
            Trimesh is static-only (fixed body).
          </p>
          {collisionOn && (
            <>
              <div className="bb-field-row">
                <StaticScrubNumber field="collisionOffset" axis="x" label="Offset X" disabled={disabled} staticMesh={staticMesh} />
                <StaticScrubNumber field="collisionOffset" axis="y" label="Offset Y" disabled={disabled} staticMesh={staticMesh} />
                <StaticScrubNumber field="collisionOffset" axis="z" label="Offset Z" disabled={disabled} staticMesh={staticMesh} />
              </div>
              <div className="bb-field-row">
                <StaticScrubNumber field="collisionSize" axis="x" label="Box W (0=AABB)" min={0} disabled={disabled} staticMesh={staticMesh} />
                <StaticScrubNumber field="collisionSize" axis="y" label="Box H" min={0} disabled={disabled} staticMesh={staticMesh} />
                <StaticScrubNumber field="collisionSize" axis="z" label="Box D" min={0} disabled={disabled} staticMesh={staticMesh} />
              </div>
              <div className="bb-field-row">
                <StaticScrubNumber field="collisionRadius" label="Radius (0=auto)" min={0} disabled={disabled} staticMesh={staticMesh} />
                <StaticScrubNumber field="collisionHeight" label="Height (0=auto)" min={0} disabled={disabled} staticMesh={staticMesh} />
              </div>
            </>
          )}
          <label className="bb-field">
            <span className="bb-field__label">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(staticMesh.showCollision)}
                onChange={(e) => updateSelectedStaticMesh({ showCollision: e.target.checked })}
              />
              {' '}Show collision helper
            </span>
          </label>
          </div>
        </Collapsible>

        <Collapsible title="Materials" storageKey="details.staticMesh.materials" defaultOpen>
          <div {...helpProps('details.staticMesh.materials')}>
          <p className="bb-muted">
            Slots come from the loaded GLB (`meshName:matIndex`). Clear a slot to restore the original material. GLB files are never modified.
          </p>
          {slotKeys.length === 0 && (
            <p className="bb-muted">No slots yet — wait for the mesh to load in a viewport, or add a slot key manually.</p>
          )}
          {slotKeys.map((key) => (
            <label className="bb-field" key={key}>
              <span className="bb-field__label">{key}</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={staticMesh.materialOverrides[key] || ''}
                onChange={(e) => {
                  const next = { ...staticMesh.materialOverrides };
                  if (!e.target.value) delete next[key];
                  else next[key] = e.target.value;
                  updateSelectedStaticMesh({ materialOverrides: next });
                }}
              >
                <option value="">(original)</option>
                {(materials || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            </label>
          ))}
          {discovered.length === 0 && (
            <label className="bb-field">
              <span className="bb-field__label">Add override for slot</span>
              <select
                className="bb-select"
                disabled={disabled}
                value=""
                onChange={(e) => {
                  const materialId = e.target.value;
                  if (!materialId) return;
                  const key = window.prompt('Slot key (meshName:matIndex)', 'Mesh_0:0');
                  if (!key) return;
                  updateSelectedStaticMesh({
                    materialOverrides: { ...staticMesh.materialOverrides, [key]: materialId },
                  });
                }}
              >
                <option value="">Select material…</option>
                {(materials || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="bb-btn"
            disabled={disabled || overrideKeys.length === 0}
            onClick={() => updateSelectedStaticMesh({ materialOverrides: {} })}
            {...helpProps(
              'details.staticMesh.clearOverrides',
              overrideKeys.length === 0 ? 'No material overrides on this actor.' : null,
            )}
          >
            Restore all original materials
          </button>
          </div>
        </Collapsible>

        <Collapsible title="LOD" storageKey="details.staticMesh.lod">
          <div {...helpProps('details.staticMesh.lod')}>
          <p className="bb-muted">
            Distances in editor units (100 eu = 1 m). Level 0 is nearest. Auto LOD uses SimplifyModifier (Batch 7) and saves derived assets without overwriting the source.
          </p>
          {lodLevels.map((row, i) => (
            <div className="bb-field-row" key={`lod-${i}`}>
              <label className="bb-field">
                <span className="bb-field__label">L{i} asset</span>
                <input
                  className="bb-input"
                  disabled={disabled}
                  value={row.assetId || ''}
                  onChange={(e) => {
                    const next = lodLevels.map((r, j) => (
                      j === i ? { ...r, assetId: e.target.value } : r
                    ));
                    updateSelectedStaticMesh({ lodLevels: next });
                  }}
                />
              </label>
              <StaticLodDistanceScrub
                index={i}
                disabled={disabled}
                staticMesh={staticMesh}
                value={row.distance || 0}
              />
            </div>
          ))}
          <button
            type="button"
            className="bb-btn bb-btn--primary"
            disabled={disabled || !staticMesh.assetId || lodBusy}
            onClick={() => { void generateAutoLod(); }}
            {...helpProps('details.staticMesh.autoLod')}
          >
            {lodBusy ? 'Generating LOD…' : 'Generate auto LOD'}
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={disabled || !staticMesh.assetId}
            onClick={() => {
              const base = lodLevels.length
                ? lodLevels
                : [{ assetId: staticMesh.assetId, distance: 0 }];
              updateSelectedStaticMesh({
                lodLevels: [...base, { assetId: staticMesh.assetId, distance: 500 * (base.length) }],
              });
            }}
          >
            Add LOD level
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={disabled || !lodLevels.length}
            onClick={() => updateSelectedStaticMesh({ lodLevels: [] })}
            {...helpProps(
              'details.staticMesh.clearLod',
              lodLevels.length ? null : 'No LOD levels authored.',
            )}
          >
            Clear LOD (use primary asset)
          </button>
          <label className="bb-field">
            <span className="bb-field__label">Preview level (−1 auto)</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={staticMesh.lodPreview ?? -1}
              onChange={(e) => updateSelectedStaticMesh({ lodPreview: Number(e.target.value) })}
            >
              <option value={-1}>Automatic</option>
              {lodLevels.map((_, i) => (
                <option key={i} value={i}>Force L{i}</option>
              ))}
            </select>
          </label>
          <StaticScrubNumber
            field="lodHysteresis"
            label="Hysteresis (eu)"
            min={0}
            disabled={disabled}
            staticMesh={staticMesh}
          />
          </div>
        </Collapsible>

        <Collapsible title="Rendering" storageKey="details.staticMesh.rendering" defaultOpen>
          <div {...helpProps('details.staticMesh.rendering')}>
          <label className="bb-field">
            <span className="bb-field__label">
              <input
                type="checkbox"
                disabled={disabled}
                checked={staticMesh.castShadow !== false}
                onChange={(e) => updateSelectedStaticMesh({ castShadow: e.target.checked })}
              />
              {' '}Cast shadow
            </span>
          </label>
          <label className="bb-field">
            <span className="bb-field__label">
              <input
                type="checkbox"
                disabled={disabled}
                checked={staticMesh.receiveShadow !== false}
                onChange={(e) => updateSelectedStaticMesh({ receiveShadow: e.target.checked })}
              />
              {' '}Receive shadow
            </span>
          </label>
          <label className="bb-field">
            <span className="bb-field__label">
              <input
                type="checkbox"
                disabled={disabled}
                checked={staticMesh.frustumCulled !== false}
                onChange={(e) => updateSelectedStaticMesh({ frustumCulled: e.target.checked })}
              />
              {' '}Frustum culled
            </span>
          </label>
          <StaticScrubNumber
            field="renderOrder"
            label="Render order"
            step={1}
            disabled={disabled}
            staticMesh={staticMesh}
          />
          <label className="bb-field">
            <span className="bb-field__label">Instancing</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={staticMesh.instancing || 'off'}
              onChange={(e) => updateSelectedStaticMesh({ instancing: e.target.value })}
            >
              {STATIC_MESH_INSTANCING.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <p className="bb-muted">
            Instancing default is off. Auto groups 3+ identical assets. BatchedMesh deferred for multi-material atlases.
          </p>
          </div>
        </Collapsible>
      </div>
    </Collapsible>
  );
}

export function StaticScrubNumber({
  staticMesh,
  field,
  axis,
  min,
  max,
  step = 1,
  disabled,
  label,
}) {
  const { updateSelectedStaticMesh, commitStaticMeshGesture } = useEditor();
  const beforeRef = useRef(null);
  const value = axis
    ? (staticMesh[field]?.[axis] ?? 0)
    : (staticMesh[field] ?? 0);
  return (
    <ScrubNumberInput
      className="bb-input"
      label={label || field}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onGestureStart={() => {
        if (!staticMesh || beforeRef.current) return;
        beforeRef.current = staticMeshAuthorableSnapshot(staticMesh);
      }}
      onChange={(next) => {
        if (axis) {
          updateSelectedStaticMesh({
            [field]: { ...staticMesh[field], [axis]: next },
          }, { undoable: false });
        } else {
          updateSelectedStaticMesh({ [field]: next }, { undoable: false });
        }
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitStaticMeshGesture?.(before, label || `Edit ${field}`);
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (!before) return;
        updateSelectedStaticMesh(before, { undoable: false });
      }}
    />
  );
}

export function StaticLodDistanceScrub({ index, disabled, staticMesh, value }) {
  const { updateSelectedStaticMesh, commitStaticMeshGesture } = useEditor();
  const beforeRef = useRef(null);
  return (
    <ScrubNumberInput
      className="bb-input"
      label={`L${index} dist`}
      disabled={disabled}
      value={value}
      min={0}
      step={25}
      onGestureStart={() => {
        if (!staticMesh || beforeRef.current) return;
        beforeRef.current = staticMeshAuthorableSnapshot(staticMesh);
      }}
      onChange={(next) => {
        const lodLevels = (staticMesh.lodLevels || []).map((r, j) => (
          j === index ? { ...r, distance: next } : r
        ));
        updateSelectedStaticMesh({ lodLevels }, { undoable: false });
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitStaticMeshGesture?.(before, 'Edit LOD distance');
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) updateSelectedStaticMesh(before, { undoable: false });
      }}
    />
  );
}
