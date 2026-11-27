import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_TEXTURE_SAMPLER,
  DEFAULT_TEXTURE_TRANSFORM,
  TEXTURE_COLOR_SPACES,
  TEXTURE_MAG_FILTERS,
  TEXTURE_MIN_FILTERS,
  TEXTURE_WRAP_MODES,
  describeSampler,
  estimateTextureGpuBytes,
  formatBytes,
  isCompressedTextureMeta,
  isCompressedTexturePath,
  normalizeTextureSampler,
  normalizeTextureTransform,
  validateTextureSampler,
} from '../../assets/textureSampling.js';
import { TexturePreviewCanvas } from './TexturePreviewCanvas.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

/**
 * Batch 8 — Texture Asset Viewer inspector (sampling, transform, diagnostics).
 */
export function TextureInspector({
  asset,
  updateTextureMeta,
  notify,
  maxAnisotropy = 16,
  /** When false, preview is owned by the parent stage (avoids a second WebGL view). */
  showPreview = true,
  onDraftChange = null,
}) {
  const meta = asset?.meta || {};
  const compressed = isCompressedTextureMeta(meta) || isCompressedTexturePath(asset?.path);
  const [sampler, setSampler] = useState(() => normalizeTextureSampler(meta.sampler, { compressed }));
  const [transform, setTransform] = useState(() => normalizeTextureTransform(meta.transform));
  const [channelView, setChannelView] = useState('rgba');
  const [busy, setBusy] = useState(false);
  const [dims, setDims] = useState({
    width: Number(meta.width) || 0,
    height: Number(meta.height) || 0,
  });

  useEffect(() => {
    setSampler(normalizeTextureSampler(asset?.meta?.sampler, {
      compressed: isCompressedTextureMeta(asset?.meta) || isCompressedTexturePath(asset?.path),
    }));
    setTransform(normalizeTextureTransform(asset?.meta?.transform));
    setDims({
      width: Number(asset?.meta?.width) || 0,
      height: Number(asset?.meta?.height) || 0,
    });
  }, [asset?.id, asset?.updatedAt, asset?.meta, asset?.path]);

  useEffect(() => {
    onDraftChange?.({ sampler, transform, channelView, width: dims.width, height: dims.height });
  }, [sampler, transform, channelView, dims.width, dims.height, onDraftChange]);

  const validation = useMemo(
    () => validateTextureSampler(sampler, { compressed }),
    [sampler, compressed],
  );

  const gpuEstimate = useMemo(() => estimateTextureGpuBytes({
    width: dims.width,
    height: dims.height,
    generateMipmaps: sampler.generateMipmaps,
    compressed,
    bytes: Number(meta.bytes) || 0,
  }), [dims, sampler.generateMipmaps, compressed, meta.bytes]);

  const dirty = useMemo(() => {
    const a = normalizeTextureSampler(meta.sampler, { compressed });
    const b = normalizeTextureTransform(meta.transform);
    return JSON.stringify(a) !== JSON.stringify(sampler)
      || JSON.stringify(b) !== JSON.stringify(transform);
  }, [meta.sampler, meta.transform, sampler, transform, compressed]);

  const patchSampler = (partial) => {
    setSampler((prev) => normalizeTextureSampler({ ...prev, ...partial }, { compressed }));
  };
  const patchTransform = (partial) => {
    setTransform((prev) => normalizeTextureTransform({ ...prev, ...partial }));
  };

  const onApply = useCallback(async () => {
    if (!updateTextureMeta || !asset?.id) return;
    setBusy(true);
    try {
      const nextMeta = {
        sampler,
        transform,
      };
      if (dims.width > 0) nextMeta.width = dims.width;
      if (dims.height > 0) nextMeta.height = dims.height;
      await updateTextureMeta(asset.id, nextMeta);
      notify?.('Texture sampling saved');
    } catch (err) {
      notify?.(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [updateTextureMeta, asset?.id, sampler, transform, dims, notify]);

  const onReset = () => {
    setSampler(normalizeTextureSampler(DEFAULT_TEXTURE_SAMPLER, { compressed }));
    setTransform(normalizeTextureTransform(DEFAULT_TEXTURE_TRANSFORM));
  };

  const onImageProbe = useCallback((w, h) => {
    if (w > 0 && h > 0) setDims({ width: w, height: h });
  }, []);

  const summary = describeSampler(sampler);
  const format = meta.format || (asset?.path || '').split('.').pop() || '—';
  const alpha = meta.hasAlpha == null ? 'α?' : (meta.hasAlpha ? 'α' : 'opaque');
  const dimLabel = dims.width && dims.height ? `${dims.width}×${dims.height}` : '—';
  const compact = !showPreview;

  return (
    <div
      className={`bb-texture-inspector${compact ? ' bb-texture-inspector--compact' : ''}`}
      {...helpProps('texture.inspector')}
    >
      {showPreview ? (
        <TexturePreviewCanvas
          url={asset?.url || asset?.preview?.url}
          path={asset?.path}
          sampler={sampler}
          transform={transform}
          channelView={channelView}
          compressed={compressed}
          maxAnisotropy={maxAnisotropy}
          onProbeSize={onImageProbe}
        />
      ) : null}

      <p className="bb-texture-inspector__summary">
        <span>{dimLabel}</span>
        <span>{format}</span>
        <span>{summary.colorSpace}</span>
        <span>{alpha}</span>
        <span>{summary.mipmaps}</span>
        <span>{compressed ? 'KTX2' : 'raw'}</span>
        <span title="GPU memory estimate (not a live query)">{formatBytes(gpuEstimate)}</span>
      </p>

      {validation.warnings.length > 0 && (
        <ul className="bb-texture-inspector__warnings">
          {validation.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div className="bb-texture-inspector__grid">
        <fieldset className="bb-texture-inspector__fieldset" disabled={busy}>
          <legend>Sampling</legend>
          <label>
            Wrap S
            <select value={sampler.wrapS} onChange={(e) => patchSampler({ wrapS: e.target.value })}>
              {TEXTURE_WRAP_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            Wrap T
            <select value={sampler.wrapT} onChange={(e) => patchSampler({ wrapT: e.target.value })}>
              {TEXTURE_WRAP_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            Mag
            <select value={sampler.magFilter} onChange={(e) => patchSampler({ magFilter: e.target.value })}>
              {TEXTURE_MAG_FILTERS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            Min
            <select value={sampler.minFilter} onChange={(e) => patchSampler({ minFilter: e.target.value })}>
              {TEXTURE_MIN_FILTERS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>
            Aniso
            <input
              type="number"
              min={1}
              max={maxAnisotropy}
              value={sampler.anisotropy}
              onChange={(e) => patchSampler({ anisotropy: Number(e.target.value) })}
              title={`max ${maxAnisotropy}`}
            />
          </label>
          <label>
            Color
            <select value={sampler.colorSpace} onChange={(e) => patchSampler({ colorSpace: e.target.value })}>
              {TEXTURE_COLOR_SPACES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="bb-texture-inspector__check">
            <input
              type="checkbox"
              checked={sampler.generateMipmaps}
              disabled={compressed}
              onChange={(e) => patchSampler({ generateMipmaps: e.target.checked })}
            />
            Mipmaps
          </label>
        </fieldset>

        <fieldset className="bb-texture-inspector__fieldset" disabled={busy} {...helpProps('texture.transform')}>
          <legend>Transform</legend>
          <label>Rep U <input type="number" step="0.1" value={transform.repeatU} onChange={(e) => patchTransform({ repeatU: Number(e.target.value) })} /></label>
          <label>Rep V <input type="number" step="0.1" value={transform.repeatV} onChange={(e) => patchTransform({ repeatV: Number(e.target.value) })} /></label>
          <label>Off U <input type="number" step="0.05" value={transform.offsetU} onChange={(e) => patchTransform({ offsetU: Number(e.target.value) })} /></label>
          <label>Off V <input type="number" step="0.05" value={transform.offsetV} onChange={(e) => patchTransform({ offsetV: Number(e.target.value) })} /></label>
          <label>Rot ° <input type="number" step="1" value={transform.rotation} onChange={(e) => patchTransform({ rotation: Number(e.target.value) })} /></label>
          <label>Ctr U <input type="number" step="0.05" value={transform.centerU} onChange={(e) => patchTransform({ centerU: Number(e.target.value) })} /></label>
          <label>Ctr V <input type="number" step="0.05" value={transform.centerV} onChange={(e) => patchTransform({ centerV: Number(e.target.value) })} /></label>
          <label className="bb-texture-inspector__check">
            <input
              type="checkbox"
              checked={transform.flipY}
              disabled={compressed}
              onChange={(e) => patchTransform({ flipY: e.target.checked })}
            />
            Flip Y
          </label>
        </fieldset>
      </div>

      <div className="bb-texture-inspector__footer">
        <label className="bb-texture-inspector__channel" {...helpProps('texture.channel')}>
          Channel
          <select value={channelView} onChange={(e) => setChannelView(e.target.value)}>
            <option value="rgba">RGBA</option>
            <option value="r">R</option>
            <option value="g">G</option>
            <option value="b">B</option>
            <option value="a">A</option>
          </select>
        </label>
        <div className="bb-texture-inspector__actions">
          <button
            type="button"
            className="bb-btn"
            disabled={!dirty || busy}
            onClick={onApply}
            {...helpProps('texture.apply', dirty ? null : 'No texture draft changes.')}
          >
            Apply
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={busy}
            onClick={onReset}
            {...helpProps('texture.reset')}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
