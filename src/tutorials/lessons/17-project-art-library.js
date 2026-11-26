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
        'From here you can Send to Meshy / Send Region to Meshy for Image-to-3D, or Use as Reference / Send Region for OpenArt. ComfyUI remains Coming Soon.',
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
      id: 'external',
      title: 'External Google Drive libraries',
      body:
        'Under External Libraries, Add a Google Drive folder URL. Connect Google Account when the folder needs private access (read-only Drive scope). Browse subfolders and thumbnails on demand — BloodBound does not download the whole Drive folder. Use as Reference / Send to Generation / Meshy / Copy to Project Art work here; remote rename/delete/move are blocked.',
      highlight: ['projectArt.nav.externalLibraries', 'projectArt.gallery'],
      verify: { type: 'manualConfirm', label: 'I understand External Libraries' },
      explain:
        'Before OpenArt or Meshy runs, Drive images are materialized into project-controlled storage so generation never depends on temporary Drive URLs. Copy to Project Art Library to manage files locally.',
      terms: [
        {
          term: 'External Library',
          def: 'A connected Google Drive folder browsed read-only inside Project Art Library.',
        },
        {
          term: 'Materialize',
          def: 'Download a Drive file into project staging before using it as a generation reference.',
        },
      ],
    },
    {
      id: 'organize',
      title: 'Organize concept art',
      body:
        'Create folders with New, collections under Collections, and tags on the Details tab of a selected image. Favorites (star) and ratings help you find art later.',
      highlight: ['projectArt.detail.tabs'],
      verify: { type: 'manualConfirm', label: 'I checked organization tools' },
      explain:
        'Import needs an open local folder (not All Assets / Favorites / External Drive). Drop images onto the gallery or use Import.',
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
        'Send Region to Generation crops that rectangle and stages the crop as the sole OpenArt --image reference (not the full concept). It auto-composes a Wall Texture / selected template prompt and does not reuse the concept’s original generation prompt. No separate vision-analysis step.',
    },
    {
      id: 'send',
      title: 'Send to Asset Generation',
      body:
        'Send to Generation stages the full image as a reference. If a saved prompt exists it is transferred; if not, Asset Generation opens so you can pick a template or type a prompt. Send Region to Generation crops the selection into the OpenArt image reference and auto-composes a template prompt (not the concept prompt). Send to Meshy needs only the image — no prompt. Prompt and credit checks happen at Estimate / Generate, not in the library. No credits are spent by these handoffs.',
      highlight: ['projectArt.action.sendToGeneration', 'projectArt.action.sendRegion', 'projectArt.action.sendToMeshy'],
      verify: { type: 'manualConfirm', label: 'I understand handoff' },
    },
  ],
};
