/**
 * Provider-independent prompt composition for AI Assets generation.
 * Keeps the editable user prompt separate from appended generation instructions
 * (tiling today; reusable by OpenArt and future image providers).
 */

export const TILING_INSTRUCTIONS = Object.freeze({
  horizontal:
    'Seamless horizontal tiling, with matching left and right edges. Vertical tiling is not required.',
  vertical:
    'Seamless vertical tiling, with matching top and bottom edges. Horizontal tiling is not required.',
  both:
    'Seamless bidirectional tiling, with all opposing edges matching.',
});

/** Resolve the tiling sentence for the current checkbox state (or empty). */
export function tilingInstruction({ tileHorizontal = false, tileVertical = false } = {}) {
  const h = Boolean(tileHorizontal);
  const v = Boolean(tileVertical);
  if (h && v) return TILING_INSTRUCTIONS.both;
  if (h) return TILING_INSTRUCTIONS.horizontal;
  if (v) return TILING_INSTRUCTIONS.vertical;
  return '';
}

/**
 * Compose the exact prompt text submitted to an image provider.
 * Does not mutate the editable prompt — callers keep that separate.
 */
export function composeGenerationPrompt({
  prompt = '',
  tileHorizontal = false,
  tileVertical = false,
} = {}) {
  const body = String(prompt ?? '').trim();
  const tiling = tilingInstruction({ tileHorizontal, tileVertical });
  if (!tiling) return body;
  if (!body) return tiling;
  return `${body}\n\n${tiling}`;
}

export function defaultPromptComposition() {
  return {
    tileHorizontal: false,
    tileVertical: false,
  };
}
