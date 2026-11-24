import { useMemo } from 'react';
import { ASSET_KINDS, listByKind } from '../../assets/AssetRegistry.js';
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
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          disabled={disabled}
          value={draft.normalScale ?? 1}
          onChange={(e) => patch({ normalScale: Number(e.target.value) })}
        />
      </label>

      <div className="bb-field-caption">Surface response</div>
      <label className="bb-field">
        <span className="bb-field__label">Roughness</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.roughness}
          onChange={(e) => patch({ roughness: Number(e.target.value) })}
        />
      </label>
      {textureSelect('Roughness Map', 'roughnessMapId')}
      <label className="bb-field">
        <span className="bb-field__label">Metalness</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.metalness}
          onChange={(e) => patch({ metalness: Number(e.target.value) })}
        />
      </label>
      {textureSelect('Metalness Map', 'metalnessMapId')}
      <label className="bb-field">
        <span className="bb-field__label">Env Map Intensity</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          disabled={disabled}
          value={draft.envMapIntensity ?? 1}
          onChange={(e) => patch({ envMapIntensity: Number(e.target.value) })}
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
        <input
          className="bb-input"
          type="number"
          step={0.1}
          min={0}
          disabled={disabled}
          value={draft.emissiveIntensity}
          onChange={(e) => patch({ emissiveIntensity: Number(e.target.value) })}
        />
      </label>
      {textureSelect('Emissive Map', 'emissiveMapId')}

      <div className="bb-field-caption">Opacity</div>
      <label className="bb-field">
        <span className="bb-field__label">Opacity</span>
        <input
          className="bb-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          disabled={disabled}
          value={draft.opacity}
          onChange={(e) => {
            const opacity = Number(e.target.value);
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
          <input
            className="bb-input"
            type="number"
            step={0.05}
            disabled={disabled}
            value={draft.uvScale?.x ?? 1}
            onChange={(e) => patch({
              uvScale: { x: Number(e.target.value), y: draft.uvScale?.y ?? 1 },
            })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Scale V</span>
          <input
            className="bb-input"
            type="number"
            step={0.05}
            disabled={disabled}
            value={draft.uvScale?.y ?? 1}
            onChange={(e) => patch({
              uvScale: { x: draft.uvScale?.x ?? 1, y: Number(e.target.value) },
            })}
          />
        </label>
      </div>
      <div className="bb-field-row">
        <label className="bb-field">
          <span className="bb-field__label">Offset U</span>
          <input
            className="bb-input"
            type="number"
            step={0.05}
            disabled={disabled}
            value={draft.uvOffset?.x ?? 0}
            onChange={(e) => patch({
              uvOffset: { x: Number(e.target.value), y: draft.uvOffset?.y ?? 0 },
            })}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Offset V</span>
          <input
            className="bb-input"
            type="number"
            step={0.05}
            disabled={disabled}
            value={draft.uvOffset?.y ?? 0}
            onChange={(e) => patch({
              uvOffset: { x: draft.uvOffset?.x ?? 0, y: Number(e.target.value) },
            })}
          />
        </label>
      </div>
      <label className="bb-field">
        <span className="bb-field__label">UV Rotation°</span>
        <input
          className="bb-input"
          type="number"
          step={1}
          disabled={disabled}
          value={draft.uvRotation ?? 0}
          onChange={(e) => patch({ uvRotation: Number(e.target.value) })}
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
