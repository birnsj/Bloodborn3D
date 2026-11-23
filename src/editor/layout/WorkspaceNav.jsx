import { WORKSPACE_ICONS } from '../../ui/icons.jsx';
import { useLayout } from './LayoutContext.jsx';

export function WorkspaceNav() {
  const { layout, setWorkspace, workspaces } = useLayout();

  return (
    <nav className="bb-workspace-nav" aria-label="Workspaces">
      {workspaces.map((ws) => {
        const Icon = WORKSPACE_ICONS[ws.id];
        const active = layout.workspace === ws.id;
        return (
          <button
            key={ws.id}
            type="button"
            className={`bb-workspace-tab${active ? ' is-active' : ''}`}
            onClick={() => setWorkspace(ws.id)}
            title={ws.id === 'level' ? ws.label : `${ws.label} (extension point)`}
          >
            {Icon ? <Icon /> : null}
            <span>{ws.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
