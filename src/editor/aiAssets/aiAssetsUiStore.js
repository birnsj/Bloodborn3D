/**
 * Phase 2H.1C/D — AI Assets workspace UI state.
 * Separate from OpenArt / Concept Library stores so switches keep in-flight work.
 */
import { DEFAULT_AI_PROVIDER_ID, getAiProvider } from './providers.js';
import { defaultPromptComposition } from './promptComposition.js';

const LISTENERS = new Set();

let state = {
  /** concepts | generation */
  section: 'concepts',
  selectedProviderId: DEFAULT_AI_PROVIDER_ID,
  /** When generating a concept into an area (OpenArt save target). */
  conceptSaveTargetAreaId: null,
  /**
   * Origin of an Asset Generation launch from Concept Library.
   * Preserved through OpenArt estimate/generate/import so associations can be written.
   * { areaId, conceptId, promptId, finalPrompt } | null
   */
  generationOrigin: null,
  /**
   * Provider-independent prompt composition options (tiling, etc.).
   * Editable prompt text lives in the active provider store.
   */
  promptComposition: defaultPromptComposition(),
  /** Result strip thumbnail size (px), like Asset Viewer Size. */
  resultsThumbSize: 72,
};

export const RESULTS_THUMB_SIZE_MIN = 32;
export const RESULTS_THUMB_SIZE_MAX = 128;
export const RESULTS_THUMB_SIZE_DEFAULT = 72;

function clampResultsThumbSize(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return RESULTS_THUMB_SIZE_DEFAULT;
  return Math.min(
    RESULTS_THUMB_SIZE_MAX,
    Math.max(RESULTS_THUMB_SIZE_MIN, Math.round(v)),
  );
}

export function getAiAssetsUiState() {
  return state;
}

export function subscribeAiAssetsUi(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

function emit() {
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export function setAiAssetsSection(section) {
  state = {
    ...state,
    section: section === 'generation' ? 'generation' : 'concepts',
  };
  emit();
  return state;
}

export function selectAiProvider(providerId) {
  const provider = getAiProvider(providerId);
  if (!provider) return state;
  state = { ...state, selectedProviderId: provider.id, section: 'generation' };
  emit();
  return state;
}

export function setConceptSaveTargetAreaId(areaId) {
  state = { ...state, conceptSaveTargetAreaId: areaId || null };
  emit();
  return state;
}

export function setGenerationOrigin(origin) {
  state = {
    ...state,
    generationOrigin: origin && typeof origin === 'object'
      ? {
        areaId: origin.areaId || null,
        conceptId: origin.conceptId || null,
        promptId: origin.promptId || null,
        finalPrompt: String(origin.finalPrompt || ''),
      }
      : null,
  };
  emit();
  return state;
}

export function clearGenerationOrigin() {
  return setGenerationOrigin(null);
}

export function setPromptComposition(patch = {}) {
  const prev = state.promptComposition || defaultPromptComposition();
  const next = {
    tileHorizontal: patch.tileHorizontal !== undefined
      ? Boolean(patch.tileHorizontal)
      : Boolean(prev.tileHorizontal),
    tileVertical: patch.tileVertical !== undefined
      ? Boolean(patch.tileVertical)
      : Boolean(prev.tileVertical),
  };
  state = { ...state, promptComposition: next };
  emit();
  return state;
}

export function resetPromptComposition() {
  state = { ...state, promptComposition: defaultPromptComposition() };
  emit();
  return state;
}

export function setResultsThumbSize(size) {
  state = { ...state, resultsThumbSize: clampResultsThumbSize(size) };
  emit();
  return state;
}

/** @deprecated Use setResultsThumbSize */
export function setResultsPreviewSize(size) {
  return setResultsThumbSize(size);
}

export function __testResetAiAssetsUi() {
  state = {
    section: 'concepts',
    selectedProviderId: DEFAULT_AI_PROVIDER_ID,
    conceptSaveTargetAreaId: null,
    generationOrigin: null,
    promptComposition: defaultPromptComposition(),
    resultsThumbSize: RESULTS_THUMB_SIZE_DEFAULT,
  };
  emit();
}

if (typeof window !== 'undefined') {
  window.__bloodboundAiAssetsUi = {
    get: getAiAssetsUiState,
    select: selectAiProvider,
    setSection: setAiAssetsSection,
    setConceptSaveTarget: setConceptSaveTargetAreaId,
    setGenerationOrigin,
    clearGenerationOrigin,
    setPromptComposition,
    resetPromptComposition,
    setResultsThumbSize,
    setResultsPreviewSize,
    reset: __testResetAiAssetsUi,
  };
}
