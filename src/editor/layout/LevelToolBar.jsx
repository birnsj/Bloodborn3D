import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useEditorSettings } from '../EditorSettingsContext.jsx';
import {
  ROTATION_SNAP_INCREMENTS,
  SCALE_SNAP_INCREMENTS,
} from '../editorSettingsPrefs.js';
import {
  IconAlign,
  IconPlay,
  IconRecord,
  IconRedo,
  IconSave,
  IconSelect,
  IconSurface,
  IconStop,
  IconUndo,
} from '../../ui/icons.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useSessionRecorder } from '../sessionRecorder/useSessionRecorder.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import {
  fetchStickyNotesDoc,
  getStickyNotesVisibleSync,
  persistStickyNotesDoc,
  requestAddStickyNote,
  STICKY_NOTES_CHANGED_EVENT,
} from '../stickyNotes/stickyNotesApi.js';
import { setStickyNotesVisible } from '../stickyNotes/stickyNotesModel.js';
import {
  CHECKLISTS_CHANGED_EVENT,
  fetchChecklistsDoc,
  getChecklistsVisibleSync,
  persistChecklistsDoc,
} from '../checklists/checklistsApi.js';
import { setChecklistsVisible } from '../checklists/checklistsModel.js';

export function LevelToolBar() {
  const { alert } = useEditorDialogs();
  const {
    mode,
    tool,
    setTool,
    setSelectedSurface,
    setAlignReferenceSurface,
    geometryMode,
    setGeometryMode,
    setGeometrySelection,
    setStatus,
    gridSize,
    setGridSize,
    gridSnap,
    setGridSnap,
    gridIncrements,
    canUndo,
    canRedo,
    saveLevel,
    undo,
    redo,
    play,
    stop,
    status,
    pivotEditMode,
    setPivotEditMode,
    gizmoSpace,
    setGizmoSpace,
  } = useEditor();
  const { settings, patchSettings } = useEditorSettings();

  const recorder = useSessionRecorder();
  const lastRecorderError = useRef(null);
  const [notesVisible, setNotesVisible] = useState(() => getStickyNotesVisibleSync());
  const [checklistVisible, setChecklistVisible] = useState(() => getChecklistsVisibleSync());

  useEffect(() => {
    if (!recorder.error || recorder.error === lastRecorderError.current) return;
    lastRecorderError.current = recorder.error;
    void alert(recorder.error, { title: 'Recording' });
  }, [recorder.error, alert]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await fetchStickyNotesDoc();
      if (!cancelled) setNotesVisible(doc.visible !== false);
    })();
    const onChanged = (e) => {
      if (e?.detail) setNotesVisible(e.detail.visible !== false);
    };
    window.addEventListener(STICKY_NOTES_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(STICKY_NOTES_CHANGED_EVENT, onChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await fetchChecklistsDoc();
      if (!cancelled) setChecklistVisible(doc.visible === true);
    })();
    const onChanged = (e) => {
      if (e?.detail) setChecklistVisible(e.detail.visible === true);
    };
    window.addEventListener(CHECKLISTS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(CHECKLISTS_CHANGED_EVENT, onChanged);
    };
  }, []);

  const onToggleNotesVisible = async (checked) => {
    setNotesVisible(checked);
    const doc = await fetchStickyNotesDoc();
    await persistStickyNotesDoc(setStickyNotesVisible(doc, checked));
  };

  const onToggleChecklist = async () => {
    const next = !checklistVisible;
    setChecklistVisible(next);
    const doc = await fetchChecklistsDoc();
    await persistChecklistsDoc(setChecklistsVisible(doc, next));
  };

  const isPlay = mode === 'play';
  const playReason = isPlay ? 'Unavailable during Play mode.' : null;
  const undoReason = isPlay
    ? 'Unavailable during Play mode.'
    : (!canUndo ? 'Nothing to undo.' : null);
  const redoReason = isPlay
    ? 'Unavailable during Play mode.'
    : (!canRedo ? 'Nothing to redo.' : null);
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
          title="Select / gizmo · W move · E rotate · R scale (R again = Unreal gizmo)"
          onClick={() => {
            setTool('select');
            setSelectedSurface(null);
            setAlignReferenceSurface(null);
            setGeometrySelection(null);
          }}
          {...helpProps('toolbar.select', playReason)}
        >
          <IconSelect /> Select
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'surface' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Surface Selection — click a face to assign materials"
          onClick={() => {
            setAlignReferenceSurface(null);
            setTool('surface');
          }}
          {...helpProps('toolbar.surface', playReason)}
        >
          <IconSurface /> Surface
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'align' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Align to Neighbor — click reference face, then target face"
          onClick={() => {
            setSelectedSurface(null);
            setAlignReferenceSurface(null);
            setTool('align');
            setStatus?.('Align: click reference surface.');
          }}
          {...helpProps('toolbar.align', playReason)}
        >
          <IconAlign /> Align
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <div className="bb-seg">
        <button
          type="button"
          className={`bb-btn${tool === 'geometry' && geometryMode === 'face' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Geometry Face — select and move ConvexBrush faces"
          onClick={() => {
            setSelectedSurface(null);
            setAlignReferenceSurface(null);
            setGeometryMode('face');
            setTool('geometry');
            setStatus?.('Face mode — click a ConvexBrush face.');
          }}
          {...helpProps('toolbar.geometryFace', playReason)}
        >
          Face
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'geometry' && geometryMode === 'edge' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Geometry Edge — select and move ConvexBrush edges"
          onClick={() => {
            setSelectedSurface(null);
            setAlignReferenceSurface(null);
            setGeometryMode('edge');
            setTool('geometry');
            setStatus?.('Edge mode — click near a ConvexBrush edge (Alt = x-ray).');
          }}
          {...helpProps('toolbar.geometryEdge', playReason)}
        >
          Edge
        </button>
        <button
          type="button"
          className={`bb-btn${tool === 'geometry' && geometryMode === 'vertex' && !isPlay ? ' bb-btn--active' : ''}`}
          disabled={isPlay}
          title="Geometry Vertex — select and move ConvexBrush vertices"
          onClick={() => {
            setSelectedSurface(null);
            setAlignReferenceSurface(null);
            setGeometryMode('vertex');
            setTool('geometry');
            setStatus?.('Vertex mode — click near a ConvexBrush vertex (Alt = x-ray). Move only.');
          }}
          {...helpProps('toolbar.geometryVertex', playReason)}
        >
          Vertex
        </button>
      </div>

      <div className="bb-toolbar-divider" />

      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.grid',
          playReason,
          `Current setting: ${gridSize} editor units · snap ${gridSnap ? 'on' : 'off'}`,
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
      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.rotationSnap',
          playReason,
          `Current: ${settings.rotationSnapDegrees}°`,
        )}
      >
        <span>Rot</span>
        <select
          className="bb-select bb-select--snap"
          value={settings.rotationSnapDegrees}
          disabled={isPlay || !gridSnap}
          onChange={(e) => patchSettings({ rotationSnapDegrees: Number(e.target.value) })}
        >
          {ROTATION_SNAP_INCREMENTS.map((n) => (
            <option key={n} value={n}>{n}°</option>
          ))}
        </select>
      </label>
      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.scaleSnap',
          playReason,
          `Current: ${settings.scaleSnapIncrement}`,
        )}
      >
        <span>Scale</span>
        <select
          className="bb-select bb-select--snap"
          value={settings.scaleSnapIncrement}
          disabled={isPlay || !gridSnap}
          onChange={(e) => patchSettings({ scaleSnapIncrement: Number(e.target.value) })}
        >
          {SCALE_SNAP_INCREMENTS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={`bb-btn${pivotEditMode ? ' bb-btn--active' : ''}`}
        disabled={isPlay}
        title="Pivot Edit (P) — move the actor origin without moving geometry"
        onClick={() => {
          const next = !pivotEditMode;
          setPivotEditMode(next);
          setStatus(next ? 'Pivot edit on — drag the gizmo' : 'Pivot edit off');
        }}
        {...helpProps('toolbar.pivotEdit', playReason)}
      >
        Pivot
      </button>
      <button
        type="button"
        className="bb-btn"
        disabled={isPlay}
        title={`Gizmo space: ${gizmoSpace} (click to toggle local/world)`}
        onClick={() => setGizmoSpace(gizmoSpace === 'local' ? 'world' : 'local')}
        {...helpProps('toolbar.gizmoSpace', playReason)}
      >
        {gizmoSpace === 'local' ? 'Local' : 'World'}
      </button>
      <div className="bb-toolbar-divider" />
      <label
        className="bb-toolbar-field"
        {...helpProps('toolbar.gridSnap', playReason)}
      >
        <input
          type="checkbox"
          checked={gridSnap}
          disabled={isPlay}
          onChange={(e) => setGridSnap(e.target.checked)}
        />
        <span>Snap</span>
      </label>
      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.showLights',
          playReason,
          settings.showLightHelpers !== false
            ? 'Light gizmos shown'
            : 'Light gizmos hidden (lights still illuminate)',
        )}
      >
        <input
          type="checkbox"
          checked={settings.showLightHelpers !== false}
          disabled={isPlay}
          onChange={(e) => patchSettings({ showLightHelpers: e.target.checked })}
        />
        <span>Lights</span>
      </label>
      <label
        className="bb-toolbar-field"
        {...helpProps(
          'toolbar.showSubtract',
          playReason,
          settings.showSubtractVolumes ? 'Fill volumes shown' : 'Fill volumes hidden (edges stay)',
        )}
      >
        <input
          type="checkbox"
          checked={settings.showSubtractVolumes !== false}
          disabled={isPlay}
          onChange={(e) => patchSettings({ showSubtractVolumes: e.target.checked })}
        />
        <span>Subtract</span>
      </label>
      <label
        className="bb-toolbar-field bb-toolbar-field--slider"
        {...helpProps(
          'toolbar.subtractOpacity',
          playReason || (settings.showSubtractVolumes === false
            ? 'Turn Subtract on to adjust fill opacity.'
            : null),
          `Fill opacity ${Math.round((settings.subtractVolumeOpacity ?? 0.14) * 100)}% · edges stay solid`,
        )}
      >
        <span>Opacity</span>
        <input
          type="range"
          className="bb-toolbar-slider"
          min={0}
          max={100}
          step={1}
          value={Math.round((settings.subtractVolumeOpacity ?? 0.14) * 100)}
          disabled={isPlay || settings.showSubtractVolumes === false}
          onChange={(e) => patchSettings({
            subtractVolumeOpacity: Number(e.target.value) / 100,
          })}
          aria-label="Subtract fill opacity"
        />
      </label>
      <button
        type="button"
        className="bb-btn"
        disabled={isPlay}
        title="Reset all viewport cameras to home"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('bb:reset-all-views'));
        }}
        {...helpProps('toolbar.resetAllViews', playReason)}
      >
        Reset Views
      </button>
      <button
        type="button"
        className="bb-btn"
        disabled={isPlay}
        title="Add sticky note"
        onClick={() => requestAddStickyNote()}
        {...helpProps('stickyNotes.add', playReason)}
      >
        Note
      </button>
      <label
        className="bb-toolbar-field"
        title={notesVisible ? 'Hide sticky notes' : 'Show sticky notes'}
        {...helpProps('stickyNotes.visible', playReason)}
      >
        <input
          type="checkbox"
          checked={notesVisible}
          disabled={isPlay}
          onChange={(e) => {
            void onToggleNotesVisible(e.target.checked);
          }}
          aria-label="Show sticky notes"
        />
        <span>Show</span>
      </label>
      <button
        type="button"
        className={`bb-btn${checklistVisible ? ' is-active' : ''}`}
        disabled={isPlay}
        title={checklistVisible ? 'Hide checklist' : 'Show checklist'}
        onClick={() => { void onToggleChecklist(); }}
        {...helpProps('checklists.toggle', playReason)}
      >
        Checklist
      </button>

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
