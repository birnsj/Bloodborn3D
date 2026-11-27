import { SceneOutliner } from './SceneOutliner.jsx';
import { DetailsPanel } from './DetailsPanel.jsx';
import { ContentBrowser } from './ContentBrowser.jsx';
import { AssetViewer } from './AssetViewer.jsx';
import { Viewport } from '../Viewport.jsx';
import { TutorialsPanel } from '../../tutorials/TutorialsPanel.jsx';
import { LayersPanel } from './LayersPanel.jsx';

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
    <DockPanelShell className="bb-dock-panel--outliner">
      <div data-bb-tutorial="panel.outliner" className="bb-dock-panel__fill">
        <SceneOutliner docked />
      </div>
    </DockPanelShell>
  );
}

function DetailsDockPanel() {
  return (
    <DockPanelShell className="bb-dock-panel--details">
      <div data-bb-tutorial="panel.details" className="bb-dock-panel__fill">
        <DetailsPanel docked />
      </div>
    </DockPanelShell>
  );
}

function ContentDockPanel() {
  return (
    <DockPanelShell className="bb-dock-panel--content">
      <div data-bb-tutorial="panel.content" className="bb-dock-panel__fill">
        <ContentBrowser docked />
      </div>
    </DockPanelShell>
  );
}

function AssetViewerDockPanel() {
  return (
    <DockPanelShell>
      <div data-bb-tutorial="panel.assetViewer" className="bb-dock-panel__fill">
        <AssetViewer docked />
      </div>
    </DockPanelShell>
  );
}

function TutorialsDockPanel() {
  return (
    <DockPanelShell className="bb-dock-panel--tutorials">
      <TutorialsPanel docked />
    </DockPanelShell>
  );
}

function LayersDockPanel() {
  return (
    <DockPanelShell className="bb-dock-panel--layers">
      <div data-bb-tutorial="panel.layers" className="bb-dock-panel__fill">
        <LayersPanel docked />
      </div>
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
  tutorials: TutorialsDockPanel,
  layers: LayersDockPanel,
};
