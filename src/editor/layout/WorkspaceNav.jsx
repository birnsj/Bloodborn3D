import { WORKSPACE_ICONS } from '../../ui/icons.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useLayout } from './LayoutContext.jsx';

/** Workspaces with real editor UI today (others are shell placeholders). */
const LIVE_WORKSPACES = new Set(['level', 'materials', 'ai']);

function workspaceHelpId(id) {
  if (id === 'level') return 'workspace.level';
  if (id === 'materials') return 'workspace.materials';
  if (id === 'ai') return 'workspace.ai';
  return 'workspace.placeholder';
}

export function WorkspaceNav() {
  const { layout, setWorkspace, workspaces } = useLayout();

  return (
    <nav className="bb-workspace-nav" aria-label="Workspaces">
      {workspaces.map((ws) => {
        const Icon = WORKSPACE_ICONS[ws.id];
        const active = layout.workspace === ws.id;
        const live = LIVE_WORKSPACES.has(ws.id);
        return (
          <button
            key={ws.id}
            type="button"
            className={`bb-workspace-tab${active ? ' is-active' : ''}`}
            onClick={() => setWorkspace(ws.id)}
            title={live ? ws.label : `${ws.label} (extension point)`}
            {...helpProps(workspaceHelpId(ws.id))}
          >
            {Icon ? <Icon /> : null}
            <span>{ws.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
