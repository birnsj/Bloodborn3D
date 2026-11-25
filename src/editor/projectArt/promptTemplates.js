/**
 * Template-based asset prompt composition (NOT vision / image analysis).
 * Builds production-oriented prompts from category, instruction, and tiling flags.
 */

export const ASSET_CATEGORIES = Object.freeze([
  { id: 'environment_concept', label: 'Environment Concept' },
  { id: 'wall_texture', label: 'Wall Texture' },
  { id: 'floor_texture', label: 'Floor Texture' },
  { id: 'ceiling_texture', label: 'Ceiling Texture' },
  { id: 'architectural_element', label: 'Architectural Element' },
  { id: 'door_window', label: 'Door / Window' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'decorative_object', label: 'Decorative Object' },
  { id: 'prop', label: 'Prop' },
  { id: 'lighting_fixture', label: 'Lighting Fixture' },
  { id: 'character', label: 'Character' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'other', label: 'Other' },
]);

export const ASSET_CATEGORY_IDS = ASSET_CATEGORIES.map((c) => c.id);

const TEXTURE_CATEGORIES = new Set(['wall_texture', 'floor_texture', 'ceiling_texture']);

const TILING_NOTES = Object.freeze({
  horizontal:
    'Seamless horizontal tiling required: left and right edges must match. Vertical tiling is not required.',
  vertical:
    'Seamless vertical tiling required: top and bottom edges must match. Horizontal tiling is not required.',
  both:
    'Seamless bidirectional tiling required: all opposing edges must match.',
});

const ORTHOGRAPHIC_CONSTRAINT =
  'Front-facing orthographic view, neutral even lighting, no perspective, no vanishing point, flat to camera.';

/**
 * Compose a production-oriented prompt string from templates + metadata.
 * This is template composition — not image vision analysis.
 *
 * @returns {{ promptText: string, notes: string[], source: 'template', assetCategory: string }}
 */
export function composeTemplateAssetPrompt({
  assetCategory = 'other',
  instruction = '',
  tileHorizontal = false,
  tileVertical = false,
  referenceTitles = [],
} = {}) {
  const catId = ASSET_CATEGORY_IDS.includes(assetCategory) ? assetCategory : 'other';
  const cat = ASSET_CATEGORIES.find((c) => c.id === catId) || ASSET_CATEGORIES[ASSET_CATEGORIES.length - 1];
  const notes = [
    'Composed via prompt template (not vision analysis).',
  ];

  const parts = [];
  parts.push(`${cat.label} asset.`);

  const titles = Array.isArray(referenceTitles)
    ? referenceTitles.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (titles.length) {
    parts.push(`Reference art: ${titles.join('; ')}.`);
    notes.push(`Included ${titles.length} reference title(s) in the prompt.`);
  }

  const body = String(instruction || '').trim();
  if (body) {
    parts.push(body);
  } else {
    parts.push(`Generate a high-quality ${cat.label.toLowerCase()} suitable for a game production pipeline.`);
    notes.push('No designer instruction provided; used category default phrasing.');
  }

  if (TEXTURE_CATEGORIES.has(catId)) {
    parts.push(ORTHOGRAPHIC_CONSTRAINT);
    notes.push('Appended orthographic / neutral-lighting constraints for surface texture category.');
  }

  const h = Boolean(tileHorizontal);
  const v = Boolean(tileVertical);
  if (h || v) {
    const tiling = h && v ? TILING_NOTES.both : h ? TILING_NOTES.horizontal : TILING_NOTES.vertical;
    parts.push(tiling);
    notes.push('Appended tiling technical constraints.');
  } else if (TEXTURE_CATEGORIES.has(catId)) {
    notes.push('Texture category without tiling flags; orthographic constraints only.');
  }

  return {
    promptText: parts.join(' ').replace(/\s+/g, ' ').trim(),
    notes,
    source: 'template',
    assetCategory: catId,
  };
}
