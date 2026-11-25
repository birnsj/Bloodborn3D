/**
 * Phase 2H.1D — Concept Library client store (survives panel switches).
 */
import {
  analyzeConcept,
  conceptImageUrl,
  createConceptArea,
  createLibraryPrompt,
  deleteConcept,
  deleteConceptArea,
  deleteLibraryPrompt,
  duplicateConceptArea,
  duplicateLibraryPrompt,
  fetchConceptLibrary,
  fetchVisionCapability,
  importConceptImage,
  reorderConcepts,
  saveConceptFromStaging,
  setPrimaryConcept,
  updateConcept,
  updateConceptArea,
  updateLibraryPrompt,
} from '../../io/conceptLibraryClient.js';
import { createEmptyLibrary, MAX_CONCEPTS_PER_AREA, PROMPT_CATEGORIES } from './schema.js';

const LISTENERS = new Set();

const initialState = () => ({
  loaded: false,
  busy: false,
  error: null,
  library: createEmptyLibrary(),
  selectedAreaId: null,
  selectedConceptId: null,
  selectedPromptId: null,
  centerMode: 'concepts', // concepts | prompts
  promptFilter: {
    query: '',
    category: 'all',
    tags: '',
  },
  vision: null,
});

let state = initialState();

export function getConceptLibraryState() {
  return state;
}

