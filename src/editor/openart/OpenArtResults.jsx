import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from '../layout/LayoutContext.jsx';
import {
  RESULTS_THUMB_SIZE_DEFAULT,
  RESULTS_THUMB_SIZE_MAX,
  RESULTS_THUMB_SIZE_MIN,
  clearGenerationOrigin,
  getAiAssetsUiState,
  setAiAssetsSection,
  setConceptSaveTargetAreaId,
  setResultsThumbSize,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import { GenerationFramePreview } from '../aiAssets/GenerationFramePreview.jsx';
import { PreviewCanvasViewport } from '../aiAssets/PreviewCanvasViewport.jsx';
import {
  conceptLibraryAttachGeneratedAsset,
  conceptLibrarySaveFromStaging,
} from '../conceptLibrary/conceptLibraryStore.js';
import {
  getOpenArtComposedPrompt,
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
      const submittedPrompt = getOpenArtComposedPrompt() || ui.prompt;
      await conceptLibrarySaveFromStaging({
        areaId: saveTargetAreaId,
        stagingId: ui.staging.stagingId,
        title: suggestConceptTitle(ui.prompt),
        generationPrompt: submittedPrompt,
        provenance: {
          source: 'openart',
          modelId: ui.modelId,
          mode: ui.mode,
          stagingId: ui.staging.stagingId,
          jobId: ui.job?.jobId || null,
          generationId: ui.job?.generationId || null,
          formValues: { ...ui.formValues },
          tileHorizontal: Boolean(aiUi.promptComposition?.tileHorizontal),
          tileVertical: Boolean(aiUi.promptComposition?.tileVertical),
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
  }, [aiUi.promptComposition, notify, saveTargetAreaId, setStatus, ui]);

  const phaseLabel = describePhase(ui);
  const thumbSize = Number(aiUi.resultsThumbSize) || RESULTS_THUMB_SIZE_DEFAULT;
  const [chromeH, setChromeH] = useState(148);
  const chromeDrag = useRef(null);

  const onChromeHandleDown = useCallback((e) => {
    e.preventDefault();
    chromeDrag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startH: chromeH,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('is-dragging');
  }, [chromeH]);

  const onChromeHandleMove = useCallback((e) => {
    const drag = chromeDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    // Drag handle down → more chrome; up → more canvas.
    const next = clamp(drag.startH - (e.clientY - drag.startY), 96, 320);
    setChromeH(next);
  }, []);

  const onChromeHandleUp = useCallback((e) => {
    if (!chromeDrag.current) return;
    chromeDrag.current = null;
    e.currentTarget.classList.remove('is-dragging');
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="bb-openart-results"
      style={{
        '--bb-results-thumb-size': `${thumbSize}px`,
        '--bb-results-chrome-h': `${chromeH}px`,
      }}
    >
      <div className="bb-openart-results__toolbar">
        <span className="bb-field-caption">Status</span>
        <span className={`bb-openart-results__phase${ui.phase === 'failed' ? ' is-bad' : ''}`}>
          {phaseLabel}
        </span>
      </div>

      <div className="bb-openart-results__stage">
        <PreviewCanvasViewport className="bb-openart-results__preview-frame">
          {hasResult ? (
            <img
              className="bb-openart__preview-img"
              src={ui.previewUrl}
              alt="OpenArt generation preview"
              draggable={false}
            />
          ) : (
            <GenerationFramePreview
              className="bb-gen-frame-preview--stage"
              aspectRatio={ui.formValues?.aspectRatio || ui.formValues?.aspect_ratio || '1:1'}
              resolution={ui.formValues?.resolution || '1K'}
              width={ui.formValues?.width}
              height={ui.formValues?.height}
              tileHorizontal={Boolean(aiUi.promptComposition?.tileHorizontal)}
              tileVertical={Boolean(aiUi.promptComposition?.tileVertical)}
            />
          )}
        </PreviewCanvasViewport>
      </div>

      <div
        className="bb-resize-h bb-openart-results__chrome-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize results strip"
        title="Drag to resize preview vs results strip"
        onPointerDown={onChromeHandleDown}
        onPointerMove={onChromeHandleMove}
        onPointerUp={onChromeHandleUp}
        onPointerCancel={onChromeHandleUp}
      />

      <div className="bb-openart-results__chrome">
        <div className="bb-openart-results__thumbs-wrap">
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
        </div>

        <div className="bb-openart-results__bar">
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

          <label
            className="bb-openart-results__size"
            title="Thumbnail size"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="bb-muted">Size</span>
            <input
              type="range"
              className="bb-openart-results__size-slider"
              min={RESULTS_THUMB_SIZE_MIN}
              max={RESULTS_THUMB_SIZE_MAX}
              step={4}
              value={thumbSize}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onWheel={(e) => e.preventDefault()}
              onChange={(e) => setResultsThumbSize(Number(e.target.value))}
              aria-label="Thumbnail size"
            />
            <span className="bb-openart-results__size-value">{thumbSize}</span>
          </label>
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
            {(generationOrigin?.finalPrompt || ui.prompt) && (
              <div className="bb-openart__final-prompt">
                <div className="bb-field-caption">Final submitted prompt</div>
                <pre className="bb-openart__final-prompt-text">
                  {generationOrigin?.finalPrompt || getOpenArtComposedPrompt()}
                </pre>
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  );
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
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
