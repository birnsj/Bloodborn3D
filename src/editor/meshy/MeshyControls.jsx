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
  MODEL_TYPES,
  availableResolutionsForTexture,
  availableTextureModels,
  geometryModelsForType,
  estimateImageTo3dCredits,
} from '../../dev/meshy/meshyModels.js';
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
      const ok = await confirm(
        `Spend approximately ${credits} Meshy credits on one Image-to-3D generation?\n\n`
        + `Model: ${form.ai_model}\n`
        + `Topology: ${form.model_type}\n`
        + `Target faces: ${form.target_polycount}\n`
        + `Textures: ${form.should_texture ? `${form.texture_model} @ ${form.texture_resolution}` : 'off'}\n`
        + `PBR: ${form.enable_pbr ? 'yes' : 'no'}\n\n`
        + 'This will not auto-retry if it fails.',
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
  }, [ui.estimate, localCredits, form, confirm, notify, setStatus]);

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
          >
            Import Image…
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={ui.busy || !ui.reference}
            onClick={() => meshyClearReference()}
          >
            Remove
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={ui.busy}
            onClick={() => meshyApplyPreset()}
            {...helpProps('meshy.preset')}
          >
            Game Prop Preset
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

        <label className="bb-field">
          <span className="bb-field-caption">Target polygon count</span>
          <input
            className="bb-input"
            type="number"
            min={100}
            max={modelType === MODEL_TYPES.smartTopology ? 30000 : 300000}
            step={100}
            value={form.target_polycount}
            disabled={ui.busy}
            onChange={(e) => meshySetFormValue('target_polycount', Number(e.target.value))}
          />
        </label>

        <label className="bb-field">
          <span className="bb-field-caption">Topology</span>
          <select
            className="bb-select"
            value={form.topology || 'triangle'}
            disabled={ui.busy || modelType === MODEL_TYPES.smartTopology}
            onChange={(e) => meshySetFormValue('topology', e.target.value)}
          >
            <option value="triangle">Triangle</option>
            {modelType === MODEL_TYPES.standard && (
              <option value="quad">Quad</option>
            )}
          </select>
        </label>

        <label className="bb-field bb-field--row">
          <input
            type="checkbox"
            checked={form.should_texture !== false}
            disabled={ui.busy}
            onChange={(e) => meshySetFormValue('should_texture', e.target.checked)}
          />
          <span className="bb-field-caption">Generate textures</span>
        </label>

        <label className="bb-field bb-field--row">
          <input
            type="checkbox"
            checked={Boolean(form.enable_pbr)}
            disabled={ui.busy || form.should_texture === false}
            onChange={(e) => meshySetFormValue('enable_pbr', e.target.checked)}
          />
          <span className="bb-field-caption">Generate PBR maps</span>
        </label>

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
          </>
        )}

        <p className="bb-muted">
          Output format: GLB. Estimated cost:
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
