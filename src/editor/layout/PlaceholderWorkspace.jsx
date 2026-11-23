import { WORKSPACES } from './layoutPrefs.js';

export function PlaceholderWorkspace({ workspaceId }) {
  const ws = WORKSPACES.find((w) => w.id === workspaceId);
  return (
    <div className="bb-placeholder-workspace">
      <div className="bb-placeholder-workspace__card">
        <h2>{ws?.label || 'Workspace'}</h2>
        <p>
          Extension point for a future BloodBound workspace.
          Level Editor remains the active authoring surface for Phases 1–2A.
        </p>
        <p className="bb-muted">No fabricated tools or demo content in this panel.</p>
      </div>
    </div>
  );
}
