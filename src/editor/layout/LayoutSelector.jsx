import { useLayout } from './LayoutContext.jsx';

/**
 * Toolbar control: active named layout + dirty indicator.
 */
export function LayoutSelector({ disabled = false } = {}) {
  const {
    namedLayouts,
    activeNamedLayout,
    layoutDirty,
    loadNamedLayout,
    factoryLayoutId,
  } = useLayout();

  const value = activeNamedLayout?.id || factoryLayoutId;

  return (
    <label
      className="bb-toolbar-field bb-layout-selector"
      title={layoutDirty ? 'Layout has unsaved changes' : 'Workspace layout'}
    >
      <span>Layout</span>
      <select
        className={`bb-select${layoutDirty ? ' is-dirty' : ''}`}
        value={value}
        disabled={disabled}
        onChange={(e) => loadNamedLayout(e.target.value)}
      >
        {namedLayouts.map((entry) => {
          const isActive = entry.id === value;
          const suffix = isActive && layoutDirty ? ' •' : '';
          return (
            <option key={entry.id} value={entry.id}>
              {entry.name}{suffix}
            </option>
          );
        })}
      </select>
      {layoutDirty ? (
        <span className="bb-layout-dirty" title="Unsaved changes">*</span>
      ) : null}
    </label>
  );
}
