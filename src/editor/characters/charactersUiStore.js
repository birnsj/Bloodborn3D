/** Lightweight selection state for Characters workspace + Meshy handoff. */

const LISTENERS = new Set();

let state = {
  selectedId: null,
};

function emit() {
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export function getCharactersUiState() {
  return state;
}

export function subscribeCharactersUi(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

export function setCharactersSelection(id) {
  state = { ...state, selectedId: id || null };
  emit();
  return state;
}
