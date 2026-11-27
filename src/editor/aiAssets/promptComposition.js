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
 * True when text already carries seamless-tiling language (case-insensitive
 * "seamless" + "tiling"), so appending the checkbox sentence would duplicate it.
 */
export function hasTilingLanguage(text) {
  const t = String(text ?? '').toLowerCase();
  return t.includes('seamless') && t.includes('tiling');
}

/**
 * Compose the exact prompt text submitted to an image provider.
 * Does not mutate the editable prompt — callers keep that separate.
 * Skips the tiling append when the body already contains tiling language.
 */
export function composeGenerationPrompt({
  prompt = '',
  tileHorizontal = false,
  tileVertical = false,
} = {}) {
  const body = String(prompt ?? '').trim();
  const tiling = tilingInstruction({ tileHorizontal, tileVertical });
  if (!tiling) return body;
  if (body && hasTilingLanguage(body)) return body;
  if (!body) return tiling;
  return `${body}\n\n${tiling}`;
}

export function defaultPromptComposition() {
  return {
    tileHorizontal: false,
    tileVertical: false,
    /** Character template only: '' | 't-pose' | 'a-pose' */
    characterPose: '',
    /** Character template only: keep held weapons / props in the sketch. */
    includeObjects: true,
  };
}

/** Pose constraint sentence for Character template composition. */
export function characterPoseInstruction(poseMode = '') {
  const pose = String(poseMode || '').trim().toLowerCase();
  if (pose === 't-pose' || pose === 'tpose') {
    return 'Full body in a clear T-pose (arms straight out to the sides), even lighting.';
  }
  if (pose === 'a-pose' || pose === 'apose') {
    return 'Full body in a clear A-pose (arms angled down and away from the torso), even lighting.';
  }
  return '';
}

/** Include / exclude held objects for Character template composition. */
export function characterObjectsInstruction(includeObjects = true) {
  if (includeObjects) {
    return 'Include any held weapons or objects from the reference sketch as part of the character.';
  }
  return 'Character only — exclude held weapons and loose objects; show empty hands.';
}
