import { useEffect } from 'react';
import { useLayout } from './LayoutContext.jsx';
import { viewScaleFactor } from './viewScale.js';
import { AppMenuBar } from './AppMenuBar.jsx';
import { WorkspaceNav } from './WorkspaceNav.jsx';
import { LevelToolBar } from './LevelToolBar.jsx';
import { StatusBar } from './StatusBar.jsx';
import { PlaceholderWorkspace } from './PlaceholderWorkspace.jsx';
import { LevelDockWorkspace } from './LevelDockWorkspace.jsx';

export function EditorShell() {
  const { layout, setDockApi } = useLayout();
  const isLevel = layout.workspace === 'level';
  const scale = viewScaleFactor(layout.uiScale);

  useEffect(() => {
    if (!isLevel) setDockApi(null);
  }, [isLevel, setDockApi]);

  // Block browser Ctrl/Cmd+wheel zoom so it cannot break the layout.
  // UI scale is View-menu only (STA behavior).
  useEffect(() => {
    const blockBrowserZoom = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };
    const blockKeyZoom = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0') {
        event.preventDefault();
      }
    };
    window.addEventListener('wheel', blockBrowserZoom, { passive: false });
    window.addEventListener('keydown', blockKeyZoom, { passive: false });
    return () => {
      window.removeEventListener('wheel', blockBrowserZoom);
      window.removeEventListener('keydown', blockKeyZoom);
    };
  }, []);

  return (
    <div className="bb-stage-viewport">
      <div
        className="bb-app"
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          ['--bb-ui-scale']: String(scale),
        }}
      >
        <AppMenuBar />
        <WorkspaceNav />

        {isLevel ? (
          <>
            <LevelToolBar />
            <div className="bb-workspace bb-workspace--dock">
              <LevelDockWorkspace />
            </div>
          </>
        ) : (
          <PlaceholderWorkspace workspaceId={layout.workspace} />
        )}

        <StatusBar />
      </div>
    </div>
  );
}
