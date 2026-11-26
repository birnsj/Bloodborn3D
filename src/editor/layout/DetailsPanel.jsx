import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from './LayoutContext.jsx';
import { Collapsible, CollapsibleGroup } from '../../ui/Collapsible.jsx';
import { ScrubAxisLabel, ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { FACE_KEYS } from '../../materials/MaterialDefinition.js';
import { listByKind, ASSET_KINDS, isEnvironmentMapAsset } from '../../assets/AssetRegistry.js';
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
import {
  DEFAULT_WORLD_AMBIENT,
  DEFAULT_WORLD_SCENE,
  DEFAULT_WORLD_RENDERER,
  WORLD_FOG_TYPES,
  WORLD_FOG_VOLUMETRIC_STEPS,
  WORLD_BACKGROUND_TYPES,
  WORLD_TONE_MAPPINGS,
  WORLD_SHADOW_MAP_TYPES,
  WORLD_OUTPUT_COLOR_SPACES,
  normalizeWorldScene,
  normalizeWorldRenderer,
  normalizeWorldAmbient,
} from '../../core/World.js';
import { PostProcessingSettings } from '../postprocessing/PostProcessingSettings.jsx';
import {
  LIGHT_TYPES,
  LENSFLARE_PRESETS,
  createLensflareFromPreset,
  lightAuthorableSnapshot,
} from '../../components/LightComponent.js';
import {
  ENVIRONMENT_TYPES,
  ENV_RT_RESOLUTIONS,
  environmentAuthorableSnapshot,
} from '../../components/EnvironmentComponent.js';

/**
 * Live-preview scrub with one undo entry per completed gesture.
 * @param {'scene'|'renderer'|'ambient'} kind
 */
function useWorldNumericGesture(kind) {
  const {
    world,
    updateWorldScene,
    commitWorldSceneGesture,
    updateWorldRenderer,
    commitWorldRendererGesture,
    updateWorldAmbient,
    commitWorldAmbientGesture,
  } = useEditor();
  const beforeRef = useRef(null);

  const begin = useCallback(() => {
    if (!world || beforeRef.current) return;
    if (kind === 'renderer') {
      beforeRef.current = structuredClone(normalizeWorldRenderer(world.renderer));
    } else if (kind === 'ambient') {
      beforeRef.current = structuredClone(normalizeWorldAmbient(world.ambient));
    } else {
      beforeRef.current = structuredClone(normalizeWorldScene(world.scene));
    }
  }, [world, kind]);

  const live = useCallback((partial) => {
    if (kind === 'renderer') updateWorldRenderer?.(partial, { undoable: false });
    else if (kind === 'ambient') updateWorldAmbient?.(partial, { undoable: false });
    else updateWorldScene?.(partial, { undoable: false });
  }, [kind, updateWorldScene, updateWorldRenderer, updateWorldAmbient]);

  const commit = useCallback((label) => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    if (kind === 'renderer') commitWorldRendererGesture?.(before, label);
    else if (kind === 'ambient') commitWorldAmbientGesture?.(before, label);
    else commitWorldSceneGesture?.(before, label);
  }, [kind, commitWorldSceneGesture, commitWorldRendererGesture, commitWorldAmbientGesture]);

  const cancel = useCallback(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    if (kind === 'renderer') {
      updateWorldRenderer?.(before, { undoable: false, replace: true });
    } else if (kind === 'ambient') {
      updateWorldAmbient?.(before, { undoable: false, replace: true });
    } else {
      updateWorldScene?.(before, { undoable: false, replace: true });
    }
  }, [kind, updateWorldScene, updateWorldRenderer, updateWorldAmbient]);

  return { begin, live, commit, cancel };
}

function WorldScrubNumber({
  kind = 'scene',
  patch,
  label = 'Edit world setting',
  value,
  disabled,
  step,
  min,
  max,
  className = 'bb-input',
}) {
  const gesture = useWorldNumericGesture(kind);
  return (
    <ScrubNumberInput
      className={className}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={value}
      onGestureStart={gesture.begin}
      onChange={(v) => gesture.live(typeof patch === 'function' ? patch(v) : { [patch]: v })}
      onCommit={() => gesture.commit(label)}
      onCancel={gesture.cancel}
    />
  );
}

