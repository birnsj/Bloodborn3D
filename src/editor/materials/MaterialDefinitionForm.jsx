import { useMemo } from 'react';
import { ASSET_KINDS, listByKind } from '../../assets/AssetRegistry.js';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';

/**
 * Shared PBR material property form (Phase 2E.4).
 * Edits a draft object via onChange — does not persist.
 */
export function MaterialDefinitionForm({
  draft,
  onChange,
  disabled = false,
}) {
  const { registry } = useAssetBrowser();
  const textures = useMemo(
    () => listByKind(registry, ASSET_KINDS.texture),
    [registry],
  );

  if (!draft) {
    return <p className="bb-muted">No material selected.</p>;
  }

  const patch = (partial) => {
    if (disabled || !onChange) return;
    onChange({ ...draft, ...partial });
  };

  const textureSelect = (label, field) => (
    <label className="bb-field" key={field}>
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

  return (
    <div className="bb-material-def">
      <label className="bb-field">
        <span className="bb-field__label">Name</span>
        <input
          className="bb-input"
          disabled={disabled}
          value={draft.name || ''}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>

      <div className="bb-field-caption">Base</div>
      <label className="bb-field">
        <span className="bb-field__label">Base Color</span>
        <input
          className="bb-input"
          type="color"
          disabled={disabled}
          value={normalizeHex(draft.baseColor)}
          onChange={(e) => patch({ baseColor: e.target.value })}
        />
      </label>
      {textureSelect('Base Color Map', 'baseColorMapId')}
      {textureSelect('Normal Map', 'normalMapId')}
      <label className="bb-field">
        <span className="bb-field__label">Normal Scale</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.05}
          min={0}
          disabled={disabled}
          value={draft.normalScale ?? 1}
          onChange={(v) => patch({ normalScale: v })}
        />
      </label>

      <div className="bb-field-caption">Surface response</div>
      <label className="bb-field">
        <span className="bb-field__label">Roughness</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.roughness}
          onChange={(v) => patch({ roughness: v })}
        />
      </label>
      {textureSelect('Roughness Map', 'roughnessMapId')}
      <label className="bb-field">
        <span className="bb-field__label">Metalness</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.metalness}
          onChange={(v) => patch({ metalness: v })}
        />
      </label>
      {textureSelect('Metalness Map', 'metalnessMapId')}
      <label className="bb-field">
        <span className="bb-field__label">Env Map Intensity</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.05}
          min={0}
          disabled={disabled}
          value={draft.envMapIntensity ?? 1}
          onChange={(v) => patch({ envMapIntensity: v })}
        />
      </label>

      <div className="bb-field-caption">Emissive</div>
      <label className="bb-field">
        <span className="bb-field__label">Emissive</span>
        <input
          className="bb-input"
          type="color"
          disabled={disabled}
          value={normalizeHex(draft.emissive)}
          onChange={(e) => patch({ emissive: e.target.value })}
        />
      </label>
      <label className="bb-field">
        <span className="bb-field__label">Emissive Intensity</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.1}
          min={0}
          disabled={disabled}
          value={draft.emissiveIntensity}
          onChange={(v) => patch({ emissiveIntensity: v })}
        />
      </label>
      {textureSelect('Emissive Map', 'emissiveMapId')}

      <div className="bb-field-caption">Opacity</div>
      <label className="bb-field">
        <span className="bb-field__label">Opacity</span>
        <ScrubNumberInput
          className="bb-input"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.opacity}
          onChange={(v) => {
            const opacity = v;
            patch({ opacity, transparent: opacity < 1 });
          }}
        />
      </label>
      <label className="bb-field bb-field--row">
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(draft.transparent)}
          onChange={(e) => patch({ transparent: e.target.checked })}
        />
        <span className="bb-field__label">Transparent</span>
      </label>

      <div className="bb-field-caption">Material UV (Layer 2)</div>
      <div className="bb-field-row">
        <label className="bb-field">
          <span className="bb-field__label">Scale U</span>
          <ScrubNumberInput
            className="bb-input"
            step={0.05}
            disabled={disabled}
            value={draft.uvScale?.x ?? 1}
            onChange={(v) => patch({
              uvScale: { x: v, y: draft.uvScale?.y ?? 1 },
            })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Scale V</span>
          <ScrubNumberInput
            className="bb-input"
            step={0.05}
            disabled={disabled}
            value={draft.uvScale?.y ?? 1}
            onChange={(v) => patch({
              uvScale: { x: draft.uvScale?.x ?? 1, y: v },
            })}
          />
        </label>
      </div>
      <div className="bb-field-row">
        <label className="bb-field">
          <span className="bb-field__label">Offset U</span>
          <ScrubNumberInput
            className="bb-input"
            step={0.05}
            disabled={disabled}
            value={draft.uvOffset?.x ?? 0}
            onChange={(v) => patch({
              uvOffset: { x: v, y: draft.uvOffset?.y ?? 0 },
            })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Offset V</span>
          <ScrubNumberInput
            className="bb-input"
            step={0.05}
            disabled={disabled}
            value={draft.uvOffset?.y ?? 0}
            onChange={(v) => patch({
              uvOffset: { x: draft.uvOffset?.x ?? 0, y: v },
            })}
          />
        </label>
      </div>
      <label className="bb-field">
        <span className="bb-field__label">UV Rotation°</span>
        <ScrubNumberInput
          className="bb-input"
          step={1}
          disabled={disabled}
          value={draft.uvRotation ?? 0}
          onChange={(v) => patch({ uvRotation: v })}
        />
      </label>
    </div>
  );
}

function normalizeHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#') && color.length === 7) return color;
  return '#888888';
}
