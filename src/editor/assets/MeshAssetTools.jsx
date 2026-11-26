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
}) {
  const [report, setReport] = useState(() => buildMeshAssetReport(asset));
  const [busy, setBusy] = useState(null);
  const [ratio, setRatio] = useState(0.5);
  const [previewCompare, setPreviewCompare] = useState(null);
  const [exportFormat, setExportFormat] = useState('glb');
  const [pivotDraft, setPivotDraft] = useState(() =>
    normalizeContentOffset(asset?.meta?.defaultContentOffset));
  const compression = describeCompressionSupport();

  useEffect(() => {
    let cancelled = false;
    setReport(buildMeshAssetReport(asset));
    setPreviewCompare(null);
    setPivotDraft(normalizeContentOffset(asset?.meta?.defaultContentOffset));
    (async () => {
      if (!asset?.path) return;
      const url = publicAssetUrl(asset.path);
      const loaded = await loadGltfScene(url);
      if (cancelled || !loaded?.scene) return;
      const live = inspectMeshRoot(loaded.scene);
      setReport(buildMeshAssetReport(asset, live));
    })();
    return () => { cancelled = true; };
  }, [asset?.id, asset?.path, asset?.meta?.bytes, asset?.meta?.defaultContentOffset]);

  const saveAssetPivot = useCallback(async (offset, label = 'Saved asset default pivot') => {
    if (!asset?.id || !updateMeshMeta) return;
    setBusy('pivot');
    try {
      const next = normalizeContentOffset(offset);
      await updateMeshMeta(asset.id, { defaultContentOffset: next });
      setPivotDraft(next);
      notify(`${label}. Existing placed actors are unchanged.`);
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }, [asset, updateMeshMeta, notify]);

  const applyAssetPivotPreset = useCallback(async (preset) => {
    const offset = assetPivotPresetOffset(preset, asset?.meta || report);
    await saveAssetPivot(offset, `Asset pivot: ${PIVOT_PRESET_LABELS[preset] || preset}`);
  }, [asset, report, saveAssetPivot]);

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
      <div className="bb-mesh-tools__row">
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
      <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={generateLods}>
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
        Saved as asset meta for future placements only. Source GLB is never rewritten.
        Existing actors keep their own pivots unless you apply explicitly in the level.
      </p>
      <div className="bb-field-caption">Content offset (eu)</div>
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
              onChange={(e) => setPivotDraft((prev) => ({
                ...prev,
                [axis]: Number(e.target.value) || 0,
              }))}
            />
          </label>
        ))}
      </div>
      <div className="bb-mesh-tools__row">
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => saveAssetPivot(pivotDraft)}>
          {busy === 'pivot' ? 'Saving…' : 'Save default pivot'}
        </button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('original')}>Reset</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('center')}>Center</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('bottomCenter')}>Bottom</button>
        <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={() => applyAssetPivotPreset('topCenter')}>Top</button>
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
      <button type="button" className="bb-btn" disabled={Boolean(busy)} onClick={runExport}>
        {busy === 'export' ? 'Exporting…' : 'Download export'}
      </button>
      <p className="bb-muted">Source registry assets are never overwritten by export or simplify.</p>
    </div>
  );
}
