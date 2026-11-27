import { useCallback, useMemo, useRef } from 'react';
import {
  MATERIAL_SHADING_MODELS,
  MATERIAL_SIDES,
  normalizeMaterialDefinition,
} from '../../materials/MaterialDefinition.js';
import { ASSET_KINDS, listByKind } from '../../assets/AssetRegistry.js';
import {
  DEFAULT_MAP_CHANNELS,
  MAP_ID_TO_CHANNEL_KEY,
  normalizeMapChannels,
} from '../../assets/textureUvChannels.js';
import { Collapsible, CollapsibleGroup } from '../../ui/Collapsible.jsx';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
const SHADING_LABELS = {
  standard: 'Standard (PBR)',
  physical: 'Physical',
  basic: 'Basic (unlit)',
  toon: 'Toon',
  matcap: 'Matcap',
};

/**
 * Shared material property form (Batch 2).
 * Edits a draft object via onChange — does not persist.
 *
 * Optional gesture hooks coalesce numeric scrub into one draft-history entry:
 * onGestureBegin / onGestureCommit / onGestureCancel (Materials workspace undo).
 */
export function MaterialDefinitionForm({
  draft,
  onChange,
  disabled = false,
  onGestureBegin,
  onGestureCommit,
  onGestureCancel,
}) {
  const { registry } = useAssetBrowser();
  const textures = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture),
    [registry],
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const patch = useCallback((partial) => {
    if (disabled || !onChange || !draftRef.current) return;
    onChange(normalizeMaterialDefinition({ ...draftRef.current, ...partial }));
  }, [disabled, onChange]);

  const resetGroup = useCallback((defaults) => {
    patch(defaults);
  }, [patch]);

  if (!draft) {
    return <p className="bb-muted">No material selected.</p>;
  }

  const model = draft.shadingModel || 'standard';
  const isPbr = model === 'standard' || model === 'physical';
  const isPhysical = model === 'physical';
  const isBasic = model === 'basic';
  const isToon = model === 'toon';
  const isMatcap = model === 'matcap';

  const textureSelect = (label, field, helpId) => (
    <label className="bb-field" key={field} {...(helpId ? helpProps(helpId) : {})}>
      <span className="bb-field__label">{label}</span>
      <select
        className="bb-select"
        disabled={disabled}
        value={draft[field] || ''}
        onChange={(e) => patch({ [field]: e.target.value || null })}
      >
        <option value="">(none)</option>
        {textures.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );

  const colorField = (label, field) => (
    <label className="bb-field" key={field}>
      <span className="bb-field__label">{label}</span>
      <input
        className="bb-input"
        type="color"
        disabled={disabled}
        value={normalizeHex(draft[field])}
        onChange={(e) => patch({ [field]: e.target.value })}
      />
    </label>
  );

  const scrub = (label, field, opts = {}) => (
    <MaterialScrub
      key={field}
      label={label}
      disabled={disabled}
      value={opts.value ?? draft[field]}
      step={opts.step}
      min={opts.min}
      max={opts.max}
      onGestureBegin={onGestureBegin}
      onGestureCommit={onGestureCommit}
      onGestureCancel={onGestureCancel}
      onChange={(v) => {
        if (opts.map) patch(opts.map(v));
        else patch({ [field]: v });
      }}
      helpId={opts.helpId}
    />
  );

  const check = (label, field, opts = {}) => (
    <label className="bb-field bb-field--row" key={field}>
      <input
        type="checkbox"
        disabled={disabled}
        checked={opts.checked != null ? opts.checked : Boolean(draft[field])}
        onChange={(e) => {
          if (opts.map) patch(opts.map(e.target.checked));
          else patch({ [field]: e.target.checked });
        }}
      />
      <span className="bb-field__label">{label}</span>
    </label>
  );

  return (
    <div className="bb-material-def">
      <CollapsibleGroup storagePrefixes={['materials.form.']}>
        <label className="bb-field" {...helpProps('materials.shadingModel')}>
          <span className="bb-field__label">Shading model</span>
          <select
            className="bb-select"
            disabled={disabled}
            value={model}
            onChange={(e) => patch({ shadingModel: e.target.value })}
          >
            {MATERIAL_SHADING_MODELS.map((id) => (
              <option key={id} value={id}>{SHADING_LABELS[id] || id}</option>
            ))}
          </select>
        </label>
        <p className="bb-muted">
          Legacy assets default to Standard. Physical unlocks clearcoat, glass, sheen, and related maps.
        </p>

        <label className="bb-field">
          <span className="bb-field__label">Name</span>
          <input
            className="bb-input"
            disabled={disabled}
            value={draft.name || ''}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>

        <Collapsible title="Base" storageKey="materials.form.base" defaultOpen>
          {colorField('Base Color', 'baseColor')}
          {textureSelect('Base Color Map', 'baseColorMapId')}
          {(isPbr || isToon) && (
            <>
              {textureSelect('Normal Map', 'normalMapId')}
              {scrub('Normal Scale', 'normalScale', { step: 0.05, min: 0 })}
            </>
          )}
          {isMatcap && textureSelect('Matcap Map', 'matcapMapId', 'materials.matcap')}
          {isToon && textureSelect('Gradient Map', 'gradientMapId', 'materials.toon')}
          {isBasic && scrub('Reflectivity', 'reflectivity', { step: 0.05, min: 0, max: 1 })}
        </Collapsible>

        {isPbr && (
          <Collapsible title="Surface response" storageKey="materials.form.surface" defaultOpen>
            {scrub('Roughness', 'roughness', { step: 0.05, min: 0, max: 1 })}
            {textureSelect('Roughness Map', 'roughnessMapId')}
            {scrub('Metalness', 'metalness', { step: 0.05, min: 0, max: 1 })}
            {textureSelect('Metalness Map', 'metalnessMapId')}
            {scrub('Env Map Intensity', 'envMapIntensity', { step: 0.05, min: 0 })}
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              disabled={disabled}
              onClick={() => resetGroup({
                roughness: 0.75,
                metalness: 0.05,
                envMapIntensity: 1,
                roughnessMapId: null,
                metalnessMapId: null,
              })}
            >
              Reset surface
            </button>
          </Collapsible>
        )}

        {(isPbr || isToon || isBasic) && (
          <Collapsible title="Maps" storageKey="materials.form.maps">
            {textureSelect('AO Map', 'aoMapId')}
            {scrub('AO Intensity', 'aoMapIntensity', { step: 0.05, min: 0 })}
            {(isPbr || isToon) && (
              <>
                {textureSelect('Bump Map', 'bumpMapId')}
                {scrub('Bump Scale', 'bumpScale', { step: 0.05 })}
                {textureSelect('Displacement Map', 'displacementMapId')}
                {scrub('Displacement Scale', 'displacementScale', { step: 0.05 })}
                {scrub('Displacement Bias', 'displacementBias', { step: 0.05 })}
              </>
            )}
            {textureSelect('Alpha Map', 'alphaMapId')}
            {textureSelect('Light Map', 'lightMapId')}
            {scrub('Light Map Intensity', 'lightMapIntensity', { step: 0.05, min: 0 })}
          </Collapsible>
        )}

        {(isPbr || isToon) && (
          <Collapsible title="Emissive" storageKey="materials.form.emissive">
            {colorField('Emissive', 'emissive')}
            {scrub('Emissive Intensity', 'emissiveIntensity', { step: 0.1, min: 0 })}
            {textureSelect('Emissive Map', 'emissiveMapId')}
          </Collapsible>
        )}

        {isPhysical && (
          <>
            <Collapsible title="Clearcoat" storageKey="materials.form.clearcoat">
              {scrub('Clearcoat', 'clearcoat', { step: 0.05, min: 0, max: 1 })}
              {scrub('Clearcoat Roughness', 'clearcoatRoughness', { step: 0.05, min: 0, max: 1 })}
              {textureSelect('Clearcoat Map', 'clearcoatMapId')}
              {textureSelect('Clearcoat Normal Map', 'clearcoatNormalMapId')}
              {scrub('Clearcoat Normal Scale', 'clearcoatNormalScale', { step: 0.05, min: 0 })}
              {textureSelect('Clearcoat Roughness Map', 'clearcoatRoughnessMapId')}
            </Collapsible>

            <Collapsible title="Transmission / glass" storageKey="materials.form.transmission">
              {scrub('Transmission', 'transmission', { step: 0.05, min: 0, max: 1 })}
              {textureSelect('Transmission Map', 'transmissionMapId')}
              {scrub('Thickness', 'thickness', { step: 0.05, min: 0 })}
              {textureSelect('Thickness Map', 'thicknessMapId')}
              {scrub('IOR', 'ior', { step: 0.01, min: 1, max: 2.333 })}
              {colorField('Attenuation Color', 'attenuationColor')}
              {scrub('Attenuation Distance', 'attenuationDistance', {
                step: 0.1,
                min: 0,
                value: Number.isFinite(draft.attenuationDistance) && draft.attenuationDistance !== Infinity
                  ? draft.attenuationDistance
                  : 0,
                map: (v) => ({ attenuationDistance: v <= 0 ? Infinity : v }),
              })}
              {scrub('Dispersion', 'dispersion', { step: 0.05, min: 0 })}
            </Collapsible>

            <Collapsible title="Sheen" storageKey="materials.form.sheen">
              {scrub('Sheen', 'sheen', { step: 0.05, min: 0, max: 1 })}
              {scrub('Sheen Roughness', 'sheenRoughness', { step: 0.05, min: 0, max: 1 })}
              {colorField('Sheen Color', 'sheenColor')}
              {textureSelect('Sheen Color Map', 'sheenColorMapId')}
              {textureSelect('Sheen Roughness Map', 'sheenRoughnessMapId')}
            </Collapsible>

            <Collapsible title="Specular" storageKey="materials.form.specular">
              {scrub('Specular Intensity', 'specularIntensity', { step: 0.05, min: 0 })}
              {colorField('Specular Color', 'specularColor')}
              {textureSelect('Specular Intensity Map', 'specularIntensityMapId')}
              {textureSelect('Specular Color Map', 'specularColorMapId')}
            </Collapsible>

            <Collapsible title="Iridescence" storageKey="materials.form.iridescence">
              {scrub('Iridescence', 'iridescence', { step: 0.05, min: 0, max: 1 })}
              {scrub('Iridescence IOR', 'iridescenceIOR', { step: 0.01, min: 1, max: 2.333 })}
              {scrub('Thickness Min (nm)', 'iridescenceThicknessMin', { step: 10, min: 0 })}
              {scrub('Thickness Max (nm)', 'iridescenceThicknessMax', { step: 10, min: 0 })}
              {textureSelect('Iridescence Map', 'iridescenceMapId')}
              {textureSelect('Iridescence Thickness Map', 'iridescenceThicknessMapId')}
            </Collapsible>

            <Collapsible title="Anisotropy" storageKey="materials.form.anisotropy">
              {scrub('Anisotropy', 'anisotropy', { step: 0.05, min: -1, max: 1 })}
              {scrub('Anisotropy Rotation°', 'anisotropyRotation', { step: 1 })}
              {textureSelect('Anisotropy Map', 'anisotropyMapId')}
            </Collapsible>
          </>
        )}

        <Collapsible title="Opacity & coverage" storageKey="materials.form.opacity" defaultOpen>
          {scrub('Opacity', 'opacity', {
            step: 0.05,
            min: 0,
            max: 1,
            map: (opacity) => ({ opacity, transparent: opacity < 1 || draft.transparent }),
          })}
          {check('Transparent', 'transparent')}
          {scrub('Alpha Test', 'alphaTest', { step: 0.01, min: 0, max: 1, helpId: 'materials.alphaTest' })}
          {check('Alpha Hash', 'alphaHash')}
          {check('Alpha To Coverage', 'alphaToCoverage')}
        </Collapsible>

        <Collapsible title="Surface flags" storageKey="materials.form.flags">
          <label className="bb-field">
            <span className="bb-field__label">Side</span>
            <select
              className="bb-select"
              disabled={disabled}
              value={draft.side || 'front'}
              onChange={(e) => patch({ side: e.target.value })}
            >
              {MATERIAL_SIDES.map((s) => (
                <option key={s} value={s}>
                  {s === 'front' ? 'Front' : s === 'back' ? 'Back' : 'Double'}
                </option>
              ))}
            </select>
          </label>
          {check('Depth Write', 'depthWrite', { checked: draft.depthWrite !== false })}
          {check('Wireframe', 'wireframe')}
          {check('Flat Shading', 'flatShading')}
          {check('Fog', 'fog', { checked: draft.fog !== false })}
          {check('Tone Mapped', 'toneMapped', { checked: draft.toneMapped !== false })}
        </Collapsible>

        <Collapsible title="Material UV (Layer 2)" storageKey="materials.form.uv">
          <p className="bb-muted" {...helpProps('materials.uvLayers')}>
            Layer 2 scales/offsets/rotates all maps together. Texture Asset Viewer
            transform (repeat/offset/rotation) applies first; surface face UV is Layer 1.
          </p>
          <div className="bb-field-row">
            {scrub('Scale U', 'uvScale.x', {
              step: 0.05,
              value: draft.uvScale?.x ?? 1,
              map: (v) => ({ uvScale: { x: v, y: draft.uvScale?.y ?? 1 } }),
            })}
            {scrub('Scale V', 'uvScale.y', {
              step: 0.05,
              value: draft.uvScale?.y ?? 1,
              map: (v) => ({ uvScale: { x: draft.uvScale?.x ?? 1, y: v } }),
            })}
          </div>
          <div className="bb-field-row">
            {scrub('Offset U', 'uvOffset.x', {
              step: 0.05,
              value: draft.uvOffset?.x ?? 0,
              map: (v) => ({ uvOffset: { x: v, y: draft.uvOffset?.y ?? 0 } }),
            })}
            {scrub('Offset V', 'uvOffset.y', {
              step: 0.05,
              value: draft.uvOffset?.y ?? 0,
              map: (v) => ({ uvOffset: { x: draft.uvOffset?.x ?? 0, y: v } }),
            })}
          </div>
          {scrub('UV Rotation°', 'uvRotation', { step: 1 })}
        </Collapsible>

        <Collapsible title="UV Channels" storageKey="materials.form.mapChannels">
          <p className="bb-muted" {...helpProps('materials.uvChannels')}>
            Select which geometry UV set each assigned map samples (Three.js Texture.channel).
            Defaults are UV0. Set AO/lightMap to UV1/UV2 when geometry has those sets. Missing channels warn at bind time — baking is not included.
          </p>
          <div className="bb-map-channels">
            {Object.entries(MAP_ID_TO_CHANNEL_KEY)
              .filter(([mapIdField]) => draft[mapIdField])
              .map(([mapIdField, channelKey]) => {
                const channels = normalizeMapChannels(draft.mapChannels);
                const value = channels[channelKey] ?? DEFAULT_MAP_CHANNELS[channelKey] ?? 0;
                return (
                  <label className="bb-field" key={mapIdField}>
                    <span className="bb-field__label">{channelKey} UV</span>
                    <select
                      className="bb-select"
                      disabled={disabled}
                      value={String(value)}
                      onChange={(e) => {
                        const next = normalizeMapChannels({
                          ...draft.mapChannels,
                          [channelKey]: Number(e.target.value),
                        });
                        patch({ mapChannels: next });
                      }}
                    >
                      <option value="0">UV0</option>
                      <option value="1">UV1</option>
                      <option value="2">UV2</option>
                      <option value="3">UV3</option>
                    </select>
                  </label>
                );
              })}
            {!Object.keys(MAP_ID_TO_CHANNEL_KEY).some((f) => draft[f]) && (
              <p className="bb-muted">Assign a texture map above to choose its UV channel.</p>
            )}
          </div>
        </Collapsible>
      </CollapsibleGroup>
    </div>
  );
}

function MaterialScrub({
  label,
  value,
  disabled,
  step = 0.05,
  min,
  max,
  onChange,
  onGestureBegin,
  onGestureCommit,
  onGestureCancel,
  helpId,
}) {
  return (
    <label className="bb-field" {...(helpId ? helpProps(helpId) : {})}>
      <span className="bb-field__label">{label}</span>
      <ScrubNumberInput
        className="bb-input"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onGestureStart={onGestureBegin}
        onChange={onChange}
        onCommit={onGestureCommit}
        onCancel={onGestureCancel}
      />
    </label>
  );
}

function normalizeHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#') && color.length === 7) return color;
  return '#888888';
}