function LightScrubNumber({
  light,
  field,
  map,
  label = 'Edit light',
  value,
  disabled,
  step,
  min,
  max,
}) {
  const { updateSelectedLight, commitLightGesture } = useEditor();
  const beforeRef = useRef(null);

  return (
    <ScrubNumberInput
      className="bb-input"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onGestureStart={() => {
        if (!light || beforeRef.current) return;
        beforeRef.current = lightAuthorableSnapshot(light);
      }}
      onChange={(v) => {
        const partial = typeof map === 'function' ? map(v) : { [field]: v };
        updateSelectedLight(partial, { undoable: false });
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitLightGesture?.(before, label);
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (!before) return;
        updateSelectedLight(before, { undoable: false });
      }}
    />
  );
}

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
    geometryMode,
    geometrySelection,
    clipSession,
    commitExtrudeFace,
    previewExtrudeFace,
    beginClipSession,
    setClipSessionMode,
    cancelClipSession,
    setClipPlaneFromFace,
    commitClipSession,
    addBrushOpening,
    updateBrushOpening,
    removeBrushOpening,
    updateSelectedLight,
    updateSelectedEnvironment,
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
  const environment = selectedActor?.getComponent('Environment');
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

            <CollapsibleGroup storagePrefixes={['details.']}>
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
                  <label className="bb-field" {...helpProps('details.surface.material')}>
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
                  <div className="bb-axis-row" {...helpProps('details.surface.uv')}>
                    <label className="bb-field">
                      <span className="bb-field__label">Scale U</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step="0.1"
                        disabled={disabled}
                        value={surfaceUv.scale.x}
                        onChange={(v) => assignSelectedSurfaceUv({
                          scale: { x: v, y: surfaceUv.scale.y },
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Scale V</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step="0.1"
                        disabled={disabled}
                        value={surfaceUv.scale.y}
                        onChange={(v) => assignSelectedSurfaceUv({
                          scale: { x: surfaceUv.scale.x, y: v },
                        })}
                      />
                    </label>
                  </div>
                  <div className="bb-axis-row" {...helpProps('details.surface.uv')}>
                    <label className="bb-field">
                      <span className="bb-field__label">Offset U</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step="0.05"
                        disabled={disabled}
                        value={surfaceUv.offset.x}
                        onChange={(v) => assignSelectedSurfaceUv({
                          offset: { x: v, y: surfaceUv.offset.y },
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Offset V</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step="0.05"
                        disabled={disabled}
                        value={surfaceUv.offset.y}
                        onChange={(v) => assignSelectedSurfaceUv({
                          offset: { x: surfaceUv.offset.x, y: v },
                        })}
                      />
                    </label>
                  </div>
                  <label className="bb-field" {...helpProps('details.surface.uv')}>
                    <span className="bb-field__label">Rotation (°)</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step="1"
                      disabled={disabled}
                      value={surfaceUv.rotation}
                      onChange={(v) => assignSelectedSurfaceUv({
                        rotation: v,
                      })}
                    />
                  </label>
                  <div className="bb-details-actions">
                    <button
                      type="button"
                      className="bb-btn"
                      disabled={disabled || !hasSurfaceUv}
                      onClick={() => resetSelectedSurfaceUv()}
                      {...helpProps('details.surface.resetUv')}
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
                    <div
                      className="bb-details-actions"
                      style={{ marginTop: '0.75rem' }}
                      data-bb-tutorial="details.convertConvex"
                    >
                      <button
                        type="button"
                        className="bb-btn"
                        disabled={disabled || !eligibility.ok}
                        title={eligibility.ok ? 'Convert to editable ConvexBrush' : eligibility.message}
                        onClick={() => convertSelectedToConvexBrush()}
                        {...helpProps(
                          'details.convex.convert',
                          disabled
                            ? 'Unavailable during Play mode.'
                            : (!eligibility.ok ? eligibility.message : null),
                        )}
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
                  <div {...helpProps('details.convexBrush')}>
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
                    Use Face / Edge / Vertex tools to edit. Extrude and Clip are below when a face
                    is selected (or start Clip from selected brushes).
                  </p>
                  </div>
                </Collapsible>
              );
            })()}

            {(brush || convexBrush) && (
              <Collapsible title="Extrude / Clip" storageKey="details.extrudeClip" defaultOpen>
                <div data-bb-tutorial="details.extrudeClip" {...helpProps('details.extrudeClip')}>
                <ExtrudeClipControls
                  disabled={mode === 'play'}
                  gridSize={gridSize}
                  geometryMode={geometryMode}
                  geometrySelection={geometrySelection}
                  clipSession={clipSession}
                  selectedActor={selectedActor}
                  commitExtrudeFace={commitExtrudeFace}
                  previewExtrudeFace={previewExtrudeFace}
                  beginClipSession={beginClipSession}
                  setClipSessionMode={setClipSessionMode}
                  cancelClipSession={cancelClipSession}
                  setClipPlaneFromFace={setClipPlaneFromFace}
                  commitClipSession={commitClipSession}
                />
                </div>
              </Collapsible>
            )}

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
                  <ScrubNumberInput
                    className="bb-input"
                    step={0.1}
                    disabled={disabled}
                    value={matComp.uv?.scale?.x ?? 1}
                    onChange={(v) => updateMat({
                      uv: {
                        ...matComp.uv,
                        scale: { ...matComp.uv.scale, x: v },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <ScrubNumberInput
                    className="bb-input"
                    step={0.1}
                    disabled={disabled}
                    value={matComp.uv?.scale?.y ?? 1}
                    onChange={(v) => updateMat({
                      uv: {
                        ...matComp.uv,
                        scale: { ...matComp.uv.scale, y: v },
                      },
                    })}
                  />
                </div>
                <div className="bb-field-caption">UV Offset</div>
                <div className="bb-axis-row" {...helpProps('details.material.uv')}>
                  <span className="bb-axis">U</span>
                  <ScrubNumberInput
                    className="bb-input"
                    step={0.05}
                    disabled={disabled}
                    value={matComp.uv?.offset?.x ?? 0}
                    onChange={(v) => updateMat({
                      uv: {
                        ...matComp.uv,
                        offset: { ...matComp.uv.offset, x: v },
                      },
                    })}
                  />
                  <span className="bb-axis">V</span>
                  <ScrubNumberInput
                    className="bb-input"
                    step={0.05}
                    disabled={disabled}
                    value={matComp.uv?.offset?.y ?? 0}
                    onChange={(v) => updateMat({
                      uv: {
                        ...matComp.uv,
                        offset: { ...matComp.uv.offset, y: v },
                      },
                    })}
                  />
                </div>
                <label className="bb-field" {...helpProps('details.material.uv')}>
                  <span className="bb-field__label">UV Rotation°</span>
                  <ScrubNumberInput
                    className="bb-input"
                    step={1}
                    disabled={disabled}
                    value={matComp.uv?.rotation ?? 0}
                    onChange={(v) => updateMat({
                      uv: { ...matComp.uv, rotation: v },
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
                        <ScrubNumberInput
                          className="bb-input"
                          step={1}
                          disabled={disabled}
                          value={brush.miterStart || 0}
                          onChange={(v) => updateSelectedBrush({ miterStart: v })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Miter End (°)</span>
                        <ScrubNumberInput
                          className="bb-input"
                          step={1}
                          disabled={disabled}
                          value={brush.miterEnd || 0}
                          onChange={(v) => updateSelectedBrush({ miterEnd: v })}
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
                      <ScrubNumberInput
                        className="bb-input"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.offset}
                        onChange={(v) => updateBrushOpening(opening.id, {
                          offset: v,
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Bottom</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.bottom}
                        onChange={(v) => updateBrushOpening(opening.id, {
                          bottom: v,
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Width</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.width}
                        onChange={(v) => updateBrushOpening(opening.id, {
                          width: v,
                        })}
                      />
                    </label>
                    <label className="bb-field">
                      <span className="bb-field__label">Height</span>
                      <ScrubNumberInput
                        className="bb-input"
                        step={gridSize}
                        disabled={disabled}
                        value={opening.height}
                        onChange={(v) => updateBrushOpening(opening.id, {
                          height: v,
                        })}
                      />
                    </label>
                    {(opening.profile === 'roman' || opening.profile === 'gothic') && (
                      <>
                        <label className="bb-field">
                          <span className="bb-field__label">Arch Rise</span>
                          <ScrubNumberInput
                            className="bb-input"
                            step={gridSize}
                            disabled={disabled}
                            value={opening.rise}
                            onChange={(v) => updateBrushOpening(opening.id, {
                              rise: v,
                            })}
                          />
                        </label>
                        <label className="bb-field">
                          <span className="bb-field__label">Curve Segments</span>
                          <ScrubNumberInput
                            className="bb-input"
                            min={4}
                            max={48}
                            step={1}
                            disabled={disabled}
                            value={opening.curveResolution}
                            onChange={(v) => updateBrushOpening(opening.id, {
                              curveResolution: v,
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.width}
                      onChange={(v) => updateSelectedRamp({ width: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Length (run)</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.length}
                      onChange={(v) => updateSelectedRamp({ length: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Rise</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.rise}
                      onChange={(v) => updateSelectedRamp({ rise: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={ramp.thickness}
                      onChange={(v) => updateSelectedRamp({ thickness: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.width}
                      onChange={(v) => updateSelectedStair({ width: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Step Count</span>
                    <ScrubNumberInput
                      className="bb-input"
                      min={1}
                      step={1}
                      disabled={disabled}
                      value={stair.stepCount}
                      onChange={(v) => updateSelectedStair({ stepCount: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Step Height</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.stepHeight}
                      onChange={(v) => updateSelectedStair({ stepHeight: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Total Rise</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={stair.totalRise}
                      onChange={(v) => updateSelectedStair({ totalRise: v })}
                    />
                  </label>
                  {(stair.stairType || 'straight') === 'straight' && (
                    <>
                      <label className="bb-field">
                        <span className="bb-field__label">Tread Depth</span>
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={stair.treadDepth}
                          onChange={(v) => updateSelectedStair({ treadDepth: v })}
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
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={stair.innerRadius}
                          onChange={(v) => updateSelectedStair({ innerRadius: v })}
                        />
                      </label>
                      <label className="bb-field" {...helpProps('details.stair.sweep')}>
                        <span className="bb-field__label">Sweep Angle (°)</span>
                        <ScrubNumberInput
                          className="bb-input"
                          min={1}
                          max={720}
                          step={15}
                          disabled={disabled}
                          value={stair.sweepAngle}
                          onChange={(v) => updateSelectedStair({ sweepAngle: v })}
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
                        <ScrubNumberInput
                          className="bb-input"
                          step={15}
                          disabled={disabled}
                          value={stair.startAngle}
                          onChange={(v) => updateSelectedStair({ startAngle: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={column.height}
                      onChange={(v) => updateSelectedColumn({ height: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Radius / Width</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={column.radius}
                      onChange={(v) => updateSelectedColumn({ radius: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Sides</span>
                    <ScrubNumberInput
                      className="bb-input"
                      min={3}
                      max={64}
                      step={1}
                      disabled={disabled}
                      value={column.sides}
                      onChange={(v) => updateSelectedColumn({ sides: v })}
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
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={column.baseHeight}
                          onChange={(v) => updateSelectedColumn({ baseHeight: v })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Base Radius</span>
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={column.baseRadius ?? Math.round(column.radius * 1.25)}
                          onChange={(v) => updateSelectedColumn({ baseRadius: v })}
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
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={column.capitalHeight}
                          onChange={(v) => updateSelectedColumn({ capitalHeight: v })}
                        />
                      </label>
                      <label className="bb-field">
                        <span className="bb-field__label">Capital Radius</span>
                        <ScrubNumberInput
                          className="bb-input"
                          step={gridSize}
                          disabled={disabled}
                          value={column.capitalRadius ?? Math.round(column.radius * 1.2)}
                          onChange={(v) => updateSelectedColumn({ capitalRadius: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.radius}
                      onChange={(v) => updateSelectedCurvedWall({ radius: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Sweep Angle (°)</span>
                    <ScrubNumberInput
                      className="bb-input"
                      min={1}
                      max={360}
                      step={5}
                      disabled={disabled}
                      value={curvedWall.sweepAngle}
                      onChange={(v) => updateSelectedCurvedWall({ sweepAngle: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={5}
                      disabled={disabled}
                      value={curvedWall.startAngle}
                      onChange={(v) => updateSelectedCurvedWall({ startAngle: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Height</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.height}
                      onChange={(v) => updateSelectedCurvedWall({ height: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Thickness</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={curvedWall.thickness}
                      onChange={(v) => updateSelectedCurvedWall({ thickness: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Curve Resolution</span>
                    <ScrubNumberInput
                      className="bb-input"
                      min={4}
                      max={128}
                      step={1}
                      disabled={disabled}
                      value={curvedWall.curveResolution}
                      onChange={(v) => updateSelectedCurvedWall({ curveResolution: v })}
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
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.openingWidth}
                      onChange={(v) => updateSelectedArch({ openingWidth: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Opening Height</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.openingHeight}
                      onChange={(v) => updateSelectedArch({ openingHeight: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Arch Rise</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.archRise}
                      onChange={(v) => updateSelectedArch({ archRise: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Thickness</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.thickness}
                      onChange={(v) => updateSelectedArch({ thickness: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Depth</span>
                    <ScrubNumberInput
                      className="bb-input"
                      step={gridSize}
                      disabled={disabled}
                      value={arch.depth}
                      onChange={(v) => updateSelectedArch({ depth: v })}
                    />
                  </label>
                  <label className="bb-field">
                    <span className="bb-field__label">Curve Resolution</span>
                    <ScrubNumberInput
                      className="bb-input"
                      min={4}
                      max={64}
                      step={1}
                      disabled={disabled}
                      value={arch.curveResolution}
                      onChange={(v) => updateSelectedArch({ curveResolution: v })}
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
              <LightDetailsSection
                light={light}
                disabled={disabled}
                world={world}
                updateSelectedLight={updateSelectedLight}
              />
            )}

            {environment && (
              <EnvironmentDetailsSection
                environment={environment}
                disabled={disabled}
                world={world}
                updateSelectedEnvironment={updateSelectedEnvironment}
              />
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
            </CollapsibleGroup>
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

function EnvScrubNumber({
  environment,
  field,
  map,
  label = 'Edit environment',
  value,
  disabled,
  step,
  min,
  max,
}) {
  const { updateSelectedEnvironment, commitEnvironmentGesture } = useEditor();
  const beforeRef = useRef(null);
  return (
    <ScrubNumberInput
      className="bb-input"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onGestureStart={() => {
        if (!environment || beforeRef.current) return;
        beforeRef.current = environmentAuthorableSnapshot(environment);
      }}
      onChange={(v) => {
        const partial = typeof map === 'function' ? map(v) : { [field]: v };
        updateSelectedEnvironment(partial, { undoable: false });
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitEnvironmentGesture?.(before, label);
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (!before) return;
        updateSelectedEnvironment(before, { undoable: false });
      }}
    />
  );
}

function EnvironmentDetailsSection({
  environment,
  disabled,
  world,
  updateSelectedEnvironment,
}) {
  const { registry } = useAssetBrowser();
  const textures = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture),
    [registry],
  );
  const actors = world?.actors || [];
  const type = environment.envType || 'water2';
  const isWater = type === 'water' || type === 'water2';
  const isMirror = type === 'reflector' || type === 'refractor';
  const isDecal = type === 'decal';
  const isSprite = type === 'sprite';
  const isSky = type === 'sky';

  return (
    <Collapsible title="Environment" storageKey="details.environment" defaultOpen>
      <div {...helpProps('details.environment')}>
        <label className="bb-field">
          <span className="bb-field__label">Type</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={type}
            onChange={(e) => updateSelectedEnvironment({ envType: e.target.value })}
          >
            {ENVIRONMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Color / tint</span>
          <input
            className="bb-input"
            type="color"
            disabled={disabled}
            value={environment.color || '#ffffff'}
            onChange={(e) => updateSelectedEnvironment({ color: e.target.value })}
          />
        </label>
        {!isSky && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Width</span>
              <EnvScrubNumber environment={environment} field="width" label="Edit env width" min={1} step={10} disabled={disabled} value={environment.width} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Height</span>
              <EnvScrubNumber environment={environment} field="height" label="Edit env height" min={1} step={10} disabled={disabled} value={environment.height} />
            </label>
          </>
        )}
        {(isWater || isMirror) && (
          <label className="bb-field">
            <span className="bb-field__label">RT resolution</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={environment.textureResolution}
              onChange={(e) => updateSelectedEnvironment({ textureResolution: Number(e.target.value) })}
            >
              {ENV_RT_RESOLUTIONS.map((n) => (
                <option key={n} value={n}>{n}px</option>
              ))}
            </select>
          </label>
        )}
        {(isWater || isMirror) && (
          <label className="bb-field">
            <span className="bb-field__label">Quality</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={environment.quality || 'medium'}
              onChange={(e) => updateSelectedEnvironment({ quality: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        )}
        {isWater && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Flow speed</span>
              <EnvScrubNumber environment={environment} field="flowSpeed" label="Edit flow speed" min={0} step={0.005} disabled={disabled} value={environment.flowSpeed} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Reflectivity</span>
              <EnvScrubNumber environment={environment} field="reflectivity" label="Edit reflectivity" min={0} max={1} step={0.01} disabled={disabled} value={environment.reflectivity} />
            </label>
            {type === 'water' && (
              <label className="bb-field">
                <span className="bb-field__label">Distortion</span>
                <EnvScrubNumber environment={environment} field="distortionScale" label="Edit distortion" min={0} step={0.1} disabled={disabled} value={environment.distortionScale} />
              </label>
            )}
            <label className="bb-field">
              <span className="bb-field__label">Normal map A</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={environment.normalMap0Id || ''}
                onChange={(e) => updateSelectedEnvironment({ normalMap0Id: e.target.value || null })}
              >
                <option value="">—</option>
                {textures.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {isDecal && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Target actor</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={environment.targetActorId || ''}
                onChange={(e) => updateSelectedEnvironment({ targetActorId: e.target.value || null })}
              >
                <option value="">—</option>
                {actors.filter((a) => a.id).map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.id}</option>
                ))}
              </select>
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Map</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={environment.mapId || ''}
                onChange={(e) => updateSelectedEnvironment({ mapId: e.target.value || null })}
              >
                <option value="">—</option>
                {textures.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Opacity</span>
              <EnvScrubNumber environment={environment} field="opacity" label="Edit decal opacity" min={0} max={1} step={0.05} disabled={disabled} value={environment.opacity} />
            </label>
          </>
        )}
        {isSprite && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Texture</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={environment.mapId || ''}
                onChange={(e) => updateSelectedEnvironment({ mapId: e.target.value || null })}
              >
                <option value="">—</option>
                {textures.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Opacity</span>
              <EnvScrubNumber environment={environment} field="opacity" label="Edit sprite opacity" min={0} max={1} step={0.05} disabled={disabled} value={environment.opacity} />
            </label>
            <label className="bb-field bb-field--check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(environment.sizeAttenuation)}
                onChange={(e) => updateSelectedEnvironment({ sizeAttenuation: e.target.checked })}
              />
              <span>Size attenuation</span>
            </label>
            <label className="bb-field bb-field--check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(environment.fog)}
                onChange={(e) => updateSelectedEnvironment({ fog: e.target.checked })}
              />
              <span>Fog</span>
            </label>
          </>
        )}
        {isSky && (
          <>
            <p className="bb-muted" {...helpProps('details.environment.sky')}>
              Placeable Sky overrides World Settings procedural sky while present. Authored world.scene.sky is preserved.
            </p>
            <label className="bb-field">
              <span className="bb-field__label">Turbidity</span>
              <EnvScrubNumber environment={environment} field="turbidity" label="Edit sky turbidity" min={0} step={0.1} disabled={disabled} value={environment.turbidity} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Rayleigh</span>
              <EnvScrubNumber environment={environment} field="rayleigh" label="Edit sky rayleigh" min={0} step={0.1} disabled={disabled} value={environment.rayleigh} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Elevation</span>
              <EnvScrubNumber environment={environment} field="elevation" label="Edit sky elevation" step={0.5} disabled={disabled} value={environment.elevation} />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Azimuth</span>
              <EnvScrubNumber environment={environment} field="azimuth" label="Edit sky azimuth" step={1} disabled={disabled} value={environment.azimuth} />
            </label>
          </>
        )}
        {(isWater || isMirror) && (
          <label className="bb-field bb-field--check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(environment.perspectiveOnly)}
              onChange={(e) => updateSelectedEnvironment({ perspectiveOnly: e.target.checked })}
            />
            <span>Perspective-only RT (ortho uses proxy)</span>
          </label>
        )}
      </div>
    </Collapsible>
  );
}

function LightDetailsSection({
  light,
  disabled,
  world,
  updateSelectedLight,
}) {
  const { registry } = useAssetBrowser();
  const textures = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture),
    [registry],
  );
  const actors = world?.actors || [];
  const type = light.lightType || 'point';
  const isPoint = type === 'point';
  const isSpot = type === 'spot';
  const isDir = type === 'directional';
  const isHemi = type === 'hemisphere';
  const isRect = type === 'rectArea';
  const isAmbient = type === 'ambient';
  const canShadow = isPoint || isSpot || isDir;
  const canDecay = isPoint || isSpot;
  const canTarget = isSpot || isDir;
  const shadowMapType = world?.renderer?.shadowMapType || 'PCF';
  const radiusApplies = shadowMapType === 'PCF' || shadowMapType === 'VSM';
  const blurApplies = shadowMapType === 'VSM';

  const typeLabel = {
    point: 'Point',
    spot: 'Spot',
    directional: 'Directional',
    ambient: 'Ambient',
    hemisphere: 'Hemisphere',
    rectArea: 'Rect Area',
  };

  return (
    <Collapsible title="Light" storageKey="details.light" defaultOpen>
      <div {...helpProps('details.light')}>
        <CollapsibleGroup storagePrefixes={['details.light.']}>
          <label className="bb-field" {...helpProps('details.light.type')}>
            <span className="bb-field__label">Type</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={type}
              onChange={(e) => updateSelectedLight({ lightType: e.target.value })}
            >
              {LIGHT_TYPES.map((id) => (
                <option key={id} value={id}>{typeLabel[id] || id}</option>
              ))}
            </select>
          </label>

          <Collapsible title="Base" storageKey="details.light.base" defaultOpen>
            <label className="bb-field">
              <span className="bb-field__label">{isHemi ? 'Sky Color' : 'Color'}</span>
              <input
                className="bb-input"
                type="color"
                disabled={disabled}
                value={normalizeHex(light.color)}
                onChange={(e) => updateSelectedLight({ color: e.target.value })}
              />
            </label>
            {isHemi && (
              <label className="bb-field" {...helpProps('details.light.hemisphere')}>
                <span className="bb-field__label">Ground Color</span>
                <input
                  className="bb-input"
                  type="color"
                  disabled={disabled}
                  value={normalizeHex(light.groundColor)}
                  onChange={(e) => updateSelectedLight({ groundColor: e.target.value })}
                />
              </label>
            )}
            <label className="bb-field">
              <span className="bb-field__label">Intensity</span>
              <LightScrubNumber
                light={light}
                field="intensity"
                label="Edit light intensity"
                disabled={disabled}
                step={0.1}
                min={0}
                value={light.intensity}
              />
            </label>
            {canDecay && (
              <>
                <label className="bb-field" {...helpProps('details.light.decay')}>
                  <span className="bb-field__label">Decay</span>
                  <LightScrubNumber
                    light={light}
                    field="decay"
                    label="Edit light decay"
                    disabled={disabled}
                    step={0.05}
                    min={0}
                    value={light.decay ?? 2}
                  />
                </label>
                <label className="bb-field" {...helpProps('details.light.power')}>
                  <span className="bb-field__label">Power (lm)</span>
                  <LightScrubNumber
                    light={light}
                    field="power"
                    label="Edit light power"
                    disabled={disabled}
                    step={10}
                    min={0}
                    value={light.power != null
                      ? light.power
                      : (Number(light.intensity) || 0) * 4 * Math.PI}
                    map={(power) => ({
                      power,
                      intensity: power / (4 * Math.PI),
                    })}
                  />
                </label>
              </>
            )}
            {(isPoint || isSpot) && (
              <label className="bb-field">
                <span className="bb-field__label">Range (eu)</span>
                <LightScrubNumber
                  light={light}
                  field="range"
                  label="Edit light range"
                  disabled={disabled}
                  step={25}
                  min={0}
                  value={light.range}
                />
              </label>
            )}
            {isRect && (
              <>
                <label className="bb-field" {...helpProps('details.light.rectArea')}>
                  <span className="bb-field__label">Width (eu)</span>
                  <LightScrubNumber
                    light={light}
                    field="width"
                    label="Edit rect light width"
                    disabled={disabled}
                    step={10}
                    min={1}
                    value={light.width ?? 200}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Height (eu)</span>
                  <LightScrubNumber
                    light={light}
                    field="height"
                    label="Edit rect light height"
                    disabled={disabled}
                    step={10}
                    min={1}
                    value={light.height ?? 200}
                  />
                </label>
                <p className="bb-muted">RectAreaLight has no shadows. Needs MeshStandard/Physical materials.</p>
              </>
            )}
          </Collapsible>

          {isSpot && (
            <Collapsible title="Spot" storageKey="details.light.spot" defaultOpen>
              <label className="bb-field">
                <span className="bb-field__label">Spot Angle°</span>
                <LightScrubNumber
                  light={light}
                  field="spotAngle"
                  disabled={disabled}
                  step={1}
                  min={1}
                  max={90}
                  value={light.spotAngle}
                />
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Penumbra</span>
                <LightScrubNumber
                  light={light}
                  field="spotPenumbra"
                  disabled={disabled}
                  step={0.05}
                  min={0}
                  max={1}
                  value={light.spotPenumbra}
                />
              </label>
              <label className="bb-field" {...helpProps('details.light.spotMap')}>
                <span className="bb-field__label">Projection Map</span>
                <select
                  className="bb-select"
                  disabled={disabled}
                  value={light.spotMapId || ''}
                  onChange={(e) => updateSelectedLight({ spotMapId: e.target.value || null })}
                >
                  <option value="">(none)</option>
                  {textures.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            </Collapsible>
          )}

          {canTarget && (
            <Collapsible title="Target" storageKey="details.light.target">
              <label className="bb-field" {...helpProps('details.light.target')}>
                <span className="bb-field__label">Aim at Actor</span>
                <select
                  className="bb-select"
                  disabled={disabled}
                  value={light.targetActorId || ''}
                  onChange={(e) => updateSelectedLight({ targetActorId: e.target.value || null })}
                >
                  <option value="">(local −Y aim)</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                  ))}
                </select>
              </label>
            </Collapsible>
          )}

          {canShadow && (
            <Collapsible title="Shadows" storageKey="details.light.shadows">
              <label className="bb-field bb-field--row">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(light.castShadow)}
                  onChange={(e) => updateSelectedLight({ castShadow: e.target.checked })}
                />
                <span className="bb-field__label">Cast Shadow</span>
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
              <label className="bb-field" {...helpProps('details.light.shadowBias')}>
                <span className="bb-field__label">Bias</span>
                <LightScrubNumber
                  light={light}
                  field="shadowBias"
                  disabled={disabled || !light.castShadow}
                  step={0.0001}
                  value={light.shadowBias ?? -0.0005}
                />
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Normal Bias</span>
                <LightScrubNumber
                  light={light}
                  field="shadowNormalBias"
                  disabled={disabled || !light.castShadow}
                  step={0.01}
                  min={0}
                  value={light.shadowNormalBias ?? 0.04}
                />
              </label>
              {radiusApplies && (
                <label className="bb-field">
                  <span className="bb-field__label">Radius</span>
                  <LightScrubNumber
                    light={light}
                    field="shadowRadius"
                    disabled={disabled || !light.castShadow}
                    step={0.1}
                    min={0}
                    value={light.shadowRadius ?? 2}
                  />
                </label>
              )}
              {blurApplies && (
                <label className="bb-field">
                  <span className="bb-field__label">Blur Samples</span>
                  <LightScrubNumber
                    light={light}
                    field="shadowBlurSamples"
                    disabled={disabled || !light.castShadow}
                    step={1}
                    min={1}
                    value={light.shadowBlurSamples ?? 8}
                  />
                </label>
              )}
              {!radiusApplies && (
                <p className="bb-muted">Radius / blur apply to PCF and VSM shadow maps (World → Renderer).</p>
              )}
              <label className="bb-field">
                <span className="bb-field__label">Camera Near</span>
                <LightScrubNumber
                  light={light}
                  field="shadowCameraNear"
                  disabled={disabled || !light.castShadow}
                  step={0.05}
                  min={0.01}
                  value={light.shadowCameraNear ?? (isDir ? 0.5 : 0.2)}
                />
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Camera Far</span>
                <LightScrubNumber
                  light={light}
                  field="shadowCameraFar"
                  disabled={disabled || !light.castShadow}
                  step={1}
                  min={0.1}
                  value={light.shadowCameraFar ?? 80}
                />
              </label>
              {isDir && (
                <label className="bb-field">
                  <span className="bb-field__label">Ortho Size (m)</span>
                  <LightScrubNumber
                    light={light}
                    field="shadowCameraSize"
                    disabled={disabled || !light.castShadow}
                    step={0.5}
                    min={0.5}
                    value={light.shadowCameraSize ?? 20}
                  />
                </label>
              )}
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                disabled={disabled}
                onClick={() => updateSelectedLight({
                  shadowBias: -0.0005,
                  shadowNormalBias: 0.04,
                  shadowRadius: 2,
                  shadowBlurSamples: 8,
                  shadowCameraNear: isDir ? 0.5 : 0.2,
                  shadowCameraFar: 80,
                  shadowCameraSize: 20,
                })}
              >
                Reset shadow defaults
              </button>
            </Collapsible>
          )}

          {!isAmbient && (
            <Collapsible title="Lensflare" storageKey="details.light.lensflare">
              <label className="bb-field bb-field--row" {...helpProps('details.light.lensflare')}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(light.lensflareEnabled)}
                  onChange={(e) => updateSelectedLight({
                    lensflareEnabled: e.target.checked,
                    lensflareElements: e.target.checked && !(light.lensflareElements?.length)
                      ? createLensflareFromPreset(light.lensflarePreset || 'soft')
                      : light.lensflareElements,
                  })}
                />
                <span className="bb-field__label">Enable Lensflare</span>
              </label>
              <label className="bb-field">
                <span className="bb-field__label">Preset</span>
                <select
                  className="bb-select"
                  disabled={disabled || !light.lensflareEnabled}
                  value={light.lensflarePreset || 'soft'}
                  onChange={(e) => {
                    const preset = e.target.value;
                    updateSelectedLight({
                      lensflarePreset: preset,
                      lensflareElements: preset === 'none'
                        ? []
                        : createLensflareFromPreset(preset),
                    });
                  }}
                >
                  {Object.keys(LENSFLARE_PRESETS).map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
              <p className="bb-muted">
                {(light.lensflareElements || []).length} element(s). Hidden in orthographic panes.
              </p>
            </Collapsible>
          )}

          <Collapsible title="Helper" storageKey="details.light.helper">
            <label className="bb-field bb-field--row" {...helpProps('details.light.helper')}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(light.showHelper)}
                onChange={(e) => updateSelectedLight({ showHelper: e.target.checked })}
              />
              <span className="bb-field__label">Show native light helper</span>
            </label>
          </Collapsible>
        </CollapsibleGroup>
      </div>
    </Collapsible>
  );
}

function WorldSettings() {
  const {
    world,
    gridSize,
    levelName,
    mode,
    revision,
    updateWorldAmbient,
    updateWorldScene,
    updateWorldRenderer,
  } = useEditor();
  const { registry, importTexture, notify } = useAssetBrowser();
  const disabled = mode === 'play' || !world;
  // Touch revision so ambient field values refresh after scrub/type updates.
  void revision;
  const ambient = world?.ambient || DEFAULT_WORLD_AMBIENT;
  const scene = world?.scene || DEFAULT_WORLD_SCENE;
  const fog = scene.fog || DEFAULT_WORLD_SCENE.fog;
  const sky = scene.sky || DEFAULT_WORLD_SCENE.sky;
  const grounded = scene.groundedSkybox || DEFAULT_WORLD_SCENE.groundedSkybox;
  const renderer = world?.renderer || DEFAULT_WORLD_RENDERER;
  const mapModeLabel = world?.mapMode === 'subtractive' ? 'Subtractive' : 'Additive';
  const envAssets = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture).filter(isEnvironmentMapAsset),
    [registry],
  );
  const mapModeHelp = world?.mapMode === 'subtractive'
    ? ' — World Solid is invisible substrate; subtract boxes carve rooms'
    : ' — place additive brushes to build';
  return (
    <div>
      <CollapsibleGroup storagePrefixes={['world.']}>
      <Collapsible title="Level" storageKey="world.level">
        <p className="bb-muted">Name: {world?.name || '—'}</p>
        <p className="bb-muted">File: {levelName}</p>
        <p className="bb-muted" {...helpProps('file.newMap')}>
          Map mode: {mapModeLabel}
          {mapModeHelp}
        </p>
        <p className="bb-muted">Actors: {world?.actors?.length ?? 0}</p>
        <p className="bb-muted">Schema: {world?.schemaVersion ?? '—'}</p>
      </Collapsible>
      <Collapsible title="Ambient Light" storageKey="world.ambient" defaultOpen>
        <p className="bb-muted" {...helpProps('world.ambient')}>
          Scene fill (AmbientLight + editor fills). With RoomEnvironment fallback, also scales IBL.
          Authored HDRI uses Environment intensity instead. Numeric scrub = live preview + one Undo
          entry (same World Settings history as Scene/Renderer).
        </p>
        <label className="bb-field">
          <span className="bb-field__label">Color</span>
          <input
            className="bb-input"
            type="color"
            disabled={disabled}
            value={normalizeHex(ambient.color)}
            onChange={(e) => updateWorldAmbient?.({ color: e.target.value }, { label: 'Edit ambient color' })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Edit intensity</span>
          <WorldScrubNumber
            kind="ambient"
            patch="intensity"
            label="Edit ambient intensity"
            step={0.05}
            min={0}
            max={4}
            disabled={disabled}
            value={ambient.intensity}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Play intensity</span>
          <WorldScrubNumber
            kind="ambient"
            patch="playIntensity"
            label="Edit ambient play intensity"
            step={0.05}
            min={0}
            max={4}
            disabled={disabled}
            value={ambient.playIntensity}
          />
        </label>
      </Collapsible>
      <Collapsible title="Scene" storageKey="world.scene" defaultOpen>
        <p className="bb-muted" {...helpProps('world.scene')}>
          Background, environment lighting, sky, and fog (saved with the map).
        </p>
        <label className="bb-field" {...helpProps('world.scene.backgroundType')}>
          <span className="bb-field__label">Background mode</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={scene.backgroundType || 'color'}
            onChange={(e) => updateWorldScene?.({ backgroundType: e.target.value })}
          >
            {WORLD_BACKGROUND_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === 'environment' ? 'Environment' : type === 'sky' ? 'Procedural sky' : 'Solid color'}
              </option>
            ))}
          </select>
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Background color</span>
          <input
            className="bb-input"
            type="color"
            disabled={disabled}
            value={normalizeHex(scene.background)}
            onChange={(e) => updateWorldScene?.({ background: e.target.value })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Background intensity</span>
          <WorldScrubNumber
            patch="backgroundIntensity"
            label="Edit background intensity"
            step={0.05}
            min={0}
            max={4}
            disabled={disabled}
            value={scene.backgroundIntensity}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Background blurriness</span>
          <WorldScrubNumber
            patch="backgroundBlurriness"
            label="Edit background blurriness"
            step={0.05}
            min={0}
            max={1}
            disabled={disabled || scene.backgroundType === 'color' || scene.backgroundType === 'sky'}
            value={scene.backgroundBlurriness}
          />
        </label>
        <p className="bb-muted">Blurriness applies when background is the environment map.</p>
        <div className="bb-axis-row" {...helpProps('world.scene.backgroundRotation')}>
          <span className="bb-field__label" style={{ width: '100%' }}>Background rotation (°)</span>
          {['x', 'y', 'z'].map((axis) => (
            <label key={axis} className="bb-field">
              <span className="bb-field__label">{axis.toUpperCase()}</span>
              <WorldScrubNumber
                patch={(v) => ({ backgroundRotation: { [axis]: v } })}
                label="Edit background rotation"
                step={1}
                disabled={disabled || scene.backgroundType === 'color' || scene.backgroundType === 'sky'}
                value={scene.backgroundRotation?.[axis] ?? 0}
              />
            </label>
          ))}
        </div>

        <p className="bb-muted" {...helpProps('world.scene.environment')}>
          Environment lighting (HDRI/EXR → PMREM). Empty uses RoomEnvironment studio fallback.
        </p>
        <label className="bb-field" {...helpProps('world.scene.environment')}>
          <span className="bb-field__label">Environment map</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={scene.environmentAssetId || ''}
            onChange={(e) => updateWorldScene?.({
              environmentAssetId: e.target.value || null,
            })}
          >
            <option value="">RoomEnvironment (default)</option>
            {envAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.meta?.format || 'hdr'})
              </option>
            ))}
          </select>
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Import HDR / EXR</span>
          <input
            className="bb-input"
            type="file"
            accept=".hdr,.exr,image/vnd.radiance,image/x-exr"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const result = await importTexture?.(file);
                const id = result?.asset?.id;
                if (id) updateWorldScene?.({ environmentAssetId: id });
              } catch (err) {
                notify?.(err.message || 'HDR/EXR import failed');
              }
            }}
          />
        </label>
        <label className="bb-field" {...helpProps('world.scene.environmentIntensity')}>
          <span className="bb-field__label">Environment intensity</span>
          <WorldScrubNumber
            patch="environmentIntensity"
            label="Edit environment intensity"
            step={0.05}
            min={0}
            max={8}
            disabled={disabled || !scene.environmentAssetId}
            value={scene.environmentIntensity}
          />
        </label>
        <div className="bb-axis-row" {...helpProps('world.scene.environmentRotation')}>
          <span className="bb-field__label" style={{ width: '100%' }}>Environment rotation (°)</span>
          {['x', 'y', 'z'].map((axis) => (
            <label key={axis} className="bb-field">
              <span className="bb-field__label">{axis.toUpperCase()}</span>
              <WorldScrubNumber
                patch={(v) => ({ environmentRotation: { [axis]: v } })}
                label="Edit environment rotation"
                step={1}
                disabled={disabled || !scene.environmentAssetId}
                value={scene.environmentRotation?.[axis] ?? 0}
              />
            </label>
          ))}
        </div>
        <label className="bb-field" {...helpProps('world.scene.lightProbe')}>
          <span className="bb-field__label">Light probe</span>
          <input
            type="checkbox"
            disabled={disabled || !scene.environmentAssetId}
            checked={Boolean(scene.lightProbeEnabled)}
            onChange={(e) => updateWorldScene?.({ lightProbeEnabled: e.target.checked })}
          />
        </label>
        {scene.lightProbeEnabled && (
          <label className="bb-field">
            <span className="bb-field__label">Probe intensity</span>
            <WorldScrubNumber
              patch="lightProbeIntensity"
              label="Edit light probe intensity"
              step={0.05}
              min={0}
              max={8}
              disabled={disabled}
              value={scene.lightProbeIntensity}
            />
          </label>
        )}
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={disabled}
          onClick={() => updateWorldScene?.({
            environmentAssetId: null,
            environmentIntensity: DEFAULT_WORLD_SCENE.environmentIntensity,
            environmentRotation: { ...DEFAULT_WORLD_SCENE.environmentRotation },
            lightProbeEnabled: false,
            lightProbeIntensity: DEFAULT_WORLD_SCENE.lightProbeIntensity,
            backgroundType: 'color',
            backgroundRotation: { ...DEFAULT_WORLD_SCENE.backgroundRotation },
            groundedSkybox: { ...DEFAULT_WORLD_SCENE.groundedSkybox },
            sky: { ...DEFAULT_WORLD_SCENE.sky },
          }, { label: 'Reset environment' })}
        >
          Reset environment
        </button>

        <p className="bb-muted" {...helpProps('world.scene.sky')}>
          Procedural sky (Preetham). Set Background mode to Procedural sky to use it as the backdrop.
        </p>
        {scene.backgroundType === 'sky' && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Turbidity</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { turbidity: v } })}
                label="Edit sky turbidity"
                step={0.1}
                min={0}
                max={20}
                disabled={disabled}
                value={sky.turbidity}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Rayleigh</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { rayleigh: v } })}
                label="Edit sky rayleigh"
                step={0.05}
                min={0}
                max={4}
                disabled={disabled}
                value={sky.rayleigh}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Mie coefficient</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { mieCoefficient: v } })}
                label="Edit sky mieCoefficient"
                step={0.001}
                min={0}
                max={0.1}
                disabled={disabled}
                value={sky.mieCoefficient}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Mie directional G</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { mieDirectionalG: v } })}
                label="Edit sky mieDirectionalG"
                step={0.01}
                min={0}
                max={1}
                disabled={disabled}
                value={sky.mieDirectionalG}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Sun elevation (°)</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { elevation: v } })}
                label="Edit sky elevation"
                step={0.5}
                min={-90}
                max={90}
                disabled={disabled}
                value={sky.elevation}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Sun azimuth (°)</span>
              <WorldScrubNumber
                patch={(v) => ({ sky: { azimuth: v } })}
                label="Edit sky azimuth"
                step={1}
                min={-360}
                max={360}
                disabled={disabled}
                value={sky.azimuth}
              />
            </label>
          </>
        )}

        <label className="bb-field" {...helpProps('world.scene.groundedSkybox')}>
          <span className="bb-field__label">Grounded skybox</span>
          <input
            type="checkbox"
            disabled={disabled || !scene.environmentAssetId}
            checked={Boolean(grounded.enabled)}
            onChange={(e) => updateWorldScene?.({
              groundedSkybox: { enabled: e.target.checked },
            })}
          />
        </label>
        {grounded.enabled && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Height (m)</span>
              <WorldScrubNumber
                patch={(v) => ({ groundedSkybox: { height: v } })}
                label="Edit grounded height"
                step={0.5}
                min={0.1}
                max={500}
                disabled={disabled}
                value={grounded.height}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Radius (m)</span>
              <WorldScrubNumber
                patch={(v) => ({ groundedSkybox: { radius: v } })}
                label="Edit grounded radius"
                step={1}
                min={1}
                max={5000}
                disabled={disabled}
                value={grounded.radius}
              />
            </label>
          </>
        )}

        <label className="bb-field">
          <span className="bb-field__label">Fog</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={fog.type !== 'none'}
            onChange={(e) => updateWorldScene?.({
              fog: { type: e.target.checked ? (fog.type !== 'none' ? fog.type : 'linear') : 'none' },
            })}
          />
        </label>
        {fog.type !== 'none' && (
          <>
            <label className="bb-field">
              <span className="bb-field__label">Fog type</span>
              <select
                className="bb-select"
                disabled={disabled}
                value={fog.type}
                onChange={(e) => updateWorldScene?.({ fog: { type: e.target.value } })}
              >
                {WORLD_FOG_TYPES.filter((type) => type !== 'none').map((type) => (
                  <option key={type} value={type}>
                    {type === 'exp2' ? 'Exp2' : 'Linear'}
                  </option>
                ))}
              </select>
            </label>
            <label className="bb-field">
              <span className="bb-field__label">Fog color</span>
              <input
                className="bb-input"
                type="color"
                disabled={disabled}
                value={normalizeHex(fog.color)}
                onChange={(e) => updateWorldScene?.({ fog: { color: e.target.value } })}
              />
            </label>
            {fog.type === 'linear' && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Fog near (eu)</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { near: v } })}
                    label="Edit fog near"
                    step={25}
                    min={0}
                    disabled={disabled}
                    value={fog.near}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Fog far (eu)</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { far: v } })}
                    label="Edit fog far"
                    step={25}
                    min={0}
                    disabled={disabled}
                    value={fog.far}
                  />
                </label>
                <p className="bb-muted">100 editor units = 1 meter. Defaults (~1–15 m) suit interiors.</p>
              </>
            )}
            {fog.type === 'exp2' && (
              <label className="bb-field">
                <span className="bb-field__label">Fog density</span>
                <WorldScrubNumber
                  patch={(v) => ({ fog: { density: v } })}
                  label="Edit fog density"
                  step={0.001}
                  min={0}
                  max={1}
                  disabled={disabled}
                  value={fog.density}
                />
              </label>
            )}
            <label className="bb-field">
              <span className="bb-field__label">Drift</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(fog.drift)}
                onChange={(e) => updateWorldScene?.({ fog: { drift: e.target.checked } })}
              />
            </label>
            {fog.drift && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Drift speed</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { driftSpeed: v } })}
                    label="Edit fog driftSpeed"
                    step={0.01}
                    min={0}
                    max={2}
                    disabled={disabled}
                    value={fog.driftSpeed}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Drift amount</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { driftAmount: v } })}
                    label="Edit fog driftAmount"
                    step={0.01}
                    min={0}
                    max={1}
                    disabled={disabled}
                    value={fog.driftAmount}
                  />
                </label>
                <p className="bb-muted">Slow breathe on fog depth/density.</p>
              </>
            )}
            <p className="bb-muted" {...helpProps('world.scene.atmosphere')}>
              Moving atmosphere (perspective / Play only; hidden in ortho).
            </p>
            <label className="bb-field" {...helpProps('world.scene.mist')}>
              <span className="bb-field__label">Mist</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(fog.mist)}
                onChange={(e) => updateWorldScene?.({ fog: { mist: e.target.checked } })}
              />
            </label>
            {fog.mist && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Mist count</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { mistCount: v } })}
                    label="Edit fog mistCount"
                    step={50}
                    min={0}
                    max={4000}
                    disabled={disabled}
                    value={fog.mistCount}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Mist speed</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { mistSpeed: v } })}
                    label="Edit fog mistSpeed"
                    step={0.01}
                    min={0}
                    max={2}
                    disabled={disabled}
                    value={fog.mistSpeed}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Mist opacity</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { mistOpacity: v } })}
                    label="Edit fog mistOpacity"
                    step={0.01}
                    min={0}
                    max={1}
                    disabled={disabled}
                    value={fog.mistOpacity}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Mist size (m)</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { mistSize: v } })}
                    label="Edit fog mistSize"
                    step={0.05}
                    min={0.05}
                    max={4}
                    disabled={disabled}
                    value={fog.mistSize}
                  />
                </label>
              </>
            )}
            <label className="bb-field" {...helpProps('world.scene.noise')}>
              <span className="bb-field__label">Noise</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(fog.noise)}
                onChange={(e) => updateWorldScene?.({ fog: { noise: e.target.checked } })}
              />
            </label>
            {fog.noise && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Noise strength</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { noiseStrength: v } })}
                    label="Edit fog noiseStrength"
                    step={0.01}
                    min={0}
                    max={1}
                    disabled={disabled}
                    value={fog.noiseStrength}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Noise scale</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { noiseScale: v } })}
                    label="Edit fog noiseScale"
                    step={0.01}
                    min={0.05}
                    max={4}
                    disabled={disabled}
                    value={fog.noiseScale}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Noise speed</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { noiseSpeed: v } })}
                    label="Edit fog noiseSpeed"
                    step={0.01}
                    min={0}
                    max={2}
                    disabled={disabled}
                    value={fog.noiseSpeed}
                  />
                </label>
              </>
            )}
            <label className="bb-field" {...helpProps('world.scene.volumetric')}>
              <span className="bb-field__label">Volumetric</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(fog.volumetric)}
                onChange={(e) => updateWorldScene?.({ fog: { volumetric: e.target.checked } })}
              />
            </label>
            {fog.volumetric && (
              <>
                <label className="bb-field">
                  <span className="bb-field__label">Volume density</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { volumetricDensity: v } })}
                    label="Edit fog volumetricDensity"
                    step={0.01}
                    min={0}
                    max={2}
                    disabled={disabled}
                    value={fog.volumetricDensity}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Volume extent (m)</span>
                  <WorldScrubNumber
                    patch={(v) => ({ fog: { volumetricExtent: v } })}
                    label="Edit fog volumetricExtent"
                    step={0.5}
                    min={1}
                    max={80}
                    disabled={disabled}
                    value={fog.volumetricExtent}
                  />
                </label>
                <label className="bb-field">
                  <span className="bb-field__label">Volume steps</span>
                  <select
                    className="bb-select"
                    disabled={disabled}
                    value={fog.volumetricSteps}
                    onChange={(e) => updateWorldScene?.({
                      fog: { volumetricSteps: Number(e.target.value) },
                    })}
                  >
                    {WORLD_FOG_VOLUMETRIC_STEPS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <p className="bb-muted">Higher steps look denser but cost more GPU.</p>
              </>
            )}
          </>
        )}
      </Collapsible>
      <Collapsible title="Renderer" storageKey="world.renderer" defaultOpen>
        <p className="bb-muted" {...helpProps('world.renderer')}>
          Tone mapping, shadows, and output color space. PP overrides tone mapping when composing.
        </p>
        <label className="bb-field">
          <span className="bb-field__label">Tone mapping</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={renderer.toneMapping}
            onChange={(e) => updateWorldRenderer?.({ toneMapping: e.target.value })}
          >
            {WORLD_TONE_MAPPINGS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Exposure</span>
          <WorldScrubNumber
            kind="renderer"
            patch="toneMappingExposure"
            label="Edit exposure"
            step={0.05}
            min={0}
            max={4}
            disabled={disabled}
            value={renderer.toneMappingExposure}
          />
        </label>
        <label className="bb-field" {...helpProps('world.renderer.outputColorSpace')}>
          <span className="bb-field__label">Output color space</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={renderer.outputColorSpace || 'srgb'}
            onChange={(e) => updateWorldRenderer?.({ outputColorSpace: e.target.value })}
          >
            {WORLD_OUTPUT_COLOR_SPACES.map((name) => (
              <option key={name} value={name}>
                {name === 'srgb-linear' ? 'Linear sRGB' : 'sRGB'}
              </option>
            ))}
          </select>
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Shadow map</span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={Boolean(renderer.shadowMapEnabled)}
            onChange={(e) => updateWorldRenderer?.({ shadowMapEnabled: e.target.checked })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Shadow type</span>
          <select
            className="bb-select"
            disabled={disabled || !renderer.shadowMapEnabled}
            value={renderer.shadowMapType === 'PCFSoft' ? 'PCF' : renderer.shadowMapType}
            onChange={(e) => updateWorldRenderer?.({ shadowMapType: e.target.value })}
          >
            {WORLD_SHADOW_MAP_TYPES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <p className="bb-muted">PCF Soft was removed (Three r187 treats it as PCF).</p>
      </Collapsible>
      <PostProcessingSettings />
      <Collapsible title="Editor" storageKey="world.editor">
        <p className="bb-muted">Mode: {mode}</p>
        <p className="bb-muted">Grid: {gridSize} editor units</p>
        <p className="bb-muted">100 editor units = 1 meter</p>
      </Collapsible>
      </CollapsibleGroup>
    </div>
  );
}

function ExtrudeClipControls({
  disabled,
  gridSize,
  geometryMode,
  geometrySelection,
  clipSession,
  selectedActor,
  commitExtrudeFace,
  previewExtrudeFace,
  beginClipSession,
  setClipSessionMode,
  cancelClipSession,
  setClipPlaneFromFace,
  commitClipSession,
}) {
  const [distance, setDistance] = useState(gridSize || 25);
  const [clipModeDraft, setClipModeDraft] = useState('front');
  const primaryFace = geometryMode === 'face' ? geometrySelection?.primary : null;
  const canExtrude = Boolean(primaryFace) && !disabled;
  const clipMode = clipSession?.mode || clipModeDraft;
  const clipReady = Boolean(clipSession?.plane);

  return (
    <div className="bb-details-actions">
      <p className="bb-muted">
        Extrude creates a new prism brush from the selected face. Clip cuts by a plane
        (three picks or the selected face plane).
      </p>
      <label className="bb-field">
        <span className="bb-field__label">Extrude depth (eu)</span>
        <ScrubNumberInput
          value={distance}
          disabled={disabled}
          step={gridSize || 25}
          onChange={(v) => {
            setDistance(v);
            if (canExtrude) previewExtrudeFace?.(v);
          }}
        />
      </label>
      <button
        type="button"
        className="bb-btn"
        disabled={!canExtrude}
        title={canExtrude ? 'Extrude selected face' : 'Select a face in Face mode'}
        onClick={() => commitExtrudeFace?.(distance)}
      >
        Extrude Face
      </button>

      <div className="bb-field" style={{ marginTop: '0.75rem' }}>
        <span className="bb-field__label">Clip mode</span>
        <select
          className="bb-select"
          disabled={disabled}
          value={clipMode}
          onChange={(e) => {
            const m = e.target.value;
            setClipModeDraft(m);
            if (clipSession) setClipSessionMode?.(m);
          }}
        >
          <option value="front">Keep front</option>
          <option value="back">Keep back</option>
          <option value="split">Split (both)</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled}
          onClick={() => beginClipSession?.(clipMode)}
        >
          Pick 3 Points
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !primaryFace}
          title={primaryFace ? 'Use selected face as clip plane' : 'Select a face first'}
          onClick={() => {
            if (!primaryFace) return;
            setClipPlaneFromFace?.(primaryFace.actorId, primaryFace.id, clipMode);
          }}
        >
          Clip by Face
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !clipReady}
          onClick={() => commitClipSession?.()}
          title="Apply clip (Enter)"
          {...helpProps('details.extrudeClip', !clipReady ? 'Pick a clip plane first.' : null)}
        >
          Apply Clip
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !clipSession}
          onClick={() => cancelClipSession?.()}
          title="Cancel clip (Esc)"
        >
          Cancel
        </button>
      </div>
      {clipSession && (
        <p className="bb-muted">
          Clip session: {clipSession.points?.length || 0}/3 points
          {clipReady ? ' · plane ready (Enter)' : ''}
          {clipSession.preview?.ok === false ? ` · ${clipSession.preview.message}` : ''}
          {clipSession.preview?.ok ? ' · preview ok' : ''}
          {' · Esc cancels'}
        </p>
      )}
      {!selectedActor && (
        <p className="bb-muted">Select a brush to extrude or clip.</p>
      )}
    </div>
  );
}

function normalizeHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#') && color.length === 7) return color;
  return '#888888';
}
