import { useEditor } from './EditorContext.jsx';

export function Hierarchy() {
  const {
    world,
    selectedActorIds,
    selectActor,
    mode,
    revision,
  } = useEditor();
  void revision;

  return (
    <aside className="bb-panel bb-hierarchy">
      <div className="bb-panel-head">
        <span>Hierarchy</span>
      </div>
      <div className="bb-panel-body">
        {!world ? (
          <p className="bb-muted">No level loaded</p>
        ) : (
          <>
            <p className="bb-muted">{world.name}</p>
            <ul className="bb-hierarchy-list">
              {world.actors.map((actor) => {
                const selected = selectedActorIds.includes(actor.id);
                return (
                  <li key={actor.id}>
                    <button
                      type="button"
                      className={
                        selected
                          ? 'bb-hierarchy-item selected'
                          : 'bb-hierarchy-item'
                      }
                      disabled={mode === 'play'}
                      onClick={(e) => selectActor(actor.id, { additive: e.ctrlKey || e.metaKey })}
                    >
                      <span className="bb-hierarchy-name">{actor.name}</span>
                      <span className="bb-hierarchy-type">
                        {actor.components[0]?.type || 'Actor'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
