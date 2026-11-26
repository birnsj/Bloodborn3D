import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import {
  suppressNativeImageMenu,
  useEditorContextMenu,
} from '../../ui/contextMenu/EditorContextMenu.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { MaterialPreviewCanvas } from '../assets/MeshPreviewCanvas.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import {
  generatePbrMapsFromImageData,
  loadImageDataFromUrl,
  tileImageDataPreview,
} from './pbrGeneration.js';
import {
  DEFAULT_NORMAL_PARAMS,
  DEFAULT_ROUGHNESS_PARAMS,
  createDefaultPbrSession,
  normalizeNormalParams,
  normalizeRoughnessParams,
} from './pbrGeneratorState.js';
import { applyGeneratedPbrMaps } from './applyPbrMaps.js';

const PREVIEW_MODES = [
  { id: 'lit', label: 'Lit' },
  { id: 'base', label: 'Base' },
  { id: 'normal', label: 'Normal' },
  { id: 'roughness', label: 'Roughness' },
];

const PREVIEW_SHAPES = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'plane', label: 'Flat' },
];

/**
 * Local PBR map generator — drafts maps until Apply.
 * Cancel discards session state and leaves the saved material untouched.
 */
export function PbrGeneratorPanel({
  material,
  onClose,
  onApplied,
}) {
  const {
    assetResolver,
    importTexture,
    replaceTexture,
    saveMaterialDefinition,
    notify,
    setStatus,
  } = useAssetBrowser();
  const { openFromEvent } = useEditorContextMenu();

  const getTextureUrl = assetResolver?.getTextureUrl;
  const sourceId = material?.baseColorMapId || null;

  const [session, setSession] = useState(() => createDefaultPbrSession({
    sourceTextureId: sourceId,
    tileHorizontal: material?.pbrGenerator?.tileHorizontal ?? true,
    tileVertical: material?.pbrGenerator?.tileVertical ?? false,
    previous: material?.pbrGenerator,
  }));
  const [sourceImage, setSourceImage] = useState(null);
  const [maps, setMaps] = useState(null);
  const [genMs, setGenMs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [previewMode, setPreviewMode] = useState('lit');
  const [previewShape, setPreviewShape] = useState('sphere');
  const [showAfter, setShowAfter] = useState(true);
  const [tilePreview, setTilePreview] = useState(true);
  const [lightAzimuth, setLightAzimuth] = useState(35);
  const [previewUrls, setPreviewUrls] = useState({ normal: null, roughness: null });
  const genTokenRef = useRef(0);

  // Load base-color pixels once per source texture.
  useEffect(() => {
    let cancelled = false;
    setSourceImage(null);
    setMaps(null);
    setError(null);
    if (!sourceId || !getTextureUrl) {
      setError('Select a material with a base-color texture.');
      return undefined;
    }
    const url = getTextureUrl(sourceId);
    setBusy(true);
    loadImageDataFromUrl(url)
      .then((img) => {
        if (cancelled) return;
        setSourceImage(img);
        setBusy(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBusy(false);
        setError(err.message || 'Failed to load base-color texture');
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, getTextureUrl]);

  const regenerate = useCallback(() => {
    if (!sourceImage) return;
    const token = ++genTokenRef.current;
    setBusy(true);
    setError(null);
    // Yield so scrub inputs stay responsive on large textures.
    requestAnimationFrame(() => {
      try {
        const result = generatePbrMapsFromImageData(sourceImage, {
          normal: session.normal,
          roughness: session.roughness,
          tiling: session.tiling,
        });
        if (token !== genTokenRef.current) return;
        setMaps(result);
        setGenMs(result.ms);
        setBusy(false);
      } catch (err) {
        if (token !== genTokenRef.current) return;
        setBusy(false);
        setError(err.message || 'Generation failed');
      }
    });
  }, [sourceImage, session.normal, session.roughness, session.tiling]);

  useEffect(() => {
    if (!sourceImage) return undefined;
    const handle = setTimeout(() => regenerate(), 80);
    return () => clearTimeout(handle);
  }, [sourceImage, regenerate]);

  const patchNormal = (partial) => {
    setSession((prev) => ({
      ...prev,
      normal: normalizeNormalParams({ ...prev.normal, ...partial }),
    }));
  };
  const patchRoughness = (partial) => {
    setSession((prev) => ({
      ...prev,
      roughness: normalizeRoughnessParams({ ...prev.roughness, ...partial }),
    }));
  };
  const patchTiling = (partial) => {
    setSession((prev) => ({
      ...prev,
      tiling: { ...prev.tiling, ...partial },
    }));
  };

  const previewDefinition = useMemo(() => {
    if (!material) return null;
    if (!showAfter || !maps) {
      return {
        ...material,
        // Before: base color only (strip maps for comparison).
        normalMapId: null,
        roughnessMapId: null,
      };
    }
    // Live preview uses blob URLs via synthetic ids — MaterialPreviewCanvas
    // needs getTextureUrl. We pass map blobs through a local resolver wrapper.
    return {
      ...material,
      normalMapId: '__pbr_preview_normal__',
      roughnessMapId: '__pbr_preview_roughness__',
      roughness: 1,
      metalness: 0,
    };
  }, [material, maps, showAfter]);

  const previewGetTextureUrl = useCallback((id) => {
    if (id === '__pbr_preview_normal__' && previewUrls.normal) return previewUrls.normal;
    if (id === '__pbr_preview_roughness__' && previewUrls.roughness) {
      return previewUrls.roughness;
    }
    return getTextureUrl?.(id) || null;
  }, [getTextureUrl, previewUrls]);

  // Data-URL previews for Three.js (same path as registered textures after Apply).
  useEffect(() => {
    if (!maps?.normal || !maps?.roughness) {
      setPreviewUrls({ normal: null, roughness: null });
      return undefined;
    }
    const canvas = document.createElement('canvas');
    const toUrl = (imageData) => {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      const id = imageData instanceof ImageData
        ? imageData
        : new ImageData(imageData.data, imageData.width, imageData.height);
      ctx.putImageData(id, 0, 0);
      return canvas.toDataURL('image/png');
    };
    setPreviewUrls({
      normal: toUrl(maps.normal),
      roughness: toUrl(maps.roughness),
    });
    return undefined;
  }, [maps?.normal, maps?.roughness]);

  const onApply = useCallback(async () => {
    if (!material || !maps?.normal || !maps?.roughness) return;
    setApplying(true);
    setError(null);
    try {
      setStatus('Applying PBR maps…');
      const result = await applyGeneratedPbrMaps({
        baseline: material,
        normalImage: maps.normal,
        roughnessImage: maps.roughness,
        session,
        importTexture,
        replaceTexture,
        saveMaterialDefinition,
      });
      notify(`Applied PBR maps to ${result.definition.name}`);
      setStatus(`Applied PBR maps (${Math.round(genMs || 0)} ms generate).`);
      onApplied?.(result.definition);
    } catch (err) {
      setError(err.message || 'Apply failed');
      notify(err.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [
    material,
    maps,
    session,
    importTexture,
    replaceTexture,
    saveMaterialDefinition,
    notify,
    setStatus,
    onApplied,
    genMs,
  ]);

  const inspectImage = useMemo(() => {
    if (!maps) return null;
    if (previewMode === 'normal') return maps.normal;
    if (previewMode === 'roughness') return maps.roughness;
    if (previewMode === 'base') return sourceImage;
    return null;
  }, [maps, previewMode, sourceImage]);

  const tiledInspect = useMemo(() => {
    if (!inspectImage || !tilePreview) return inspectImage;
    const cols = session.tiling.tileHorizontal ? 3 : 1;
    const rows = session.tiling.tileVertical ? 2 : 1;
    if (cols === 1 && rows === 1) return inspectImage;
    return tileImageDataPreview(inspectImage, cols, rows);
  }, [inspectImage, tilePreview, session.tiling]);

  if (!material) return null;

  return (
    <div className="bb-pbr-generator" {...helpProps('materials.pbrGenerator')}>
      <header className="bb-pbr-generator__head">
        <div>
          <h2 className="bb-pbr-generator__title">Generate PBR Maps</h2>
          <p className="bb-muted">
            Local normal + roughness from base color for
            {' '}
            <strong>{material.name}</strong>
            . Artistic approximation — not measured PBR.
            Cancel leaves the saved material unchanged.
          </p>
        </div>
        <div className="bb-field-row" style={{ gap: 6 }}>
          <button type="button" className="bb-btn" disabled={applying} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--primary"
            disabled={applying || busy || !maps}
            onClick={() => { void onApply(); }}
            {...helpProps('materials.pbrApply')}
          >
            {applying ? 'Applying…' : 'Apply & Save'}
          </button>
        </div>
      </header>

      {error && <p className="bb-pbr-generator__error">{error}</p>}

      <div className="bb-pbr-generator__grid">
        <section className="bb-pbr-generator__controls" {...helpProps('materials.pbrParams')}>
          <div className="bb-field-caption">Tiling (edge sampling)</div>
          <label className="bb-field bb-field--row" {...helpProps('materials.pbrTiling')}>
            <input
              type="checkbox"
              checked={session.tiling.tileHorizontal}
              onChange={(e) => patchTiling({ tileHorizontal: e.target.checked })}
            />
            <span className="bb-field__label">Tile Horizontal (wrap)</span>
          </label>
          <label className="bb-field bb-field--row">
            <input
              type="checkbox"
              checked={session.tiling.tileVertical}
              onChange={(e) => patchTiling({ tileVertical: e.target.checked })}
            />
            <span className="bb-field__label">Tile Vertical (wrap)</span>
          </label>

          <div className="bb-field-caption">
            Normal
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              onClick={() => patchNormal({ ...DEFAULT_NORMAL_PARAMS })}
            >
              Reset
            </button>
          </div>
          <Param
            label="Surface detail strength"
            value={session.normal.strength}
            min={0}
            max={6}
            step={0.05}
            onChange={(v) => patchNormal({ strength: v })}
          />
          <Param
            label="Fine detail"
            value={session.normal.fineDetail}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patchNormal({ fineDetail: v })}
          />
          <Param
            label="Large-scale relief"
            value={session.normal.largeScale}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patchNormal({ largeScale: v })}
          />
          <Param
            label="Smoothing"
            value={session.normal.smoothing}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patchNormal({ smoothing: v })}
          />
          <label className="bb-field bb-field--row">
            <input
              type="checkbox"
              checked={session.normal.invertHeight}
              onChange={(e) => patchNormal({ invertHeight: e.target.checked })}
            />
            <span className="bb-field__label">Invert height (dark = high)</span>
          </label>
          <label className="bb-field bb-field--row">
            <input
              type="checkbox"
              checked={session.normal.invertY}
              onChange={(e) => patchNormal({ invertY: e.target.checked })}
            />
            <span className="bb-field__label">Invert Normal Y (DirectX)</span>
          </label>

          <div className="bb-field-caption">
            Roughness
            <button
              type="button"
              className="bb-btn bb-btn--ghost"
              onClick={() => patchRoughness({ ...DEFAULT_ROUGHNESS_PARAMS })}
            >
              Reset
            </button>
          </div>
          <label className="bb-field">
            <span className="bb-field__label">Mode</span>
            <select
              className="bb-select"
              value={session.roughness.mode}
              onChange={(e) => patchRoughness({ mode: e.target.value })}
            >
              <option value="derived">From base color</option>
              <option value="uniform">Uniform</option>
            </select>
          </label>
          {session.roughness.mode === 'uniform' ? (
            <Param
              label="Uniform roughness"
              value={session.roughness.uniformValue}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patchRoughness({ uniformValue: v })}
            />
          ) : (
            <>
              <Param
                label="Overall roughness"
                value={session.roughness.overall}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patchRoughness({ overall: v })}
              />
              <Param
                label="Contrast"
                value={session.roughness.contrast}
                min={0.1}
                max={4}
                step={0.05}
                onChange={(v) => patchRoughness({ contrast: v })}
              />
              <Param
                label="Detail intensity"
                value={session.roughness.detail}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => patchRoughness({ detail: v })}
              />
              <label className="bb-field bb-field--row">
                <input
                  type="checkbox"
                  checked={session.roughness.invert}
                  onChange={(e) => patchRoughness({ invert: e.target.checked })}
                />
                <span className="bb-field__label">Invert</span>
              </label>
              <Param
                label="Min roughness"
                value={session.roughness.min}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patchRoughness({ min: v })}
              />
              <Param
                label="Max roughness"
                value={session.roughness.max}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patchRoughness({ max: v })}
              />
            </>
          )}
          {genMs != null && (
            <p className="bb-muted">
              Last generate:
              {' '}
              {Math.round(genMs)}
              {' '}
              ms ·
              {' '}
              {sourceImage ? `${sourceImage.width}×${sourceImage.height}` : '—'}
            </p>
          )}
        </section>

        <section className="bb-pbr-generator__preview">
          <div className="bb-pbr-generator__preview-toolbar">
            <div className="bb-seg" role="group" aria-label="Preview mode">
              {PREVIEW_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`bb-btn bb-btn--icon${previewMode === m.id ? ' bb-btn--active' : ''}`}
                  onClick={() => setPreviewMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="bb-seg" role="group" aria-label="Preview shape">
              {PREVIEW_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`bb-btn bb-btn--icon${previewShape === s.id ? ' bb-btn--active' : ''}`}
                  onClick={() => setPreviewShape(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="bb-field bb-field--row">
              <input
                type="checkbox"
                checked={showAfter}
                onChange={(e) => setShowAfter(e.target.checked)}
              />
              <span className="bb-field__label">After (with maps)</span>
            </label>
            <label className="bb-field bb-field--row">
              <input
                type="checkbox"
                checked={tilePreview}
                onChange={(e) => setTilePreview(e.target.checked)}
              />
              <span className="bb-field__label">Tile preview</span>
            </label>
          </div>

          <div
            className="bb-pbr-generator__preview-stage"
            {...helpProps('materials.pbrPreview')}
            onContextMenu={(event) => {
              openFromEvent(event, PREVIEW_MODES.map((m) => ({
                id: `mode-${m.id}`,
                label: `View ${m.label}`,
                disabled: previewMode === m.id,
                onSelect: () => setPreviewMode(m.id),
              })));
            }}
          >
            {previewMode === 'lit' ? (
              <>
                <MaterialPreviewCanvas
                  definition={previewDefinition}
                  color={material.baseColor}
                  getTextureUrl={previewGetTextureUrl}
                  shape={previewShape}
                  lightAzimuth={lightAzimuth}
                />
                <label className="bb-pbr-generator__light">
                  <span className="bb-field__label">Light direction</span>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={lightAzimuth}
                    onChange={(e) => setLightAzimuth(Number(e.target.value))}
                  />
                </label>
              </>
            ) : (
              <MapInspectCanvas image={tiledInspect} busy={busy} />
            )}
          </div>
          <p className="bb-muted">
            UV scale
            {' '}
            {material.uvScale?.x?.toFixed?.(4) ?? 1}
            ×
            {material.uvScale?.y?.toFixed?.(4) ?? 1}
            {' '}
            is preserved on Apply. Material roughness scalar becomes 1 when a
            roughness map is assigned (map holds absolute values).
          </p>
        </section>
      </div>
    </div>
  );
}

function Param({
  label, value, min, max, step, onChange,
}) {
  return (
    <label className="bb-field">
      <span className="bb-field__label">{label}</span>
      <ScrubNumberInput
        className="bb-input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </label>
  );
}

function MapInspectCanvas({ image, busy }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const w = image.width;
    const h = image.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const id = image instanceof ImageData
      ? image
      : new ImageData(image.data, w, h);
    ctx.putImageData(id, 0, 0);
  }, [image]);

  return (
    <div className="bb-pbr-generator__inspect">
      {busy && <span className="bb-muted">Updating…</span>}
      <canvas
        ref={canvasRef}
        className="bb-pbr-generator__inspect-canvas"
        onContextMenu={suppressNativeImageMenu}
      />
    </div>
  );
}
