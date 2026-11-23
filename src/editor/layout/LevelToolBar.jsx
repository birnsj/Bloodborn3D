import { useEffect, useRef } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  IconBox,
  IconFloor,
  IconPlay,
  IconRecord,
  IconRedo,
  IconSave,
  IconSelect,
  IconStop,
  IconUndo,
  IconWall,
} from '../../ui/icons.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useSessionRecorder } from '../sessionRecorder/useSessionRecorder.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';

export function LevelToolBar() {
  const { alert } = useEditorDialogs();
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

  const recorder = useSessionRecorder();
  const lastRecorderError = useRef(null);

  useEffect(() => {
    if (!recorder.error || recorder.error === lastRecorderError.current) return;
    lastRecorderError.current = recorder.error;
    void alert(recorder.error, { title: 'Recording' });
  }, [recorder.error, alert]);

  const isPlay = mode === 'play';
  const hasSelection = selectedActorIds.length > 0;
  const playReason = isPlay ? 'Unavailable during Play mode.' : null;
  const undoReason = isPlay
    ? 'Unavailable during Play mode.'
    : (!canUndo ? 'Nothing to undo.' : null);
  const redoReason = isPlay
    ? 'Unavailable during Play mode.'
    : (!canRedo ? 'Nothing to redo.' : null);
  const selectionReason = isPlay
    ? 'Unavailable during Play mode.'
    : (!hasSelection ? 'Select one or more actors first.' : null);
  const recordReason = !recorder.supported
    ? 'Screen recording is not supported in this browser.'
    : (recorder.error || null);

  return (
    <div className="bb-level-toolbar">
      <div className="bb-seg">
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay}
          title="Save"
          onClick={() => saveLevel()}
          {...helpProps('toolbar.save', playReason)}
        >
          <IconSave />
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay || !canUndo}
          title="Undo"
          onClick={() => undo()}
          {...helpProps('toolbar.undo', undoReason)}
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          disabled={isPlay || !canRedo}
          title="Redo"
          onClick={() => redo()}
          {...helpProps('toolbar.redo', redoReason)}
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
          {...helpProps('toolbar.select', playReason)}
        >
          <IconSelect /> Select
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'box' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create box brush"
          onClick={() => setTool('box')}
          {...helpProps('toolbar.box', playReason)}
        >
          <IconBox /> Box
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'wall' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create wall brush"
          onClick={() => setTool('wall')}
          {...helpProps('toolbar.wall', playReason)}
        >
          <IconWall /> Wall
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'floor' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Create floor brush"
          onClick={() => setTool('floor')}
          {...helpProps('toolbar.floor', playReason)}
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
          {...helpProps('toolbar.pointLight', playReason)}
        >
          Point Light
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay}
          title="Place spot light"
          onClick={() => placeLight('spot')}
          {...helpProps('toolbar.spotLight', playReason)}
        >
          Spot
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay}
          title="Place directional light"
          onClick={() => placeLight('directional')}
          {...helpProps('toolbar.dirLight', playReason)}
        >
          Dir
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.grid',
          playReason,
          `Current setting: ${gridSize} editor units`,
        )}
      >
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
        {...helpProps('toolbar.levelName', playReason)}
      />

      <div className="bb-seg">
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay || !hasSelection}
          onClick={() => duplicateSelected()}
          {...helpProps('toolbar.duplicate', selectionReason)}
        >
          Dup
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={isPlay || !hasSelection}
          onClick={() => deleteSelected()}
          {...helpProps('toolbar.delete', selectionReason)}
        >
          Del
        </button>
      </div>

      <div className="bb-level-toolbar__end">
        <span className="bb-toolbar-status" title={status}>{status}</span>
        <div className="bb-seg bb-recorder-seg">
          {recorder.isRecording && (
            <span
              className="bb-recorder-indicator"
              title={recorder.error || 'Recording'}
              {...helpProps('toolbar.recordStop')}
            >
              <span className="bb-recorder-dot" aria-hidden />
              REC {recorder.elapsedLabel}
            </span>
          )}
          {!recorder.isRecording ? (
            <button
              type="button"
              className="bb-btn bb-btn--record"
              disabled={!recorder.supported || recorder.isBusy}
              onClick={() => { void recorder.start(); }}
              title="Record session"
              {...helpProps('toolbar.record', recordReason)}
            >
              <IconRecord /> Record
            </button>
          ) : (
            <button
              type="button"
              className="bb-btn bb-btn--record is-active"
              disabled={recorder.isBusy}
              onClick={() => { void recorder.stop({ save: true }); }}
              title="Stop recording"
              {...helpProps('toolbar.recordStop')}
            >
              <IconStop /> Stop Rec
            </button>
          )}
        </div>
        <div className="bb-seg">
          <button
            type="button"
            className={`bb-btn bb-btn--play${isPlay ? ' is-active' : ''}`}
            disabled={isPlay}
            onClick={() => play()}
            title="Play in Editor"
            {...helpProps('toolbar.play', isPlay ? 'Already in Play mode.' : null)}
          >
            <IconPlay /> Play
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={!isPlay}
            onClick={() => stop()}
            title="Stop"
            {...helpProps('toolbar.stop', !isPlay ? 'Only available while Playing.' : null)}
          >
            <IconStop /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}
