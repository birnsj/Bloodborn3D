/**
 * Phase 2H.1C/D — AI Assets workspace UI state.
 * Separate from OpenArt / Project Art stores so switches keep in-flight work.
 */
import { DEFAULT_AI_PROVIDER_ID, getAiProvider } from './providers.js';
import { defaultPromptComposition } from './promptComposition.js';

const LISTENERS = new Set();

/** Soft UI warning threshold for generation references tray (still stores all). */
export const GENERATION_REFS_SOFT_LIMIT = 8;

let state = {
  /** concepts | generation */
  section: 'concepts',
  selectedProviderId: DEFAULT_AI_PROVIDER_ID,
  /** When generating a concept into an area (OpenArt save target). */
  conceptSaveTargetAreaId: null,
  /** When saving generated art into Project Art Library (relative folder path). */
  artSaveTargetFolder: null,
  /**
   * Origin of an Asset Generation launch from Concept / Project Art Library.
   * Preserved through OpenArt estimate/generate/import so associations can be written.
   * {
   *   areaId, conceptId, promptId, finalPrompt,
   *   assetCategory, tileHorizontal, tileVertical, itemIds, folderPath,
   *   promptTemplateId?, sourceRegion?, sourceItemId?, croppedReference?
   * } | null
   */
  generationOrigin: null,
  /**
   * Persistent generation reference tray (survives section / folder switches).
   * [{ id, relativePath, title }]
   */
  generationReferences: [],
  /** Last soft-limit warning for the tray (UI may clear after display). */
  generationReferencesWarning: null,
  /**
   * Provider-independent prompt composition options (tiling, etc.).
   * Editable prompt text lives in the active provider store.
   */
  promptComposition: defaultPromptComposition(),
  /**
   * Region drawn on a Project Art preview (normalized 0..1 of natural image size).
   * { itemId, relativePath, title, x, y, width, height, naturalWidth, naturalHeight, description? } | null
   */
  selectedRegion: null,
  /** Prompt template id shared by Project Art handoff and Asset Generation UI. */
  selectedPromptTemplateId: null,
  /** Result strip thumbnail size (px), like Asset Viewer Size. */
  resultsThumbSize: 72,
  /** Project Art Library gallery thumbnail size (px). */
  libraryThumbSize: 96,
};

export const RESULTS_THUMB_SIZE_MIN = 32;
export const RESULTS_THUMB_SIZE_MAX = 128;
export const RESULTS_THUMB_SIZE_DEFAULT = 72;

export const LIBRARY_THUMB_SIZE_MIN = 48;
export const LIBRARY_THUMB_SIZE_MAX = 160;
export const LIBRARY_THUMB_SIZE_DEFAULT = 96;

function clampResultsThumbSize(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return RESULTS_THUMB_SIZE_DEFAULT;
  return Math.min(
    RESULTS_THUMB_SIZE_MAX,
    Math.max(RESULTS_THUMB_SIZE_MIN, Math.round(v)),
  );
}

function clampLibraryThumbSize(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return LIBRARY_THUMB_SIZE_DEFAULT;
  return Math.min(
    LIBRARY_THUMB_SIZE_MAX,
    Math.max(LIBRARY_THUMB_SIZE_MIN, Math.round(v)),
  );
}

function normalizeRefItem(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    relativePath: String(raw.relativePath || ''),
    title: String(raw.title || raw.relativePath || raw.id),
  };
}

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

/** Validate + clamp a region; returns null when unusable. */
export function normalizeRegion(raw) {
  if (!raw || typeof raw !== 'object' || !raw.itemId) return null;
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const width = Math.min(clamp01(raw.width), 1 - x);
  const height = Math.min(clamp01(raw.height), 1 - y);
  if (!(width > 0) || !(height > 0)) return null;
  const region = {
    itemId: String(raw.itemId),
    relativePath: String(raw.relativePath || ''),
    title: String(raw.title || raw.relativePath || raw.itemId),
    x,
    y,
    width,
    height,
    naturalWidth: Math.max(0, Math.round(Number(raw.naturalWidth) || 0)),
    naturalHeight: Math.max(0, Math.round(Number(raw.naturalHeight) || 0)),
  };
  if (raw.description != null && String(raw.description).trim()) {
    region.description = String(raw.description).trim();
  }
  return region;
}

function normalizeGenerationOrigin(origin) {
  if (!origin || typeof origin !== 'object') return null;
  // Optional fields are only present when set, so existing origins keep their shape.
  const optional = {};
  if (origin.promptTemplateId) optional.promptTemplateId = String(origin.promptTemplateId);
  const sourceRegion = normalizeRegion(origin.sourceRegion);
  if (sourceRegion) optional.sourceRegion = sourceRegion;
  if (origin.sourceItemId) optional.sourceItemId = String(origin.sourceItemId);
  if (origin.croppedReference && typeof origin.croppedReference === 'object') {
    optional.croppedReference = {
      stagingId: origin.croppedReference.stagingId
        ? String(origin.croppedReference.stagingId)
        : null,
      fileName: origin.croppedReference.fileName
        ? String(origin.croppedReference.fileName)
        : null,
      originalName: origin.croppedReference.originalName
        ? String(origin.croppedReference.originalName)
        : null,
      absolutePath: origin.croppedReference.absolutePath
        ? String(origin.croppedReference.absolutePath)
        : null,
      sourceItemId: origin.croppedReference.sourceItemId
        ? String(origin.croppedReference.sourceItemId)
        : null,
    };
  }
  return {
    ...optional,
    areaId: origin.areaId || null,
    conceptId: origin.conceptId || null,
    promptId: origin.promptId || null,
    finalPrompt: String(origin.finalPrompt || ''),
    assetCategory: origin.assetCategory ? String(origin.assetCategory) : null,
    tileHorizontal: Boolean(origin.tileHorizontal),
    tileVertical: Boolean(origin.tileVertical),
    itemIds: Array.isArray(origin.itemIds) ? origin.itemIds.map(String) : [],
    folderPath: origin.folderPath != null ? String(origin.folderPath) : null,
  };
}

