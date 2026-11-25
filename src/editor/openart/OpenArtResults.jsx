import { useCallback, useEffect, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from '../layout/LayoutContext.jsx';
import {
  getOpenArtUiState,
  openArtCreateMaterial,
  openArtDiscardResult,
  openArtImportTexture,
  subscribeOpenArtUi,
} from './openArtUiStore.js';

/**
 * Phase 2H.1C — OpenArt results / actions (right column).
 */
export function OpenArtResults() {
  const [ui, setUi] = useState(() => getOpenArtUiState());
  const { refreshRegistry, selectAsset, notify, setStatus } = useAssetBrowser();
  const { patch } = useLayout();

  useEffect(() => subscribeOpenArtUi(setUi), []);

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

  const hasResult = Boolean(ui.staging?.stagingId || ui.previewUrl);

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
        </dl>
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
