import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  CHECKLISTS_CHANGED_EVENT,
  fetchChecklistsDoc,
  persistChecklistsDoc,
} from './checklistsApi.js';
import {
  checklistsSize,
  checklistsVisible,
  createChecklistItem,
  itemsForLevel,
  patchChecklistItem,
  projectItems,
  removeChecklistItem,
  setChecklistsSize,
  setChecklistsVisible,
  setItemsForLevel,
  setProjectItems,
} from './checklistsModel.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

function readUiScale(el) {
  const app = el?.closest?.('.bb-app');
  const scaleRaw = app
    ? Number(getComputedStyle(app).getPropertyValue('--bb-ui-scale'))
    : 1;
  return Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
}

/**
 * Editor-only floating checklist (project + per-level).
 * Stored in `.editor-local/checklists.json`. Hidden in Play.
 */
export function ChecklistPanel() {
  const { mode, levelName } = useEditor();
  const [doc, setDoc] = useState(() => setProjectItems({}, []));
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('level');
  const saveTimer = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [pos, setPos] = useState({ x: null, y: 56 });

  const levelNameRef = useRef(levelName);
  useEffect(() => {
    levelNameRef.current = levelName;
  }, [levelName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await fetchChecklistsDoc();
      if (cancelled) return;
      setDoc(loaded);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitDoc = useCallback((mutator) => {
    setDoc((prev) => {
      const next = mutator(prev);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistChecklistsDoc(next);
      }, 200);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    const onChanged = (e) => {
      if (e?.detail) setDoc(e.detail);
    };
    window.addEventListener(CHECKLISTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHECKLISTS_CHANGED_EVENT, onChanged);
  }, []);

  const visible = checklistsVisible(doc);
  const items = tab === 'project'
    ? projectItems(doc)
    : itemsForLevel(doc, levelName);

  const mapItems = useCallback((mapper) => {
    commitDoc((prev) => {
      const current = tab === 'project'
        ? projectItems(prev)
        : itemsForLevel(prev, levelNameRef.current);
      const nextItems = mapper(current);
      if (tab === 'project') return setProjectItems(prev, nextItems);
      return setItemsForLevel(prev, levelNameRef.current, nextItems);
    });
  }, [commitDoc, tab]);

  const addItem = () => {
    mapItems((current) => [...current, createChecklistItem({ text: '' })]);
  };

  const closePanel = () => {
    commitDoc((prev) => setChecklistsVisible(prev, false));
  };

  const onDragHandleDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const panel = e.currentTarget.closest('.bb-checklist-panel');
    const host = e.currentTarget.closest('.bb-dock-host');
    if (!panel || !host) return;
    // .bb-app uses transform: scale(); client coords are scaled, CSS left/top are not.
    const scale = readUiScale(host);
    const hostRect = host.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const grabX = e.clientX - panelRect.left;
    const grabY = e.clientY - panelRect.top;
    const maxX = Math.max(8, host.clientWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, host.clientHeight - panel.offsetHeight - 8);
    dragRef.current = { grabX, grabY, hostRect, scale, maxX, maxY };

    const localPos = (clientX, clientY) => {
      const d = dragRef.current;
      if (!d) return { x: 8, y: 8 };
      const x = (clientX - d.hostRect.left - d.grabX) / d.scale;
      const y = (clientY - d.hostRect.top - d.grabY) / d.scale;
      return {
        x: Math.max(8, Math.min(d.maxX, x)),
        y: Math.max(8, Math.min(d.maxY, y)),
      };
    };

    // Switch from right-anchored default to left/top immediately so the first
    // move does not jump (and cursor stays under the grab point).
    setPos(localPos(e.clientX, e.clientY));

    const onMove = (ev) => {
      setPos(localPos(ev.clientX, ev.clientY));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onResizeCornerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const size = checklistsSize(doc);
    const uiScale = readUiScale(e.currentTarget);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
      uiScale,
    };

    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = (ev.clientX - r.startX) / r.uiScale;
      const dy = (ev.clientY - r.startY) / r.uiScale;
      commitDoc((prev) => setChecklistsSize(prev, {
        w: Math.round(r.startW + dx),
        h: Math.round(r.startH + dy),
      }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (mode === 'play' || !ready || !visible) return null;

  const size = checklistsSize(doc);
  const style = {
    ...(pos.x == null
      ? { top: `${pos.y}px`, right: '16px' }
      : { top: `${pos.y}px`, left: `${pos.x}px` }),
    width: `${size.w}px`,
    height: `${size.h}px`,
  };

  const levelLabel = levelName || 'untitled.json';
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="bb-checklist-layer" aria-label="Checklists">
      <aside
        className="bb-checklist-panel"
        style={style}
        {...helpProps('checklists.panel')}
      >
        <header
          className="bb-checklist-panel__bar"
          onPointerDown={onDragHandleDown}
        >
          <span className="bb-checklist-panel__grip" aria-hidden>⋮⋮</span>
          <span className="bb-checklist-panel__title">Checklist</span>
          <span className="bb-checklist-panel__count">
            {doneCount}/{items.length}
          </span>
          <button
            type="button"
            className="bb-checklist-panel__close"
            title="Close checklist"
            aria-label="Close checklist"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={closePanel}
          >
            ×
          </button>
        </header>

        <div className="bb-checklist-panel__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'project'}
            className={`bb-checklist-panel__tab${tab === 'project' ? ' is-active' : ''}`}
            onClick={() => setTab('project')}
            {...helpProps('checklists.project')}
          >
            Project
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'level'}
            className={`bb-checklist-panel__tab${tab === 'level' ? ' is-active' : ''}`}
            onClick={() => setTab('level')}
            title={levelLabel}
            {...helpProps('checklists.level')}
          >
            Level
          </button>
        </div>

        {tab === 'level' && (
          <div className="bb-checklist-panel__level-name" title={levelLabel}>
            {levelLabel}
          </div>
        )}

        <ul className="bb-checklist-panel__list">
          {items.length === 0 && (
            <li className="bb-checklist-panel__empty">
              {tab === 'project'
                ? 'No project tasks yet.'
                : 'No tasks for this level.'}
            </li>
          )}
          {items.map((item) => (
            <li key={item.id} className={`bb-checklist-panel__item${item.done ? ' is-done' : ''}`}>
              <input
                type="checkbox"
                checked={item.done}
                aria-label="Done"
                onChange={(e) => {
                  const done = e.target.checked;
                  mapItems((current) => patchChecklistItem(current, item.id, { done }));
                }}
              />
              <input
                type="text"
                className="bb-checklist-panel__text"
                value={item.text}
                placeholder="Task…"
                onChange={(e) => {
                  const text = e.target.value;
                  mapItems((current) => patchChecklistItem(current, item.id, { text }));
                }}
              />
              <button
                type="button"
                className="bb-checklist-panel__delete"
                title="Remove"
                aria-label="Remove"
                onClick={() => mapItems((current) => removeChecklistItem(current, item.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <div className="bb-checklist-panel__footer">
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={addItem}
            {...helpProps('checklists.add')}
          >
            + Add
          </button>
        </div>

        <div
          className="bb-checklist-panel__resize"
          role="separator"
          aria-orientation="both"
          aria-label="Resize checklist"
          title="Drag to resize"
          onPointerDown={onResizeCornerDown}
          {...helpProps('checklists.scale')}
        />
      </aside>
    </div>
  );
}
