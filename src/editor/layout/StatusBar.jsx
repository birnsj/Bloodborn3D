import { useEditor } from '../EditorContext.jsx';
import { useLayout } from './LayoutContext.jsx';

export function StatusBar() {
  const {
    selectedActorIds,
    selectedActor,
    gridSize,
    tool,
    world,
    mode,
  } = useEditor();
  const { layout } = useLayout();

  const selectionLabel = selectedActorIds.length === 0
    ? 'Nothing selected'
    : selectedActorIds.length === 1
      ? `1 item selected (${selectedActor?.name || selectedActorIds[0]})`
      : `${selectedActorIds.length} items selected`;

  const brushLabel = tool === 'select' ? 'Select' : `Brush: ${tool}`;
  const mapModeLabel = world?.mapMode === 'subtractive' ? 'Subtractive' : 'Additive';

  return (
    <footer className="bb-statusbar">
      <div className="bb-statusbar__left">{selectionLabel}</div>
      <div className="bb-statusbar__right">
        <span title="View → UI Scale">
          UI {layout.uiScale}%
        </span>
        <span>Grid: {gridSize}</span>
        <span>{brushLabel}</span>
        <span>Mode: {mode}</span>
        <span title="File → New Map… sets map mode">Map: {mapModeLabel}</span>
        <span>World: {world?.name || '—'}</span>
      </div>
    </footer>
  );
}
