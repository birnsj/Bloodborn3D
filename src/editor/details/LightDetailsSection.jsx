import { useMemo } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible } from '../../ui/Collapsible.jsx';
import { listByKind, ASSET_KINDS } from '../../assets/AssetRegistry.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  LIGHT_TYPES,
  LENSFLARE_PRESETS,
  createLensflareFromPreset,
} from '../../components/LightComponent.js';
import { normalizeHex } from './detailsUtils.js';
import { LightScrubNumber } from './scrubFields.jsx';

export function LightDetailsSection({
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
                {...helpProps('details.light.shadowReset')}
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
      </div>
    </Collapsible>
  );
}
