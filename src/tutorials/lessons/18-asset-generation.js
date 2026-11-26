export const assetGenerationLesson = {
  id: 'asset-generation',
  title: 'Asset Generation',
  summary:
    'Compose prompts from templates and cropped image references with OpenArt, or generate static 3D props with Meshy Image-to-3D. Estimate and approve every paid request.',
  order: 18,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'intro',
      title: 'Open Asset Generation',
      body:
        'In AI Assets, open Asset Generation. OpenArt (images) and Meshy (Image-to-3D) are live. ComfyUI remains Coming Soon.',
      highlight: ['workspace.ai', 'ai.section.generation'],
      verify: { type: 'manualConfirm', label: 'I opened Asset Generation' },
      explain:
        'Prefer starting from Project Art Library → Use as Reference / Send Region / Send to Meshy so destination folder and references are already set.',
    },
    {
      id: 'templates',
      title: 'Prompt templates',
      body:
        'Under Prompt Templates, pick a type (Wall Texture, Full Wall Texture, Prop, Character, …). Selecting a template auto-composes the Prompt field (asks before replacing manual edits). Wall / Full Wall Texture suggest Tile Horizontal on by default. Full Wall Texture asks for a complete floor-to-ceiling elevation. Send Region seeds Wall Texture (or your current selection) — it never reuses the concept’s original bedroom/scene prompt.',
      highlight: ['openart.promptTemplate'],
      verify: { type: 'manualConfirm', label: 'I chose a template' },
      terms: [
        {
          term: 'Template',
          def: 'Data-driven prompt scaffold. Visual material comes from the attached cropped reference image, not from a separate vision caption.',
        },
      ],
    },
    {
      id: 'compose',
      title: 'Compose Prompt (optional)',
      body:
        'Send Region and template changes already compose the prompt. Compose Prompt is for explicit recomposition after you change instructions or want a fresh template body. Review the Prompt field and the Final submitted prompt preview (includes tiling from the checkboxes) — that preview is exactly what Estimate / Generate send.',
      highlight: ['openart.generatePrompt', 'openart.prompt'],
      verify: { type: 'manualConfirm', label: 'I reviewed the composed prompt' },
    },
    {
      id: 'tiling',
      title: 'Tiling checkboxes',
      body:
        'Use the existing Tile Horizontal / Tile Vertical checkboxes only. Final submitted prompt appends matching tiling language once (no duplicate controls elsewhere).',
      highlight: ['openart.tiling'],
      verify: { type: 'manualConfirm', label: 'I checked tiling' },
      explain:
        'Both on → bidirectional tiling instruction. Neither → no tiling sentence. Language already in the prompt body is not duplicated.',
    },
    {
      id: 'save-prompt',
      title: 'Save and reuse prompts',
      body:
        'Save Prompt stores the working prompt into Project Art (and can attach it to the source image). Reopen that image → Prompt / Generation tabs to inspect original prompt, template id, region, cropped reference, and provenance.',
      highlight: ['openart.savePrompt', 'projectArt.detail.tabs'],
      verify: { type: 'manualConfirm', label: 'I know where prompts live' },
    },
    {
      id: 'cost',
      title: 'Estimate and spend approval',
      body:
        'Estimate refreshes credit cost. Generate… always asks for explicit spend approval before calling OpenArt — it will not auto-spend. The cropped reference is submitted with the prompt via --image.',
      highlight: ['openart.estimate', 'openart.generate'],
      verify: { type: 'manualConfirm', label: 'I understand spend approval' },
    },
    {
      id: 'results',
      title: 'Import texture and materials',
      body:
        'After a result appears: Import Texture registers it under project textures; Create Material builds a material from that texture; Save to Project Art writes into the handoff folder when you arrived from the library.',
      highlight: [
        'openart.importTexture',
        'openart.createMaterial',
        'openart.saveProjectArt',
      ],
      verify: { type: 'manualConfirm', label: 'I reviewed result actions' },
      explain:
        'Imported materials are usable in Level Editor / Materials workspace like any other material. Generation details (collapsed) show estimate, job, template, source region, and cropped reference when present.',
    },
    {
      id: 'meshy-setup',
      title: 'Meshy provider setup',
      body:
        'Install the Meshy CLI (`npm install -g meshy-cli`, Node.js 22.12+). Select Meshy in Providers, then Log in to sign in with your Meshy account in the browser (`meshy auth login`). Status refreshes after you finish; credit balance appears when connected. Credentials stay in the CLI store — BloodBound never reads them.',
      highlight: ['ai.provider.meshy', 'meshy.connect', 'meshy.controls'],
      verify: { type: 'manualConfirm', label: 'I understand Meshy uses CLI browser sign-in' },
    },
    {
      id: 'meshy-reference',
      title: 'Prepare an isolated 3D reference',
      body:
        'For furniture from mansion concept art: select a region, optionally Send Region to Generation with the 3D Model Reference template (three-quarter isolated prop on a plain background), review the OpenArt result, then Send to Meshy. Or Send to Meshy / Send Region to Meshy directly from Project Art.',
      highlight: ['projectArt.action.sendToMeshy', 'meshy.reference'],
      verify: { type: 'manualConfirm', label: 'I know how to hand off a reference to Meshy' },
    },
    {
      id: 'meshy-generate',
      title: 'Smart Topology props and import',
      body:
        'Use Game Prop Preset (T2.5, ~5k triangles, meshy-7 PBR @ 2K, GLB). Estimate (binds the exact CLI argv + dry-run), approve spend once, then inspect the staged model (textured / untextured / wireframe). Import Model writes a local mesh with pivot at bottom-center and character-like meshes scaled to ~1.75 m — place it in the Level Editor at scale 1. Discarding a result does not delete an imported asset. Paid tasks are never auto-retried; ambiguous CLI exit 10 requires recovery before another submit.',
      highlight: ['meshy.preset', 'meshy.generate', 'meshy.import'],
      verify: { type: 'manualConfirm', label: 'I understand Meshy estimate → approve → import' },
      explain:
        'meshy-n1 cannot enable PBR — the preset uses meshy-7 for PBR maps. Jobs recover from .meshy-staging after editor restart.',
    },
  ],
};
