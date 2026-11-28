import {
  CollapsibleGroup,
  CollapsibleGroupToolbar,
} from '../../ui/Collapsible.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

/** Details / World Settings chrome with optional Collapse All / Expand All. */
export function DetailsPanelShell({
  docked = false,
  tab,
  setTab,
  showCollapseTools = false,
  children,
}) {
  const chrome = (
    <>
      <div className="bb-panel-chrome__head">
        <div className="bb-panel-chrome__tabs">
          <button
            type="button"
            className={`bb-panel-chrome__tab${tab === 'details' ? ' is-active' : ''}`}
            onClick={() => setTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            className={`bb-panel-chrome__tab${tab === 'world' ? ' is-active' : ''}`}
            onClick={() => setTab('world')}
          >
            World Settings
          </button>
        </div>
        {showCollapseTools ? (
          <CollapsibleGroupToolbar
            className="bb-collapse-group__actions bb-details__collapse-actions"
            collapseHelpProps={helpProps('details.collapseAll')}
            expandHelpProps={helpProps('details.expandAll')}
          />
        ) : null}
      </div>
      <div className="bb-panel-chrome__body">
        {children}
      </div>
    </>
  );

  return (
    <aside className={`bb-panel-chrome bb-details${docked ? ' bb-panel-chrome--docked' : ''}`}>
      {showCollapseTools ? (
        <CollapsibleGroup showControls={false} storagePrefixes={['details.']}>
          {chrome}
        </CollapsibleGroup>
      ) : chrome}
    </aside>
  );
}
