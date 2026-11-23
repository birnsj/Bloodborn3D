import { useState } from 'react';
import { IconCollapse, IconExpand } from './icons.jsx';

export function Collapsible({ title, defaultOpen = true, children, storageKey }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(`bloodbound.ui.collapse.${storageKey}`);
      if (raw == null) return defaultOpen;
      return raw === '1';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try {
          localStorage.setItem(`bloodbound.ui.collapse.${storageKey}`, next ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <div className="bb-collapse">
      <button type="button" className="bb-collapse__head" onClick={toggle}>
        <span className="bb-collapse__chevron">
          {open ? <IconCollapse /> : <IconExpand />}
        </span>
        <span>{title}</span>
      </button>
      {open ? <div className="bb-collapse__body">{children}</div> : null}
    </div>
  );
}
