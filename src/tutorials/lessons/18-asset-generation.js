export const assetGenerationLesson = {
  id: 'asset-generation',
  title: 'Asset Generation',
  summary:
    'Compose prompts from templates and cropped image references, apply tiling, estimate/spend with OpenArt, then save to Project Art or import textures.',
  order: 18,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'intro',
      title: 'Open Asset Generation',
      body:
        'In AI Assets, open Asset Generation. OpenArt is the live provider (CLI + login). Other providers stay Coming Soon.',
      highlight: ['workspace.ai', 'ai.section.generation'],
      verify: { type: 'manualConfirm', label: 'I opened Asset Generation' },
      explain:
        'Prefer starting from Project Art Library → Use as Reference / Send Region to Generation so destination folder and cropped references are already set.',
    },
    {
      id: 'templates',
      title: 'Prompt templates',
      body:
        'Under Prompt Templates, pick a type (Wall Texture, Prop, Character, …). Read the template help — it sets framing and whether tiling language applies. Wall Texture suggests Tile Horizontal on by default.',
      highlight: ['openart.promptTemplate'],
      verify: { type: 'manualConfirm', label: 'I chose a template' },
      terms: [
        {
          term: 'Template',
          def: 'Data-driven prompt scaffold. Visual material comes from the attached reference image, not from a separate vision caption.',
        },
      ],
    },
    {
      id: 'compose',
      title: 'Compose Prompt',
      body:
        'If you sent a region, the cropped reference is already staged. Optionally add instructions, then Compose Prompt. Review the editable Prompt field — the image model will interpret the reference directly when you generate.',
      highlight: ['openart.generatePrompt', 'openart.prompt'],
      verify: { type: 'manualConfirm', label: 'I composed a prompt' },
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
  ],
};
