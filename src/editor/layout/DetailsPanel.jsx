import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { FACE_KEYS } from '../../materials/MaterialDefinition.js';
import { listByKind, ASSET_KINDS } from '../../assets/AssetRegistry.js';

function AxisInputs({ values, onChange, disabled, step }) {
  return (
    <div className="bb-axis-row">
      {['x', 'y', 'z'].map((axis) => (
        <FragmentAxis
          key={axis}
          axis={axis}
          value={values[axis]}
          disabled={disabled}
          step={step}
          onChange={(v) => onChange({ [axis]: v })}
        />
      ))}
    </div>
  );
}

function FragmentAxis({ axis, value, onChange, disabled, step }) {
  return (
    <>
      <span className={`bb-axis bb-axis--${axis}`}>{axis.toUpperCase()}</span>
      <input
        className="bb-input"
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </>
  );
}

export function DetailsPanel({ docked = false } = {}) {
  const {
    selectedActor,
    selectedActorIds,
    mode,
    gridSize,
    world,
    updateSelectedTransform,
    updateSelectedBrush,
    updateSelectedLight,
    updateSelectedStaticMesh,
    renameSelected,
    deleteSelected,
    duplicateSelected,
    reparentSelected,
    setSelectedActorFlags,
    createCell,
    assignSelectedToCell,
    createPrefabFromSelection,
    updatePrefabAssetFromSelection,
    applyPrefabSourceUpdate,
    unpackSelectedPrefab,
    recordSelectedPrefabOverride,
    revertSelectedPrefabOverride,
  } = useEditor();

  const {
    registry,
    selectedAsset,
    selectAsset,
    getMaterialDefinition,
    saveMaterialDefinition,
    getPrefabDefinitionSync,
  } = useAssetBrowser();

  const [tab, setTab] = useState('details');
  const disabled = mode === 'play' || !selectedActor;
  const brush = selectedActor?.getComponent('Brush');
  const light = selectedActor?.getComponent('Light');
  const spawn = selectedActor?.getComponent('PlayerSpawn');
  const staticMesh = selectedActor?.getComponent('StaticMesh');

  const materials = useMemo(
    () => listByKind(registry, ASSET_KINDS.material),
    [registry],
  );

  return (
    <aside className={`bb-panel-chrome bb-details${docked ? ' bb-panel-chrome--docked' : ''}`}>
      <div className="bb-panel-chrome__head">
        <div className="bb-panel-chrome__tabs">
          <button
            type="button"
            className={`bb-panel-chrome__tab${tab === 'details' ? ' is-active' : ''}`}
            onClick={() => setTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            className={`bb-panel-chrome__tab${tab === 'world' ? ' is-active' : ''}`}
            onClick={() => setTab('world')}
          >
            World Settings
          </button>
        </div>
      </div>

      <div className="bb-panel-chrome__body">
        {tab === 'world' ? (
          <WorldSettings />
        ) : !selectedActor ? (
          <p className="bb-muted">Select an actor in the viewport or outliner.</p>
        ) : (
          <>
            {selectedActorIds.length > 1 && (
              <p className="bb-muted">{selectedActorIds.length} selected · editing primary</p>
            )}

            <div className="bb-details-identity">
              <input
                className="bb-input"
                value={selectedActor.name}
                disabled={disabled}
                onChange={(e) => renameSelected(e.target.value)}
              />
              <p className="bb-details-id">{selectedActor.id}</p>
              <div className="bb-details-actions">
                <button type="button" className="bb-btn" disabled={disabled} onClick={() => duplicateSelected()}>
                  Duplicate
                </button>
                <button type="button" className="bb-btn" disabled={disabled} onClick={() => deleteSelected()}>
                  Delete
                </button>
              </div>
            </div>

            <div className="bb-component-list">
              <span>Transform</span>
              {selectedActor.getComponent('Cell') && <span>Cell</span>}
              {brush && <span>Brush</span>}
              {brush && <span>Collider (Box)</span>}
              {light && <span>Light</span>}
              {staticMesh && <span>StaticMesh</span>}
              {spawn && <span>PlayerSpawn</span>}
            </div>

            <Collapsible title="Hierarchy" storageKey="details.hierarchy">
              <label className="bb-field">
                <span className="bb-field__label">Parent</span>
                <select
                  className="bb-select"
                  disabled={disabled}
                  value={selectedActor.parentId || ''}
                  onChange={(e) => reparentSelected(e.target.value || null)}
                >
                  <option value="">(world root)</option>
                  {(world?.actors || [])
                    .filter((a) => a.id !== selectedActor.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.getComponent('Cell') ? ' [Cell]' : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Visible</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selectedActor.visible !== false}
                  onChange={(e) => setSelectedActorFlags({ visible: e.target.checked })}
                />
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Locked</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(selectedActor.locked)}
                  onChange={(e) => setSelectedActorFlags({ locked: e.target.checked })}
                />
              </label>
              <div className="bb-details-actions">
                <button type="button" className="bb-btn" disabled={disabled} onClick={() => createCell()}>
                  New Cell
                </button>
                {selectedActor.getComponent('Cell') && selectedActorIds.length > 1 && (
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    onClick={() => assignSelectedToCell(selectedActor.id)}
                  >
                    Parent selection here
                  </button>
                )}
              </div>
              <p className="bb-muted">Transform values below are local (relative to parent).</p>
            </Collapsible>

            <Collapsible title="Prefab" storageKey="details.prefab">
              {selectedActor.prefab?.prefabId ? (
                <>
                  <p className="bb-muted">
                    Source: {selectedActor.prefab.prefabId}
                    {selectedActor.prefab.isRoot ? ' · root' : ''}
                  </p>
                  <p className="bb-muted">
                    Instance: {selectedActor.prefab.instanceId || '—'}
                  </p>
                  <p className="bb-muted">
                    Template: {selectedActor.prefab.templateId || '—'}
                  </p>
                  {selectedActor.prefab.isRoot && (
                    <p className="bb-muted">
                      Overrides: {Object.keys(selectedActor.prefab.overrides || {}).length}
                    </p>
                  )}
                  <div className="bb-details-actions">
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => recordSelectedPrefabOverride()}
                      title="Store current differences from source as instance overrides"
                    >
                      Record Override
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => revertSelectedPrefabOverride()}
                      title="Clear overrides for this template and resync from source"
                    >
                      Revert Override
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => applyPrefabSourceUpdate(selectedActor.prefab.prefabId)}
                    >
                      Apply Source
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => updatePrefabAssetFromSelection()}
                    >
                      Update Source
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => unpackSelectedPrefab()}
                    >
                      Unpack
                    </button>
                  </div>
                  {!getPrefabDefinitionSync?.(selectedActor.prefab.prefabId) && (
                    <p className="bb-muted">Source asset not loaded in Content Browser yet.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="bb-muted">Not a prefab instance.</p>
                  <div className="bb-details-actions">
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => {
                        const name = window.prompt('Prefab name', selectedActor.name || 'Prefab');
                        if (name) createPrefabFromSelection(name);
                      }}
                    >
                      Create Prefab From Selection
                    </button>
                  </div>
                </>
              )}
            </Collapsible>

            <Collapsible title="Transform" storageKey="details.transform">
              <div className="bb-field-caption">Location</div>
              <AxisInputs
                values={selectedActor.transform.position}
                step={gridSize}
                disabled={disabled}
                onChange={(partial) => updateSelectedTransform({ position: partial })}
              />
              <div className="bb-field-caption">Rotation</div>
              <AxisInputs
                values={selectedActor.transform.rotation}
                step={1}
                disabled={disabled}
                onChange={(partial) => updateSelectedTransform({ rotation: partial }, { snap: false })}
              />
              <div className="bb-field-caption">Scale</div>
              <AxisInputs
                values={selectedActor.transform.scale}
                step={0.1}
                disabled={disabled}
                onChange={(partial) => updateSelectedTransform({ scale: partial }, { snap: false })}
              />
            </Collapsible>

            {brush && (
              <Collapsible title="Brush" storageKey="details.brush">
                <div className="bb-field-caption">Dimensions</div>
                <AxisInputs
                  values={brush.size}
                  step={gridSize}
                  disabled={disabled}
                  onChange={(partial) => updateSelectedBrush({ size: partial })}
                />
                <label className="bb-field">
                  <span className="bb-field__label">Fallback Color</span>
                  <input
                    className="bb-input"
                    type="color"
                    value={normalizeHex(brush.color)}
                    disabled={disabled}
                    onChange={(e) => updateSelectedBrush({ color: e.target.value })}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Collidable</span>
                  <input
                    type="checkbox"
                    checked={brush.collidable !== false}
                    disabled={disabled}
                    onChange={(e) => updateSelectedBrush({ collidable: e.target.checked })}
                  />
                </label>
              </Collapsible>
            )}

            {brush && (
              <Collapsible title="Material" storageKey="details.material">
                <label className="bb-field">
                  <span className="bb-field__label">Material</span>
                  <select
                    className="bb-select"
                    disabled={disabled}
                    value={brush.materialId || ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      updateSelectedBrush({ materialId: id });
                      if (id) selectAsset(id);
                    }}
                  >
                    <option value="">(fallback color)</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                {selectedAsset?.type === 'material' && selectedAsset.id !== brush.materialId && (
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    onClick={() => updateSelectedBrush({ materialId: selectedAsset.id })}
                  >
                    Assign selected: {selectedAsset.name}
                  </button>
                )}
                <div className="bb-field-caption">UV Scale</div>
                <div className="bb-axis-row">
                  <span className="bb-axis">U</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.1}
                    disabled={disabled}
                    value={brush.uv?.scale?.x ?? 1}
                    onChange={(e) => updateSelectedBrush({
                      uv: {
                        ...brush.uv,
                        scale: { ...brush.uv.scale, x: Number(e.target.value) },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.1}
                    disabled={disabled}
                    value={brush.uv?.scale?.y ?? 1}
                    onChange={(e) => updateSelectedBrush({
                      uv: {
                        ...brush.uv,
                        scale: { ...brush.uv.scale, y: Number(e.target.value) },
                      },
                    })}
                  />
                </div>
                <div className="bb-field-caption">UV Offset</div>
                <div className="bb-axis-row">
                  <span className="bb-axis">U</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.05}
                    disabled={disabled}
                    value={brush.uv?.offset?.x ?? 0}
                    onChange={(e) => updateSelectedBrush({
                      uv: {
                        ...brush.uv,
                        offset: { ...brush.uv.offset, x: Number(e.target.value) },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.05}
                    disabled={disabled}
                    value={brush.uv?.offset?.y ?? 0}
                    onChange={(e) => updateSelectedBrush({
                      uv: {
                        ...brush.uv,
                        offset: { ...brush.uv.offset, y: Number(e.target.value) },
                      },
                    })}
                  />
                </div>
                <label className="bb-field">
                  <span className="bb-field__label">UV Rotation°</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={1}
                    disabled={disabled}
                    value={brush.uv?.rotation ?? 0}
                    onChange={(e) => updateSelectedBrush({
                      uv: { ...brush.uv, rotation: Number(e.target.value) },
                    })}
                  />
                </label>

                <div className="bb-field-caption">Per-face overrides</div>
                {FACE_KEYS.map((face) => (
                  <label key={face} className="bb-field">
                    <span className="bb-field__label">{face}</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={brush.faceMaterials?.[face] || ''}
                      onChange={(e) => {
                        const next = { ...(brush.faceMaterials || {}) };
                        if (!e.target.value) delete next[face];
                        else next[face] = e.target.value;
                        updateSelectedBrush({
                          faceMaterials: Object.keys(next).length ? next : null,
                        });
                      }}
                    >
                      <option value="">(brush material)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                ))}

                {brush.materialId && (
                  <MaterialDefinitionEditor
                    materialId={brush.materialId}
                    disabled={disabled}
                    getMaterialDefinition={getMaterialDefinition}
                    saveMaterialDefinition={saveMaterialDefinition}
                  />
                )}
              </Collapsible>
            )}

            {brush && (
              <Collapsible title="Collision" storageKey="details.collision" defaultOpen={false}>
                <p className="bb-muted">
                  Play mode builds a Rapier box collider from brush size and transform.
                </p>
              </Collapsible>
            )}

            {light && (
              <Collapsible title="Light" storageKey="details.light">
                <label className="bb-field">
                  <span className="bb-field__label">Type</span>
                  <select
                    className="bb-select"
                    disabled={disabled}
                    value={light.lightType}
                    onChange={(e) => updateSelectedLight({ lightType: e.target.value })}
                  >
                    <option value="point">Point</option>
                    <option value="spot">Spot</option>
                    <option value="directional">Directional</option>
                    <option value="ambient">Ambient</option>
                  </select>
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Color</span>
                  <input
                    className="bb-input"
                    type="color"
                    disabled={disabled}
                    value={normalizeHex(light.color)}
                    onChange={(e) => updateSelectedLight({ color: e.target.value })}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Intensity</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.1}
                    min={0}
                    disabled={disabled}
                    value={light.intensity}
                    onChange={(e) => updateSelectedLight({ intensity: Number(e.target.value) })}
                  />
                </label>
                {(light.lightType === 'point' || light.lightType === 'spot') && (
                  <label className="bb-field">
                    <span className="bb-field__label">Range (eu)</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={25}
                      min={0}
                      disabled={disabled}
                      value={light.range}
                      onChange={(e) => updateSelectedLight({ range: Number(e.target.value) })}
                    />
                  </label>
                )}
                {light.lightType === 'spot' && (
                  <>
                    <label className="bb-field">
                      <span className="bb-field__label">Spot Angle°</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={1}
                        disabled={disabled}
                        value={light.spotAngle}
                        onChange={(e) => updateSelectedLight({ spotAngle: Number(e.target.value) })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Penumbra</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        disabled={disabled}
                        value={light.spotPenumbra}
                        onChange={(e) => updateSelectedLight({ spotPenumbra: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                {light.lightType !== 'ambient' && (
                  <>
                    <label className="bb-field">
                      <span className="bb-field__label">Cast Shadow</span>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={Boolean(light.castShadow)}
                        onChange={(e) => updateSelectedLight({ castShadow: e.target.checked })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Shadow Map</span>
                      <select
                        className="bb-select"
                        disabled={disabled || !light.castShadow}
                        value={light.shadowMapSize || 1024}
                        onChange={(e) => updateSelectedLight({ shadowMapSize: Number(e.target.value) })}
                      >
                        <option value={512}>512</option>
                        <option value={1024}>1024</option>
                        <option value={2048}>2048</option>
                      </select>
                    </label>
                  </>
                )}
              </Collapsible>
            )}

            {staticMesh && (
              <Collapsible title="Static Mesh" storageKey="details.staticMesh">
                <p className="bb-muted">Asset ID: {staticMesh.assetId || '—'}</p>
                <label className="bb-field">
                  <span className="bb-field__label">Collision</span>
                  <select
                    className="bb-select"
                    disabled={disabled}
                    value={staticMesh.collidable && staticMesh.collisionType === 'box' ? 'box' : 'none'}
                    onChange={(e) => {
                      const box = e.target.value === 'box';
                      updateSelectedStaticMesh({
                        collidable: box,
                        collisionType: box ? 'box' : 'none',
                      });
                    }}
                  >
                    <option value="none">None</option>
                    <option value="box">Box (Rapier)</option>
                  </select>
                </label>
                <p className="bb-muted">
                  Collision is explicit. Box uses actor scale as a 1 m unit cube proxy.
                </p>
              </Collapsible>
            )}

            {spawn && (
              <Collapsible title="Player Spawn" storageKey="details.spawn">
                <p className="bb-muted">
                  Eye height {spawn.eyeHeight} · move speed {spawn.moveSpeed}
                </p>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function MaterialDefinitionEditor({
  materialId,
  disabled,
  getMaterialDefinition,
  saveMaterialDefinition,
}) {
  const { registry } = useAssetBrowser();
  const textures = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture),
    [registry],
  );
  const [def, setDef] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMaterialDefinition(materialId).then((d) => {
      if (!cancelled) setDef(d);
    });
    return () => { cancelled = true; };
  }, [materialId, getMaterialDefinition]);

  if (!def) {
    return <p className="bb-muted">Loading material…</p>;
  }

  const patch = async (partial) => {
    const next = { ...def, ...partial };
    setDef(next);
    await saveMaterialDefinition(materialId, next);
  };

  return (
    <div className="bb-material-def">
      <div className="bb-field-caption">Shared material properties</div>
      <label className="bb-field">
        <span className="bb-field__label">Name</span>
        <input
          className="bb-input"
          disabled={disabled}
          value={def.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Base Color</span>
        <input
          className="bb-input"
          type="color"
          disabled={disabled}
          value={normalizeHex(def.baseColor)}
          onChange={(e) => patch({ baseColor: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Base Color Map</span>
        <select
          className="bb-select"
          disabled={disabled}
          value={def.baseColorMapId || ''}
          onChange={(e) => patch({ baseColorMapId: e.target.value || null })}
        >
          <option value="">(none)</option>
          {textures.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Normal Map</span>
        <select
          className="bb-select"
          disabled={disabled}
          value={def.normalMapId || ''}
          onChange={(e) => patch({ normalMapId: e.target.value || null })}
        >
          <option value="">(none)</option>
          {textures.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Roughness</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={def.roughness}
          onChange={(e) => patch({ roughness: Number(e.target.value) })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Metalness</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={def.metalness}
          onChange={(e) => patch({ metalness: Number(e.target.value) })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Emissive</span>
        <input
          className="bb-input"
          type="color"
          disabled={disabled}
          value={normalizeHex(def.emissive)}
          onChange={(e) => patch({ emissive: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Emissive Intensity</span>
        <input
          className="bb-input"
          type="number"
          step={0.1}
          min={0}
          disabled={disabled}
          value={def.emissiveIntensity}
          onChange={(e) => patch({ emissiveIntensity: Number(e.target.value) })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Opacity</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={def.opacity}
          onChange={(e) => {
            const opacity = Number(e.target.value);
            patch({ opacity, transparent: opacity < 1 });
          }}
        />
      </label>
    </div>
  );
}

function WorldSettings() {
  const { world, gridSize, levelName, mode } = useEditor();
  return (
    <div>
      <Collapsible title="Level" storageKey="world.level">
        <p className="bb-muted">Name: {world?.name || '—'}</p>
        <p className="bb-muted">File: {levelName}</p>
        <p className="bb-muted">Actors: {world?.actors?.length ?? 0}</p>
        <p className="bb-muted">Schema: {world?.schemaVersion ?? '—'}</p>
      </Collapsible>
      <Collapsible title="Editor" storageKey="world.editor">
        <p className="bb-muted">Mode: {mode}</p>
        <p className="bb-muted">Grid: {gridSize} editor units</p>
        <p className="bb-muted">100 editor units = 1 meter</p>
      </Collapsible>
    </div>
  );
}

function normalizeHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#') && color.length === 7) return color;
  return '#888888';
}
