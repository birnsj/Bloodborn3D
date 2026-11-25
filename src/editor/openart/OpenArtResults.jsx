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

  return (
    <div className="bb-openart-results">
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

      {(ui.job || ui.staging || ui.estimate) && (
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
      )}

      {generationOrigin?.finalPrompt && (
        <div className="bb-openart__final-prompt">
          <div className="bb-field-caption">Final submitted prompt</div>
          <pre className="bb-openart__final-prompt-text">{generationOrigin.finalPrompt}</pre>
        </div>
      )}

      {saveTargetAreaId && (
        <div className="bb-openart__concept-save">
          <div className="bb-muted">Saving into Concept Library area…</div>
          <button
            type="button"
            className="bb-btn bb-btn--primary"
            disabled={!hasResult || ui.busy}
            onClick={onSaveToConceptLibrary}
          >
            Save to Concept Library
          </button>
        </div>
      )}

      <div className="bb-openart__result-actions">
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={!hasResult || ui.busy}
          onClick={onImportTexture}
        >
          Import as Texture
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={!hasResult || ui.busy}
          onClick={onCreateMaterial}
        >
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
