import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { listByKind, ASSET_KINDS } from '../../assets/AssetRegistry.js';
import {
  EFFECT_CATEGORIES,
  EFFECT_DEFINITIONS,
  effectInputsReady,
} from '../../runtime/postprocessing/effectRegistry.js';
import {
  DEFAULT_POST_PROCESSING,
  MULTISAMPLING_OPTIONS,
  normalizePostProcessing,
} from '../../runtime/postprocessing/postProcessingState.js';
import {
  fetchProjectPostProcessingPresets,
  listAllPostProcessingPresets,
  makePresetId,
  saveProjectPostProcessingPresets,
} from './presetApi.js';

function EffectParamControl({
  param,
  value,
  disabled,
  actors,
  textures,
  onChange,
  onCommit,
}) {
  if (param.type === 'boolean') {
    return (
      <label className="bb-field bb-field--row">
        <span className="bb-field__label">{param.label}</span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(e) => onCommit?.(e.target.checked)}
        />
      </label>
    );
  }

  if (param.type === 'color') {
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <input
          className="bb-input"
          type="color"
          disabled={disabled}
          value={typeof value === 'string' ? value : '#ffffff'}
          onChange={(e) => onCommit?.(e.target.value)}
        />
      </label>
    );
  }

  if (param.type === 'enum') {
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <select
          className="bb-input"
          disabled={disabled}
          value={value}
          onChange={(e) => onCommit?.(e.target.value)}
        >
          {(param.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === 'number') {
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <ScrubNumberInput
          className="bb-input"
          disabled={disabled}
          value={Number(value) || 0}
          min={param.min}
          max={param.max}
          step={param.step ?? 0.01}
          onChange={(v) => {
            onChange(v);
            onCommit?.(v);
          }}
        />
      </label>
    );
  }

  if (param.type === 'actorIds') {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <select
          className="bb-input"
          multiple
          disabled={disabled}
          value={[...selected]}
          size={Math.min(6, Math.max(3, actors.length || 3))}
          onChange={(e) => {
            const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
            onCommit?.(ids);
          }}
        >
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name || a.id}</option>
          ))}
        </select>
        <span className="bb-muted">Hold Ctrl/Cmd to multi-select.</span>
      </label>
    );
  }

  if (param.type === 'lightActorId') {
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <select
          className="bb-input"
          disabled={disabled}
          value={value || ''}
          onChange={(e) => onCommit?.(e.target.value || null)}
        >
          <option value="">— Select light —</option>
          {actors.filter((a) => a.hasLight).map((a) => (
            <option key={a.id} value={a.id}>{a.name || a.id}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === 'textureAssetId') {
    return (
      <label className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <select
          className="bb-input"
          disabled={disabled}
          value={value || ''}
          onChange={(e) => onCommit?.(e.target.value || null)}
        >
          <option value="">— Select texture —</option>
          {textures.map((t) => (
            <option key={t.id} value={t.id}>{t.name || t.id}</option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === 'vec3') {
    const v = value || { x: 0, y: 0, z: 0 };
    const setAxis = (axis, n) => {
      onChange({ ...v, [axis]: n });
    };
    return (
      <div className="bb-field">
        <span className="bb-field__label">{param.label}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem' }}>
          {['x', 'y', 'z'].map((axis) => (
            <ScrubNumberInput
              key={axis}
              className="bb-input"
              disabled={disabled}
              value={Number(v[axis]) || 0}
              step={5}
              onChange={(n) => {
                const next = { ...v, [axis]: n };
                onChange(next);
                onCommit?.(next);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function EffectSection({
  effectId,
  state,
  disabled,
  actors,
  textures,
  commitEffect,
  resetEffect,
}) {
  const def = EFFECT_DEFINITIONS[effectId];
  if (!def || !state) return null;
  const live = state;
  const ready = effectInputsReady(effectId, live);

  return (
    <Collapsible
      title={`${def.label}${live.enabled ? '' : ' (off)'}`}
      storageKey={`world.pp.${effectId}`}
      defaultOpen={false}
    >
      {def.note ? <p className="bb-muted">{def.note}</p> : null}
      {!ready && live.enabled ? (
        <p className="bb-muted">Requires inputs before this effect runs.</p>
      ) : null}
      <label className="bb-field bb-field--row">
        <span className="bb-field__label">Enabled</span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(live.enabled)}
          onChange={(e) => {
            commitEffect(effectId, { enabled: e.target.checked });
          }}
        />
      </label>
      {def.params.map((param) => {
        const isRequiredInput = def.requires?.includes(param.key)
          || (param.type === 'actorIds' && def.requires?.includes('actorIds'))
          || (param.type === 'lightActorId' && def.requires?.includes('lightActorId'))
          || (param.type === 'textureAssetId' && def.requires?.includes('textureAssetId'))
          || (param.type === 'vec3' && def.requires?.includes('epicenter'));
        return (
          <EffectParamControl
            key={param.key}
            param={param}
            value={live[param.key]}
            disabled={disabled || (!live.enabled && !isRequiredInput)}
            actors={actors}
            textures={textures}
            onChange={() => {}}
            onCommit={(v) => commitEffect(effectId, { [param.key]: v })}
          />
        );
      })}
      <button
        type="button"
        className="bb-btn bb-btn--ghost"
        disabled={disabled}
        onClick={() => resetEffect(effectId)}
      >
        Reset effect
      </button>
    </Collapsible>
  );
}

export function PostProcessingSettings() {
  const {
    world,
    mode,
    revision,
    updateWorldPostProcessing,
    resetWorldPostProcessingEffect,
    resetWorldPostProcessingAll,
    runtimeRef,
  } = useEditor();
  const disabled = mode === 'play' || !world;
  void revision;

  const settings = normalizePostProcessing(world?.postProcessing || DEFAULT_POST_PROCESSING);
  const { registry } = useAssetBrowser();
  const [projectPresets, setProjectPresets] = useState([]);
  const [presetId, setPresetId] = useState('default-disabled');
  const [saveName, setSaveName] = useState('');
  const [preview, setPreview] = useState(() => (
    runtimeRef?.current?.sceneView?.postProcessingPreview !== false
  ));

  useEffect(() => {
    let cancelled = false;
    fetchProjectPostProcessingPresets()
      .then((data) => {
        if (!cancelled) setProjectPresets(data.presets || []);
      })
      .catch(() => {
        if (!cancelled) setProjectPresets([]);
      });
    return () => { cancelled = true; };
  }, []);

  const allPresets = useMemo(
    () => listAllPostProcessingPresets(projectPresets),
    [projectPresets],
  );

  const actors = useMemo(() => {
    if (!world?.actors) return [];
    return world.actors.map((a) => ({
      id: a.id,
      name: a.name,
      hasLight: Boolean(a.getComponent?.('Light')),
    }));
  }, [world, revision]);

  const textures = useMemo(() => {
    if (!registry) return [];
    return listByKind(registry, ASSET_KINDS.texture).map((a) => ({
      id: a.id,
      name: a.name,
    }));
  }, [registry]);

  const commitGlobal = useCallback((partial, opts) => {
    updateWorldPostProcessing?.(partial, opts);
  }, [updateWorldPostProcessing]);

  const commitEffect = useCallback((effectId, patch) => {
    updateWorldPostProcessing?.(
      { effects: { [effectId]: patch } },
      { label: `Edit ${EFFECT_DEFINITIONS[effectId]?.label || effectId}` },
    );
  }, [updateWorldPostProcessing]);

  const applyPreset = useCallback(() => {
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) return;
    updateWorldPostProcessing?.(preset.settings, {
      replace: true,
      label: `Apply preset ${preset.label}`,
    });
  }, [allPresets, presetId, updateWorldPostProcessing]);

  const savePreset = useCallback(async () => {
    const label = saveName.trim() || 'Custom preset';
    const id = makePresetId(label);
    const next = [
      ...projectPresets.filter((p) => p.id !== id),
      {
        id,
        label,
        settings: settings,
        updatedAt: Date.now(),
      },
    ];
    const saved = await saveProjectPostProcessingPresets(next);
    setProjectPresets(saved.presets || next);
    setPresetId(id);
    setSaveName('');
  }, [projectPresets, saveName, settings]);

  const deletePreset = useCallback(async () => {
    if (!presetId || presetId.startsWith('default') || BUILTIN_IDS.has(presetId)) return;
    const next = projectPresets.filter((p) => p.id !== presetId);
    const saved = await saveProjectPostProcessingPresets(next);
    setProjectPresets(saved.presets || next);
    setPresetId('default-disabled');
  }, [presetId, projectPresets]);

  const setPreviewLive = useCallback((on) => {
    setPreview(on);
    runtimeRef?.current?.sceneView?.setPostProcessingPreview?.(on);
    try {
      window.dispatchEvent(new CustomEvent('bb:post-processing-preview', {
        detail: { enabled: on },
      }));
    } catch {
      /* ignore */
    }
  }, [runtimeRef]);

  return (
    <Collapsible title="Post Processing" storageKey="world.postProcessing" defaultOpen={false}>
      <p className="bb-muted" {...helpProps('world.postProcessing')}>
        Map-authored image effects (pmndrs). Ambient fills the scene; exposure and tone mapping
        sit after lighting. Ortho / wireframe panes stay raw.
      </p>

      <label className="bb-field bb-field--row">
        <span className="bb-field__label">Enabled</span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(settings.enabled)}
          onChange={(e) => commitGlobal({ enabled: e.target.checked }, { label: 'Toggle post-processing' })}
        />
      </label>
      {!settings.enabled ? (
        <p className="bb-muted">Turn Enabled on to edit and preview effects in the perspective Lit view.</p>
      ) : (
        <p className="bb-muted">
          {runtimeRef?.current?.sceneView?.postProcessingController?.isActive
            ? 'Composer active'
            : 'Native tone mapping (composer starts when you enable bloom, AA, etc.)'}
          {' · '}Effects with required inputs stay off until you set those inputs.
        </p>
      )}

      <label className="bb-field bb-field--row" {...helpProps('world.postProcessingPreview')}>
        <span className="bb-field__label">Editor preview</span>
        <input
          type="checkbox"
          disabled={disabled}
          checked={preview}
          onChange={(e) => setPreviewLive(e.target.checked)}
        />
      </label>

      <label className="bb-field" {...helpProps('world.postProcessingExposure')}>
        <span className="bb-field__label">Exposure</span>
        <ScrubNumberInput
          className="bb-input"
          disabled={disabled || !settings.enabled}
          value={settings.exposure}
          min={0.05}
          max={8}
          step={0.05}
          onChange={(v) => commitGlobal({ exposure: v }, { label: 'Edit exposure' })}
        />
      </label>

      <label className="bb-field">
        <span className="bb-field__label">Multisampling</span>
        <select
          className="bb-input"
          disabled={disabled || !settings.enabled}
          value={settings.multisampling}
          onChange={(e) => commitGlobal(
            { multisampling: Number(e.target.value) },
            { label: 'Edit multisampling' },
          )}
        >
          {MULTISAMPLING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="bb-field">
        <span className="bb-field__label">Presets</span>
        <select
          className="bb-input"
          disabled={disabled}
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
        >
          {allPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.builtin ? p.label : `${p.label} (project)`}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
          <button type="button" className="bb-btn" disabled={disabled} onClick={applyPreset}>
            Apply
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={disabled}
            onClick={() => resetWorldPostProcessingAll?.()}
          >
            Reset all
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={disabled || BUILTIN_IDS.has(presetId)}
            onClick={() => { void deletePreset(); }}
          >
            Delete preset
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
          <input
            className="bb-input"
            disabled={disabled}
            placeholder="Save as…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <button
            type="button"
            className="bb-btn"
            disabled={disabled}
            onClick={() => { void savePreset(); }}
          >
            Save
          </button>
        </div>
      </div>

      {EFFECT_CATEGORIES.map((cat) => (
        <Collapsible
          key={cat.id}
          title={cat.label}
          storageKey={`world.pp.cat.${cat.id}`}
          defaultOpen={cat.id === 'rendering' || cat.id === 'lighting'}
        >
          {cat.effectIds.map((effectId) => (
            <EffectSection
              key={effectId}
              effectId={effectId}
              state={settings.effects[effectId]}
              disabled={disabled || !settings.enabled}
              actors={actors}
              textures={textures}
              commitEffect={commitEffect}
              resetEffect={(id) => resetWorldPostProcessingEffect?.(id)}
            />
          ))}
        </Collapsible>
      ))}
    </Collapsible>
  );
}

const BUILTIN_IDS = new Set([
  'default-disabled',
  'gothic-interior',
  'dark-horror',
  'cinematic',
  'retro-horror',
]);
