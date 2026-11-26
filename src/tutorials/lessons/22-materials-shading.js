export const materialsShadingLesson = {
  id: 'materials-shading',
  title: 'Material Shading Models',
  summary: 'Choose Standard, Physical, Basic, Toon, or Matcap; author clearcoat, glass, foliage alpha, and surface flags.',
  order: 22,
  starterPath: 'tutorials/materials-shading.json',
  steps: [
    {
      id: 'intro',
      title: 'Shading models',
      body: 'Open Materials workspace. Each material has a Shading model: Standard (default PBR), Physical (clearcoat/glass/sheen), Basic (unlit), Toon, or Matcap. Legacy assets stay Standard so existing levels keep their look.',
      terms: [
        { term: 'Shading model', def: 'Which Three.js material class adapters build (MeshStandard / Physical / Basic / Toon / Matcap).' },
        { term: 'Physical', def: 'MeshPhysicalMaterial — clearcoat, transmission/IOR, sheen, specular, iridescence, anisotropy, dispersion.' },
      ],
      highlight: ['workspace.materials', 'materials.shadingModel'],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'physical-glass',
      title: 'Physical glass',
      body: 'Select Batch2 Glass (or create a Physical material). Raise Transmission and Thickness, set IOR near 1.5. Preview under the Batch 1 HDRI environment — glass needs IBL to look convincing.',
      highlight: ['workspace.materials', 'materials.transmission'],
      verify: { type: 'manualConfirm', label: 'I saw glass transmission' },
    },
    {
      id: 'clearcoat-sheen',
      title: 'Clearcoat and sheen',
      body: 'Open Clearcoat Paint and Sheen Cloth samples. Clearcoat adds a glossy lacquer layer; Sheen softens fabric highlights. Groups collapse so only Physical fields appear for that model.',
      highlight: ['workspace.materials'],
      verify: { type: 'manualConfirm', label: 'I compared clearcoat / sheen' },
    },
    {
      id: 'foliage-flags',
      title: 'Foliage and surface flags',
      body: 'Batch2 Foliage uses an alpha map, Alpha Test, double-sided faces, and Depth Write off. Opacity & coverage plus Surface flags control transparency, fog, and tone mapping participation.',
      highlight: ['materials.alphaTest', 'workspace.materials'],
      verify: { type: 'manualConfirm', label: 'I checked foliage flags' },
    },
    {
      id: 'draft-undo',
      title: 'Draft scrub undo',
      body: 'In Materials, scrub Roughness or Transmission. Undo/Redo in the material editor undoes one finished numeric adjustment (draft-local). Cancel restores the last saved asset. Save writes the JSON asset; level Undo is not used for materials.',
      highlight: ['workspace.materials'],
      verify: { type: 'manualConfirm', label: 'Finish' },
    },
  ],
};