function emptyUiState() {
  return {
    section: 'concepts',
    selectedProviderId: DEFAULT_AI_PROVIDER_ID,
    conceptSaveTargetAreaId: null,
    artSaveTargetFolder: null,
    generationOrigin: null,
    generationReferences: [],
    generationReferencesWarning: null,
    promptComposition: defaultPromptComposition(),
    selectedRegion: null,
    selectedPromptTemplateId: null,
    resultsThumbSize: RESULTS_THUMB_SIZE_DEFAULT,
    libraryThumbSize: LIBRARY_THUMB_SIZE_DEFAULT,
  };
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

export function setArtSaveTargetFolder(folderPath) {
  state = {
    ...state,
    artSaveTargetFolder: folderPath != null && folderPath !== ''
      ? String(folderPath)
      : (folderPath === '' ? '' : null),
  };
  emit();
  return state;
}

export function setGenerationOrigin(origin) {
  state = {
    ...state,
    generationOrigin: normalizeGenerationOrigin(origin),
  };
  emit();
  return state;
}

export function clearGenerationOrigin() {
  return setGenerationOrigin(null);
}

/**
 * Add references to the tray. Dedupes by id; never silently drops —
 * stores all unique items. Soft-warns when count exceeds GENERATION_REFS_SOFT_LIMIT.
 */
export function addGenerationReferences(items) {
  const incoming = (Array.isArray(items) ? items : [])
    .map(normalizeRefItem)
    .filter(Boolean);
  const byId = new Map(state.generationReferences.map((r) => [r.id, r]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  const generationReferences = [...byId.values()];
  const warning = generationReferences.length > GENERATION_REFS_SOFT_LIMIT
    ? `Reference tray has ${generationReferences.length} images (soft limit ${GENERATION_REFS_SOFT_LIMIT}). All are kept — staging may require reducing before OpenArt.`
    : null;
  state = {
    ...state,
    generationReferences,
    generationReferencesWarning: warning,
  };
  emit();
  return state;
}

export function removeGenerationReference(id) {
  const next = state.generationReferences.filter((r) => r.id !== String(id));
  const warning = next.length > GENERATION_REFS_SOFT_LIMIT
    ? state.generationReferencesWarning
    : null;
  state = {
    ...state,
    generationReferences: next,
    generationReferencesWarning: warning,
  };
  emit();
  return state;
}

export function reorderGenerationReferences(fromIndex, toIndex) {
  const list = [...state.generationReferences];
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (
    !Number.isInteger(from) || !Number.isInteger(to)
    || from < 0 || to < 0
    || from >= list.length || to >= list.length
    || from === to
  ) {
    return state;
  }
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  state = { ...state, generationReferences: list };
  emit();
  return state;
}

export function clearGenerationReferences() {
  state = {
    ...state,
    generationReferences: [],
    generationReferencesWarning: null,
  };
  emit();
  return state;
}

export function setGenerationReferences(items) {
  const generationReferences = (Array.isArray(items) ? items : [])
    .map(normalizeRefItem)
    .filter(Boolean);
  // Dedupe preserving order
  const seen = new Set();
  const deduped = [];
  for (const item of generationReferences) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  const warning = deduped.length > GENERATION_REFS_SOFT_LIMIT
    ? `Reference tray has ${deduped.length} images (soft limit ${GENERATION_REFS_SOFT_LIMIT}). All are kept — staging may require reducing before OpenArt.`
    : null;
  state = {
    ...state,
    generationReferences: deduped,
    generationReferencesWarning: warning,
  };
  emit();
  return state;
}

export function clearGenerationReferencesWarning() {
  if (!state.generationReferencesWarning) return state;
  state = { ...state, generationReferencesWarning: null };
  emit();
  return state;
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

export function setSelectedRegion(region) {
  state = { ...state, selectedRegion: normalizeRegion(region) };
  emit();
  return state;
}

export function clearSelectedRegion() {
  if (!state.selectedRegion) return state;
  return setSelectedRegion(null);
}

export function setSelectedPromptTemplateId(id) {
  state = {
    ...state,
    selectedPromptTemplateId: id != null && id !== '' ? String(id) : null,
  };
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

export function setLibraryThumbSize(size) {
  state = { ...state, libraryThumbSize: clampLibraryThumbSize(size) };
  emit();
  return state;
}

/** @deprecated Use setResultsThumbSize */
export function setResultsPreviewSize(size) {
  return setResultsThumbSize(size);
}

export function __testResetAiAssetsUi() {
  state = emptyUiState();
  emit();
}

if (typeof window !== 'undefined') {
  window.__bloodboundAiAssetsUi = {
    get: getAiAssetsUiState,
    select: selectAiProvider,
    setSection: setAiAssetsSection,
    setConceptSaveTarget: setConceptSaveTargetAreaId,
    setArtSaveTargetFolder,
    setGenerationOrigin,
    clearGenerationOrigin,
    addGenerationReferences,
    removeGenerationReference,
    reorderGenerationReferences,
    clearGenerationReferences,
    setGenerationReferences,
    setPromptComposition,
    resetPromptComposition,
    setSelectedRegion,
    clearSelectedRegion,
    setSelectedPromptTemplateId,
    setResultsThumbSize,
    setLibraryThumbSize,
    setResultsPreviewSize,
    reset: __testResetAiAssetsUi,
  };
}
