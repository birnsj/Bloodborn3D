/**
 * Phase 2H.1D — helpers for Concept Library → OpenArt asset generation.
 * Pure functions (no I/O) for seeding, prompt preview, and reference support.
 */

/** Compose the exact prompt text that will be submitted (art direction + asset prompt). */
export function buildFinalConceptPrompt({ artDirection = '', promptText = '' } = {}) {
  const direction = String(artDirection || '').trim();
  const body = String(promptText || '').trim();
  if (direction && body) return `[Art direction] ${direction}\n\n${body}`;
  if (direction) return `[Art direction] ${direction}`;
  return body;
}

/**
 * Whether the current OpenArt model/mode/schema accepts reference images.
 * Prefer schema fields; fall back to image2image mode availability.
 */
export function openArtSupportsReferenceImages({
  mode = 'text2image',
  schemaProperties = {},
  availableModes = null,
} = {}) {
  const props = schemaProperties || {};
  if (props.image || props.images || props.referenceImage || props.reference) return true;
  if (mode === 'image2image') return true;
  if (Array.isArray(availableModes) && availableModes.some((m) => (m.mode || m) === 'image2image')) {
    return true;
  }
  return false;
}

/** Prefer image2image when a concept reference will be attached and the model allows it. */
export function preferReferenceMode({ availableModes = [], currentMode = 'text2image', hasReference = false } = {}) {
  if (!hasReference) return currentMode;
  const modes = availableModes.map((m) => m.mode || m);
  if (modes.includes('image2image')) return 'image2image';
  return currentMode;
}

export function createGenerationOrigin({
  areaId = null,
  conceptId = null,
  promptId = null,
  finalPrompt = '',
} = {}) {
  return {
    areaId: areaId || null,
    conceptId: conceptId || null,
    promptId: promptId || null,
    finalPrompt: String(finalPrompt || ''),
  };
}

export function createGeneratedAssetRef({
  id,
  kind,
  name = '',
  areaId = null,
  conceptId = null,
  promptId = null,
} = {}) {
  if (!id || !kind) return null;
  return {
    id: String(id),
    kind: String(kind),
    name: String(name || id),
    areaId: areaId || null,
    conceptId: conceptId || null,
    promptId: promptId || null,
    attachedAt: new Date().toISOString(),
  };
}
