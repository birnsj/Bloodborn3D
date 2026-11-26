/**
 * Phase 2H.1C — AI Assets provider catalog.
 * OpenArt (image) and Meshy (Image-to-3D) are implemented. ComfyUI remains stubbed.
 */

export const AI_PROVIDER_CATEGORIES = [
  {
    id: 'image',
    label: 'Image Generation',
    providers: [
      {
        id: 'openart',
        name: 'OpenArt',
        category: 'image',
        status: 'available',
        blurb: 'Texture and image generation via the OpenArt CLI',
      },
      {
        id: 'comfyui',
        name: 'ComfyUI',
        category: 'image',
        status: 'coming_soon',
        blurb: 'Local ComfyUI workflows — coming soon',
      },
    ],
  },
  {
    id: 'mesh',
    label: '3D Generation',
    providers: [
      {
        id: 'meshy',
        name: 'Meshy',
        category: 'mesh',
        status: 'available',
        blurb: 'Image-to-3D via the Meshy CLI (Smart Topology + PBR)',
      },
    ],
  },
];

export const AI_PROVIDERS = AI_PROVIDER_CATEGORIES.flatMap((c) => c.providers);

export function getAiProvider(id) {
  return AI_PROVIDERS.find((p) => p.id === id) || null;
}

export const DEFAULT_AI_PROVIDER_ID = 'openart';
