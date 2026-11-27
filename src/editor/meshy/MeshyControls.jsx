import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import {
  suppressNativeImageMenu,
  useEditorContextMenu,
} from '../../ui/contextMenu/EditorContextMenu.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  getAiAssetsUiState,
  removeGenerationReference,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import {
  projectArtPreviewUrl,
} from '../projectArt/projectArtStore.js';
import {
  GAME_CHARACTER_PRESET,
  GAME_PROP_PRESET,
  MESHY_ASSET_CATEGORIES,
  MESHY_POSE_MODES,
  MODEL_TYPES,
  availableResolutionsForTexture,
  availableTextureModels,
  geometryModelsForType,
  estimateImageTo3dCredits,
} from '../../dev/meshy/meshyModels.js';
import {
  MESHY_DECIMATION_MODES,
  MESHY_GEOMETRY_RESOLUTIONS,
  MESHY_ORIGIN_OPTIONS,
  MESHY_OUTPUT_FORMATS,
  capabilityForImageTo3dSetting,
  summarizeImageTo3dSettings,
} from '../../dev/meshy/meshyCapabilities.js';
import {
  getMeshyUiState,
  meshyApplyPreset,
  meshyClearReference,
  meshyConnect,
  meshyEstimate,
  meshyGenerate,
  meshyLogin,
  meshySetFormValue,
  meshySetReference,
  meshyUploadReferenceFile,
  subscribeMeshyUi,
} from './meshyUiStore.js';
import { uploadMeshyReference } from '../../io/meshyClient.js';

/**
 * Meshy Image-to-3D generation controls (center column).
 */
