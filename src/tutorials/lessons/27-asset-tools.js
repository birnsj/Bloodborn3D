/** Academy lesson 27 — Batch 7 asset tools. */
export const assetToolsLesson = {
  id: 'asset-tools',
  title: 'Asset Tools',
  summary: 'Multi-format import/export, inspection, SimplifyModifier, auto LOD, and local compression decode.',
  order: 27,
  starterPath: 'tutorials/acceptance-static-meshes.json',
  steps: [
    {
      id: 'import',
      title: 'Import meshes',
      body: 'Content Browser → Meshes → Import Mesh accepts GLB/GLTF, FBX, OBJ, STL, PLY, Collada, and USDZ. Foreign formats normalize to GLB; the original source is stored. Import notes list unsupported features.',
      highlight: 'content.importMesh',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'inspect',
      title: 'Inspect in Asset Viewer',
      body: 'Double-click a mesh. The preview shows triangles, vertices, materials, bounds, file size, and source/derived relationships. Warnings flag missing geometry or skinned/morph content.',
      highlight: 'assetViewer.meshTools',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'simplify',
      title: 'Simplify non-destructively',
      body: 'Set a keep ratio, Preview before/after triangle counts, then Save derived. The source asset is never overwritten. Use derived meshes for lighter LODs or props.',
      highlight: 'assetViewer.meshTools',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'lod',
      title: 'Auto LOD + Batch 6',
      body: 'Generate LOD assets from the preview, or select a Static Mesh → Details → Generate auto LOD. Distances are in editor units. Collision stays on the actor collider, not the visual LOD mesh.',
      highlight: 'details.staticMesh.lod',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'export',
      title: 'Export formats',
      body: 'Export downloads GLB/GLTF/OBJ/STL/PLY/USDZ. Format limitations are reported (STL drops materials/UVs; compression encode is deferred). Level JSON remains engine-neutral — mesh export does not replace it.',
      highlight: 'assetViewer.meshTools',
      verify: { type: 'manualConfirm' },
    },
  ],
};
