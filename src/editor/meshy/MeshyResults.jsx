import { useCallback, useEffect, useState } from 'react';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useLayout } from '../layout/LayoutContext.jsx';
import {
  getMeshyUiState,
  meshyDiscardResult,
  meshyImportModel,
  subscribeMeshyUi,
} from './meshyUiStore.js';
import { MeshyModelPreview } from './MeshyModelPreview.jsx';

/**
 * Meshy results / preview / import (right column).
 */
export function MeshyResults() {
  const [ui, setUi] = useState(() => getMeshyUiState());
  const { notify, setStatus, selectAsset, refreshRegistry } = useAssetBrowser();
  const { prompt } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const { patch } = useLayout();

  useEffect(() => subscribeMeshyUi(setUi), []);

  const job = ui.job;
  const hasModel = Boolean(job?.modelUrl) && job?.phase === 'succeeded';
  const phaseLabel = describePhase(ui);

  const onImport = useCallback(async () => {
    try {
      const name = await prompt('Asset name', {
        title: 'Import Meshy Model',
        initialValue: ui.reference?.title || 'Meshy Model',
      });
      if (!name) return;
      setStatus('Importing Meshy GLB…');
      const result = await meshyImportModel({ name });
      await refreshRegistry?.();
      if (result?.asset?.id) {
        selectAsset?.(result.asset.id);
        patch?.({ contentFolder: 'Meshes' });
      }
      setStatus(`Imported mesh ${result?.asset?.id || ''}`);
      notify(`Imported “${result?.asset?.name || name}”`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [ui.reference, prompt, setStatus, refreshRegistry, selectAsset, patch, notify]);

  const onDiscard = useCallback(async () => {
    await meshyDiscardResult();
    setStatus('Meshy result discarded (imported assets kept)');
  }, [setStatus]);

  const openResultsMenu = useCallback((event) => {
    openFromEvent(event, [
      {
        id: 'import',
        label: 'Import Model',
        disabled: !hasModel || ui.busy,
        onSelect: () => { onImport(); },
      },
      {
        id: 'inspect',
        label: 'Inspect Model',
        disabled: !hasModel,
        onSelect: () => {
          setStatus(hasModel
            ? `Meshy task ${job.taskId} · ${job.creditsConsumed ?? job.creditsEstimated} credits`
            : 'No model');
        },
      },
      {
        id: 'show-browser',
        label: 'Show in Asset Browser',
        disabled: !job?.importedAssetId,
        onSelect: () => {
          if (job?.importedAssetId) {
            selectAsset?.(job.importedAssetId);
            patch?.({ contentFolder: 'Meshes', workspace: 'level' });
          }
        },
      },
      {
        id: 'open-ref',
        label: 'Open Source Reference',
        disabled: !ui.reference?.previewUrl,
        onSelect: () => {
          if (ui.reference?.previewUrl) {
            window.open(ui.reference.previewUrl, '_blank', 'noopener');
          }
        },
      },
      { id: 'sep', separator: true },
      {
        id: 'discard',
        label: 'Discard Result',
        danger: true,
        disabled: !job,
        onSelect: () => { onDiscard(); },
      },
    ]);
  }, [
    openFromEvent, hasModel, ui.busy, ui.reference, job, onImport, onDiscard,
    setStatus, selectAsset, patch,
  ]);

  return (
    <div className="bb-meshy-results" {...helpProps('meshy.results')}>
      <div className="bb-meshy-results__toolbar">
        <span className="bb-field-caption">Status</span>
        <span className={`bb-meshy-results__phase${ui.phase === 'failed' ? ' is-bad' : ''}`}>
          {phaseLabel}
        </span>
        {job?.progress != null && job.phase === 'running' && (
          <span className="bb-muted">
            {Math.round(job.progress)}
            %
          </span>
        )}
      </div>

      <div
        className="bb-meshy-results__stage"
        onContextMenu={openResultsMenu}
      >
        {hasModel ? (
          <MeshyModelPreview
            url={job.modelUrl}
            referenceUrl={ui.reference?.previewUrl || null}
          />
        ) : (
          <div className="bb-muted bb-meshy-results__empty">
            {ui.phase === 'running' || ui.phase === 'submitting'
              ? 'Generating 3D model…'
              : 'Generate an Image-to-3D result to preview the GLB here.'}
          </div>
        )}
      </div>

      <div className="bb-meshy-results__bar">
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={!hasModel || ui.busy}
          onClick={onImport}
          {...helpProps('meshy.import')}
        >
          Import Model
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          disabled={!job}
          onClick={onDiscard}
          {...helpProps('meshy.discard')}
        >
          Discard
        </button>
        {job?.taskId && (
          <span className="bb-muted" title="Meshy task ID">
            Task
            {' '}
            {job.taskId.slice(0, 8)}
            …
          </span>
        )}
        {job?.importedAssetId && (
          <span className="bb-muted">
            Imported
            {' '}
            {job.importedAssetId}
          </span>
        )}
      </div>

      {(job?.settings || job?.provenance) && (
        <details className="bb-meshy-results__meta">
          <summary>Generation details</summary>
          <dl className="bb-openart-meta">
            {job.taskId && (
              <>
                <dt>Task ID</dt>
                <dd>{job.taskId}</dd>
              </>
            )}
            {job.settings?.ai_model && (
              <>
                <dt>Geometry</dt>
                <dd>{job.settings.ai_model}</dd>
              </>
            )}
            {job.settings?.texture_model && (
              <>
                <dt>Texture</dt>
                <dd>
                  {job.settings.texture_model}
                  {' '}
                  @
                  {job.settings.texture_resolution}
                  {job.settings.enable_pbr ? ' · PBR' : ''}
                </dd>
              </>
            )}
            {job.creditsEstimated != null && (
              <>
                <dt>Credits (est.)</dt>
                <dd>{job.creditsEstimated}</dd>
              </>
            )}
            {job.creditsConsumed != null && (
              <>
                <dt>Credits (actual)</dt>
                <dd>{job.creditsConsumed}</dd>
              </>
            )}
            {job.provenance?.projectArtItemId && (
              <>
                <dt>Source art</dt>
                <dd>{job.provenance.projectArtItemId}</dd>
              </>
            )}
            {job.provenance?.region && (
              <>
                <dt>Region</dt>
                <dd>
                  {JSON.stringify(job.provenance.region)}
                </dd>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}

function describePhase(ui) {
  switch (ui.phase) {
    case 'connecting': return 'Connecting…';
    case 'ready': return 'Ready';
    case 'estimating': return 'Estimating…';
    case 'awaiting_approval': return 'Awaiting approval';
    case 'submitting': return 'Submitting…';
    case 'running': return `Running${ui.job?.progress != null ? ` (${Math.round(ui.job.progress)}%)` : ''}`;
    case 'succeeded': return 'Succeeded';
    case 'failed': return ui.error || 'Failed';
    default: return 'Idle';
  }
}
