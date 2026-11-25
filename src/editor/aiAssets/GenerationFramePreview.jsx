import { useMemo } from 'react';
import {
  describeTilingDirection,
  resolveGenerationPixelSize,
} from './generationFrame.js';

/**
 * Visual preview of generation output size + tiling direction.
 * Provider-independent — driven by aspect/resolution/tiling options.
 */
export function GenerationFramePreview({
  className = '',
  aspectRatio = '1:1',
  resolution = '1K',
  width = null,
  height = null,
  tileHorizontal = false,
  tileVertical = false,
}) {
  const frame = useMemo(
    () => resolveGenerationPixelSize({ aspectRatio, resolution, width, height }),
    [aspectRatio, resolution, width, height],
  );
  const tilingLabel = describeTilingDirection({ tileHorizontal, tileVertical });
  const tileH = Boolean(tileHorizontal);
  const tileV = Boolean(tileVertical);
  const aspectStyle = { aspectRatio: `${frame.width} / ${frame.height}` };

  return (
    <div className={`bb-gen-frame-preview${className ? ` ${className}` : ''}`}>
      <div className="bb-gen-frame-preview__stage">
        <div className={`bb-gen-frame-preview__layout${tileH ? ' is-tile-h' : ''}${tileV ? ' is-tile-v' : ''}`}>
          {tileH && (
            <GhostColumn tileV={tileV} aspectStyle={aspectStyle} side="left" />
          )}

          <div className="bb-gen-frame-preview__main-col">
            {tileV && <div className="bb-gen-frame-preview__cell is-ghost" style={aspectStyle} />}
            <div className="bb-gen-frame-preview__cell is-primary" style={aspectStyle}>
              {(tileH || tileV) && (
                <div className="bb-gen-frame-preview__arrows" aria-hidden>
                  {tileH && (
                    <>
                      <span className="bb-gen-frame-preview__arrow is-left">←</span>
                      <span className="bb-gen-frame-preview__arrow is-right">→</span>
                    </>
                  )}
                  {tileV && (
                    <>
                      <span className="bb-gen-frame-preview__arrow is-up">↑</span>
                      <span className="bb-gen-frame-preview__arrow is-down">↓</span>
                    </>
                  )}
                </div>
              )}
              <div className="bb-gen-frame-preview__size-badge">
                {frame.width}×{frame.height}
              </div>
            </div>
            {tileV && <div className="bb-gen-frame-preview__cell is-ghost" style={aspectStyle} />}
          </div>

          {tileH && (
            <GhostColumn tileV={tileV} aspectStyle={aspectStyle} side="right" />
          )}
        </div>
      </div>
      <div className="bb-gen-frame-preview__meta">
        <strong>{frame.width} × {frame.height} px</strong>
        <span className="bb-muted">
          {frame.aspectLabel}
          {frame.resolution ? ` · ${frame.resolution}` : ''}
        </span>
        <span className={`bb-gen-frame-preview__tile-label${tileH || tileV ? ' is-on' : ''}`}>
          {tilingLabel}
        </span>
      </div>
    </div>
  );
}

function GhostColumn({ tileV, aspectStyle, side }) {
  return (
    <div className={`bb-gen-frame-preview__side-col is-${side}`}>
      {tileV && <div className="bb-gen-frame-preview__cell is-ghost" style={aspectStyle} />}
      <div className="bb-gen-frame-preview__cell is-ghost" style={aspectStyle} />
      {tileV && <div className="bb-gen-frame-preview__cell is-ghost" style={aspectStyle} />}
    </div>
  );
}