export function subscribeConceptLibrary(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export async function conceptLibraryLoad() {
  setState({ busy: true, error: null });
  try {
    const [libRes, visionRes] = await Promise.all([
      fetchConceptLibrary(),
      fetchVisionCapability().catch(() => ({ capability: null })),
    ]);
    const library = libRes.library || createEmptyLibrary();
    const selectedAreaId = state.selectedAreaId
      && library.areas.some((a) => a.id === state.selectedAreaId)
      ? state.selectedAreaId
      : (library.areas[0]?.id || null);
    setState({
      loaded: true,
      busy: false,
      library,
      selectedAreaId,
      vision: visionRes.capability || null,
    });
    return library;
  } catch (err) {
    setState({ busy: false, error: err.message, loaded: true });
    throw err;
  }
}

export function selectConceptArea(areaId) {
  setState({
    selectedAreaId: areaId,
    selectedConceptId: null,
    selectedPromptId: null,
  });
}

export function selectConcept(conceptId) {
  setState({ selectedConceptId: conceptId, centerMode: 'concepts' });
}

export function selectPrompt(promptId) {
  setState({ selectedPromptId: promptId, centerMode: 'prompts' });
}

export function setConceptCenterMode(mode) {
  setState({ centerMode: mode === 'prompts' ? 'prompts' : 'concepts' });
}

export function setPromptFilter(patch) {
  setState({ promptFilter: { ...state.promptFilter, ...patch } });
}

async function mutate(fn) {
  setState({ busy: true, error: null });
  try {
    const result = await fn();
    const library = result.library || state.library;
    setState({
      busy: false,
      library,
      selectedAreaId: pickArea(library, result.areaId),
      selectedConceptId: result.conceptId || state.selectedConceptId,
      selectedPromptId: result.promptId || state.selectedPromptId,
    });
    return result;
  } catch (err) {
    setState({ busy: false, error: err.message });
    throw err;
  }
}

function pickArea(library, preferred) {
  if (preferred && library.areas.some((a) => a.id === preferred)) return preferred;
  if (state.selectedAreaId && library.areas.some((a) => a.id === state.selectedAreaId)) {
    return state.selectedAreaId;
  }
  return library.areas[0]?.id || null;
}

export function conceptLibraryCreateArea(payload) {
  return mutate(() => createConceptArea(payload));
}

export function conceptLibraryUpdateArea(areaId, patch) {
  return mutate(() => updateConceptArea({ areaId, patch }));
}

export function conceptLibraryDuplicateArea(areaId) {
  return mutate(() => duplicateConceptArea({ areaId }));
}

export function conceptLibraryDeleteArea(areaId) {
  return mutate(async () => {
    const result = await deleteConceptArea({ areaId });
    if (state.selectedAreaId === areaId) {
      setState({ selectedAreaId: null, selectedConceptId: null });
    }
    return result;
  });
}

export function conceptLibraryImportImage({ areaId, file, title }) {
  return mutate(() => importConceptImage({ areaId, file, title }));
}

export function conceptLibrarySaveFromStaging(payload) {
  return mutate(() => saveConceptFromStaging(payload));
}

export function conceptLibraryUpdateConcept(conceptId, patch) {
  return mutate(() => updateConcept({ conceptId, patch }));
}

export function conceptLibraryDeleteConcept(conceptId) {
  return mutate(async () => {
    const result = await deleteConcept({ conceptId });
    if (state.selectedConceptId === conceptId) setState({ selectedConceptId: null });
    return result;
  });
}

export function conceptLibraryReorder(areaId, conceptOrder) {
  return mutate(() => reorderConcepts({ areaId, conceptOrder }));
}

export function conceptLibrarySetPrimary(areaId, conceptId) {
  return mutate(() => setPrimaryConcept({ areaId, conceptId }));
}

export async function conceptLibraryAnalyze(conceptId) {
  setState({ busy: true, error: null });
  try {
    const result = await analyzeConcept({ conceptId });
    setState({ busy: false, vision: result.capability || state.vision });
    return result;
  } catch (err) {
    setState({ busy: false, error: err.message });
    throw err;
  }
}

export function conceptLibraryCreatePrompt(payload) {
  return mutate(() => createLibraryPrompt(payload));
}

export function conceptLibraryUpdatePrompt(promptId, patch) {
  return mutate(() => updateLibraryPrompt({ promptId, patch }));
}

export function conceptLibraryDuplicatePrompt(promptId) {
  return mutate(() => duplicateLibraryPrompt({ promptId }));
}

export function conceptLibraryDeletePrompt(promptId) {
  return mutate(async () => {
    const result = await deleteLibraryPrompt({ promptId });
    if (state.selectedPromptId === promptId) setState({ selectedPromptId: null });
    return result;
  });
}

export function getSelectedArea() {
  return state.library.areas.find((a) => a.id === state.selectedAreaId) || null;
}

export function getSelectedConcept() {
  return state.library.concepts.find((c) => c.id === state.selectedConceptId) || null;
}

export function getAreaConcepts(areaId = state.selectedAreaId) {
  const area = state.library.areas.find((a) => a.id === areaId);
  if (!area) return [];
  return area.conceptOrder
    .map((id) => state.library.concepts.find((c) => c.id === id))
    .filter(Boolean);
}

export function getFilteredPrompts() {
  const { query, category, tags } = state.promptFilter;
  const q = query.trim().toLowerCase();
  const tagList = tags.split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return state.library.prompts.filter((p) => {
    if (state.selectedAreaId && p.areaId && p.areaId !== state.selectedAreaId) return false;
    if (category !== 'all' && p.category !== category) return false;
    if (q) {
      const hay = `${p.name} ${p.promptText} ${p.negativePrompt} ${(p.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tagList.length) {
      const ptags = (p.tags || []).map((t) => t.toLowerCase());
      if (!tagList.every((t) => ptags.includes(t))) return false;
    }
    return true;
  });
}

export function conceptPreviewUrl(concept) {
  return concept?.imagePath ? conceptImageUrl(concept.imagePath) : null;
}

export { MAX_CONCEPTS_PER_AREA, PROMPT_CATEGORIES, conceptImageUrl };

export function __testResetConceptLibrary() {
  state = initialState();
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export function __testSetConceptLibrary(patch) {
  setState(patch);
}

if (typeof window !== 'undefined') {
  window.__bloodboundConceptLibrary = {
    get: getConceptLibraryState,
    load: conceptLibraryLoad,
    reset: __testResetConceptLibrary,
  };
}
