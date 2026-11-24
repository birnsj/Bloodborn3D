import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from './LayoutContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { ScrubAxisLabel, ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { FACE_KEYS } from '../../materials/MaterialDefinition.js';
import { listByKind, ASSET_KINDS } from '../../assets/AssetRegistry.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { isWallBrush, normalizeOpenings } from '../../runtime/wallOpenings.js';
import { MaterialDefinitionForm } from '../materials/MaterialDefinitionForm.jsx';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftToSavePayload,
} from '../materials/materialDraft.js';
import {
  canConvertActorToConvex,
  describeConvexBrush,
  listCutterConvexConflicts,
} from '../../rules/convexBrushRules.js';

function AxisInputs({ values, onChange, disabled, step, helpId }) {
  return (
    <div className="bb-axis-row" {...(helpId ? helpProps(helpId) : {})}>
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
      <ScrubAxisLabel
        axis={axis}
        value={value}
        disabled={disabled}
        step={step}
        onChange={onChange}
      />
      <ScrubNumberInput
        value={value}
        disabled={disabled}
        step={step}
        onChange={onChange}
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
    updateSelectedConvexBrush,
    convertSelectedToConvexBrush,
    addBrushOpening,
    updateBrushOpening,
    removeBrushOpening,
    updateSelectedLight,
    updateSelectedStaticMesh,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
    joinSelectedWallToNearest,
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
    selectedSurface,
    alignReferenceSurface,
    assignSelectedSurfaceMaterial,
    assignSelectedSurfaceUv,
    resetSelectedSurfaceUv,
    setSelectedSurface,
    tool,
  } = useEditor();
  const { prompt } = useEditorDialogs();

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
  const convexBrush = selectedActor?.getComponent('ConvexBrush');
  const ramp = selectedActor?.getComponent('Ramp');
  const stair = selectedActor?.getComponent('Stair');
  const column = selectedActor?.getComponent('Column');
  const arch = selectedActor?.getComponent('Arch');
  const curvedWall = selectedActor?.getComponent('CurvedWall');
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
                <button
                  type="button"
                  className="bb-btn"
                  disabled={disabled}
                  onClick={() => duplicateSelected()}
                  {...helpProps('details.duplicate', disabled ? 'Unavailable during Play mode.' : null)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="bb-btn"
                  disabled={disabled}
                  onClick={() => deleteSelected()}
                  {...helpProps('details.delete', disabled ? 'Unavailable during Play mode.' : null)}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="bb-component-list">
              <span>Transform</span>
              {selectedActor.getComponent('Cell') && <span>Cell</span>}
              {brush && <span>Brush</span>}
              {brush && <span>Collider (Box)</span>}
              {convexBrush && <span>ConvexBrush</span>}
              {convexBrush && <span>Collider (Convex Hull)</span>}
              {ramp && <span>Ramp</span>}
              {ramp && <span>Collider (Slope)</span>}
              {stair && <span>Stairs</span>}
              {stair && <span>Collider (Steps)</span>}
              {light && <span>Light</span>}
              {staticMesh && <span>StaticMesh</span>}
              {spawn && <span>PlayerSpawn</span>}
            </div>

            {selectedSurface && selectedSurface.actorId === selectedActor.id && (() => {
              const surfaceComp = brush || convexBrush || ramp || stair || column || arch || curvedWall;
              const surfaceUv = surfaceComp?.faceUVs?.[selectedSurface.surfaceId] || {
                scale: { x: 1, y: 1 },
                offset: { x: 0, y: 0 },
                rotation: 0,
              };
              const hasSurfaceUv = Boolean(surfaceComp?.faceUVs?.[selectedSurface.surfaceId]);
              return (
                <Collapsible title="Selected Surface" storageKey="details.surface" defaultOpen>
                  <p className="bb-muted">
                    Surface <code>{selectedSurface.surfaceId}</code>
                    {tool === 'surface' ? ' · Surface Selection mode' : ''}
                    {tool === 'align' ? ' · Align to Neighbor' : ''}
                    {alignReferenceSurface
                      && `${alignReferenceSurface.actorId}:${alignReferenceSurface.surfaceId}`
                        !== `${selectedSurface.actorId}:${selectedSurface.surfaceId}`
                      ? ` · ref ${alignReferenceSurface.surfaceId}`
                      : ''}
                  </p>
                  <label className="bb-field">
                    <span className="bb-field__label">Surface material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={surfaceComp?.faceMaterials?.[selectedSurface.surfaceId] || ''}
                      onChange={(e) => assignSelectedSurfaceMaterial(e.target.value || null)}
                    >
                      <option value="">(actor material)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                  <p className="bb-muted">
                    Surface UV overrides actor UV for this face only.
                    {hasSurfaceUv ? '' : ' (inherited defaults)'}
                  </p>
                  <div className="bb-axis-row">
                    <label className="bb-field">
                      <span className="bb-field__label">Scale U</span>
                      <input
                        type="number"
                        className="bb-input"
                        step="0.1"
                        disabled={disabled}
                        value={surfaceUv.scale.x}
                        onChange={(e) => assignSelectedSurfaceUv({
                          scale: { x: Number(e.target.value), y: surfaceUv.scale.y },
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Scale V</span>
                      <input
                        type="number"
                        className="bb-input"
                        step="0.1"
                        disabled={disabled}
                        value={surfaceUv.scale.y}
                        onChange={(e) => assignSelectedSurfaceUv({
                          scale: { x: surfaceUv.scale.x, y: Number(e.target.value) },
                        })}
                      />
                    </label>
                  </div>
                  <div className="bb-axis-row">
                    <label className="bb-field">
                      <span className="bb-field__label">Offset U</span>
                      <input
                        type="number"
                        className="bb-input"
                        step="0.05"
                        disabled={disabled}
                        value={surfaceUv.offset.x}
                        onChange={(e) => assignSelectedSurfaceUv({
                          offset: { x: Number(e.target.value), y: surfaceUv.offset.y },
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Offset V</span>
                      <input
                        type="number"
                        className="bb-input"
                        step="0.05"
                        disabled={disabled}
                        value={surfaceUv.offset.y}
                        onChange={(e) => assignSelectedSurfaceUv({
                          offset: { x: surfaceUv.offset.x, y: Number(e.target.value) },
                        })}
                      />
                    </label>
                  </div>
                  <label className="bb-field">
                    <span className="bb-field__label">Rotation (°)</span>
                    <input
                      type="number"
                      className="bb-input"
                      step="1"
                      disabled={disabled}
                      value={surfaceUv.rotation}
                      onChange={(e) => assignSelectedSurfaceUv({
                        rotation: Number(e.target.value),
                      })}
                    />
                  </label>
                  <div className="bb-details-actions">
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled || !hasSurfaceUv}
                      onClick={() => resetSelectedSurfaceUv()}
                    >
                      Reset Surface UV
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => setSelectedSurface(null)}
                    >
                      Clear surface selection
                    </button>
                  </div>
                </Collapsible>
              );
            })()}

            <Collapsible title="Hierarchy" storageKey="details.hierarchy">
              <label className="bb-field" {...helpProps('details.parent')}>
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
              <label className="bb-field" {...helpProps('details.visible')}>
                <span className="bb-field__label">Visible</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selectedActor.visible !== false}
                  onChange={(e) => setSelectedActorFlags({ visible: e.target.checked })}
                />
              </label>
              <label className="bb-field" {...helpProps('details.locked')}>
                <span className="bb-field__label">Locked</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(selectedActor.locked)}
                  onChange={(e) => setSelectedActorFlags({ locked: e.target.checked })}
                />
              </label>
              <div className="bb-details-actions">
                <button
                  type="button"
                  className="bb-btn"
                  disabled={disabled}
                  onClick={() => createCell()}
                  {...helpProps('details.newCell', disabled ? 'Unavailable during Play mode.' : null)}
                >
                  New Cell
                </button>
                {selectedActor.getComponent('Cell') && selectedActorIds.length > 1 && (
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    onClick={() => assignSelectedToCell(selectedActor.id)}
                    {...helpProps('details.parentSelection', disabled ? 'Unavailable during Play mode.' : null)}
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
                      {...helpProps('details.prefab.record', disabled ? 'Unavailable during Play mode.' : null)}
                    >
                      Record Override
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => revertSelectedPrefabOverride()}
                      title="Clear overrides for this template and resync from source"
                      {...helpProps('details.prefab.revert', disabled ? 'Unavailable during Play mode.' : null)}
                    >
                      Revert Override
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => applyPrefabSourceUpdate(selectedActor.prefab.prefabId)}
                      {...helpProps('details.prefab.apply', disabled ? 'Unavailable during Play mode.' : null)}
                    >
                      Apply Source
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => updatePrefabAssetFromSelection()}
                      {...helpProps('details.prefab.update', disabled ? 'Unavailable during Play mode.' : null)}
                    >
                      Update Source
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => unpackSelectedPrefab()}
                      {...helpProps('details.prefab.unpack', disabled ? 'Unavailable during Play mode.' : null)}
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
                      onClick={async () => {
                        const name = await prompt('Prefab name', {
                          title: 'Create Prefab',
                          initialValue: selectedActor.name || 'Prefab',
                        });
                        if (name?.trim()) createPrefabFromSelection(name.trim());
                      }}
                      {...helpProps('details.prefab.create', disabled ? 'Unavailable during Play mode.' : null)}
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
                helpId="details.transform.location"
                onChange={(partial) => updateSelectedTransform({ position: partial })}
              />
              <div className="bb-field-caption">Rotation</div>
              <AxisInputs
                values={selectedActor.transform.rotation}
                step={1}
                disabled={disabled}
                helpId="details.transform.rotation"
                onChange={(partial) => updateSelectedTransform({ rotation: partial }, { snap: false })}
              />
              <div className="bb-field-caption">Scale</div>
              <AxisInputs
                values={selectedActor.transform.scale}
                step={0.1}
                disabled={disabled}
                helpId="details.transform.scale"
                onChange={(partial) => updateSelectedTransform({ scale: partial }, { snap: false })}
              />
            </Collapsible>

            {brush && (
              <Collapsible title="Brush" storageKey="details.brush">
                <label className="bb-field" {...helpProps('details.brush.operation')}>
                  <span className="bb-field__label">Operation</span>
                  <select
                    className="bb-input"
                    value={brush.operation === 'subtract' ? 'subtract' : 'add'}
                    disabled={disabled}
                    onChange={(e) => updateSelectedBrush({ operation: e.target.value })}
                  >
                    <option value="add">Add (solid)</option>
                    <option value="subtract">Subtract (cutter)</option>
                  </select>
                </label>
                <div className="bb-field-caption">Dimensions</div>
                <AxisInputs
                  values={brush.size}
                  step={gridSize}
                  disabled={disabled}
                  helpId="details.brush.size"
                  onChange={(partial) => updateSelectedBrush({ size: partial })}
                />
                <label className="bb-field" {...helpProps('details.brush.color')}>
                  <span className="bb-field__label">Fallback Color</span>
                  <input
                    className="bb-input"
                    type="color"
                    value={normalizeHex(brush.color)}
                    disabled={disabled}
                    onChange={(e) => updateSelectedBrush({ color: e.target.value })}
                  />
                </label>
                <label className="bb-field" {...helpProps('details.collision.collidable')}>
                  <span className="bb-field__label">Collidable</span>
                  <input
                    type="checkbox"
                    checked={brush.operation !== 'subtract' && brush.collidable !== false}
                    disabled={disabled || brush.operation === 'subtract'}
                    onChange={(e) => updateSelectedBrush({ collidable: e.target.checked })}
                  />
                </label>
                {brush.operation === 'subtract' && (
                  <p className="bb-muted">
                    Subtractive brushes carve overlapping additive solids. They never generate
                    colliders and are hidden in Play mode.
                  </p>
                )}
                {brush.operation !== 'subtract' && (() => {
                  const eligibility = canConvertActorToConvex(selectedActor, world);
                  return (
                    <div className="bb-details-actions" style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="bb-btn"
                        disabled={disabled || !eligibility.ok}
                        title={eligibility.ok ? 'Convert to editable ConvexBrush' : eligibility.message}
                        onClick={() => convertSelectedToConvexBrush()}
                      >
                        Convert to Convex Brush
                      </button>
                      {!eligibility.ok && (
                        <p className="bb-muted">{eligibility.message}</p>
                      )}
                      {eligibility.ok && (
                        <p className="bb-muted">
                          Creates an editable convex brush. Parametric size, openings, and miters
                          are baked. Undo restores the original Brush.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </Collapsible>
            )}

            {convexBrush && (() => {
              const info = describeConvexBrush(selectedActor);
              const conflicts = listCutterConvexConflicts(world)
                .filter((c) => c.convexId === selectedActor.id);
              return (
                <Collapsible title="Convex Brush" storageKey="details.convexBrush" defaultOpen>
                  {!info?.valid && (
                    <p className="bb-muted">
                      Invalid geometry
                      {info?.error?.code ? ` (${info.error.code})` : ''}:
                      {' '}
                      {info?.message || 'disabled'}
                    </p>
                  )}
                  {info?.valid && (
                    <p className="bb-muted">
                      {info.vertices} verts · {info.faces} faces · volume {info.volume.toFixed(1)} eu³
                      {info.provenance ? ` · from ${info.provenance}` : ''}
                    </p>
                  )}
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      value={normalizeHex(convexBrush.color)}
                      disabled={disabled}
                      onChange={(e) => updateSelectedConvexBrush({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={convexBrush.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedConvexBrush({ collidable: e.target.checked })}
                    />
                  </label>
                  {conflicts.length > 0 && (
                    <p className="bb-muted">
                      Warning: {conflicts.length} subtractive cutter(s) overlap this ConvexBrush.
                      Cutters do not carve ConvexBrush geometry.
                    </p>
                  )}
                  <p className="bb-muted">
                    Face / edge / vertex editing arrives in Phase 2F.1+. Surface materials and UVs
                    work now via the Surface tool.
                  </p>
                </Collapsible>
              );
            })()}

            {(brush || convexBrush) && (() => {
              const matComp = brush || convexBrush;
              const updateMat = brush ? updateSelectedBrush : updateSelectedConvexBrush;
              return (
              <Collapsible title="Material" storageKey="details.material">
                <label className="bb-field" {...helpProps('details.material.id')}>
                  <span className="bb-field__label">Material</span>
                  <select
                    className="bb-select"
                    disabled={disabled}
                    value={matComp.materialId || ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      updateMat({ materialId: id });
                      if (id) selectAsset(id);
                    }}
                  >
                    <option value="">(fallback color)</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                {selectedAsset?.type === 'material' && selectedAsset.id !== matComp.materialId && (
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    onClick={() => updateMat({ materialId: selectedAsset.id })}
                  >
                    Assign selected: {selectedAsset.name}
                  </button>
                )}
                <div className="bb-field-caption">UV Scale</div>
                <div className="bb-axis-row" {...helpProps('details.material.uv')}>
                  <span className="bb-axis">U</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.1}
                    disabled={disabled}
                    value={matComp.uv?.scale?.x ?? 1}
                    onChange={(e) => updateMat({
                      uv: {
                        ...matComp.uv,
                        scale: { ...matComp.uv.scale, x: Number(e.target.value) },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.1}
                    disabled={disabled}
                    value={matComp.uv?.scale?.y ?? 1}
                    onChange={(e) => updateMat({
                      uv: {
                        ...matComp.uv,
                        scale: { ...matComp.uv.scale, y: Number(e.target.value) },
                      },
                    })}
                  />
                </div>
                <div className="bb-field-caption">UV Offset</div>
                <div className="bb-axis-row" {...helpProps('details.material.uv')}>
                  <span className="bb-axis">U</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.05}
                    disabled={disabled}
                    value={matComp.uv?.offset?.x ?? 0}
                    onChange={(e) => updateMat({
                      uv: {
                        ...matComp.uv,
                        offset: { ...matComp.uv.offset, x: Number(e.target.value) },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={0.05}
                    disabled={disabled}
                    value={matComp.uv?.offset?.y ?? 0}
                    onChange={(e) => updateMat({
                      uv: {
                        ...matComp.uv,
                        offset: { ...matComp.uv.offset, y: Number(e.target.value) },
                      },
                    })}
                  />
                </div>
                <label className="bb-field" {...helpProps('details.material.uv')}>
                  <span className="bb-field__label">UV Rotation°</span>
                  <input
                    className="bb-input"
                    type="number"
                    step={1}
                    disabled={disabled}
                    value={matComp.uv?.rotation ?? 0}
                    onChange={(e) => updateMat({
                      uv: { ...matComp.uv, rotation: Number(e.target.value) },
                    })}
                  />
                </label>

                <div className="bb-field-caption">Per-face overrides</div>
                {(brush ? FACE_KEYS : (convexBrush?.geometry?.faces || []).map((f) => f.id)).map((face) => (
                  <label key={face} className="bb-field">
                    <span className="bb-field__label">{face}</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={matComp.faceMaterials?.[face] || ''}
                      onChange={(e) => {
                        const next = { ...(matComp.faceMaterials || {}) };
                        if (!e.target.value) delete next[face];
                        else next[face] = e.target.value;
                        updateMat({
                          faceMaterials: Object.keys(next).length ? next : null,
                        });
                      }}
                    >
                      <option value="">(actor material)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </label>
                ))}

                {matComp.materialId && (
                  <MaterialDefinitionEditor
                    materialId={matComp.materialId}
                    disabled={disabled}
                    getMaterialDefinition={getMaterialDefinition}
                    saveMaterialDefinition={saveMaterialDefinition}
                  />
                )}
              </Collapsible>
              );
            })()}

            {(brush && isWallBrush(selectedActor) && brush.operation !== 'subtract') || curvedWall ? (
              <Collapsible title="Wall Join" storageKey="details.wallJoin" defaultOpen={false}>
                <div {...helpProps('details.wallJoin')}>
                  <p className="bb-muted">
                    Snap this wall’s endpoint to the nearest neighboring wall endpoint and apply miters. Walls stay separate actors.
                  </p>
                  <div className="bb-field-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => joinSelectedWallToNearest({ movingEndId: 'start' })}
                    >
                      Join Start
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => joinSelectedWallToNearest({ movingEndId: 'end' })}
                    >
                      Join End
                    </button>
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => joinSelectedWallToNearest({ movingEndId: 'end', orient: true })}
                    >
                      Join End + Orient
                    </button>
                  </div>
                  {brush && (
                    <>
                      <label className="bb-field">
                        <span className="bb-field__label">Miter Start (°)</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={1}
                          disabled={disabled}
                          value={brush.miterStart || 0}
                          onChange={(e) => updateSelectedBrush({ miterStart: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Miter End (°)</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={1}
                          disabled={disabled}
                          value={brush.miterEnd || 0}
                          onChange={(e) => updateSelectedBrush({ miterEnd: Number(e.target.value) })}
                        />
                      </label>
                      {brush.openings?.length > 0 && (Math.abs(brush.miterStart) > 0.01 || Math.abs(brush.miterEnd) > 0.01) && (
                        <p className="bb-muted">
                          Miters are ignored in mesh/collision while openings are present (openings use the rectangular solid path).
                        </p>
                      )}
                    </>
                  )}
                </div>
              </Collapsible>
            ) : null}

            {brush && brush.operation !== 'subtract' && isWallBrush(selectedActor) && (
              <Collapsible title="Openings" storageKey="details.openings">
                <div className="bb-field-row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    {...helpProps('details.openings.addDoor')}
                    onClick={() => addBrushOpening('door')}
                  >
                    Add Door
                  </button>
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    {...helpProps('details.openings.addWindow')}
                    onClick={() => addBrushOpening('window')}
                  >
                    Add Window
                  </button>
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    {...helpProps('details.openings.arch')}
                    onClick={() => addBrushOpening('arch-roman')}
                  >
                    Add Roman Arch
                  </button>
                  <button
                    type="button"
                    className="bb-btn"
                    disabled={disabled}
                    {...helpProps('details.openings.arch')}
                    onClick={() => addBrushOpening('arch-gothic')}
                  >
                    Add Gothic Arch
                  </button>
                </div>
                {normalizeOpenings(brush.openings).length === 0 && (
                  <p className="bb-muted" {...helpProps('details.openings')}>
                    No openings. Add a door, window, or arched opening; geometry and collision update automatically.
                  </p>
                )}
                {normalizeOpenings(brush.openings).map((opening) => (
                  <div
                    key={opening.id}
                    className="bb-opening-card"
                    style={{
                      borderTop: '1px solid var(--bb-border, #333)',
                      paddingTop: 8,
                      marginTop: 8,
                    }}
                    {...helpProps(opening.profile !== 'rect' ? 'details.openings.arch' : 'details.openings.fields')}
                  >
                    <label className="bb-field">
                      <span className="bb-field__label">Type</span>
                      <select
                        className="bb-select"
                        disabled={disabled}
                        value={opening.type}
                        onChange={(e) => updateBrushOpening(opening.id, { type: e.target.value })}
                      >
                        <option value="door">Door</option>
                        <option value="window">Window</option>
                      </select>
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Profile</span>
                      <select
                        className="bb-select"
                        disabled={disabled}
                        value={opening.profile || 'rect'}
                        onChange={(e) => {
                          const profile = e.target.value;
                          const patch = { profile };
                          if (profile !== 'rect' && !(opening.rise > 0)) {
                            patch.rise = Math.round(opening.width * 0.5);
                          }
                          if (profile === 'rect') patch.rise = 0;
                          updateBrushOpening(opening.id, patch);
                        }}
                      >
                        <option value="rect">Rectangular</option>
                        <option value="roman">Roman arch</option>
                        <option value="gothic">Gothic arch</option>
                      </select>
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Offset</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.offset}
                        onChange={(e) => updateBrushOpening(opening.id, {
                          offset: Number(e.target.value),
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Bottom</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.bottom}
                        onChange={(e) => updateBrushOpening(opening.id, {
                          bottom: Number(e.target.value),
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Width</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.width}
                        onChange={(e) => updateBrushOpening(opening.id, {
                          width: Number(e.target.value),
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Height</span>
                      <input
                        className="bb-input"
                        type="number"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.height}
                        onChange={(e) => updateBrushOpening(opening.id, {
                          height: Number(e.target.value),
                        })}
                      />
                    </label>
                    {(opening.profile === 'roman' || opening.profile === 'gothic') && (
                      <>
                        <label className="bb-field">
                          <span className="bb-field__label">Arch Rise</span>
                          <input
                            className="bb-input"
                            type="number"
                            step={gridSize}
                            disabled={disabled}
                            value={opening.rise}
                            onChange={(e) => updateBrushOpening(opening.id, {
                              rise: Number(e.target.value),
                            })}
                          />
                        </label>
                        <label className="bb-field">
                          <span className="bb-field__label">Curve Segments</span>
                          <input
                            className="bb-input"
                            type="number"
                            min={4}
                            max={48}
                            step={1}
                            disabled={disabled}
                            value={opening.curveResolution}
                            onChange={(e) => updateBrushOpening(opening.id, {
                              curveResolution: Number(e.target.value),
                            })}
                          />
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled}
                      onClick={() => removeBrushOpening(opening.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </Collapsible>
            )}

            {brush && (
              <Collapsible title="Collision" storageKey="details.collision" defaultOpen={false}>
                <p className="bb-muted" {...helpProps('details.collision.collidable')}>
                  {brush.operation === 'subtract'
                    ? 'Subtractive brushes never generate Rapier colliders. Carved openings in additive brushes update collision from the remaining solids.'
                    : 'Play mode builds Rapier box collider(s) from brush solids (including openings and subtractive cuts) at the actor’s world transform when Collidable is enabled.'}
                </p>
              </Collapsible>
            )}

            {ramp && (
              <Collapsible title="Ramp" storageKey="details.ramp">
                <div {...helpProps('details.ramp')}>
                  <label className="bb-field">
                    <span className="bb-field__label">Width</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.width}
                      onChange={(e) => updateSelectedRamp({ width: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Length (run)</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.length}
                      onChange={(e) => updateSelectedRamp({ length: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Rise</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.rise}
                      onChange={(e) => updateSelectedRamp({ rise: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Direction</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={ramp.direction}
                      onChange={(e) => updateSelectedRamp({ direction: e.target.value })}
                    >
                      <option value="z+">+Z (rise toward +Z)</option>
                      <option value="z-">−Z (rise toward −Z)</option>
                      <option value="x+">+X (rise toward +X)</option>
                      <option value="x-">−X (rise toward −X)</option>
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Thickness</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.thickness}
                      onChange={(e) => updateSelectedRamp({ thickness: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      disabled={disabled}
                      value={normalizeHex(ramp.color)}
                      onChange={(e) => updateSelectedRamp({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={ramp.materialId || ''}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        updateSelectedRamp({ materialId: id });
                      }}
                    >
                      <option value="">(fallback color)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={ramp.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedRamp({ collidable: e.target.checked })}
                    />
                  </label>
                  <p className="bb-muted">
                    Collision uses a rotated slab along the slope hypotenuse, not a full bounding box.
                  </p>
                </div>
              </Collapsible>
            )}

            {stair && (
              <Collapsible title="Stairs" storageKey="details.stair">
                <div {...helpProps('details.stair')}>
                  <label className="bb-field" {...helpProps('details.stair.type')}>
                    <span className="bb-field__label">Type</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={stair.stairType || 'straight'}
                      onChange={(e) => updateSelectedStair({ stairType: e.target.value })}
                    >
                      <option value="straight">Straight</option>
                      <option value="curved">Curved</option>
                      <option value="spiral">Spiral</option>
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Width</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.width}
                      onChange={(e) => updateSelectedStair({ width: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Step Count</span>
                    <input
                      className="bb-input"
                      type="number"
                      min={1}
                      step={1}
                      disabled={disabled}
                      value={stair.stepCount}
                      onChange={(e) => updateSelectedStair({ stepCount: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Step Height</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.stepHeight}
                      onChange={(e) => updateSelectedStair({ stepHeight: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Total Rise</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.totalRise}
                      onChange={(e) => updateSelectedStair({ totalRise: Number(e.target.value) })}
                    />
                  </label>
                  {(stair.stairType || 'straight') === 'straight' && (
                    <>
                      <label className="bb-field">
                        <span className="bb-field__label">Tread Depth</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={stair.treadDepth}
                          onChange={(e) => updateSelectedStair({ treadDepth: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Direction</span>
                        <select
                          className="bb-select"
                          disabled={disabled}
                          value={stair.direction}
                          onChange={(e) => updateSelectedStair({ direction: e.target.value })}
                        >
                          <option value="z+">+Z</option>
                          <option value="z-">−Z</option>
                          <option value="x+">+X</option>
                          <option value="x-">−X</option>
                        </select>
                      </label>
                    </>
                  )}
                  {(stair.stairType === 'curved' || stair.stairType === 'spiral') && (
                    <>
                      <label className="bb-field" {...helpProps('details.stair.innerRadius')}>
                        <span className="bb-field__label">Inner Radius</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={stair.innerRadius}
                          onChange={(e) => updateSelectedStair({ innerRadius: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bb-field" {...helpProps('details.stair.sweep')}>
                        <span className="bb-field__label">Sweep Angle (°)</span>
                        <input
                          className="bb-input"
                          type="number"
                          min={1}
                          max={720}
                          step={15}
                          disabled={disabled}
                          value={stair.sweepAngle}
                          onChange={(e) => updateSelectedStair({ sweepAngle: Number(e.target.value) })}
                        />
                      </label>
                      <div className="bb-seg" style={{ marginBottom: 8 }}>
                        {[90, 180, 270, 360].map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            className={`bb-btn${Number(stair.sweepAngle) === deg ? ' bb-btn--active' : ''}`}
                            disabled={disabled}
                            onClick={() => updateSelectedStair({ sweepAngle: deg })}
                          >
                            {deg}°
                          </button>
                        ))}
                      </div>
                      <label className="bb-field" {...helpProps('details.stair.winding')}>
                        <span className="bb-field__label">Winding</span>
                        <select
                          className="bb-select"
                          disabled={disabled}
                          value={stair.clockwise !== false ? 'cw' : 'ccw'}
                          onChange={(e) => updateSelectedStair({
                            clockwise: e.target.value === 'cw',
                          })}
                        >
                          <option value="cw">Clockwise</option>
                          <option value="ccw">Counterclockwise</option>
                        </select>
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Start Angle (°)</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={15}
                          disabled={disabled}
                          value={stair.startAngle}
                          onChange={(e) => updateSelectedStair({ startAngle: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      disabled={disabled}
                      value={normalizeHex(stair.color)}
                      onChange={(e) => updateSelectedStair({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={stair.materialId || ''}
                      onChange={(e) => updateSelectedStair({ materialId: e.target.value || null })}
                    >
                      <option value="">(fallback color)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={stair.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedStair({ collidable: e.target.checked })}
                    />
                  </label>
                  <p className="bb-muted">
                    {(stair.stairType || 'straight') === 'straight'
                      ? `Straight · ${stair.stepCount} step boxes · run ${Math.round(stair.length)} · rise ${Math.round(stair.totalRise)}`
                      : `${stair.stairType === 'spiral' ? 'Spiral' : 'Curved'} · ${stair.stepCount} wedge steps · sweep ${stair.sweepAngle}° · rise ${Math.round(stair.totalRise)}`}
                  </p>
                </div>
              </Collapsible>
            )}

            {column && (
              <Collapsible title="Column" storageKey="details.column">
                <div {...helpProps('details.column')}>
                  <label className="bb-field">
                    <span className="bb-field__label">Shape</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={column.shape}
                      onChange={(e) => updateSelectedColumn({ shape: e.target.value })}
                    >
                      <option value="round">Round</option>
                      <option value="square">Square</option>
                      <option value="hexagon">Hexagon</option>
                      <option value="octagon">Octagon</option>
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Height</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={column.height}
                      onChange={(e) => updateSelectedColumn({ height: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Radius / Width</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={column.radius}
                      onChange={(e) => updateSelectedColumn({ radius: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Sides</span>
                    <input
                      className="bb-input"
                      type="number"
                      min={3}
                      max={64}
                      step={1}
                      disabled={disabled}
                      value={column.sides}
                      onChange={(e) => updateSelectedColumn({ sides: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Base</span>
                    <input
                      type="checkbox"
                      checked={column.baseEnabled !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedColumn({ baseEnabled: e.target.checked })}
                    />
                  </label>
                  {column.baseEnabled !== false && (
                    <>
                      <label className="bb-field">
                        <span className="bb-field__label">Base Height</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={column.baseHeight}
                          onChange={(e) => updateSelectedColumn({ baseHeight: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Base Radius</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={column.baseRadius ?? Math.round(column.radius * 1.25)}
                          onChange={(e) => updateSelectedColumn({ baseRadius: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  <label className="bb-field">
                    <span className="bb-field__label">Capital</span>
                    <input
                      type="checkbox"
                      checked={column.capitalEnabled !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedColumn({ capitalEnabled: e.target.checked })}
                    />
                  </label>
                  {column.capitalEnabled !== false && (
                    <>
                      <label className="bb-field">
                        <span className="bb-field__label">Capital Height</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={column.capitalHeight}
                          onChange={(e) => updateSelectedColumn({ capitalHeight: Number(e.target.value) })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Capital Radius</span>
                        <input
                          className="bb-input"
                          type="number"
                          step={gridSize}
                          disabled={disabled}
                          value={column.capitalRadius ?? Math.round(column.radius * 1.2)}
                          onChange={(e) => updateSelectedColumn({ capitalRadius: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      disabled={disabled}
                      value={normalizeHex(column.color)}
                      onChange={(e) => updateSelectedColumn({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={column.materialId || ''}
                      onChange={(e) => updateSelectedColumn({ materialId: e.target.value || null })}
                    >
                      <option value="">(fallback color)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={column.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedColumn({ collidable: e.target.checked })}
                    />
                  </label>
                </div>
              </Collapsible>
            )}

            {curvedWall && (
              <Collapsible title="Curved Wall" storageKey="details.curvedWall">
                <div {...helpProps('details.curvedWall')}>
                  <label className="bb-field">
                    <span className="bb-field__label">Radius</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.radius}
                      onChange={(e) => updateSelectedCurvedWall({ radius: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Sweep Angle (°)</span>
                    <input
                      className="bb-input"
                      type="number"
                      min={1}
                      max={360}
                      step={5}
                      disabled={disabled}
                      value={curvedWall.sweepAngle}
                      onChange={(e) => updateSelectedCurvedWall({ sweepAngle: Number(e.target.value) })}
                    />
                  </label>
                  <div className="bb-seg" style={{ marginBottom: 8 }}>
                    {[45, 90, 180, 360].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        className={`bb-btn${Number(curvedWall.sweepAngle) === deg ? ' bb-btn--active' : ''}`}
                        disabled={disabled}
                        onClick={() => updateSelectedCurvedWall({ sweepAngle: deg })}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                  <label className="bb-field">
                    <span className="bb-field__label">Start Angle (°)</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={5}
                      disabled={disabled}
                      value={curvedWall.startAngle}
                      onChange={(e) => updateSelectedCurvedWall({ startAngle: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Height</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.height}
                      onChange={(e) => updateSelectedCurvedWall({ height: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Thickness</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.thickness}
                      onChange={(e) => updateSelectedCurvedWall({ thickness: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Curve Resolution</span>
                    <input
                      className="bb-input"
                      type="number"
                      min={4}
                      max={128}
                      step={1}
                      disabled={disabled}
                      value={curvedWall.curveResolution}
                      onChange={(e) => updateSelectedCurvedWall({ curveResolution: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Clockwise</span>
                    <input
                      type="checkbox"
                      checked={Boolean(curvedWall.clockwise)}
                      disabled={disabled}
                      onChange={(e) => updateSelectedCurvedWall({ clockwise: e.target.checked })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      disabled={disabled}
                      value={normalizeHex(curvedWall.color)}
                      onChange={(e) => updateSelectedCurvedWall({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={curvedWall.materialId || ''}
                      onChange={(e) => updateSelectedCurvedWall({ materialId: e.target.value || null })}
                    >
                      <option value="">(fallback color)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={curvedWall.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedCurvedWall({ collidable: e.target.checked })}
                    />
                  </label>
                  <p className="bb-muted">
                    Openings are not supported on curved walls. Cut doors/arches in adjacent straight wall segments.
                  </p>
                </div>
              </Collapsible>
            )}

            {arch && (
              <Collapsible title="Arch" storageKey="details.arch">
                <div {...helpProps('details.arch')}>
                  <label className="bb-field">
                    <span className="bb-field__label">Type</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={arch.archType}
                      onChange={(e) => updateSelectedArch({ archType: e.target.value })}
                    >
                      <option value="roman">Roman (rounded)</option>
                      <option value="gothic">Gothic (pointed)</option>
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Opening Width</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.openingWidth}
                      onChange={(e) => updateSelectedArch({ openingWidth: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Opening Height</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.openingHeight}
                      onChange={(e) => updateSelectedArch({ openingHeight: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Arch Rise</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.archRise}
                      onChange={(e) => updateSelectedArch({ archRise: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Thickness</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.thickness}
                      onChange={(e) => updateSelectedArch({ thickness: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Depth</span>
                    <input
                      className="bb-input"
                      type="number"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.depth}
                      onChange={(e) => updateSelectedArch({ depth: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Curve Resolution</span>
                    <input
                      className="bb-input"
                      type="number"
                      min={4}
                      max={64}
                      step={1}
                      disabled={disabled}
                      value={arch.curveResolution}
                      onChange={(e) => updateSelectedArch({ curveResolution: Number(e.target.value) })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Fallback Color</span>
                    <input
                      className="bb-input"
                      type="color"
                      disabled={disabled}
                      value={normalizeHex(arch.color)}
                      onChange={(e) => updateSelectedArch({ color: e.target.value })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Material</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={arch.materialId || ''}
                      onChange={(e) => updateSelectedArch({ materialId: e.target.value || null })}
                    >
                      <option value="">(fallback color)</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Collidable</span>
                    <input
                      type="checkbox"
                      checked={arch.collidable !== false}
                      disabled={disabled}
                      onChange={(e) => updateSelectedArch({ collidable: e.target.checked })}
                    />
                  </label>
                  <p className="bb-muted">
                    Freestanding arch with an open passage. Collision uses piers plus segmented arch solids.
                  </p>
                </div>
              </Collapsible>
            )}

            {light && (
              <Collapsible title="Light" storageKey="details.light">
                <div {...helpProps('details.light')}>
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
                </div>
              </Collapsible>
            )}

            {staticMesh && (
              <Collapsible title="Static Mesh" storageKey="details.staticMesh">
                <div {...helpProps('details.staticMesh')}>
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
                </div>
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
  const { setWorkspace } = useLayout();
  const [baseline, setBaseline] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBaseline(null);
    setDraft(null);
    getMaterialDefinition(materialId).then((d) => {
      if (cancelled || !d) return;
      const cloned = cloneMaterialDraft(d);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(d));
    });
    return () => { cancelled = true; };
  }, [materialId, getMaterialDefinition]);

  if (!draft) {
    return <p className="bb-muted">Loading material…</p>;
  }

  const dirty = isMaterialDraftDirty(baseline, draft);

  const onCancel = () => {
    if (!baseline) return;
    setDraft(cloneMaterialDraft(baseline));
  };

  const onSave = async () => {
    if (!dirty || disabled) return;
    const payload = materialDraftToSavePayload(draft);
    if (!payload) return;
    setSaving(true);
    try {
      const saved = await saveMaterialDefinition(materialId, payload);
      const cloned = cloneMaterialDraft(saved);
      setBaseline(cloned);
      setDraft(cloneMaterialDraft(saved));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bb-material-def">
      <div className="bb-field-caption">
        Shared material asset
        {dirty ? ' • unsaved' : ''}
      </div>
      <div className="bb-field-row" style={{ gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !dirty || saving}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={disabled || !dirty || saving}
          onClick={() => { void onSave(); }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled}
          onClick={() => { void setWorkspace('materials'); }}
          title="Open Materials workspace"
        >
          Materials…
        </button>
      </div>
      <MaterialDefinitionForm
        draft={draft}
        onChange={setDraft}
        disabled={disabled || saving}
      />
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
