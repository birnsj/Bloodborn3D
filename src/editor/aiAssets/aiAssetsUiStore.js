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

export function __testResetAiAssetsUi() {
  state = {
    section: 'concepts',
    selectedProviderId: DEFAULT_AI_PROVIDER_ID,
    conceptSaveTargetAreaId: null,
  };
  emit();
}

if (typeof window !== 'undefined') {
  window.__bloodboundAiAssetsUi = {
    get: getAiAssetsUiState,
    select: selectAiProvider,
    setSection: setAiAssetsSection,
    setConceptSaveTarget: setConceptSaveTargetAreaId,
    reset: __testResetAiAssetsUi,
  };
}
