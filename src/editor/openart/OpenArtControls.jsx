import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import {
  suppressNativeImageMenu,
  useEditorContextMenu,
} from '../../ui/contextMenu/EditorContextMenu.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { openArtStagingPreviewUrl, uploadOpenArtReference } from '../../io/openArtClient.js';
import {
  clearSelectedRegion,
  getAiAssetsUiState,
  removeGenerationReference,
  setAiAssetsSection,
  setPromptComposition,
  setSelectedPromptTemplateId,
  setSelectedRegion,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import { composeGenerationPrompt } from '../aiAssets/promptComposition.js';
import {
  ASSET_CATEGORIES,
  assembleRegionTemplatePrompt,
  composeTemplateAssetPrompt,
  describeRegionCoords,
  getPromptTemplate,
  summarizeTemplateConstraints,
} from '../projectArt/promptTemplates.js';
import {
  openFolder,
  projectArtCreatePrompt,
  projectArtPreviewUrl,
  projectArtUpdateItem,
  selectOnly,
} from '../projectArt/projectArtStore.js';
import {
  getOpenArtComposedPrompt,
  getOpenArtUiState,
  openArtClearEstimate,
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
  const [aiUi, setAiUi] = useState(() => getAiAssetsUiState());
  const { notify, setStatus } = useAssetBrowser();
  const { confirm } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const refInput = useRef(null);
  const connectedRef = useRef(false);
  const [refPreviewUrl, setRefPreviewUrl] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [promptSource, setPromptSource] = useState(null);

  useEffect(() => subscribeOpenArtUi(setUi), []);
  useEffect(() => subscribeAiAssetsUi(setAiUi), []);

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

  // Region handoff seeds a template-composed prompt — mark it so template
  // changes can confirm before overwriting intentional edits.
  useEffect(() => {
    if (aiUi.generationOrigin?.croppedReference?.stagingId
      && aiUi.generationOrigin?.promptTemplateId) {
      setPromptSource('template');
    }
  }, [
    aiUi.generationOrigin?.croppedReference?.stagingId,
    aiUi.generationOrigin?.promptTemplateId,
  ]);

  const modes = useMemo(() => {
    const model = ui.imageModels.find((m) => m.id === ui.modelId);
    return model?.modes?.image || [{ mode: 'text2image', description: 'Text to image' }];
  }, [ui.imageModels, ui.modelId]);

  const schemaProps = ui.form?.jsonSchema?.properties || {};
  const { count, compact, rest, advanced } = useMemo(
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
        stagingId: uploaded.stagingId || null,
      });
      if (ui.mode !== 'image2image') await openArtSetMode('image2image');
      setStatus(`Reference ready: ${file.name}`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, refPreviewUrl, setStatus, ui.mode]);

  const referencePreviewSrc = refPreviewUrl
    || (ui.referenceStagingId ? openArtStagingPreviewUrl(ui.referenceStagingId) : null)
    || (aiUi.generationOrigin?.croppedReference?.stagingId
      ? openArtStagingPreviewUrl(aiUi.generationOrigin.croppedReference.stagingId)
      : null);

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
    const finalPrompt = getOpenArtComposedPrompt() || '(empty prompt)';
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

  const tileHorizontal = Boolean(aiUi.promptComposition?.tileHorizontal);
  const tileVertical = Boolean(aiUi.promptComposition?.tileVertical);
  const composedPrompt = useMemo(
    () => composeGenerationPrompt({
      prompt: ui.prompt,
      tileHorizontal,
      tileVertical,
    }),
    [ui.prompt, tileHorizontal, tileVertical],
  );
  const showFinalPreview = Boolean(ui.prompt?.trim())
    || tileHorizontal
    || tileVertical;

  const onTileChange = useCallback((patch) => {
    setPromptComposition(patch);
    openArtClearEstimate();
  }, []);

  const trayRefs = aiUi.generationReferences || [];

  // Template selection is shared via the store so Project Art handoff can preselect it.
  const templateId = [aiUi.selectedPromptTemplateId, aiUi.generationOrigin?.promptTemplateId, 'environment_concept']
    .find((id) => id && getPromptTemplate(id));
  const template = getPromptTemplate(templateId);
  const constraintSummary = summarizeTemplateConstraints(template);
  // Fall back to the origin's region so the summary survives Project Art selection changes.
  const activeRegion = aiUi.selectedRegion || aiUi.generationOrigin?.sourceRegion || null;
  const regionCropSrc = aiUi.generationOrigin?.croppedReference?.stagingId
    ? openArtStagingPreviewUrl(aiUi.generationOrigin.croppedReference.stagingId)
    : null;
  const regionSourceSrc = activeRegion?.relativePath
    ? projectArtPreviewUrl(activeRegion.relativePath)
    : null;

  const buildTemplatePromptText = useCallback((nextTemplateId = templateId) => {
    const referenceTitles = trayRefs.map((r) => r.title).filter(Boolean);
    const hasCroppedRef = Boolean(
      aiUi.generationOrigin?.croppedReference?.absolutePath
      || ui.referenceStagingPath,
    );
    // Tiling is left to the checkboxes: composeGenerationPrompt appends it at submit time.
    const common = {
      instruction,
      tileHorizontal,
      tileVertical,
      referenceTitles,
      includeTiling: false,
    };
    const result = (activeRegion || hasCroppedRef)
      ? assembleRegionTemplatePrompt({
        ...common,
        templateId: nextTemplateId,
        itemTitle: activeRegion?.title || referenceTitles[0] || '',
        regionDescription: activeRegion
          ? [activeRegion.description, describeRegionCoords(activeRegion)]
            .filter(Boolean)
            .join('; ')
          : '',
      })
      : composeTemplateAssetPrompt({ ...common, templateId: nextTemplateId });
    return {
      promptText: String(result.promptText || '').trim(),
      usedRegion: Boolean(activeRegion || hasCroppedRef),
    };
  }, [
    trayRefs, templateId, instruction, tileHorizontal, tileVertical, activeRegion,
    aiUi.generationOrigin, ui.referenceStagingPath,
  ]);

  const applyTemplatePrompt = useCallback(async ({
    nextTemplateId = templateId,
    confirmIfEdited = false,
    quiet = false,
  } = {}) => {
    try {
      const { promptText, usedRegion } = buildTemplatePromptText(nextTemplateId);
      if (!promptText) {
        notify('Could not compose a prompt from this template');
        return false;
      }
      const current = String(ui.prompt || '').trim();
      if (
        confirmIfEdited
        && promptSource === 'edited'
        && current
        && current !== promptText
      ) {
        const ok = await confirm(
          'Replace your edited prompt with the template composition?',
          {
            title: 'Replace prompt',
            confirmLabel: 'Replace',
            cancelLabel: 'Keep edits',
            tone: 'warning',
          },
        );
        if (!ok) return false;
      }
      openArtSetPrompt(promptText);
      openArtClearEstimate();
      setPromptSource('template');
      if (!quiet) {
        notify(
          usedRegion
            ? 'Prompt composed — reference image supplies visual detail'
            : 'Prompt composed from template',
        );
      }
      return true;
    } catch (err) {
      notify(err.message || String(err));
      return false;
    }
  }, [
    buildTemplatePromptText, templateId, ui.prompt, promptSource,
    confirm, notify,
  ]);

  const onComposePrompt = useCallback(() => {
    applyTemplatePrompt({ confirmIfEdited: false });
  }, [applyTemplatePrompt]);

  const onTemplateChange = useCallback(async (event) => {
    const id = event.target.value;
    setSelectedPromptTemplateId(id);
    const next = getPromptTemplate(id);
    if (next?.suggestedDefaults
      && (typeof next.suggestedDefaults.tileHorizontal === 'boolean'
        || typeof next.suggestedDefaults.tileVertical === 'boolean')) {
      setPromptComposition({
        ...(typeof next.suggestedDefaults.tileHorizontal === 'boolean'
          ? { tileHorizontal: next.suggestedDefaults.tileHorizontal }
          : {}),
        ...(typeof next.suggestedDefaults.tileVertical === 'boolean'
          ? { tileVertical: next.suggestedDefaults.tileVertical }
          : {}),
      });
      openArtClearEstimate();
    }
    await applyTemplatePrompt({
      nextTemplateId: id,
      confirmIfEdited: true,
      quiet: false,
    });
  }, [applyTemplatePrompt]);

  const onSavePrompt = useCallback(async () => {
    const promptText = String(ui.prompt || '').trim();
    if (!promptText) {
      notify('Nothing to save — enter a prompt first');
      return;
    }
    try {
      const origin = getAiAssetsUiState().generationOrigin;
      const sourceItemId = origin?.sourceItemId || null;
      const itemIds = sourceItemId
        ? [sourceItemId]
        : trayRefs.map((r) => r.id).filter(Boolean);
      const res = await projectArtCreatePrompt({
        name: `${template?.label || 'Asset'} prompt`,
        promptText,
        assetCategory: templateId,
        tileHorizontal,
        tileVertical,
        itemIds,
        category: 'other',
      });
      if (sourceItemId) {
        await projectArtUpdateItem(sourceItemId, { generationPrompt: promptText });
      }
      setStatus(
        res?.promptId ? 'Prompt saved to Project Art' : 'Prompt saved',
      );
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [ui.prompt, template, templateId, tileHorizontal, tileVertical, trayRefs, notify, setStatus]);

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

        <label className="bb-field" {...helpProps('openart.model')}>
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

        <label className="bb-field" {...helpProps('openart.mode')}>
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

        <div className="bb-openart__templates" {...helpProps('openart.promptTemplate')}>
          <span className="bb-field-caption">Prompt Templates</span>
          <label className="bb-field">
            <span className="bb-field-caption">Template</span>
            <select
              className="bb-select"
              value={templateId}
              disabled={ui.busy}
              onChange={onTemplateChange}
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          {template && (
            <p className="bb-muted bb-openart__template-help">
              {template.description}
              {constraintSummary ? ` Constraints: ${constraintSummary}.` : ''}
            </p>
          )}

          {activeRegion && (
            <div className="bb-openart__template-region">
              <div className="bb-openart__template-region-body">
                <RegionPreview
                  cropSrc={regionCropSrc}
                  sourceSrc={regionSourceSrc}
                  region={activeRegion}
                  staged={Boolean(aiUi.generationOrigin?.croppedReference?.stagingId)}
                  onContextMenu={(event) => {
                    openFromEvent(event, [
                      {
                        id: 'clear-region',
                        label: 'Clear Region',
                        onSelect: () => {
                          clearSelectedRegion();
                          setStatus('Cleared selected region');
                        },
                      },
                    ]);
                  }}
                />
                <div className="bb-openart__template-region-meta">
                  <div>
                    <strong>Selected region:</strong>
                    {' '}
                    {activeRegion.title}
                    {' — '}
                    {describeRegionCoords(activeRegion)}
                    {aiUi.generationOrigin?.croppedReference?.stagingId
                      ? ' (cropped reference staged for OpenArt)'
                      : ''}
                  </div>
                  {aiUi.selectedRegion && (
                    <input
                      className="bb-input"
                      value={activeRegion.description || ''}
                      disabled={ui.busy}
                      placeholder="Optional note about the region (e.g. carved stone frieze)…"
                      onChange={(e) => setSelectedRegion({
                        ...aiUi.selectedRegion,
                        description: e.target.value,
                      })}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          <label className="bb-field">
            <span className="bb-field-caption">Instructions (optional)</span>
            <textarea
              className="bb-input bb-openart__prompt"
              rows={3}
              value={instruction}
              disabled={ui.busy}
              placeholder="Optional extra direction — the reference image carries material detail…"
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>

          <div className="bb-openart__template-actions">
            <button
              type="button"
              className="bb-btn"
              disabled={ui.busy}
              onClick={onComposePrompt}
              {...helpProps('openart.generatePrompt')}
            >
              Compose Prompt
            </button>
          </div>
          <p className="bb-muted bb-openart__template-help">
            Tiling language is appended from the checkboxes below. Attached reference images are submitted with the prompt — no separate vision pass.
          </p>
          {promptSource === 'template' && (
            <div className="bb-openart__banner">
              Prompt composed from template. The image model interprets any attached reference directly.
            </div>
          )}
        </div>

        <div className="bb-openart__library-refs">
          <span className="bb-field-caption">
            Project Art references ({trayRefs.length})
          </span>
          <div className="bb-openart__library-refs-strip">
            {trayRefs.map((ref) => {
              const rurl = projectArtPreviewUrl(ref.relativePath);
              const openRefMenu = (event) => {
                openFromEvent(event, [
                  {
                    id: 'open',
                    label: 'Open in Library',
                    onSelect: async () => {
                      const folder = ref.relativePath?.includes('/')
                        ? ref.relativePath.slice(0, ref.relativePath.lastIndexOf('/'))
                        : '';
                      try {
                        setAiAssetsSection('concepts');
                        await openFolder(folder);
                        selectOnly(ref.id);
                        setStatus(`Opened “${ref.title || ref.id}” in library`);
                      } catch (err) {
                        notify(err.message || String(err));
                      }
                    },
                  },
                  {
                    id: 'remove',
                    label: 'Remove',
                    onSelect: () => {
                      removeGenerationReference(ref.id);
                      setStatus(`Removed “${ref.title || ref.id}” from tray`);
                    },
                  },
                ]);
              };
              return (
                <div
                  key={ref.id}
                  className="bb-openart__library-ref-thumb"
                  title={ref.title}
                  onContextMenu={openRefMenu}
                >
                  {rurl ? (
                    <img
                      src={rurl}
                      alt=""
                      draggable={false}
                      onContextMenu={openRefMenu}
                    />
                  ) : <span className="bb-muted">?</span>}
                </div>
              );
            })}
            {!trayRefs.length && (
              <span className="bb-muted">
                Use Project Art Library → Use as Reference to pin images here.
              </span>
            )}
          </div>
        </div>

        <label className="bb-field bb-openart__prompt-field" {...helpProps('openart.prompt')}>
          <span className="bb-field-caption">Prompt</span>
          <textarea
            className="bb-input bb-openart__prompt"
            rows={6}
            value={ui.prompt}
            disabled={ui.busy}
            placeholder="Describe the asset to generate…"
            onChange={(e) => {
              openArtSetPrompt(e.target.value);
              if (promptSource) setPromptSource('edited');
            }}
          />
        </label>
        <div className="bb-openart__template-actions">
          <button
            type="button"
            className="bb-btn"
            disabled={ui.busy || !ui.prompt?.trim()}
            onClick={onSavePrompt}
            {...helpProps(
              'openart.savePrompt',
              !ui.prompt?.trim() ? 'Enter a prompt first.' : null,
            )}
          >
            Save Prompt
          </button>
        </div>

        <div
          className="bb-openart__tiling"
          role="group"
          aria-label="Tiling options"
          {...helpProps('openart.tiling')}
        >
          <label className="bb-field bb-field--row bb-openart__tiling-option">
            <input
              type="checkbox"
              checked={tileHorizontal}
              disabled={ui.busy}
              onChange={(e) => onTileChange({ tileHorizontal: e.target.checked })}
            />
            <span className="bb-field-caption">Tile Horizontal</span>
          </label>
          <label className="bb-field bb-field--row bb-openart__tiling-option">
            <input
              type="checkbox"
              checked={tileVertical}
              disabled={ui.busy}
              onChange={(e) => onTileChange({ tileVertical: e.target.checked })}
            />
            <span className="bb-field-caption">Tile Vertical</span>
          </label>
        </div>

        {showFinalPreview && (
          <div className="bb-openart__final-prompt">
            <div className="bb-field-caption">Final submitted prompt</div>
            <pre className="bb-openart__final-prompt-text">
              {composedPrompt || '(empty prompt)'}
            </pre>
          </div>
        )}

        {count.map((key) => (
          <SchemaField
            key={key}
            name={key}
            schema={schemaProps[key]}
            value={ui.formValues[key]}
            disabled={ui.busy}
            onChange={(v) => openArtSetFormValue(key, v)}
          />
        ))}

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
                <div
                  className="bb-openart__ref-thumb is-filled"
                  onContextMenu={(event) => {
                    openFromEvent(event, [
                      {
                        id: 'clear-ref',
                        label: 'Clear Reference',
                        disabled: ui.busy,
                        onSelect: () => clearReference(),
                      },
                    ]);
                  }}
                >
                  {referencePreviewSrc ? (
                    <img
                      src={referencePreviewSrc}
                      alt={ui.referenceFileName}
                      draggable={false}
                      onContextMenu={(event) => {
                        openFromEvent(event, [
                          {
                            id: 'clear-ref',
                            label: 'Clear Reference',
                            disabled: ui.busy,
                            onSelect: () => clearReference(),
                          },
                        ]);
                      }}
                    />
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
            <button
              type="button"
              className="bb-btn"
              disabled={!canEstimate}
              onClick={onEstimate}
              {...helpProps('openart.estimate', !canEstimate ? 'Connect OpenArt and set a prompt first.' : null)}
            >
              Estimate
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--primary bb-btn--spend"
              disabled={!canGenerate}
              onClick={onGenerate}
              title="Requires explicit spend approval"
              {...helpProps(
                'openart.generate',
                !canGenerate ? 'Estimate/connect and set a prompt first. Spend requires confirmation.' : null,
              )}
            >
              {ui.phase === 'submitting' || ui.phase === 'running' ? 'Generating…' : 'Generate…'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Visual for the Project Art selected region in Asset Generation.
 * Prefers the staged crop file; on failure / missing crop, CSS-crops the source.
 */
function RegionPreview({
  cropSrc, sourceSrc, region, staged = false, onContextMenu,
}) {
  const [cropFailed, setCropFailed] = useState(false);
  const w = Math.max(0.001, Number(region?.width) || 0);
  const h = Math.max(0.001, Number(region?.height) || 0);
  const x = Number(region?.x) || 0;
  const y = Number(region?.y) || 0;
  const title = region?.title || 'Selected region';
  const useCrop = Boolean(cropSrc) && !cropFailed;
  const handleMenu = onContextMenu || suppressNativeImageMenu;

  useEffect(() => {
    setCropFailed(false);
  }, [cropSrc]);

  if (useCrop) {
    return (
      <div
        className={`bb-openart__region-thumb${staged ? ' is-staged' : ''}`}
        title={staged ? `${title} (cropped reference)` : title}
        onContextMenu={handleMenu}
      >
        <img
          src={cropSrc}
          alt={title}
          draggable={false}
          onError={() => setCropFailed(true)}
          onContextMenu={handleMenu}
        />
      </div>
    );
  }

  if (!sourceSrc) {
    return (
      <div className="bb-openart__region-thumb is-empty" title="No region preview">
        <span className="bb-muted">No preview</span>
      </div>
    );
  }

  return (
    <div
      className={`bb-openart__region-thumb${staged ? ' is-staged' : ''}`}
      title={title}
      style={{ aspectRatio: `${w} / ${h}` }}
      onContextMenu={handleMenu}
    >
      <img
        className="bb-openart__region-thumb-crop"
        src={sourceSrc}
        alt={title}
        draggable={false}
        onContextMenu={handleMenu}
        style={{
          width: `${100 / w}%`,
          height: `${100 / h}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-y / h) * 100}%`,
        }}
      />
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
