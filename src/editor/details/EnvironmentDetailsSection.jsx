import { useMemo, useRef } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { listByKind, ASSET_KINDS } from '../../assets/AssetRegistry.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  ENVIRONMENT_TYPES,
  ENV_RT_RESOLUTIONS,
  environmentAuthorableSnapshot,
} from '../../components/EnvironmentComponent.js';

export function EnvScrubNumber({
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

export function EnvironmentDetailsSection({
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
