export const projectArtLibraryLesson = {
  id: 'project-art-library',
  title: 'Project Art Library',
  summary:
    'Browse concept art, organize folders and collections, pin multiple references, and crop image regions as OpenArt references for Asset Generation.',
  order: 17,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'intro',
      title: 'What Project Art Library is',
      body:
        'Open the AI Assets workspace tab, then Project Art Library. This is a Bridge-style browser for concept art — folders, collections, tags, favorites — not a second generator.',
      terms: [
        {
          term: 'Project Art',
          def: 'On-disk project concept/reference images under the Project Art library, with metadata in library.json.',
        },
        {
          term: 'Asset Generation',
          def: 'The sibling tab where OpenArt creates textures and images from prompts and image references.',
        },
      ],
      highlight: ['workspace.ai', 'ai.section.library'],
      verify: { type: 'manualConfirm', label: 'I opened Project Art Library' },
      explain:
        'ComfyUI and Meshy appear as Coming Soon in Asset Generation. Do not expect them to generate yet.',
    },
    {
      id: 'browse',
      title: 'Browse folders',
      body:
        'Use the left Projects tree or folder tiles in the gallery to open folders (e.g. Environments → Mansion). Breadcrumbs jump up the path. All Assets / Recent / Favorites filter the whole library.',
      highlight: ['projectArt.nav.filters', 'projectArt.gallery'],
      verify: { type: 'manualConfirm', label: 'I opened a folder' },
      failHint: 'Click a folder in the left tree or a folder tile in the center gallery.',
    },
    {
      id: 'organize',
      title: 'Organize concept art',
      body:
        'Create folders with New, collections under Collections, and tags on the Details tab of a selected image. Favorites (star) and ratings help you find art later.',
      highlight: ['projectArt.detail.tabs'],
      verify: { type: 'manualConfirm', label: 'I checked organization tools' },
      explain:
        'Import needs an open folder (not All Assets / Favorites). Drop images onto the gallery or use Import.',
    },
    {
      id: 'select-image',
      title: 'Select an image',
      body:
        'Click a thumbnail to select it. Ctrl/Cmd+click toggles; Shift+click ranges; Ctrl+A selects all visible files. The right preview shows Details, Prompt, and Generation tabs.',
      highlight: ['projectArt.gallery', 'projectArt.detail.tabs'],
      verify: { type: 'manualConfirm', label: 'I selected an image' },
    },
    {
      id: 'multi-ref',
      title: 'Multiple reference selection',
      body:
        'Select one or more images, then Use as Reference (or + in the Generation References tray). The tray under the gallery holds images that Asset Generation will treat as Project Art references.',
      highlight: ['projectArt.action.useAsReference', 'projectArt.tray'],
      verify: { type: 'manualConfirm', label: 'I pinned a reference' },
      explain:
        'Use as Reference does not generate — it only pins sources for later generation.',
    },
    {
      id: 'region',
      title: 'Select a region',
      body:
        'With an image previewed, click Select Region, then drag a rectangle on the preview (for example a limestone wall panel on a mansion concept). Clear Region removes it. The region is temporary handoff data — not a new asset file.',
      highlight: ['projectArt.region.select', 'projectArt.action.sendRegion'],
      verify: { type: 'manualConfirm', label: 'I drew a region' },
      explain:
        'Send Region to Generation crops that rectangle and stages it as the OpenArt image reference so Nano Banana 2 can read material detail directly. No separate vision-analysis step.',
    },
    {
      id: 'send',
      title: 'Send to Asset Generation',
      body:
        'Send to Generation carries the full image and any saved prompt. Send Region to Generation crops the selection into an image reference and preserves source image, coordinates, and associations. Both switch you to Asset Generation without spending credits.',
      highlight: ['projectArt.action.sendToGeneration', 'projectArt.action.sendRegion'],
      verify: { type: 'manualConfirm', label: 'I understand handoff' },
    },
  ],
};
