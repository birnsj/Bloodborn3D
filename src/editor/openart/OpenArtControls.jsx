import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { uploadOpenArtReference } from '../../io/openArtClient.js';
import {
  getOpenArtUiState,
  openArtConnect,
  openArtEstimate,
  openArtGenerate,
  openArtLogin,
  openArtSetFormValue,
  openArtSetMode,
  openArtSetModel,
  openArtSetPrompt,
  openArtSetReference,
  subscribeOpenArtUi,
} from './openArtUiStore.js';
import { partitionPrimaryForLayout, SchemaField } from './schemaForm.jsx';

/**
 * Phase 2H.1C — OpenArt generation controls (center column).
 * Scrollable settings + sticky estimate / Generate footer.
 */
export function OpenArtControls() {
  const [ui, setUi] = useState(() => getOpenArtUiState());
  const { notify, setStatus } = useAssetBrowser();
  const { confirm } = useEditorDialogs();
  const refInput = useRef(null);
  const connectedRef = useRef(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [refPreviewUrl, setRefPreviewUrl] = useState(null);

  useEffect(() => subscribeOpenArtUi(setUi), []);

  useEffect(() => {
    if (connectedRef.current) return undefined;
    connectedRef.current = true;
    openArtConnect().catch(() => {});
    return undefined;
  }, []);

  useEffect(() => () => {
    if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl);
  }, [refPreviewUrl]);

  useEffect(() => {
    if (!ui.referenceFileName && refPreviewUrl) {
      URL.revokeObjectURL(refPreviewUrl);
      setRefPreviewUrl(null);
    }
  }, [ui.referenceFileName, refPreviewUrl]);

  const modes = useMemo(() => {
    const model = ui.imageModels.find((m) => m.id === ui.modelId);
    return model?.modes?.image || [{ mode: 'text2image', description: 'Text to image' }];
  }, [ui.imageModels, ui.modelId]);

  const schemaProps = ui.form?.jsonSchema?.properties || {};
  const { compact, rest, advanced } = useMemo(
    () => partitionPrimaryForLayout(ui.form?.jsonSchema?.properties || {}),
    [ui.form],
  );

  const statusLabel = useMemo(() => {
    if (ui.errorCode === 'CLI_MISSING') return 'CLI missing';
    if (ui.errorCode === 'AUTH_FAILED') return 'Not authenticated';
    if (ui.phase === 'connecting') return 'Connecting…';
    if (ui.status?.ok) return 'Connected';
    if (ui.phase === 'failed' && ui.error) return 'Error';
    return 'Unknown';
  }, [ui]);

  const clearReference = useCallback(() => {
    if (refPreviewUrl) {
      URL.revokeObjectURL(refPreviewUrl);
      setRefPreviewUrl(null);
    }
    openArtSetReference({});
  }, [refPreviewUrl]);

  const onReferencePicked = useCallback(async (file) => {
    if (!file) return;
    try {
      setStatus('Uploading OpenArt reference…');
      const uploaded = await uploadOpenArtReference(file);
      if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl);
      setRefPreviewUrl(URL.createObjectURL(file));
      openArtSetReference({
        fileName: file.name,
        stagingPath: uploaded.absolutePath,
      });
      if (ui.mode !== 'image2image') await openArtSetMode('image2image');
      setStatus(`Reference ready: ${file.name}`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, refPreviewUrl, setStatus, ui.mode]);

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
    const finalPrompt = String(latest.prompt || '').trim() || '(empty prompt)';
    const ok = await confirm(
      `Spend ${credits ?? '?'} OpenArt credits to generate this image?\n\n`
      + `Final submitted prompt:\n${finalPrompt}\n\n`
      + 'This cannot be undone and will not auto-retry.',
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

  const canEstimate = Boolean(ui.prompt?.trim()) && !ui.busy && !ui.submitLocked && ui.status?.ok;
  const canGenerate = canEstimate && !ui.submitLocked
    && (ui.phase === 'estimated' || ui.phase === 'ready' || ui.phase === 'completed' || ui.phase === 'failed');

  const showReference = ui.mode === 'image2image'
    || Boolean(schemaProps.image)
    || Boolean(schemaProps.images)
    || Boolean(schemaProps.referenceImage);

  return (
    <div className="bb-openart-controls">
      <div className="bb-openart-controls__scroll">
        <div className="bb-openart__status-row">
          <span className={`bb-openart__pill${ui.status?.ok ? ' is-ok' : ' is-bad'}`}>
            <span className="bb-openart__pill-dot" aria-hidden />
            {statusLabel}
          </span>
          <span className="bb-muted">
            {ui.lastCredits != null
              ? `${Number(ui.lastCredits).toLocaleString()} credits`
              : '— credits'}
          </span>
          {(ui.errorCode === 'AUTH_FAILED' || (!ui.status?.ok && ui.errorCode !== 'CLI_MISSING')) && (
            <button
              type="button"
              className="bb-btn"
              disabled={ui.busy || ui.errorCode === 'CLI_MISSING'}
              onClick={() => {
                openArtLogin()
                  .then((res) => notify(res.message || 'Finish browser login, then Refresh.'))
                  .catch((err) => notify(err.message));
              }}
            >
              Log in
            </button>
          )}
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
              <option key={m.mode} value={m.mode} title={m.description || m.mode}>
                {shortModeLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="bb-field bb-openart__prompt-field">
          <span className="bb-field-caption">Prompt</span>
          <textarea
            className="bb-input bb-openart__prompt"
            rows={6}
            value={ui.prompt}
            disabled={ui.busy}
            placeholder="Describe the asset to generate…"
            onChange={(e) => openArtSetPrompt(e.target.value)}
          />
        </label>

        {compact.length > 0 && (
          <div className="bb-openart__compact-row">
            {compact.map((key) => (
              <SchemaField
                key={key}
                name={key}
                schema={schemaProps[key]}
                value={ui.formValues[key]}
                disabled={ui.busy}
                onChange={(v) => openArtSetFormValue(key, v)}
              />
            ))}
          </div>
        )}

        {rest.map((key) => (
          <SchemaField
            key={key}
            name={key}
            schema={schemaProps[key]}
            value={ui.formValues[key]}
            disabled={ui.busy}
            onChange={(v) => openArtSetFormValue(key, v)}
          />
        ))}

        {showReference && (
          <div className="bb-field bb-openart__ref-field">
            <span className="bb-field-caption">Reference images</span>
            <div className="bb-openart__ref-thumbs">
              {ui.referenceFileName ? (
                <div className="bb-openart__ref-thumb is-filled">
                  {refPreviewUrl ? (
                    <img src={refPreviewUrl} alt={ui.referenceFileName} />
                  ) : (
                    <span className="bb-muted">{ui.referenceFileName}</span>
                  )}
                  <button
                    type="button"
                    className="bb-openart__ref-clear"
                    disabled={ui.busy}
                    title="Clear reference"
                    onClick={clearReference}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="bb-openart__ref-add"
                disabled={ui.busy}
                onClick={() => refInput.current?.click()}
              >
                + Reference images
              </button>
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

        {advanced.length > 0 && (
          <details
            className="bb-openart-advanced"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
          >
            <summary className="bb-openart-advanced__summary">
              Advanced parameters ({advanced.length})
            </summary>
            <div className="bb-openart-advanced__body">
              {advanced.map((key) => (
                <SchemaField
                  key={key}
                  name={key}
                  schema={schemaProps[key]}
                  value={ui.formValues[key]}
                  disabled={ui.busy}
                  onChange={(v) => openArtSetFormValue(key, v)}
                  onPickFile={() => refInput.current?.click()}
                  fileName={ui.referenceFileName}
                />
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="bb-openart-controls__footer">
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
              className="bb-btn bb-btn--primary bb-btn--spend"
              disabled={!canGenerate}
              onClick={onGenerate}
              title="Requires explicit spend approval"
            >
              {ui.phase === 'submitting' || ui.phase === 'running' ? 'Generating…' : 'Generate…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeMode(mode) {
  return String(mode || '')
    .replace(/2/g, ' to ')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prefer short closed-select labels; full description stays on option title. */
function shortModeLabel(modeEntry) {
  const mode = String(modeEntry?.mode || '');
  if (mode === 'text2image') return 'Text to image';
  if (mode === 'image2image') return 'Image to image';
  const desc = String(modeEntry?.description || '').split(/[.—]/)[0].trim();
  if (desc && desc.length > 0 && desc.length <= 36) return desc;
  return humanizeMode(mode);
}
