import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from '../layout/LayoutContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { uploadOpenArtReference } from '../../io/openArtClient.js';
import {
  getOpenArtUiState,
  openArtConnect,
  openArtCreateMaterial,
  openArtDiscardResult,
  openArtEstimate,
  openArtGenerate,
  openArtImportTexture,
  openArtSetFormValue,
  openArtSetMode,
  openArtSetModel,
  openArtSetPrompt,
  openArtSetReference,
  subscribeOpenArtUi,
} from './openArtUiStore.js';

/**
 * Phase 2H.1B — OpenArt generation panel (Asset Viewer folder + dock panel).
 * Uses existing bb-panel / bb-btn / bb-field chrome. State lives in openArtUiStore
 * so switching panels does not lose an in-flight job.
 */
export function OpenArtGeneratePanel({ docked = false } = {}) {
  const [ui, setUi] = useState(() => getOpenArtUiState());
  const { refreshRegistry, selectAsset, notify, setStatus } = useAssetBrowser();
  const { patch } = useLayout();
  const { confirm } = useEditorDialogs();
  const refInput = useRef(null);
  const connectedRef = useRef(false);

  useEffect(() => subscribeOpenArtUi(setUi), []);

  useEffect(() => {
    if (connectedRef.current) return undefined;
    connectedRef.current = true;
    openArtConnect().catch(() => {});
    return undefined;
  }, []);

  const modes = useMemo(() => {
    const model = ui.imageModels.find((m) => m.id === ui.modelId);
    return model?.modes?.image || [{ mode: 'text2image', description: 'Text to image' }];
  }, [ui.imageModels, ui.modelId]);

  const schemaProps = ui.form?.jsonSchema?.properties || {};
  const paramKeys = Object.keys(schemaProps).filter((k) => k !== 'prompt');

  const statusLabel = useMemo(() => {
    if (ui.errorCode === 'CLI_MISSING') return 'CLI missing';
    if (ui.errorCode === 'AUTH_FAILED') return 'Not authenticated';
    if (ui.phase === 'connecting') return 'Connecting…';
    if (ui.status?.ok) return 'Connected';
    if (ui.phase === 'failed' && ui.error) return 'Error';
    return 'Unknown';
  }, [ui]);

  const onReferencePicked = useCallback(async (file) => {
    if (!file) return;
    try {
      setStatus('Uploading OpenArt reference…');
      const uploaded = await uploadOpenArtReference(file);
      openArtSetReference({
        fileName: file.name,
        stagingPath: uploaded.absolutePath,
      });
      if (ui.mode !== 'image2image') await openArtSetMode('image2image');
      setStatus(`Reference ready: ${file.name}`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, setStatus, ui.mode]);

  const onEstimate = useCallback(async () => {
    try {
      const estimate = await openArtEstimate();
      if (estimate) {
        setStatus(`OpenArt estimate: ${estimate.totalCredits ?? '?'} credits`);
      }
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, setStatus]);

  const onGenerate = useCallback(async () => {
    if (!ui.estimate) {
      try {
        await openArtEstimate();
      } catch (err) {
        notify(err.message || String(err));
        return;
      }
    }
    const latest = getOpenArtUiState();
    const credits = latest.estimate?.totalCredits;
    const ok = await confirm(
      `Spend ${credits ?? '?'} OpenArt credits to generate this image?\n\nThis cannot be undone and will not auto-retry.`,
      {
        title: 'Approve OpenArt spend',
        confirmLabel: `Spend ${credits ?? '?'} credits`,
        cancelLabel: 'Cancel',
        tone: 'warning',
      },
    );
    if (!ok) {
      setStatus('OpenArt generation cancelled');
      return;
    }
    try {
      setStatus('OpenArt generation submitted…');
      await openArtGenerate({ confirmSpend: true });
      setStatus('OpenArt generation complete');
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [confirm, notify, setStatus, ui.estimate]);

  const onImportTexture = useCallback(async () => {
    try {
      const result = await openArtImportTexture();
      await refreshRegistry();
      if (result.texture?.id) selectAsset(result.texture.id);
      patch({ contentFolder: 'Textures' });
      setStatus(`Imported texture ${result.texture?.id}`);
      notify(`Imported texture “${result.texture?.name || result.texture?.id}”`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, patch, refreshRegistry, selectAsset, setStatus]);

  const onCreateMaterial = useCallback(async () => {
    try {
      const result = await openArtCreateMaterial();
      await refreshRegistry();
      if (result.material?.id) selectAsset(result.material.id);
      patch({ contentFolder: 'Materials' });
      setStatus(`Created material ${result.material?.id}`);
      notify(`Created material “${result.material?.name || result.material?.id}”`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, patch, refreshRegistry, selectAsset, setStatus]);

  const canEstimate = Boolean(ui.prompt?.trim()) && !ui.busy && !ui.submitLocked && ui.status?.ok;
  const canGenerate = canEstimate && !ui.submitLocked
    && (ui.phase === 'estimated' || ui.phase === 'ready' || ui.phase === 'completed' || ui.phase === 'failed');
  const hasResult = Boolean(ui.staging?.stagingId || ui.previewUrl);

  return (
    <section className={`bb-panel-chrome bb-openart${docked ? ' bb-panel-chrome--docked' : ''}`}>
      {!docked && (
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">OpenArt</span>
        </div>
      )}

      <div className="bb-openart__body">
        <div className="bb-openart__status-row">
          <span className={`bb-openart__pill${ui.status?.ok ? ' is-ok' : ' is-bad'}`}>{statusLabel}</span>
          <span className="bb-muted">
            Credits: {ui.lastCredits != null ? ui.lastCredits : '—'}
          </span>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={ui.busy}
            onClick={() => openArtConnect().catch((err) => notify(err.message))}
          >
            Refresh
          </button>
        </div>

        {ui.error && (
          <div className="bb-openart__error" role="alert">
            {ui.errorCode ? `[${ui.errorCode}] ` : ''}{ui.error}
          </div>
        )}

        <label className="bb-field">
          <span className="bb-field-caption">Model</span>
          <select
            className="bb-select"
            value={ui.modelId}
            disabled={ui.busy || !ui.imageModels.length}
            onChange={(e) => openArtSetModel(e.target.value).catch((err) => notify(err.message))}
          >
            {ui.imageModels.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
            ))}
          </select>
        </label>

        <label className="bb-field">
          <span className="bb-field-caption">Mode</span>
          <select
            className="bb-select"
            value={ui.mode}
            disabled={ui.busy || !modes.length}
            onChange={(e) => openArtSetMode(e.target.value).catch((err) => notify(err.message))}
          >
            {modes.map((m) => (
              <option key={m.mode} value={m.mode}>{m.mode}{m.description ? ` — ${m.description}` : ''}</option>
            ))}
          </select>
        </label>

        <label className="bb-field">
          <span className="bb-field-caption">Prompt</span>
          <textarea
            className="bb-input bb-openart__prompt"
            rows={4}
            value={ui.prompt}
            disabled={ui.busy}
            placeholder="Describe the texture or image to generate"
            onChange={(e) => openArtSetPrompt(e.target.value)}
          />
        </label>

        {paramKeys.map((key) => (
          <SchemaField
            key={key}
            name={key}
            schema={schemaProps[key]}
            value={ui.formValues[key]}
            disabled={ui.busy}
            onChange={(v) => openArtSetFormValue(key, v)}
          />
        ))}

        {(ui.mode === 'image2image' || schemaProps.image || paramKeys.includes('image')) && (
          <div className="bb-field">
            <span className="bb-field-caption">Reference image</span>
            <div className="bb-openart__ref-row">
              <button
                type="button"
                className="bb-btn"
                disabled={ui.busy}
                onClick={() => refInput.current?.click()}
              >
                Choose image…
              </button>
              <span className="bb-muted bb-openart__ref-name">
                {ui.referenceFileName || 'None'}
              </span>
              {ui.referenceFileName && (
                <button
                  type="button"
                  className="bb-btn bb-btn--ghost"
                  disabled={ui.busy}
                  onClick={() => openArtSetReference({})}
                >
                  Clear
                </button>
              )}
            </div>
            <input
              ref={refInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onReferencePicked(file);
              }}
            />
          </div>
        )}

        <div className="bb-openart__estimate">
          <div>
            <div className="bb-field-caption">Estimated cost</div>
            <div className="bb-openart__credits">
              {ui.estimate?.totalCredits != null
                ? `${ui.estimate.totalCredits} credits`
                : '—'}
            </div>
            {ui.estimate?.costConfig && (
              <div className="bb-muted bb-openart__config">
                {Object.entries(ui.estimate.costConfig).map(([k, v]) => `${k}=${v}`).join(' · ')}
              </div>
            )}
          </div>
          <div className="bb-openart__actions">
            <button type="button" className="bb-btn" disabled={!canEstimate} onClick={onEstimate}>
              Estimate
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--primary"
              disabled={!canGenerate}
              onClick={onGenerate}
              title="Requires explicit spend approval"
            >
              {ui.phase === 'submitting' || ui.phase === 'running' ? 'Generating…' : 'Generate…'}
            </button>
          </div>
        </div>

        <div className="bb-openart__progress">
          <span className="bb-field-caption">Status</span>
          <span>{describePhase(ui)}</span>
        </div>

        <div className="bb-openart__preview">
          <div className="bb-field-caption">Preview</div>
          {hasResult ? (
            <img
              className="bb-openart__preview-img"
              src={ui.previewUrl}
              alt="OpenArt generation preview"
            />
          ) : (
            <div className="bb-openart__preview-empty bb-muted">No result yet</div>
          )}
        </div>

        <div className="bb-openart__result-actions">
          <button type="button" className="bb-btn" disabled={!hasResult || ui.busy} onClick={onImportTexture}>
            Import as Texture
          </button>
          <button type="button" className="bb-btn" disabled={!hasResult || ui.busy} onClick={onCreateMaterial}>
            Create Material from Image
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!hasResult && !ui.estimate}
            onClick={() => {
              openArtDiscardResult();
              setStatus('OpenArt result discarded');
            }}
          >
            Discard result
          </button>
        </div>

        {ui.imported?.texture && (
          <div className="bb-muted bb-openart__imported">
            Imported {ui.imported.texture.id}
            {ui.imported.material ? ` → material ${ui.imported.material.id}` : ''}
          </div>
        )}
      </div>
    </section>
  );
}

function SchemaField({ name, schema, value, disabled, onChange }) {
  const label = name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  if (schema?.enum) {
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        <select
          className="bb-select"
          value={value ?? schema.default ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={opt}>{String(opt)}</option>
          ))}
        </select>
      </label>
    );
  }
  if (schema?.type === 'boolean') {
    return (
      <label className="bb-field bb-field--row">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="bb-field-caption">{label}</span>
      </label>
    );
  }
  if (schema?.type === 'integer' || schema?.type === 'number') {
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        <input
          className="bb-input"
          type="number"
          value={value ?? schema.default ?? 0}
          min={schema.minimum}
          max={schema.maximum}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }
  if (schema?.type === 'string') {
    return (
      <label className="bb-field">
        <span className="bb-field-caption">{label}</span>
        <input
          className="bb-input"
          type="text"
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  return null;
}

function describePhase(ui) {
  switch (ui.phase) {
    case 'connecting': return 'Connecting to OpenArt CLI…';
    case 'ready': return 'Ready';
    case 'estimating': return 'Estimating cost…';
    case 'estimated': return `Estimate ready (${ui.estimate?.totalCredits ?? '?'} credits)`;
    case 'submitting': return 'Submitting generation…';
    case 'running': return `Running (${ui.job?.status || '…'})`;
    case 'completed': return 'Completed';
    case 'failed': return ui.error || 'Failed';
    default: return ui.phase;
  }
}
