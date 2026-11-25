/**
 * Phase 2H.1D — Vision / image-to-prompt extension point.
 *
 * Book / CLI fact: OpenArt CLI 0.1.1 exposes account, generate, model, creation,
 * upload, project, workspace — no image-caption, analyze, or image-to-prompt command.
 *
 * Prototype: analysis is unsupported until a future approved vision provider is wired.
 * Never invent captions or overwrite designer-authored metadata.
 */

export const VISION_CAPABILITY = {
  providerId: null,
  supportsCaption: false,
  supportsImageToPrompt: false,
  supportsMetadataFill: false,
  reason: 'OpenArt CLI has no image analysis / caption / image-to-prompt command. Manual metadata editing only.',
};

export function getVisionCapability() {
  return { ...VISION_CAPABILITY };
}

/**
 * Analyze a concept image. Always returns unsupported for the current stack.
 * Future providers must merge suggestions without clobbering non-empty designer fields.
 */
export async function analyzeConceptImage(/* { conceptId, imagePath, absolutePath } */) {
  return {
    ok: false,
    code: 'VISION_UNSUPPORTED',
    error: VISION_CAPABILITY.reason,
    suggestions: null,
  };
}

/**
 * Merge analysis suggestions into a concept draft without overwriting non-empty fields.
 * Exported for future providers and unit tests.
 */
export function mergeAnalysisSuggestions(concept, suggestions, { overwriteEmptyOnly = true } = {}) {
  if (!concept || !suggestions || typeof suggestions !== 'object') return { ...concept };
  const next = { ...concept };
  const fields = [
    'description',
    'generationPrompt',
    'architecturalStyle',
    'materials',
    'colorPalette',
    'lighting',
    'atmosphere',
    'distinctiveElements',
  ];
  for (const key of fields) {
    if (suggestions[key] == null || suggestions[key] === '') continue;
    const current = next[key];
    if (overwriteEmptyOnly && current && String(current).trim()) continue;
    next[key] = String(suggestions[key]);
  }
  if (Array.isArray(suggestions.tags) && suggestions.tags.length) {
    const existing = new Set(next.tags || []);
    for (const tag of suggestions.tags) {
      const t = String(tag).trim();
      if (t) existing.add(t);
    }
    next.tags = [...existing];
  }
  return next;
}
