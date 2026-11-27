/**
 * Batch 7 — mesh optimize / export / inspect controls in Asset Viewer preview.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadGltfScene } from '../../runtime/meshLoader.js';
import { publicAssetUrl } from '../../io/assetFileApi.js';
import { buildMeshAssetReport, formatBytes } from '../../assets/meshInspect.js';
import { inspectMeshRoot } from '../../assets/meshInspect.js';
import {
  exportMeshRoot,
  downloadExportedMesh,
  MESH_EXPORT_FORMATS,
} from '../../assets/meshFormatIO.js';
import { simplifySceneRoot } from '../../assets/meshSimplify.js';
import { generateLodLevelsFromRoot, DEFAULT_LOD_RATIOS, DEFAULT_LOD_DISTANCES_EU } from '../../assets/meshLodGenerate.js';
import { describeCompressionSupport } from '../../runtime/gltfCompression.js';
import {
  assetPivotPresetOffset,
  PIVOT_PRESET_LABELS,
} from '../../rules/pivotEdit.js';
import { normalizeContentOffset } from '../../core/contentOffset.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

export function MeshAssetTools({
  asset,
  importDerivedMeshGlb,
  updateMeshMeta,
  notify,
  pivotDraft: pivotDraftProp = null,
  onPivotDraftChange = null,
  pivotEditMode = false,
  onPivotEditModeChange = null,
  previewRotationY = 0,
  onPreviewRotationYChange = null,
  previewScale = 1,
  onPreviewScaleChange = null,
  snapEnabled = true,
  onSnapEnabledChange = null,
  onApplyPivot = null,
  onCancelPivot = null,
  pivotDirty = false,
}) {
  const [report, setReport] = useState(() => buildMeshAssetReport(asset));
  const [busy, setBusy] = useState(null);
  const [ratio, setRatio] = useState(0.5);
  const [previewCompare, setPreviewCompare] = useState(null);
  const [exportFormat, setExportFormat] = useState('glb');
  const [localPivotDraft, setLocalPivotDraft] = useState(() =>
    normalizeContentOffset(asset?.meta?.defaultContentOffset));
  const compression = describeCompressionSupport();

  const controlled = typeof onPivotDraftChange === 'function';
  const pivotDraft = controlled
    ? normalizeContentOffset(pivotDraftProp)
    : localPivotDraft;
  const setPivotDraft = controlled ? onPivotDraftChange : setLocalPivotDraft;

  useEffect(() => {
    let cancelled = false;
    setReport(buildMeshAssetReport(asset));
    setPreviewCompare(null);
    if (!controlled) {
      setLocalPivotDraft(normalizeContentOffset(asset?.meta?.defaultContentOffset));
    }
    (async () => {
      if (!asset?.path) return;
      const url = publicAssetUrl(asset.path);
      const loaded = await loadGltfScene(url);
      if (cancelled || !loaded?.scene) return;
      const live = inspectMeshRoot(loaded.scene);
      setReport(buildMeshAssetReport(asset, live));
    })();
    return () => { cancelled = true; };
  }, [asset?.id, asset?.path, asset?.meta?.bytes, asset?.meta?.defaultContentOffset, controlled]);

  const saveAssetPivot = useCallback(async (offset, label = 'Saved asset default pivot') => {
    if (!asset?.id) return;
    setBusy('pivot');
    try {
      if (typeof onApplyPivot === 'function') {
        await onApplyPivot(offset, label);
        return;
      }
      if (!updateMeshMeta) return;
      const next = normalizeContentOffset(offset);
      await updateMeshMeta(asset.id, { defaultContentOffset: next });
      setPivotDraft(next);
      notify(`${label}. Existing placed actors are unchanged.`);
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, updateMeshMeta, notify, onApplyPivot, setPivotDraft]);

  const applyAssetPivotPreset = useCallback((preset) => {
    const offset = assetPivotPresetOffset(preset, asset?.meta || report);
    setPivotDraft(offset);
    if (!pivotEditMode && typeof onPivotEditModeChange === 'function') {
      onPivotEditModeChange(true);
    }
  }, [asset, report, setPivotDraft, pivotEditMode, onPivotEditModeChange]);

  const runSimplifyPreview = useCallback(async () => {
    if (!asset?.path) return;
    setBusy('simplify');
    try {
      const loaded = await loadGltfScene(publicAssetUrl(asset.path));
      if (!loaded?.scene) throw new Error('Failed to load mesh');
      const t0 = performance.now();
      const result = await simplifySceneRoot(loaded.scene, ratio);
      const ms = performance.now() - t0;
      setPreviewCompare({
        before: result.before,
        after: result.after,
        reduction: result.reduction,
        degradation: result.degradation,
        ms,
        ratio,
      });
      if (result.degradation.length) {
        notify(`Simplification warnings: ${result.degradation.join(' ')}`);
      }
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, ratio, notify]);

  const saveSimplified = useCallback(async () => {
    if (!asset?.path) return;
    setBusy('save-simple');
    try {
      const loaded = await loadGltfScene(publicAssetUrl(asset.path));
      if (!loaded?.scene) throw new Error('Failed to load mesh');
      const simplified = await simplifySceneRoot(loaded.scene, ratio);
      const exported = await exportMeshRoot(simplified.root, 'glb');
      const derived = await importDerivedMeshGlb(exported.data, {
        name: `${asset.name} (simp ${Math.round(ratio * 100)}%)`,
        sourceAssetId: asset.id,
        tags: ['derived', 'simplified'],
        meta: {
          simplification: {
            targetRatio: ratio,
            beforeTriangles: simplified.before.triangles,
            afterTriangles: simplified.after.triangles,
            reduction: simplified.reduction,
          },
          triangles: simplified.after.triangles,
          vertices: simplified.after.vertices,
          derivedFrom: asset.id,
        },
      });
      notify(`Saved derived mesh ${derived.name} (source preserved)`);
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, ratio, importDerivedMeshGlb, notify]);

  const generateLods = useCallback(async () => {
    if (!asset?.path) return;
    setBusy('lod');
    try {
      const loaded = await loadGltfScene(publicAssetUrl(asset.path));
      if (!loaded?.scene) throw new Error('Failed to load mesh');
      const t0 = performance.now();
      const generated = await generateLodLevelsFromRoot(loaded.scene, {
        ratios: [...DEFAULT_LOD_RATIOS],
        distancesEu: [...DEFAULT_LOD_DISTANCES_EU],
      });
      const ms = performance.now() - t0;
      const assetIds = [];
      for (const level of generated.levels) {
        if (level.isSource) {
          assetIds.push(asset.id);
          continue;
        }
        const exported = await exportMeshRoot(level.root, 'glb');
        const derived = await importDerivedMeshGlb(exported.data, {
          name: `${asset.name} LOD${level.index}`,
          sourceAssetId: asset.id,
          tags: ['derived', 'lod'],
          meta: {
            lodGenerated: true,
            lodIndex: level.index,
            lodRatio: level.ratio,
            lodDistanceEu: level.distance,
            triangles: level.after.triangles,
            vertices: level.after.vertices,
            derivedFrom: asset.id,
          },
        });
        assetIds.push(derived.id);
      }
      setPreviewCompare({
        lod: generated.levels.map((l) => ({
          index: l.index,
          ratio: l.ratio,
          distance: l.distance,
          triangles: l.after.triangles,
          reduction: l.reduction,
        })),
        ms,
        assetIds,
      });
      notify(`Generated ${assetIds.length} LOD assets (${ms.toFixed(0)} ms). Assign in Static Mesh → LOD.`);
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, importDerivedMeshGlb, notify]);

  const runExport = useCallback(async () => {
    if (!asset?.path) return;
    setBusy('export');
    try {
      const loaded = await loadGltfScene(publicAssetUrl(asset.path));
      if (!loaded?.scene) throw new Error('Failed to load mesh');
      const exported = await exportMeshRoot(loaded.scene, exportFormat);
      downloadExportedMesh(exported, asset.name || 'export');
      if (exported.limitations?.length) {
        notify(`Exported ${exportFormat.toUpperCase()}. ${exported.limitations[0]}`);
      } else {
        notify(`Exported ${exportFormat.toUpperCase()}`);
      }
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, exportFormat, notify]);

  if (!asset || asset.kind !== 'mesh') return null;

  return (
    <div className="bb-mesh-tools" {...helpProps('assetViewer.meshTools')}>
      <h4 className="bb-mesh-tools__title">Mesh Inspection</h4>
      <dl className="bb-mesh-tools__stats">
        <div><dt>File</dt><dd>{report.bytesLabel}</dd></div>
        <div><dt>Format</dt><dd>{report.sourceFormat || report.format || '—'}</dd></div>
        <div><dt>Triangles</dt><dd>{report.triangles ?? '—'}</dd></div>
        <div><dt>Vertices</dt><dd>{report.vertices ?? '—'}</dd></div>
        <div><dt>Meshes</dt><dd>{report.meshCount ?? '—'}</dd></div>
        <div><dt>Materials</dt><dd>{report.materialCount ?? '—'}</dd></div>
        <div><dt>Textures</dt><dd>{report.textureCount ?? '—'}</dd></div>
        <div>
          <dt>Bounds (m)</dt>
          <dd>
            {report.boundingBoxMeters
              ? `${report.boundingBoxMeters.x?.toFixed?.(2) ?? report.boundingBoxMeters.x} × ${report.boundingBoxMeters.y?.toFixed?.(2) ?? report.boundingBoxMeters.y} × ${report.boundingBoxMeters.z?.toFixed?.(2) ?? report.boundingBoxMeters.z}`
              : '—'}
          </dd>
        </div>
        <div><dt>Relationship</dt><dd>{report.relationship}{report.derivedFrom ? ` ← ${report.derivedFrom}` : ''}</dd></div>
      </dl>
      {report.warnings?.length > 0 && (
        <ul className="bb-mesh-tools__warnings">
          {report.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <h4 className="bb-mesh-tools__title">Compression</h4>
      <p className="bb-muted">
        Decode: DRACO / Meshopt / KTX2 (local /vendor). Encode: not available —
        {compression.encode.reasonDraco}
      </p>

      <h4 className="bb-mesh-tools__title">Simplify</h4>
      <label className="bb-field">
        <span className="bb-field__label">Keep ratio ({Math.round(ratio * 100)}%)</span>
        <input
          type="range"
          min={0.1}
          max={0.95}
          step={0.05}
          value={ratio}
          disabled={Boolean(busy)}
          onChange={(e) => setRatio(Number(e.target.value))}
        />
      </label>
      <div className="bb-mesh-tools__row" {...helpProps('assetViewer.simplify')}>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={runSimplifyPreview}>
          {busy === 'simplify' ? 'Simplifying…' : 'Preview'}
        </button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={saveSimplified}>
          {busy === 'save-simple' ? 'Saving…' : 'Save derived'}
        </button>
      </div>
      {previewCompare?.before && previewCompare?.after && (
        <p className="bb-muted">
          Tris {previewCompare.before.triangles} → {previewCompare.after.triangles}
          {' '}({(previewCompare.reduction * 100).toFixed(1)}% reduction, {previewCompare.ms?.toFixed?.(0)} ms)
        </p>
      )}

      <h4 className="bb-mesh-tools__title">Auto LOD</h4>
      <p className="bb-muted">
        Generates L0 (source) + simplified L1/L2 as derived assets. Collision stays on the actor collider.
      </p>
      <button
        type="button"
        className="bb-btn"
        disabled={Boolean(busy)}
        onClick={generateLods}
        {...helpProps('assetViewer.lod')}
      >
        {busy === 'lod' ? 'Generating…' : 'Generate LOD assets'}
      </button>
      {previewCompare?.lod && (
        <ul className="bb-muted">
          {previewCompare.lod.map((l) => (
            <li key={l.index}>
              L{l.index}: {l.triangles} tris · ratio {l.ratio} · dist {l.distance} eu
            </li>
          ))}
        </ul>
      )}

      <h4 className="bb-mesh-tools__title" {...helpProps('assetViewer.pivot')}>Default Placement Pivot</h4>
      <p className="bb-muted">
        Interactive gizmo in the preview moves the proposed pivot; geometry stays put.
        Saved as <code>meta.defaultContentOffset</code> for future placements only — source GLB
        and existing actors are never rewritten.
      </p>
      <div className="bb-mesh-tools__row">
        <button
          type="button"
          className={`bb-btn${pivotEditMode ? ' bb-btn--active' : ''}`}
          disabled={Boolean(busy)}
          onClick={() => onPivotEditModeChange?.(!pivotEditMode)}
          {...helpProps('assetViewer.pivotEdit')}
        >
          {pivotEditMode ? 'Exit Pivot Edit' : 'Pivot Edit'}
        </button>
        <label className="bb-field bb-field--inline">
          <input
            type="checkbox"
            checked={Boolean(snapEnabled)}
            disabled={Boolean(busy)}
            onChange={(e) => onSnapEnabledChange?.(e.target.checked)}
          />
          <span className="bb-field__label">Snap 25</span>
        </label>
      </div>
      <div className="bb-field-caption">Content offset (eu){pivotDirty ? ' · unsaved draft' : ''}</div>
      <div className="bb-mesh-tools__row">
        {['x', 'y', 'z'].map((axis) => (
          <label key={axis} className="bb-field">
            <span className="bb-field__label">{axis.toUpperCase()}</span>
            <input
              className="bb-input"
              type="number"
              step={1}
              value={pivotDraft[axis]}
              disabled={Boolean(busy)}
              onChange={(e) => {
                const value = Number(e.target.value) || 0;
                setPivotDraft({ ...pivotDraft, [axis]: value });
                if (!pivotEditMode) onPivotEditModeChange?.(true);
              }}
            />
          </label>
        ))}
      </div>
      <div className="bb-mesh-tools__row">
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={Boolean(busy) || !pivotDirty}
          onClick={() => saveAssetPivot(pivotDraft)}
          {...helpProps('assetViewer.pivot.apply', pivotDirty ? null : 'No pivot draft changes.')}
        >
          {busy === 'pivot' ? 'Saving…' : 'Apply'}
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={Boolean(busy) || (!pivotDirty && !pivotEditMode)}
          onClick={() => {
            if (typeof onCancelPivot === 'function') onCancelPivot();
            else {
              setPivotDraft(normalizeContentOffset(asset?.meta?.defaultContentOffset));
              onPivotEditModeChange?.(false);
            }
          }}
          {...helpProps('assetViewer.pivot.cancel')}
        >
          Cancel
        </button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('original')} {...helpProps('assetViewer.pivot.presets')}>Reset</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('center')} {...helpProps('assetViewer.pivot.presets')}>Center</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('bottomCenter')} {...helpProps('assetViewer.pivot.presets')}>Bottom</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('topCenter')} {...helpProps('assetViewer.pivot.presets')}>Top</button>
      </div>
      <div className="bb-field-caption">Preview around proposed pivot</div>
      <div className="bb-mesh-tools__row">
        <label className="bb-field">
          <span className="bb-field__label">Rot Y°</span>
          <input
            className="bb-input"
            type="number"
            step={5}
            value={previewRotationY}
            disabled={Boolean(busy)}
            onChange={(e) => onPreviewRotationYChange?.(Number(e.target.value) || 0)}
          />
        </label>
        <label className="bb-field">
          <span className="bb-field__label">Scale</span>
          <input
            className="bb-input"
            type="number"
            step={0.1}
            min={0.1}
            value={previewScale}
            disabled={Boolean(busy)}
            onChange={(e) => onPreviewScaleChange?.(Math.max(0.1, Number(e.target.value) || 1))}
          />
        </label>
        <button
          type="button"
          className="bb-btn"
          disabled={Boolean(busy)}
          onClick={() => {
            onPreviewRotationYChange?.(0);
            onPreviewScaleChange?.(1);
          }}
          {...helpProps('assetViewer.clearPreview')}
        >
          Clear preview
        </button>
      </div>

      <h4 className="bb-mesh-tools__title">Export</h4>
      <label className="bb-field">
        <span className="bb-field__label">Format</span>
        <select
          className="bb-select"
          value={exportFormat}
          disabled={Boolean(busy)}
          onChange={(e) => setExportFormat(e.target.value)}
        >
          {MESH_EXPORT_FORMATS.map((f) => (
            <option key={f} value={f}>{f.toUpperCase()}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="bb-btn"
        disabled={Boolean(busy)}
        onClick={runExport}
        {...helpProps('assetViewer.export')}
      >
        {busy === 'export' ? 'Exporting…' : 'Download export'}
      </button>
      <p className="bb-muted">Source registry assets are never overwritten by export or simplify.</p>
    </div>
  );
}
