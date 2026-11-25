import { useCallback, useEffect, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from '../layout/LayoutContext.jsx';
import {
  clearGenerationOrigin,
  getAiAssetsUiState,
  setAiAssetsSection,
  setConceptSaveTargetAreaId,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import {
  conceptLibraryAttachGeneratedAsset,
  conceptLibrarySaveFromStaging,
} from '../conceptLibrary/conceptLibraryStore.js';
import {
  getOpenArtUiState,
  openArtCreateMaterial,
  openArtDiscardResult,
  openArtImportTexture,
  subscribeOpenArtUi,
} from './openArtUiStore.js';

/**
 * Phase 2H.1C/D — OpenArt results / actions (right column).
 * Asset-centric: dominant preview, status, optional thumbs, anchored actions.
 */
export function OpenArtResults() {
  const [ui, setUi] = useState(() => getOpenArtUiState());
  const [aiUi, setAiUi] = useState(() => getAiAssetsUiState());
  const { refreshRegistry, selectAsset, notify, setStatus } = useAssetBrowser();
  const { patch } = useLayout();

  useEffect(() => subscribeOpenArtUi(setUi), []);
  useEffect(() => subscribeAiAssetsUi(setAiUi), []);

  const attachOriginIfAny = useCallback(async (result) => {
    const origin = getAiAssetsUiState().generationOrigin;
    if (!origin?.conceptId) return;
    const assets = [];
    if (result?.texture?.id) {
      assets.push({
        id: result.texture.id,
        kind: 'texture',
        name: result.texture.name || result.texture.id,
      });
    }
    if (result?.material?.id) {
      assets.push({
        id: result.material.id,
        kind: 'material',
        name: result.material.name || result.material.id,
      });
    }
    for (const asset of assets) {
      try {
        await conceptLibraryAttachGeneratedAsset({
          conceptId: origin.conceptId,
          promptId: origin.promptId,
          areaId: origin.areaId,
          asset,
        });
      } catch (err) {
        notify(err.message || `Could not link ${asset.kind} to concept`);
      }
    }
  }, [notify]);

  const onImportTexture = useCallback(async () => {
    try {
      const result = await openArtImportTexture();
      await attachOriginIfAny(result);
      await refreshRegistry();
      if (result.texture?.id) selectAsset(result.texture.id);
      patch({ contentFolder: 'Textures' });
      setStatus(`Imported texture ${result.texture?.id}`);
      notify(`Imported texture “${result.texture?.name || result.texture?.id}”`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [attachOriginIfAny, notify, patch, refreshRegistry, selectAsset, setStatus]);

  const onCreateMaterial = useCallback(async () => {
    try {
      const result = await openArtCreateMaterial();
      await attachOriginIfAny(result);
      await refreshRegistry();
      if (result.material?.id) selectAsset(result.material.id);
      patch({ contentFolder: 'Materials' });
      setStatus(`Created material ${result.material?.id}`);
      notify(`Created material “${result.material?.name || result.material?.id}”`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [attachOriginIfAny, notify, patch, refreshRegistry, selectAsset, setStatus]);

  const hasResult = Boolean(ui.staging?.stagingId || ui.previewUrl);
  const saveTargetAreaId = aiUi.conceptSaveTargetAreaId;
  const generationOrigin = aiUi.generationOrigin;
  const canSaveConcept = Boolean(hasResult && saveTargetAreaId && !ui.busy);

  const onSaveToConceptLibrary = useCallback(async () => {
    if (!ui.staging?.stagingId || !saveTargetAreaId) return;
    try {
      await conceptLibrarySaveFromStaging({
        areaId: saveTargetAreaId,
        stagingId: ui.staging.stagingId,
        title: suggestConceptTitle(ui.prompt),
        generationPrompt: ui.prompt,
        provenance: {
          source: 'openart',
          modelId: ui.modelId,
          mode: ui.mode,
          stagingId: ui.staging.stagingId,
          jobId: ui.job?.jobId || null,
          generationId: ui.job?.generationId || null,
          formValues: { ...ui.formValues },
          savedAt: new Date().toISOString(),
        },
      });
      setConceptSaveTargetAreaId(null);
      clearGenerationOrigin();
      setAiAssetsSection('concepts');
      setStatus('Saved concept to Concept Library');
      notify('Concept saved to Concept Library');
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, saveTargetAreaId, setStatus, ui]);

  const phaseLabel = describePhase(ui);

  return (
    <div className="bb-openart-results">
      <div className="bb-openart-results__toolbar">
        <span className="bb-field-caption">Status</span>
        <span className={`bb-openart-results__phase${ui.phase === 'failed' ? ' is-bad' : ''}`}>
          {phaseLabel}
        </span>
      </div>

      <div className="bb-openart-results__stage">
        <div className="bb-openart-results__preview-frame">
          {hasResult ? (
            <img
              className="bb-openart__preview-img"
              src={ui.previewUrl}
              alt="OpenArt generation preview"
            />
          ) : (
            <div className="bb-openart__preview-empty bb-muted">
              <span>Generated artwork</span>
              <span className="bb-openart__preview-hint">Fit to viewport · preserve aspect ratio</span>
            </div>
          )}
        </div>
      </div>

      <div className="bb-openart-results__thumbs" aria-label="Generation results">
        {hasResult ? (
          <button type="button" className="bb-openart-results__thumb is-active" title="Result 1">
            <img src={ui.previewUrl} alt="" />
            <span>1</span>
          </button>
        ) : (
          [1, 2, 3, 4].map((n) => (
            <div key={n} className="bb-openart-results__thumb is-placeholder" aria-hidden>
              <span>{n}</span>
            </div>
          ))
        )}
        <span className="bb-muted bb-openart-results__thumbs-note">Results</span>
      </div>

      <div className="bb-openart__result-actions">
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={!hasResult || ui.busy}
          onClick={onImportTexture}
        >
          Import Texture
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={!hasResult || ui.busy}
          onClick={onCreateMaterial}
        >
          Create Material
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={!canSaveConcept}
          title={saveTargetAreaId
            ? 'Save into the selected Concept Library area'
            : 'Start from Concept Library → Generate to enable'}
          onClick={onSaveToConceptLibrary}
        >
          Save Concept
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost bb-btn--icon"
          disabled={!hasResult && !ui.estimate}
          title="Discard result"
          aria-label="Discard result"
          onClick={() => {
            openArtDiscardResult();
            setStatus('OpenArt result discarded');
          }}
        >
          ×
        </button>
      </div>

      {ui.imported?.texture && (
        <div className="bb-muted bb-openart__imported">
          Imported {ui.imported.texture.id}
          {ui.imported.material ? ` → material ${ui.imported.material.id}` : ''}
        </div>
      )}

      {(ui.job || ui.staging || ui.estimate || generationOrigin) && (
        <details className="bb-openart-results__meta">
          <summary>Generation details</summary>
          <dl className="bb-openart-meta">
            {ui.estimate?.estimateId && (
              <>
                <dt>Estimate</dt>
                <dd>{ui.estimate.estimateId}</dd>
              </>
            )}
            {ui.estimate?.totalCredits != null && (
              <>
                <dt>Cost</dt>
                <dd>{ui.estimate.totalCredits} credits</dd>
              </>
            )}
            {ui.job?.jobId && (
              <>
                <dt>Job</dt>
                <dd>{ui.job.jobId}</dd>
              </>
            )}
            {ui.job?.generationId && (
              <>
                <dt>Generation</dt>
                <dd>{ui.job.generationId}</dd>
              </>
            )}
            {ui.staging?.stagingId && (
              <>
                <dt>Staging</dt>
                <dd>{ui.staging.stagingId}</dd>
              </>
            )}
            {ui.staging?.fileName && (
              <>
                <dt>File</dt>
                <dd>{ui.staging.fileName}</dd>
              </>
            )}
            {ui.modelId && (
              <>
                <dt>Model</dt>
                <dd>{ui.modelId}</dd>
              </>
            )}
            {ui.mode && (
              <>
                <dt>Mode</dt>
                <dd>{ui.mode}</dd>
              </>
            )}
            {generationOrigin?.conceptId && (
              <>
                <dt>Origin concept</dt>
                <dd>{generationOrigin.conceptId}</dd>
              </>
            )}
            {generationOrigin?.promptId && (
              <>
                <dt>Origin prompt</dt>
                <dd>{generationOrigin.promptId}</dd>
              </>
            )}
            {generationOrigin?.areaId && (
              <>
                <dt>Origin area</dt>
                <dd>{generationOrigin.areaId}</dd>
              </>
            )}
          </dl>
          {generationOrigin?.finalPrompt && (
            <div className="bb-openart__final-prompt">
              <div className="bb-field-caption">Final submitted prompt</div>
              <pre className="bb-openart__final-prompt-text">{generationOrigin.finalPrompt}</pre>
            </div>
          )}
        </details>
      )}
    </div>
  );
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

function suggestConceptTitle(promptText) {
  const cleaned = String(promptText || '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');
  return cleaned || 'Generated concept';
}
