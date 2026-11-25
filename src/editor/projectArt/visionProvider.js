/**
 * Project Art vision / prompt analysis extension point.
 *
 * OpenArt vision remains unsupported. Template composition is the approved
 * fallback path and is clearly marked source: 'template'.
 */
import {
  VISION_CAPABILITY as CONCEPT_VISION_CAPABILITY,
  getVisionCapability as getConceptVisionCapability,
  analyzeConceptImage,
  mergeAnalysisSuggestions,
} from '../conceptLibrary/visionProvider.js';
import { composeTemplateAssetPrompt } from './promptTemplates.js';

export const VISION_CAPABILITY = {
  ...CONCEPT_VISION_CAPABILITY,
  supportsTemplatePrompt: true,
  reason: CONCEPT_VISION_CAPABILITY.reason,
};

export { analyzeConceptImage, mergeAnalysisSuggestions };

export function getVisionCapability() {
  return {
    ...getConceptVisionCapability(),
    supportsTemplatePrompt: true,
  };
}

export { composeTemplateAssetPrompt };

/**
 * Analyze an asset prompt request.
 *
 * - mode: 'template' → always returns template composition (source: 'template')
 * - mode: 'vision' (default) → VISION_UNSUPPORTED with template fallback option
 */
export async function analyzeAssetPromptRequest({
  mode = 'vision',
  assetCategory = 'other',
  instruction = '',
  tileHorizontal = false,
  tileVertical = false,
  referenceTitles = [],
  itemIds = [],
} = {}) {
  if (mode === 'template') {
    const composed = composeTemplateAssetPrompt({
      assetCategory,
      instruction,
      tileHorizontal,
      tileVertical,
      referenceTitles,
    });
    return {
      ok: true,
      source: 'template',
      code: null,
      error: null,
      promptText: composed.promptText,
      notes: composed.notes,
      assetCategory: composed.assetCategory,
      itemIds: Array.isArray(itemIds) ? itemIds.map(String) : [],
      capability: getVisionCapability(),
    };
  }

  return {
    ok: false,
    source: null,
    code: 'VISION_UNSUPPORTED',
    error: VISION_CAPABILITY.reason,
    suggestions: null,
    fallback: {
      mode: 'template',
      available: true,
      hint: 'Use mode: "template" or action compose-prompt for template-based composition.',
    },
    capability: getVisionCapability(),
    itemIds: Array.isArray(itemIds) ? itemIds.map(String) : [],
  };
}
