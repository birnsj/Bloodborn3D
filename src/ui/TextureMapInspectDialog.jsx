import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Large lightbox for inspecting UV atlases / PBR maps (pan + scroll zoom).
 * Remount via key={url} from the parent so zoom/pan start fresh.
 */
export function TextureMapInspectDialog({
  open,
  url,
  title = 'Texture map',
  subtitle = null,
  onClose,
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
      if (e.key === '0' || e.key === 'Home') {
        e.preventDefault();
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !url || typeof document === 'undefined') return null;

  return createPortal(
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Close texture inspect"
        onClick={() => onClose?.()}
      />
      <div
        className="bb-dialog bb-dialog--texture-inspect"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-texture-inspect-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bb-dialog__header">
          <div>
            <h2 id="bb-texture-inspect-title" className="bb-dialog__title">{title}</h2>
            {subtitle ? <p className="bb-muted">{subtitle}</p> : null}
            <p className="bb-muted">Scroll to zoom · drag to pan · 0 resets · Esc closes</p>
          </div>
          <button type="button" className="bb-btn bb-btn--active" onClick={() => onClose?.()}>
            Close
          </button>
        </div>
        <div
          className="bb-dialog__body bb-texture-inspect"
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setScale((s) => Math.min(8, Math.max(0.25, s * delta)));
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              originX: offset.x,
              originY: offset.y,
            });
          }}
          onPointerMove={(e) => {
            if (!drag || drag.pointerId !== e.pointerId) return;
            setOffset({
              x: drag.originX + (e.clientX - drag.startX),
              y: drag.originY + (e.clientY - drag.startY),
            });
          }}
          onPointerUp={(e) => {
            if (drag?.pointerId === e.pointerId) setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <img
            className="bb-texture-inspect__img"
            src={url}
            alt={title}
            draggable={false}
            style={{
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
