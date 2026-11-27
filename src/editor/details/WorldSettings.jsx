import { useMemo } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { Collapsible, CollapsibleGroup } from '../../ui/Collapsible.jsx';
import { listByKind, ASSET_KINDS, isEnvironmentMapAsset } from '../../assets/AssetRegistry.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
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
} from '../../core/World.js';
import { PostProcessingSettings } from '../postprocessing/PostProcessingSettings.jsx';
import { normalizeHex } from './detailsUtils.js';
import { WorldScrubNumber } from './scrubFields.jsx';

export function WorldSettings() {
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
          {...helpProps('world.scene.clearEnvironment')}
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
