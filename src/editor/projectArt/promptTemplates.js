/**
 * Data-driven prompt templates (NOT vision / image analysis).
 * Builds production-oriented prompts from a template, designer instruction,
 * optional selected-region note, and reference titles.
 */
import { hasTilingLanguage, tilingInstruction } from '../aiAssets/promptComposition.js';

const ORTHOGRAPHIC_CONSTRAINT =
  'Front-facing orthographic view, neutral even lighting, no perspective, no vanishing point, flat to camera.';

const ISOLATED_CONSTRAINT =
  'Single isolated object on a plain neutral background, no surrounding scene.';

// Constraint wording deliberately avoids "seamless ... tiling": tiling language
// comes from the checkboxes, and composeGenerationPrompt skips its append when
// the body already contains it.
function template(def) {
  return Object.freeze({
    tilingRelevant: false,
    orthographicRequired: false,
    isolatedObject: false,
    ...def,
    technicalConstraints: Object.freeze([...(def.technicalConstraints || [])]),
    suggestedDefaults: Object.freeze({ ...(def.suggestedDefaults || {}) }),
  });
}

export const PROMPT_TEMPLATES = Object.freeze([
  template({
    id: 'environment_concept',
    label: 'Environment Concept',
    description: 'Atmospheric environment / interior concept art used for look-dev and reference.',
    framing: 'Environment concept art.',
    technicalConstraints: [
      'Clear architectural readability, coherent lighting, consistent material language.',
    ],
    outputType: 'concept_art',
  }),
  template({
    id: 'wall_texture',
    label: 'Wall Texture',
    description:
      'Flat wall surface texture from a reference crop — front-facing, suitable for tiling in-engine. The image model interprets material from the attached reference.',
    framing:
      'Recreate the wall material shown in the reference image as a flat, front-facing game texture. Preserve the material, colors, construction patterns, surface details and weathering. Remove perspective distortion, directional lighting and unrelated architectural elements.',
    technicalConstraints: [
      'Uniform detail density across the whole surface.',
    ],
    outputType: 'texture',
    tilingRelevant: true,
    // Framing already covers front-facing / no perspective / neutral lighting.
    orthographicRequired: false,
    suggestedDefaults: { tileHorizontal: true, tileVertical: false },
  }),
  template({
    id: 'floor_texture',
    label: 'Floor Texture',
    description: 'Top-down floor surface texture, suitable for tiling in-engine.',
    framing: 'Floor surface texture, viewed straight down.',
    technicalConstraints: ['Uniform detail density across the whole surface, no baked-in shadows.'],
    outputType: 'texture',
    tilingRelevant: true,
    orthographicRequired: true,
    suggestedDefaults: { tileHorizontal: true, tileVertical: true },
  }),
  template({
    id: 'ceiling_texture',
    label: 'Ceiling Texture',
    description: 'Ceiling surface texture, viewed straight up, suitable for tiling in-engine.',
    framing: 'Ceiling surface texture, viewed straight up.',
    technicalConstraints: ['Uniform detail density across the whole surface, no baked-in shadows.'],
    outputType: 'texture',
    tilingRelevant: true,
    orthographicRequired: true,
    suggestedDefaults: { tileHorizontal: true, tileVertical: true },
  }),
  template({
    id: 'architectural_element',
    label: 'Architectural Element',
    description: 'Moldings, columns, arches, trim and other modular architectural pieces.',
    framing: 'Architectural element.',
    technicalConstraints: ['Clean silhouette, consistent material language, readable profile.'],
    outputType: 'object_sheet',
    tilingRelevant: true,
    orthographicRequired: true,
    isolatedObject: true,
  }),
  template({
    id: 'door_window',
    label: 'Door / Window',
    description: 'Doors, windows and other wall openings.',
    framing: 'Door or window asset.',
    technicalConstraints: ['Show frame, panels and hardware clearly.'],
    outputType: 'object_sheet',
    orthographicRequired: true,
    isolatedObject: true,
  }),
  template({
    id: 'furniture',
    label: 'Furniture',
    description: 'Furniture pieces shown as a clean, isolated reference.',
    framing: 'Furniture asset.',
    technicalConstraints: ['Clear silhouette and material breakup, even lighting.'],
    outputType: 'object_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'decorative_object',
    label: 'Decorative Object',
    description: 'Ornamental objects such as vases, busts, frames and trophies.',
    framing: 'Decorative object.',
    technicalConstraints: ['Clear silhouette and material breakup, even lighting.'],
    outputType: 'object_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'prop',
    label: 'Prop',
    description: 'Small gameplay or set-dressing props.',
    framing: 'Game prop.',
    technicalConstraints: ['Clear silhouette and material breakup, even lighting.'],
    outputType: 'object_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'lighting_fixture',
    label: 'Lighting Fixture',
    description: 'Chandeliers, sconces, lamps and other light fixtures.',
    framing: 'Lighting fixture.',
    technicalConstraints: ['Fixture shown unlit with clear structure and materials.'],
    outputType: 'object_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'character',
    label: 'Character',
    description: 'Character design reference.',
    framing: 'Character design reference.',
    technicalConstraints: ['Full body visible, neutral pose, even lighting.'],
    outputType: 'character_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'weapon',
    label: 'Weapon',
    description: 'Weapon design reference.',
    framing: 'Weapon design reference.',
    technicalConstraints: ['Full weapon visible side-on, clear silhouette, even lighting.'],
    outputType: 'object_sheet',
    isolatedObject: true,
  }),
  template({
    id: 'model_3d_reference',
    label: '3D Model Reference',
    description: 'Clean orthographic reference of one object to guide 3D modeling.',
    framing: '3D model reference sheet.',
    technicalConstraints: [
      'Flat neutral lighting, no dramatic shadows, all major forms and materials clearly readable.',
    ],
    outputType: 'model_reference',
    orthographicRequired: true,
    isolatedObject: true,
  }),
  template({
    id: 'sprite',
    label: 'Sprite',
    description: 'Isolated 2D game sprite with clean edges.',
    framing: '2D game sprite.',
    technicalConstraints: [
      'Clean readable edges suitable for transparency cut-out, consistent lighting direction.',
    ],
    outputType: 'sprite',
    isolatedObject: true,
  }),
  template({
    id: 'other',
    label: 'Other',
    description: 'General-purpose asset with no category-specific constraints.',
    framing: 'Game asset.',
    outputType: 'general',
  }),
]);

