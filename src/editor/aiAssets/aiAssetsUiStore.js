/**
 * Phase 2H.1C — AI Assets workspace UI state (selected provider).
 * Separate from OpenArt generation state so provider switches keep OpenArt jobs alive.
 */
import { DEFAULT_AI_PROVIDER_ID, getAiProvider } from './providers.js';

const LISTENERS = new Set();

let state = {
  selectedProviderId: DEFAULT_AI_PROVIDER_ID,
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

export function selectAiProvider(providerId) {
  const provider = getAiProvider(providerId);
  if (!provider) return state;
  // Coming-soon providers may still be selected to show the placeholder panel.
  state = { ...state, selectedProviderId: provider.id };
  emit();
  return state;
}

export function __testResetAiAssetsUi() {
  state = { selectedProviderId: DEFAULT_AI_PROVIDER_ID };
  emit();
}

if (typeof window !== 'undefined') {
  window.__bloodboundAiAssetsUi = {
    get: getAiAssetsUiState,
    select: selectAiProvider,
    reset: __testResetAiAssetsUi,
  };
}
