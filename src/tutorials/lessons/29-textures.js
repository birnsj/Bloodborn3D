/** Academy lesson 29 — Batch 8 textures. */
export const texturesLesson = {
  id: 'textures',
  title: 'Textures',
  summary: 'Sampling, transforms, UV channels, Asset Viewer inspection, and KTX2 decode — without conflicting surface or material UV layers.',
  order: 29,
  starterPath: 'tutorials/acceptance-textures.json',
  steps: [
    {
      id: 'inspector',
      title: 'Open the Texture Inspector',
      body: 'Content Browser → Textures → double-click Hall Dark Oak (or any PNG). The Asset Viewer shows dimensions, format, color space, mipmaps, compression, and an estimated GPU size. Draft wrap/filter/anisotropy/transform in the inspector; Apply writes asset meta and clears the GPU texture cache.',
      highlight: 'texture.inspector',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'filtering',
      title: 'Nearest vs linear + anisotropy',
      body: 'Compare the Nearest Demo and Linear Demo walls. Mag/min nearest keeps hard pixels; linear + mipmaps soften at distance. Raise anisotropy on oblique floors (Asset Viewer → Anisotropy, capped by the GPU).',
      highlight: 'texture.inspector',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'wrap-transform',
      title: 'Wrap and transform',
      body: 'Try clamp / repeat / mirrored on Wrap S/T. Repeat U/V, offset, rotation, and center are asset defaults (center defaults to 0,0). They compose under Material UV (Layer 2) and never replace surface face UVs or world-aligned mapping.',
      highlight: 'texture.transform',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'uv-channels',
      title: 'UV channels in Materials',
      body: 'Materials Workspace → UV Channels. Each assigned map can sample UV0–UV3 (Three.js Texture.channel). Defaults are UV0 so single-UV brushes stay correct — set AO/lightMap to UV1/UV2 when geometry has those sets. Missing channels warn — baking is not included in Batch 8.',
      highlight: 'materials.uvChannels',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'sharing',
      title: 'Shared image, isolated settings',
      body: 'Sampling lives on the texture asset. Two materials that reference the same texture id share wrap/filter. Duplicate the texture asset (or use the Batch 8 nearest/linear variants) for independent sampling. Material UV and mapChannels stay per-material; surface face UV stays per-brush.',
      highlight: 'materials.uvLayers',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'ktx2',
      title: 'Compressed KTX2',
      body: 'Import or open the Batch 8 KTX2 fixture. Decode uses the local Basis transcoder (Batch 7). Generate mipmaps and flipY are disabled for compressed uploads; embedded mips still work with mipmap minFilters.',
      highlight: 'texture.inspector',
      verify: { type: 'manualConfirm' },
    },
  ],
};
