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
import {
  fetchMeshyTextureMaps,
  importMeshyTextureMap,
  importMeshyTextureMaps,
  meshyStagingPreviewUrl,
  requestMeshyTextureMapDownload,
} from '../../io/meshyClient.js';
import { MESHY_MAP_SLOTS } from '../../dev/meshy/meshyPbrMapTypes.js';
import { MeshyStagingBrowser } from './MeshyStagingBrowser.jsx';

/**
 * Meshy results / preview / import (right column).
 */
export function MeshyResults() {
  const [ui, setUi] = useState(() => getMeshyUiState());
  const [maps, setMaps] = useState([]);
  const [mapsBusy, setMapsBusy] = useState(false);
  const [mapsNote, setMapsNote] = useState('');
  const { notify, setStatus, selectAsset, refreshRegistry } = useAssetBrowser();
  const { prompt } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const { patch } = useLayout();

  useEffect(() => subscribeMeshyUi(setUi), []);

  const job = ui.job;
  const hasModel = Boolean(job?.modelUrl) && job?.phase === 'succeeded';
  const phaseLabel = describePhase(ui);

  const refreshMaps = useCallback(async () => {
    if (!job?.taskId) {
      setMaps([]);
      return;
    }
    try {
      const listed = await fetchMeshyTextureMaps({ jobId: job.jobId, taskId: job.taskId });
      setMaps(listed.maps || []);
      setMapsNote(listed.note || (listed.embeddedInGlb
        ? 'Maps were embedded in the GLB; Fetch extracts separate files (free).'
        : ''));
    } catch (err) {
      setMapsNote(err.message || String(err));
    }
  }, [job?.taskId, job?.jobId]);

  useEffect(() => {
    refreshMaps();
  }, [refreshMaps]);

  const onImport = useCallback(async () => {
    try {
      const name = await prompt('Asset name', {
        title: 'Import Meshy Model',
        initialValue: ui.reference?.title || 'Meshy Model',
      });
      if (!name) return;
      setStatus('Importing Meshy GLB + texture maps into Content Browser…');
      const result = await meshyImportModel({ name });
      await refreshRegistry?.();
      if (result?.asset?.id) {
        selectAsset?.(result.asset.id);
        patch?.({ contentFolder: 'Meshes' });
      }
      const texCount = Array.isArray(result?.textures) ? result.textures.length : 0;
      const texFolder = result?.textureFolder || null;
      if (texCount > 0 && texFolder) {
        patch?.({ contentFolder: texFolder });
        setStatus(`Imported mesh + ${texCount} map(s) → ${texFolder}`);
        notify?.(
          `Imported “${result?.asset?.name || name}” and ${texCount} texture map(s) into ${texFolder}`,
          { dialog: false },
        );
      } else {
        setStatus(`Imported mesh ${result?.asset?.id || ''}${result?.mapsNote ? ` — ${result.mapsNote}` : ''}`);
        notify?.(
          `Imported “${result?.asset?.name || name}”${result?.mapsNote ? ` (${result.mapsNote})` : ''}`,
          { dialog: false },
        );
      }
    } catch (err) {
      notify(err.message || String(err), { dialog: true });
    }
  }, [ui.reference, prompt, setStatus, refreshRegistry, selectAsset, patch, notify]);

  const onImportMapsOnly = useCallback(async () => {
    if (!job?.jobId && !job?.taskId) return;
    try {
      setMapsBusy(true);
      setStatus('Importing Meshy texture maps into Content Browser…');
      const result = await importMeshyTextureMaps({
        jobId: job.jobId,
        taskId: job.taskId,
        assetBaseName: ui.reference?.title || job?.importedAssetId || 'Meshy',
      });
      await refreshRegistry?.();
      const texCount = Array.isArray(result?.textures) ? result.textures.length : 0;
      if (texCount > 0 && result.textureFolder) {
        patch?.({ contentFolder: result.textureFolder });
        if (result.textures[0]?.id) selectAsset?.(result.textures[0].id);
      }
      setMapsNote(result?.note || `Imported ${texCount} map(s)`);
      setStatus(result?.note || `Imported ${texCount} map(s)`);
      notify?.(result?.note || `Imported ${texCount} map(s)`, { dialog: false });
      await refreshMaps();
    } catch (err) {
      notify(err.message || String(err), { dialog: true });
    } finally {
      setMapsBusy(false);
    }
  }, [job, ui.reference, refreshRegistry, patch, selectAsset, setStatus, notify, refreshMaps]);

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

      {hasModel && (
        <details className="bb-meshy-results__maps" open {...helpProps('meshy.pbrMaps')}>
          <summary>PBR / texture maps</summary>
          <p className="bb-muted">
            Inspect maps from this completed task without spending credits.
            Emission appears only when Meshy returns it (typically Meshy 6 texture below 8K).
          </p>
          <div className="bb-meshy-results__map-actions">
            <button
              type="button"
              className="bb-btn"
              disabled={mapsBusy || !job?.taskId}
              onClick={async () => {
                try {
                  setMapsBusy(true);
                  setStatus('Fetching Meshy texture maps (no generation spend)…');
                  const listed = await requestMeshyTextureMapDownload({
                    jobId: job.jobId,
                    taskId: job.taskId,
                  });
                  setMaps(listed.maps || []);
                  setMapsNote(`Fetched ${(listed.maps || []).length} map(s)`);
                  setStatus('Meshy texture maps ready');
                } catch (err) {
                  notify(err.message || String(err));
                } finally {
                  setMapsBusy(false);
                }
              }}
            >
              {mapsBusy ? 'Fetching…' : 'Fetch PBR maps'}
            </button>
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              disabled={mapsBusy}
              onClick={() => refreshMaps()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={mapsBusy || !job?.taskId}
              onClick={() => { void onImportMapsOnly(); }}
              {...helpProps('meshy.importMaps')}
            >
              {mapsBusy ? 'Importing…' : 'Import maps to Content Browser'}
            </button>
          </div>
          {mapsNote && <p className="bb-muted">{mapsNote}</p>}
          <ul className="bb-meshy-results__map-list">
            {MESHY_MAP_SLOTS.map((slot) => {
              const found = maps.find((m) => m.id === slot.id);
              const preview = found?.relativePath
                ? meshyStagingPreviewUrl(found.relativePath)
                : null;
              return (
                <li key={slot.id} className="bb-meshy-results__map-item">
                  <div className="bb-meshy-results__map-thumb">
                    {preview ? (
                      <img src={preview} alt={slot.label} />
                    ) : (
                      <span className="bb-muted">{found ? 'Ready' : '—'}</span>
                    )}
                  </div>
                  <div>
                    <strong>{slot.label}</strong>
                    <div className="bb-muted">
                      {found
                        ? `${found.fileName || found.source}${found.bytes != null ? ` · ${(found.bytes / 1024).toFixed(0)} KB` : ''}`
                        : 'Not returned for this task'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bb-btn bb-btn--ghost"
                    disabled={!found?.localPath || mapsBusy}
                    onClick={async () => {
                      try {
                        setMapsBusy(true);
                        const result = await importMeshyTextureMap({
                          jobId: job.jobId,
                          taskId: job.taskId,
                          mapId: slot.id,
                          assetBaseName: ui.reference?.title || 'Meshy',
                        });
                        await refreshRegistry?.();
                        if (result?.asset?.id) selectAsset?.(result.asset.id);
                        notify(`Imported ${slot.label} → ${result?.asset?.name || result?.asset?.id}`);
                        setStatus(`Imported texture ${result?.asset?.id || ''}`);
                      } catch (err) {
                        notify(err.message || String(err));
                      } finally {
                        setMapsBusy(false);
                      }
                    }}
                  >
                    Import
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <MeshyStagingBrowser notify={notify} />

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
