/** Academy lesson 26 — Batch 6 static meshes. */
export const staticMeshesLesson = {
  id: 'static-meshes',
  title: 'Static Meshes',
  summary: 'Imported mesh props with collision modes, material slot overrides, LOD, and opt-in instancing.',
  order: 26,
  starterPath: 'tutorials/acceptance-static-meshes.json',
  steps: [
    {
      id: 'place',
      title: 'Place an imported mesh',
      body: 'Open Content Browser → Meshes and place a StaticMesh into the level (or load Acceptance — Static Meshes). Select it — Details → Static Mesh shows Collision, Materials, LOD, and Rendering.',
      highlight: 'details.staticMesh',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'collision',
      title: 'Collision modes',
      body: 'Enable Collidable and try auto / box / sphere / capsule / cylinder / convex / trimesh. Show collision helper visualizes the collider. Convex and trimesh use mesh geometry (Play preloads GLBs). Architectural brushes keep their own collision path.',
      highlight: 'details.staticMesh.collision',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'materials',
      title: 'Material slot overrides',
      body: 'After the mesh loads, Materials lists discovered slots (`meshName:matIndex`). Assign a BloodBound material or restore originals — the GLB on disk is never modified.',
      highlight: 'details.staticMesh.materials',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'lod',
      title: 'Level of detail',
      body: 'Add LOD levels with mesh assets and distance thresholds (editor units). Preview forces a level; Automatic uses camera distance. Collision stays on the primary collider, not the visual LOD. Automatic simplification is Batch 7.',
      highlight: 'details.staticMesh.lod',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'instancing',
      title: 'Instancing (opt-in)',
      body: 'Rendering → Instancing defaults to off. Auto groups 3+ identical assets; Force always instances. Actors remain separate for selection, transforms, and serialization. Measure before enabling auto by default on large scenes.',
      highlight: 'details.staticMesh.rendering',
      verify: { type: 'manualConfirm' },
    },
  ],
};
