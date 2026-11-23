import { useEditor } from '../EditorContext.jsx';
import {
  IconBox,
  IconFloor,
  IconPlay,
  IconRedo,
  IconSave,
  IconSelect,
  IconStop,
  IconUndo,
  IconWall,
} from '../../ui/icons.jsx';
import { LayoutSelector } from './LayoutSelector.jsx';

export function LevelToolBar() {
  const {
    mode,
    tool,
    setTool,
    gridSize,
    setGridSize,
    gridIncrements,
    levelName,
    setLevelName,
    canUndo,
    canRedo,
    selectedActorIds,
    saveLevel,
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    play,
    stop,
    status,
    placeLight,
  } = useEditor();

  const isPlay = mode === 'play';
  const hasSelection = selectedActorIds.length > 0;

  return (
    <div className="bb-level-toolbar">
      <div className="bb-seg">
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay}
          title="Save"
          onClick={() => saveLevel()}
        >
          <IconSave />
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay || !canUndo}
          title="Undo"
          onClick={() => undo()}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay || !canRedo}
          title="Redo"
          onClick={() => redo()}
        >
          <IconRedo />
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <div className="bb-seg">
        <button
          type="button"
          className={`bb-btn${tool === 'select' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Select / gizmo"
          onClick={() => setTool('select')}
        >
          <IconSelect /> Select
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'box' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create box brush"
          onClick={() => setTool('box')}
        >
          <IconBox /> Box
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'wall' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create wall brush"
          onClick={() => setTool('wall')}
        >
          <IconWall /> Wall
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'floor' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create floor brush"
          onClick={() => setTool('floor')}
        >
          <IconFloor /> Floor
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <div className="bb-seg">
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay}
          title="Place point light"
          onClick={() => placeLight('point')}
        >
          Point Light
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay}
          title="Place spot light"
          onClick={() => placeLight('spot')}
        >
          Spot
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay}
          title="Place directional light"
          onClick={() => placeLight('directional')}
        >
          Dir
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <label className="bb-toolbar-field">
        <span>Grid</span>
        <select
          className="bb-select"
          value={gridSize}
          disabled={isPlay}
          onChange={(e) => setGridSize(Number(e.target.value))}
        >
          {gridIncrements.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <input
        className="bb-input bb-level-name-input"
        value={levelName}
        disabled={isPlay}
        onChange={(e) => setLevelName(e.target.value)}
        title="Level filename"
      />

      <div className="bb-toolbar-divider" />

      <LayoutSelector disabled={isPlay} />

      <div className="bb-seg">
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay || !hasSelection}
          onClick={() => duplicateSelected()}
        >
          Dup
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay || !hasSelection}
          onClick={() => deleteSelected()}
        >
          Del
        </button>
      </div>

      <div className="bb-level-toolbar__end">
        <span className="bb-toolbar-status" title={status}>{status}</span>
        <div className="bb-seg">
          <button
            type="button"
            className={`bb-btn bb-btn--play${isPlay ? ' is-active' : ''}`}
            disabled={isPlay}
            onClick={() => play()}
            title="Play in Editor"
          >
            <IconPlay /> Play
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={!isPlay}
            onClick={() => stop()}
            title="Stop"
          >
            <IconStop /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}
