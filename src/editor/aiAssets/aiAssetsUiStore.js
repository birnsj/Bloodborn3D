/**
 * Phase 2H.1C/D — AI Assets workspace UI state.
 * Separate from OpenArt / Concept Library stores so switches keep in-flight work.
 */
import { DEFAULT_AI_PROVIDER_ID, getAiProvider } from './providers.js';

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
};

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

export function __testResetAiAssetsUi() {
  state = {
    section: 'concepts',
    selectedProviderId: DEFAULT_AI_PROVIDER_ID,
    conceptSaveTargetAreaId: null,
    generationOrigin: null,
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
    reset: __testResetAiAssetsUi,
  };
}