export function MeshyControls() {
  const [ui, setUi] = useState(() => getMeshyUiState());
  const [aiUi, setAiUi] = useState(() => getAiAssetsUiState());
  const { notify, setStatus } = useAssetBrowser();
  const { confirm } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const fileRef = useRef(null);
  const connectedRef = useRef(false);

  useEffect(() => subscribeMeshyUi(setUi), []);
  useEffect(() => subscribeAiAssetsUi(setAiUi), []);

  useEffect(() => {
    if (connectedRef.current) return undefined;
    connectedRef.current = true;
    meshyConnect().catch(() => {});
    return undefined;
  }, []);

  const trayRefs = aiUi.generationReferences || [];
  const form = ui.formValues || {};
  const assetCategory = form.asset_category === 'character' ? 'character' : 'prop';
  const isCharacter = assetCategory === 'character';
  const modelType = form.model_type || MODEL_TYPES.smartTopology;
  const geometryOptions = useMemo(
    () => geometryModelsForType(modelType),
    [modelType],
  );
  const textureOptions = useMemo(
    () => availableTextureModels({
      shouldTexture: form.should_texture !== false,
      enablePbr: Boolean(form.enable_pbr),
      textureResolution: form.texture_resolution || '2k',
    }),
    [form.should_texture, form.enable_pbr, form.texture_resolution],
  );
  const resolutionOptions = useMemo(
    () => availableResolutionsForTexture(form.texture_model || 'meshy-7'),
    [form.texture_model],
  );

  const localCredits = ui.localCreditEstimate?.credits
    ?? estimateImageTo3dCredits(form).credits
    ?? '—';

  const onPickFromTray = useCallback(async (ref) => {
    try {
      setStatus('Preparing Meshy reference…');
      const url = projectArtPreviewUrl(ref.relativePath);
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${ref.title || 'reference'}.png`, { type: blob.type || 'image/png' });
      const uploaded = await uploadMeshyReference(file);
      meshySetReference({
        stagingPath: uploaded.relativePath,
        previewUrl: uploaded.previewUrl,
        title: ref.title,
        source: 'project-art',
        provenance: {
          projectArtItemId: ref.id,
          relativePath: ref.relativePath,
        },
      });
      setStatus(`Meshy reference: ${ref.title}`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, setStatus]);

  const onEstimate = useCallback(async () => {
    try {
      const estimate = await meshyEstimate();
      setStatus(`Meshy estimate: ${estimate.credits} credits`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, setStatus]);

  const onGenerate = useCallback(async () => {
    try {
      let estimate = ui.estimate;
      if (!estimate?.estimateId) {
        estimate = await meshyEstimate();
      }
      const credits = estimate?.credits ?? localCredits;
      const summary = summarizeImageTo3dSettings({
        ...form,
        asset_category: assetCategory,
      }).join('\n');
      const ok = await confirm(
        `Spend approximately ${credits} Meshy credits on one Image-to-3D generation?\n\n`
        + `${summary}\n`
        + '\nThis will not auto-retry if it fails.',
        {
          title: 'Approve Meshy spend',
          confirmLabel: 'Generate',
          tone: 'warning',
        },
      );
      if (!ok) return;
      setStatus('Submitting Meshy Image-to-3D…');
      await meshyGenerate({ confirmSpend: true });
      setStatus('Meshy generation finished');
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [ui.estimate, localCredits, form, isCharacter, confirm, notify, setStatus]);

  const balance = ui.status?.balance?.balance;
  const connected = Boolean(ui.status?.ok);
  const cliMissing = ui.errorCode === 'CLI_MISSING' || ui.status?.code === 'CLI_MISSING';
  const statusLabel = useMemo(() => {
    if (cliMissing) return 'CLI missing';
    if (ui.errorCode === 'AUTH_FAILED' || ui.status?.code === 'AUTH_FAILED') {
      return 'Not authenticated';
    }
    if (ui.phase === 'connecting') return 'Connecting…';
    if (connected) return 'Connected';
    if (ui.phase === 'failed' && ui.error) return 'Error';
    return 'Unknown';
  }, [cliMissing, ui.errorCode, ui.status?.code, ui.phase, connected, ui.error]);

  return (
    <div className="bb-meshy-controls" {...helpProps('meshy.controls')}>
      <div className="bb-openart__status-row">
        <span className={`bb-openart__pill${connected ? ' is-ok' : ' is-bad'}`}>
          <span className="bb-openart__pill-dot" aria-hidden />
          {statusLabel}
        </span>
        <span className="bb-muted">
          {balance != null
            ? `${Number(balance).toLocaleString()} credits`
            : '— credits'}
        </span>
        {(ui.errorCode === 'AUTH_FAILED'
          || ui.status?.code === 'AUTH_FAILED'
          || (!connected && !cliMissing)) && (
          <button
            type="button"
            className="bb-btn"
            disabled={ui.busy || cliMissing}
            onClick={() => {
              meshyLogin()
                .then((res) => notify(res.message || 'Finish browser login, then Refresh.'))
                .catch((err) => notify(err.message));
            }}
            {...helpProps('meshy.connect')}
          >
            Log in
          </button>
        )}
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={ui.busy}
          onClick={() => meshyConnect().catch((err) => notify(err.message))}
          {...helpProps('meshy.connect')}
        >
          Refresh
        </button>
      </div>

      {ui.error && (
        <div className="bb-openart__error" role="alert">
          {ui.errorCode ? `[${ui.errorCode}] ` : ''}{ui.error}
        </div>
      )}

      <div className="bb-meshy-controls__ref" {...helpProps('meshy.reference')}>
        <span className="bb-field-caption">Reference image</span>
        <div className="bb-meshy-controls__ref-stage">
          {ui.reference?.previewUrl ? (
            <img
              src={ui.reference.previewUrl}
              alt={ui.reference.title || 'Reference'}
              draggable={false}
              onContextMenu={(event) => {
                openFromEvent(event, [
                  {
                    id: 'clear',
                    label: 'Remove Reference',
                    onSelect: () => meshyClearReference(),
                  },
                ]);
              }}
            />
          ) : (
            <div className="bb-muted">Select a Project Art image, tray reference, or import a file.</div>
          )}
        </div>
        <div className="bb-meshy-controls__ref-actions">
          <button
            type="button"
            className="bb-btn"
            disabled={ui.busy}
            onClick={() => fileRef.current?.click()}
            {...helpProps('meshy.reference')}
          >
            Import Image…
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={ui.busy || !ui.reference}
            onClick={() => meshyClearReference()}
            {...helpProps('meshy.reference', ui.reference ? null : 'No reference image loaded.')}
          >
            Remove
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={ui.busy}
            onClick={() => meshyApplyPreset(
              isCharacter ? GAME_CHARACTER_PRESET : GAME_PROP_PRESET,
            )}
            {...helpProps('meshy.preset')}
          >
            {isCharacter ? 'Character Preset' : 'Game Prop Preset'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              meshyUploadReferenceFile(file).catch((err) => notify(err.message));
            }
          }}
        />
      </div>

      {trayRefs.length > 0 && (
        <div className="bb-meshy-controls__tray">
          <span className="bb-field-caption">Project Art references</span>
          <div className="bb-meshy-controls__tray-strip">
            {trayRefs.map((ref) => {
              const rurl = projectArtPreviewUrl(ref.relativePath);
              return (
                <button
                  key={ref.id}
                  type="button"
                  className="bb-meshy-controls__tray-thumb"
                  title={`Use ${ref.title}`}
                  onClick={() => onPickFromTray(ref)}
                  onContextMenu={(event) => {
                    openFromEvent(event, [
                      {
                        id: 'use',
                        label: 'Use as Meshy Reference',
                        onSelect: () => onPickFromTray(ref),
                      },
                      {
                        id: 'remove',
                        label: 'Remove from Tray',
                        onSelect: () => removeGenerationReference(ref.id),
                      },
                    ]);
                  }}
                >
                  {rurl ? (
                    <img src={rurl} alt="" draggable={false} onContextMenu={suppressNativeImageMenu} />
                  ) : '?'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bb-meshy-controls__settings" {...helpProps('meshy.settings')}>
        <span className="bb-field-caption">Generation settings</span>

        <label className="bb-field" {...helpProps('meshy.category')}>
          <span className="bb-field-caption">Category</span>
          <select
            className="bb-select"
            value={assetCategory}
            disabled={ui.busy}
            onChange={(e) => meshySetFormValue('asset_category', e.target.value)}
          >
            {MESHY_ASSET_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>

        {isCharacter && (
          <>
            <label className="bb-field" {...helpProps('meshy.pose')}>
              <span className="bb-field-caption">Pose</span>
              <select
                className="bb-select"
                value={form.pose_mode || ''}
                disabled={ui.busy}
                onChange={(e) => meshySetFormValue('pose_mode', e.target.value)}
              >
                {MESHY_POSE_MODES.map((p) => (
                  <option key={p.id || 'default'} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className="bb-field bb-field--row" {...helpProps('meshy.includeObjects')}>
              <input
                type="checkbox"
                checked={form.include_objects !== false}
                disabled={ui.busy}
                onChange={(e) => meshySetFormValue('include_objects', e.target.checked)}
              />
              <span className="bb-field-caption">Include objects (weapons / held props)</span>
            </label>
            <p className="bb-muted">
              Meshy builds whatever is in the reference image. Leave Include objects on when
              weapons should stay in the mesh; turn it off as a reminder to use a character-only
              sketch (no held weapons).
            </p>
          </>
        )}

        <label className="bb-field">
          <span className="bb-field-caption">Mesh type</span>
          <select
            className="bb-select"
            value={modelType}
            disabled={ui.busy}
            onChange={(e) => meshySetFormValue('model_type', e.target.value)}
          >
            <option value={MODEL_TYPES.smartTopology}>Smart Topology</option>
            <option value={MODEL_TYPES.standard}>Standard</option>
          </select>
        </label>

        <label className="bb-field">
          <span className="bb-field-caption">Geometry model</span>
          <select
            className="bb-select"
            value={form.ai_model}
            disabled={ui.busy}
            onChange={(e) => meshySetFormValue('ai_model', e.target.value)}
          >
            {geometryOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>

        {(() => {
          const remeshCap = capabilityForImageTo3dSetting('should_remesh', form);
          const polyCap = capabilityForImageTo3dSetting('target_polycount', form);
          const topoCap = capabilityForImageTo3dSetting('topology', form);
          const geoResCap = capabilityForImageTo3dSetting('geometry_resolution', form);
          const decCap = capabilityForImageTo3dSetting('decimation_mode', form);
          const preCap = capabilityForImageTo3dSetting('save_pre_remeshed_model', form);
          const pbrCap = capabilityForImageTo3dSetting('enable_pbr', form);
          const enhanceCap = capabilityForImageTo3dSetting('image_enhancement', form);
          const lightCap = capabilityForImageTo3dSetting('remove_lighting', form);
          const mvCap = capabilityForImageTo3dSetting('multi_view_thumbnails', form);
          const promptCap = capabilityForImageTo3dSetting('texture_prompt', form);
          return (
            <>
              <label className="bb-field" {...helpProps('meshy.geometryResolution')}>
                <span className="bb-field-caption">Geometry resolution</span>
                <select
                  className="bb-select"
                  value={form.geometry_resolution || 'standard'}
                  disabled={ui.busy || !geoResCap.available}
                  onChange={(e) => meshySetFormValue('geometry_resolution', e.target.value)}
                >
                  {MESHY_GEOMETRY_RESOLUTIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                {!geoResCap.available && <p className="bb-muted">{geoResCap.reason}</p>}
                {geoResCap.available && geoResCap.note && <p className="bb-muted">{geoResCap.note}</p>}
              </label>

              <label className="bb-field bb-field--row" {...helpProps('meshy.remesh')}>
                <input
                  type="checkbox"
                  checked={Boolean(form.should_remesh) && remeshCap.available}
                  disabled={ui.busy || !remeshCap.available}
                  onChange={(e) => meshySetFormValue('should_remesh', e.target.checked)}
                />
                <span className="bb-field-caption">Remesh (Standard)</span>
              </label>
              {!remeshCap.available && <p className="bb-muted">{remeshCap.reason}</p>}

              <label className="bb-field" {...helpProps('meshy.polycount')}>
                <span className="bb-field-caption">Target polygon count</span>
                <input
                  className="bb-input"
                  type="number"
                  min={100}
                  max={modelType === MODEL_TYPES.smartTopology ? 30000 : 300000}
                  step={100}
                  value={form.target_polycount}
                  disabled={ui.busy || !polyCap.available}
                  onChange={(e) => meshySetFormValue('target_polycount', Number(e.target.value))}
                />
                {!polyCap.available && <p className="bb-muted">{polyCap.reason}</p>}
              </label>

              <label className="bb-field" {...helpProps('meshy.decimation')}>
                <span className="bb-field-caption">Adaptive decimation</span>
                <select
                  className="bb-select"
                  value={form.decimation_mode || ''}
                  disabled={ui.busy || !decCap.available}
                  onChange={(e) => meshySetFormValue('decimation_mode', e.target.value)}
                >
                  {MESHY_DECIMATION_MODES.map((m) => (
                    <option key={m.id || 'off'} value={m.id}>{m.label}</option>
                  ))}
                </select>
                {!decCap.available && <p className="bb-muted">{decCap.reason}</p>}
                {decCap.available && decCap.note && <p className="bb-muted">{decCap.note}</p>}
              </label>

              <label className="bb-field" {...helpProps('meshy.topology')}>
                <span className="bb-field-caption">Topology</span>
                <select
                  className="bb-select"
                  value={form.topology || 'triangle'}
                  disabled={ui.busy || !topoCap.available || modelType === MODEL_TYPES.smartTopology}
                  onChange={(e) => meshySetFormValue('topology', e.target.value)}
                >
                  <option value="triangle">Triangle</option>
                  {modelType === MODEL_TYPES.standard && (
                    <option value="quad">Quad</option>
                  )}
                </select>
                {!topoCap.available && <p className="bb-muted">{topoCap.reason}</p>}
              </label>

              <label className="bb-field bb-field--row" {...helpProps('meshy.preRemesh')}>
                <input
                  type="checkbox"
                  checked={Boolean(form.save_pre_remeshed_model) && preCap.available}
                  disabled={ui.busy || !preCap.available}
                  onChange={(e) => meshySetFormValue('save_pre_remeshed_model', e.target.checked)}
                />
                <span className="bb-field-caption">Save pre-remesh GLB</span>
              </label>
              {!preCap.available && <p className="bb-muted">{preCap.reason}</p>}

              <label className="bb-field bb-field--row">
                <input
                  type="checkbox"
                  checked={form.should_texture !== false}
                  disabled={ui.busy}
                  onChange={(e) => meshySetFormValue('should_texture', e.target.checked)}
                />
                <span className="bb-field-caption">Generate textures</span>
              </label>

              <label className="bb-field bb-field--row" {...helpProps('meshy.pbr')}>
                <input
                  type="checkbox"
                  checked={Boolean(form.enable_pbr) && pbrCap.available}
                  disabled={ui.busy || !pbrCap.available}
                  onChange={(e) => meshySetFormValue('enable_pbr', e.target.checked)}
                />
                <span className="bb-field-caption">Generate PBR maps</span>
              </label>
              {!pbrCap.available && <p className="bb-muted">{pbrCap.reason}</p>}
              {pbrCap.available && pbrCap.note && <p className="bb-muted">{pbrCap.note}</p>}

              {form.should_texture !== false && (
                <>
                  <label className="bb-field">
                    <span className="bb-field-caption">Texture model</span>
                    <select
                      className="bb-select"
                      value={form.texture_model || 'meshy-7'}
                      disabled={ui.busy}
                      onChange={(e) => meshySetFormValue('texture_model', e.target.value)}
                    >
                      {textureOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.supportsPbr ? '' : ' (no PBR)'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="bb-field">
                    <span className="bb-field-caption">Texture resolution</span>
                    <select
                      className="bb-select"
                      value={form.texture_resolution || '2k'}
                      disabled={ui.busy}
                      onChange={(e) => meshySetFormValue('texture_resolution', e.target.value)}
                    >
                      {resolutionOptions.map((r) => (
                        <option key={r} value={r}>{r.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>

                  <label className="bb-field" {...helpProps('meshy.texturePrompt')}>
                    <span className="bb-field-caption">Texture prompt</span>
                    <input
                      className="bb-input"
                      type="text"
                      maxLength={800}
                      value={form.texture_prompt || ''}
                      disabled={ui.busy || !promptCap.available}
                      onChange={(e) => meshySetFormValue('texture_prompt', e.target.value)}
                      placeholder="Optional text guidance"
                    />
                    {!promptCap.available && <p className="bb-muted">{promptCap.reason}</p>}
                  </label>
                </>
              )}

              <label className="bb-field bb-field--row" {...helpProps('meshy.imageEnhancement')}>
                <input
                  type="checkbox"
                  checked={form.image_enhancement === true}
                  disabled={ui.busy || !enhanceCap.available}
                  onChange={(e) => meshySetFormValue(
                    'image_enhancement',
                    e.target.checked ? true : false,
                  )}
                />
                <span className="bb-field-caption">Image enhancement</span>
              </label>
              {!enhanceCap.available && <p className="bb-muted">{enhanceCap.reason}</p>}

              <label className="bb-field bb-field--row" {...helpProps('meshy.removeLighting')}>
                <input
                  type="checkbox"
                  checked={form.remove_lighting === true}
                  disabled={ui.busy || !lightCap.available}
                  onChange={(e) => meshySetFormValue(
                    'remove_lighting',
                    e.target.checked ? true : false,
                  )}
                />
                <span className="bb-field-caption">Remove baked lighting</span>
              </label>
              {!lightCap.available && <p className="bb-muted">{lightCap.reason}</p>}

              <label className="bb-field bb-field--row" {...helpProps('meshy.autoSize')}>
                <input
                  type="checkbox"
                  checked={Boolean(form.auto_size)}
                  disabled={ui.busy}
                  onChange={(e) => meshySetFormValue('auto_size', e.target.checked)}
                />
                <span className="bb-field-caption">Automatic sizing</span>
              </label>

              <label className="bb-field" {...helpProps('meshy.origin')}>
                <span className="bb-field-caption">Origin placement</span>
                <select
                  className="bb-select"
                  value={form.origin_at || 'bottom'}
                  disabled={ui.busy}
                  onChange={(e) => meshySetFormValue('origin_at', e.target.value)}
                >
                  {MESHY_ORIGIN_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className="bb-field bb-field--row">
                <input
                  type="checkbox"
                  checked={Boolean(form.alpha_thumbnail)}
                  disabled={ui.busy}
                  onChange={(e) => meshySetFormValue('alpha_thumbnail', e.target.checked)}
                />
                <span className="bb-field-caption">Alpha thumbnail</span>
              </label>

              <label className="bb-field bb-field--row">
                <input
                  type="checkbox"
                  checked={Boolean(form.multi_view_thumbnails) && mvCap.available}
                  disabled={ui.busy || !mvCap.available}
                  onChange={(e) => meshySetFormValue('multi_view_thumbnails', e.target.checked)}
                />
                <span className="bb-field-caption">Multi-view thumbnails</span>
              </label>
              {!mvCap.available && <p className="bb-muted">{mvCap.reason}</p>}

              <fieldset className="bb-field" {...helpProps('meshy.formats')}>
                <span className="bb-field-caption">Output formats</span>
                <div className="bb-meshy-controls__formats">
                  {MESHY_OUTPUT_FORMATS.map((fmt) => {
                    const selected = (form.target_formats || ['glb']).includes(fmt.id);
                    return (
                      <label key={fmt.id} className="bb-field bb-field--row">
                        <input
                          type="checkbox"
                          checked={selected || fmt.id === 'glb'}
                          disabled={ui.busy || fmt.id === 'glb'}
                          onChange={(e) => {
                            const cur = new Set(form.target_formats || ['glb']);
                            cur.add('glb');
                            if (e.target.checked) cur.add(fmt.id);
                            else if (fmt.id !== 'glb') cur.delete(fmt.id);
                            meshySetFormValue('target_formats', [...cur]);
                          }}
                        />
                        <span className="bb-field-caption">{fmt.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="bb-muted">GLB is required for BloodBound import. Extra formats stay in staging.</p>
              </fieldset>
            </>
          );
        })()}

        <p className="bb-muted">
          Estimated cost:
          {' '}
          <strong>{localCredits}</strong>
          {' '}
          credits
          {ui.estimate?.credits != null && ui.estimate.credits !== localCredits
            ? ` (quoted ${ui.estimate.credits})`
            : ''}
          .
        </p>
      </div>

      <div className="bb-meshy-controls__footer">
        <button
          type="button"
          className="bb-btn"
          disabled={ui.busy || !connected || !ui.reference}
          onClick={onEstimate}
          {...helpProps('meshy.estimate')}
        >
          Estimate
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={ui.busy || !connected || !ui.reference}
          onClick={onGenerate}
          {...helpProps('meshy.generate')}
        >
          {ui.phase === 'submitting' || ui.phase === 'running' ? 'Generating…' : 'Generate…'}
        </button>
      </div>
    </div>
  );
}
