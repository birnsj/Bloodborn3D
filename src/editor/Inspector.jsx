import { ScrubNumberInput } from '../ui/ScrubNumberInput.jsx';
import { useEditor } from './EditorContext.jsx';

function NumField({ label, value, onChange, disabled, step = 1 }) {
  return (
    <label className="bb-field">
      <span>{label}</span>
      <ScrubNumberInput
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

export function Inspector() {
  const {
    selectedActor,
    selectedActorIds,
    mode,
    gridSize,
    updateSelectedTransform,
    updateSelectedBrush,
    renameSelected,
    deleteSelected,
    duplicateSelected,
  } = useEditor();

  const disabled = mode === 'play' || !selectedActor;

  return (
    <aside className="bb-panel bb-inspector">
      <div className="bb-panel-head">
        <span>Properties</span>
      </div>
      <div className="bb-panel-body">
        {!selectedActor ? (
          <p className="bb-muted">Select an actor</p>
        ) : (
          <>
            {selectedActorIds.length > 1 && (
              <p className="bb-muted">{selectedActorIds.length} selected · editing primary</p>
            )}
            <label className="bb-field">
              <span>Name</span>
              <input
                type="text"
                value={selectedActor.name}
                disabled={disabled}
                onChange={(e) => renameSelected(e.target.value)}
              />
            </label>
            <p className="bb-id">{selectedActor.id}</p>

            <div className="bb-inspector-actions">
              <button type="button" disabled={disabled} onClick={() => duplicateSelected()}>
                Duplicate
              </button>
              <button type="button" disabled={disabled} onClick={() => deleteSelected()}>
                Delete
              </button>
            </div>

            <h3>Transform</h3>
            <div className="bb-vec3">
              <NumField
                label="Pos X"
                value={selectedActor.transform.position.x}
                step={gridSize}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ position: { x: v } })}
              />
              <NumField
                label="Pos Y"
                value={selectedActor.transform.position.y}
                step={gridSize}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ position: { y: v } })}
              />
              <NumField
                label="Pos Z"
                value={selectedActor.transform.position.z}
                step={gridSize}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ position: { z: v } })}
              />
            </div>
            <div className="bb-vec3">
              <NumField
                label="Rot X"
                value={selectedActor.transform.rotation.x}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ rotation: { x: v } }, { snap: false })}
              />
              <NumField
                label="Rot Y"
                value={selectedActor.transform.rotation.y}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ rotation: { y: v } }, { snap: false })}
              />
              <NumField
                label="Rot Z"
                value={selectedActor.transform.rotation.z}
                disabled={disabled}
                onChange={(v) => updateSelectedTransform({ rotation: { z: v } }, { snap: false })}
              />
            </div>

            {selectedActor.getComponent('Brush') && (
              <>
                <h3>Brush</h3>
                <div className="bb-vec3">
                  <NumField
                    label="Size X"
                    value={selectedActor.getComponent('Brush').size.x}
                    step={gridSize}
                    disabled={disabled}
                    onChange={(v) => updateSelectedBrush({ size: { x: v } })}
                  />
                  <NumField
                    label="Size Y"
                    value={selectedActor.getComponent('Brush').size.y}
                    step={gridSize}
                    disabled={disabled}
                    onChange={(v) => updateSelectedBrush({ size: { y: v } })}
                  />
                  <NumField
                    label="Size Z"
                    value={selectedActor.getComponent('Brush').size.z}
                    step={gridSize}
                    disabled={disabled}
                    onChange={(v) => updateSelectedBrush({ size: { z: v } })}
                  />
                </div>
                <label className="bb-field">
                  <span>Color</span>
                  <input
                    type="color"
                    value={normalizeHex(selectedActor.getComponent('Brush').color)}
                    disabled={disabled}
                    onChange={(e) => updateSelectedBrush({ color: e.target.value })}
                  />
                </label>
              </>
            )}

            {selectedActor.getComponent('Light') && (
              <>
                <h3>Light</h3>
                <p className="bb-muted">
                  {selectedActor.getComponent('Light').lightType}
                  {' · intensity '}
                  {selectedActor.getComponent('Light').intensity}
                </p>
              </>
            )}

            {selectedActor.getComponent('PlayerSpawn') && (
              <>
                <h3>Player Spawn</h3>
                <p className="bb-muted">
                  eye {selectedActor.getComponent('PlayerSpawn').eyeHeight}
                  {' · speed '}
                  {selectedActor.getComponent('PlayerSpawn').moveSpeed}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function normalizeHex(color) {
  if (!color) return '#888888';
  if (color.startsWith('#') && color.length === 7) return color;
  return '#888888';
}
