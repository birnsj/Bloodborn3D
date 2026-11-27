/** Academy lesson 30 — Batch 9 authoring layers & ViewHelper. */
export const editorLayersLesson = {
  id: 'editor-layers',
  title: 'Editor Layers',
  summary: 'Hierarchical authoring layers for organization, editor-only hide/lock/solo, active-layer creation, and the per-viewport ViewHelper — independent of parenting, Cells, Prefabs, and THREE.Layers.',
  order: 30,
  starterPath: 'tutorials/acceptance-layers.json',
  steps: [
    {
      id: 'open-panel',
      title: 'Open the Layers panel',
      body: 'Window → Show Layers (or reopen via the Window menu if closed). The tree lists Architecture, Props, Lighting, Environment, Gameplay, plus any nested layers. Click a row to set the Active layer; new brushes, lights, meshes, and cells stamp that membership.',
      highlight: 'panel.layers',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'assign',
      title: 'Assign actors',
      body: 'Select actors in the Outliner or viewport, then Assign in Layers (or Details → Hierarchy → Authoring Layer). Color chips in the Outliner show membership; use the layer filter dropdown to focus one layer without changing parent hierarchy.',
      highlight: 'details.authoringLayer',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'hide-lock-solo',
      title: 'Hide, lock, and solo',
      body: 'Eye/lock/solo on a layer are editor filters only — they never mutate actor.visible / actor.locked or rebuild CSG. Nested effective visibility/lock is self ∧ ancestors. Solo saves the prior hidden map and restores it when cleared. Locked layers block edits/deletion/duplication via shared command paths (status feedback); unlock in Layers to continue. New creates refuse a locked Active layer. Play/Stop ignores layer UI.',
      highlight: 'panel.layers',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'prefabs',
      title: 'Prefabs, duplicate, and cross-level place',
      body: 'Duplication copies each source actor’s authoringLayerId (never the Active layer). Saving a prefab strips map-specific layer IDs; placing a prefab assigns every spawned actor to the current Active layer so assets stay portable across maps.',
      highlight: 'panel.layers',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'viewhelper',
      title: 'ViewHelper',
      body: 'Perspective panes show a corner axis helper. Click an axis to orbit the camera toward that view around the OrbitControls focus. Orthographic panes omit the helper. TextureHelper remains deferred — use the Texture Inspector for 2D sampling diagnostics.',
      highlight: 'viewport.viewHelper',
      verify: { type: 'manualConfirm' },
    },
  ],
};