/** Dropdown entries derived from PROMPT_TEMPLATES (kept for compatibility). */
export const ASSET_CATEGORIES = Object.freeze(
  PROMPT_TEMPLATES.map((t) => Object.freeze({ id: t.id, label: t.label })),
);

export const ASSET_CATEGORY_IDS = ASSET_CATEGORIES.map((c) => c.id);

export function getPromptTemplate(id) {
  return PROMPT_TEMPLATES.find((t) => t.id === id) || null;
}

/** Human summary of a template's constraints for UI help text. */
export function summarizeTemplateConstraints(tpl) {
  if (!tpl) return '';
  const bits = [];
  if (tpl.orthographicRequired) bits.push('orthographic view');
  if (tpl.isolatedObject) bits.push('isolated object');
  if (tpl.tilingRelevant) bits.push('tiling-relevant');
  bits.push(...tpl.technicalConstraints);
  return bits.join('; ');
}

/** "x 12%, y 20%, 40% × 30%" style summary of a normalized region. */
export function describeRegionCoords(region) {
  if (!region) return '';
  const pct = (n) => `${Math.round(Number(n || 0) * 100)}%`;
  return `x ${pct(region.x)}, y ${pct(region.y)}, ${pct(region.width)} × ${pct(region.height)}`;
}

