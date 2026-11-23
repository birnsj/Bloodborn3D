import { SceneOutliner } from './SceneOutliner.jsx';
import { DetailsPanel } from './DetailsPanel.jsx';
import { ContentBrowser } from './ContentBrowser.jsx';
import { AssetViewer } from './AssetViewer.jsx';
import { Viewport } from '../Viewport.jsx';

function DockPanelShell({ children, className = '' }) {
  return (
    <div className={`bb-dock-panel ${className}`.trim()}>
      {children}
    </div>
  );
}

function ViewportDockPanel() {
  return (
    <DockPanelShell className="bb-dock-panel--viewport">
      <Viewport />
    </DockPanelShell>
  );
}

function OutlinerDockPanel() {
  return (
    <DockPanelShell>
      <SceneOutliner docked />
    </DockPanelShell>
  );
}

function DetailsDockPanel() {
  return (
    <DockPanelShell>
      <DetailsPanel docked />
    </DockPanelShell>
  );
}

function ContentDockPanel() {
  return (
    <DockPanelShell>
      <ContentBrowser docked />
    </DockPanelShell>
  );
}

function AssetViewerDockPanel() {
  return (
    <DockPanelShell>
      <AssetViewer docked />
    </DockPanelShell>
  );
}

/** Registered dockview component map (stable identity). */
export const dockviewComponents = {
  viewport: ViewportDockPanel,
  outliner: OutlinerDockPanel,
  details: DetailsDockPanel,
  content: ContentDockPanel,
  assetViewer: AssetViewerDockPanel,
};