/**
 * Compose a production-oriented prompt string from a template + metadata.
 * This is template composition — not image vision analysis.
 *
 * `includeTiling` (default true) appends tiling sentences via tilingInstruction.
 * The OpenArt path passes false because composeGenerationPrompt appends tiling
 * from the checkboxes; either way tiling is never duplicated.
 *
 * @returns {{ promptText: string, notes: string[], source: 'template', assetCategory: string, templateId: string }}
 */
export function composeTemplateAssetPrompt({
  assetCategory = 'other',
  templateId = null,
  instruction = '',
  tileHorizontal = false,
  tileVertical = false,
  referenceTitles = [],
  includeTiling = true,
} = {}) {
  const tpl = getPromptTemplate(templateId || assetCategory) || getPromptTemplate('other');
  const notes = [
    'Composed via prompt template. The image model interprets visual characteristics from any attached reference image — no separate vision analysis.',
  ];

  const parts = [tpl.framing];

  const titles = Array.isArray(referenceTitles)
    ? referenceTitles.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (titles.length) {
    parts.push(`Source concept: ${titles.join('; ')}.`);
    notes.push(`Included ${titles.length} source title(s) in the prompt.`);
  }

  const body = String(instruction || '').trim();
  if (body) {
    parts.push(body);
  } else if (!tpl.framing.toLowerCase().includes('reference image')) {
    parts.push(`Generate a high-quality ${tpl.label.toLowerCase()} suitable for a game production pipeline.`);
    notes.push('No designer instruction provided; used template default phrasing.');
  }

  if (tpl.orthographicRequired) {
    parts.push(ORTHOGRAPHIC_CONSTRAINT);
    notes.push('Appended orthographic / neutral-lighting constraints.');
  }
  if (tpl.isolatedObject) {
    parts.push(ISOLATED_CONSTRAINT);
    notes.push('Appended isolated-object constraint.');
  }
  for (const c of tpl.technicalConstraints) parts.push(c);

  let promptText = parts.join(' ').replace(/\s+/g, ' ').trim();

  const tiling = tilingInstruction({ tileHorizontal, tileVertical });
  if (tiling && includeTiling) {
    if (hasTilingLanguage(promptText)) {
      notes.push('Body already contains tiling language; not appended again.');
    } else {
      promptText = `${promptText} ${tiling}`;
      notes.push('Appended tiling technical constraints.');
    }
  } else if (tiling) {
    notes.push('Tiling language is appended from the checkboxes at submit time.');
  } else if (tpl.tilingRelevant) {
    notes.push('Tiling-relevant template without tiling flags.');
  }

  return {
    promptText,
    notes,
    source: 'template',
    assetCategory: tpl.id,
    templateId: tpl.id,
  };
}

/**
 * Region workflow: template prompt for a cropped region attached as the OpenArt
 * --image reference. The crop carries visual detail; this only scaffolds wording.
 */
export function assembleRegionTemplatePrompt({
  templateId = 'other',
  regionDescription = '',
  instruction = '',
  tileHorizontal = false,
  tileVertical = false,
  referenceTitles = [],
  itemTitle = '',
  includeTiling = true,
} = {}) {
  const region = String(regionDescription || '').trim();
  const title = String(itemTitle || '').trim();
  const userText = String(instruction || '').trim();

  const focus = title
    ? `The attached reference image is a cropped region from "${title}".`
    : 'The attached reference image is a cropped region of the source concept.';
  const noteBits = [region ? `Crop bounds: ${region}.` : '', userText].filter(Boolean);
  const combined = [focus, ...noteBits].join(' ');

  const result = composeTemplateAssetPrompt({
    templateId,
    instruction: combined,
    tileHorizontal,
    tileVertical,
    referenceTitles,
    includeTiling,
  });
  result.notes.push(
    'Cropped region is submitted as the image reference; the model interprets its visual characteristics.',
  );
  return result;
}
