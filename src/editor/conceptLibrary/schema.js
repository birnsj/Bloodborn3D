/**
 * Phase 2H.1D — Concept Library schema (areas, concepts, reusable prompts).
 * Authoritative DB is project-local JSON via `/api/concept-library` — not localStorage.
 */

export const CONCEPT_LIBRARY_SCHEMA_VERSION = 1;
export const MAX_CONCEPTS_PER_AREA = 10;

export const PROMPT_CATEGORIES = [
  { id: 'environment', label: 'Environment concepts' },
  { id: 'architecture', label: 'Architectural elements' },
  { id: 'surface', label: 'Surface textures' },
  { id: 'doors_windows', label: 'Doors and windows' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'decorative', label: 'Decorative objects' },
  { id: 'props', label: 'Props' },
  { id: 'lighting', label: 'Lighting fixtures' },
  { id: 'characters', label: 'Characters' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'other', label: 'Other' },
];

export const PROMPT_CATEGORY_IDS = PROMPT_CATEGORIES.map((c) => c.id);

export function createEmptyLibrary() {
  return {
    schemaVersion: CONCEPT_LIBRARY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    areas: [],
    concepts: [],
    prompts: [],
  };
}

export function createArea({ id, name = 'New Area', description = '', artDirection = '' } = {}) {
  const now = new Date().toISOString();
  return {
    id,
    name: String(name || 'New Area').trim() || 'New Area',
    description: String(description || ''),
    artDirection: String(artDirection || ''),
    conceptOrder: [],
    primaryConceptId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createConcept({
  id,
  areaId,
  title = 'Untitled concept',
  imagePath = '',
  description = '',
  generationPrompt = '',
  architecturalStyle = '',
  materials = '',
  colorPalette = '',
  lighting = '',
  atmosphere = '',
  distinctiveElements = '',
  tags = [],
  provenance = null,
  associatedPromptIds = [],
  generatedAssetRefs = [],
} = {}) {
  const now = new Date().toISOString();
  return {
    id,
    areaId,
    title: String(title || 'Untitled concept').trim() || 'Untitled concept',
    imagePath: String(imagePath || ''),
    description: String(description || ''),
    generationPrompt: String(generationPrompt || ''),
    architecturalStyle: String(architecturalStyle || ''),
    materials: String(materials || ''),
    colorPalette: String(colorPalette || ''),
    lighting: String(lighting || ''),
    atmosphere: String(atmosphere || ''),
    distinctiveElements: String(distinctiveElements || ''),
    tags: normalizeTags(tags),
    provenance: provenance && typeof provenance === 'object' ? { ...provenance } : null,
    associatedPromptIds: Array.isArray(associatedPromptIds) ? [...associatedPromptIds] : [],
    generatedAssetRefs: Array.isArray(generatedAssetRefs) ? [...generatedAssetRefs] : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createPrompt({
  id,
  areaId = null,
  conceptIds = [],
  name = 'New prompt',
  category = 'other',
  promptText = '',
  negativePrompt = '',
  preferredProvider = 'openart',
  preferredModel = '',
  generationParams = {},
  tags = [],
} = {}) {
  const now = new Date().toISOString();
  const cat = PROMPT_CATEGORY_IDS.includes(category) ? category : 'other';
  return {
    id,
    areaId: areaId || null,
    conceptIds: Array.isArray(conceptIds) ? [...conceptIds] : [],
    name: String(name || 'New prompt').trim() || 'New prompt',
    category: cat,
    promptText: String(promptText || ''),
    negativePrompt: String(negativePrompt || ''),
    preferredProvider: String(preferredProvider || 'openart'),
    preferredModel: String(preferredModel || ''),
    generationParams: generationParams && typeof generationParams === 'object'
      ? { ...generationParams }
      : {},
    tags: normalizeTags(tags),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

/**
 * Normalize / migrate a raw library document. Never invent vision analysis results.
 */
export function normalizeLibrary(raw) {
  const base = createEmptyLibrary();
  if (!raw || typeof raw !== 'object') return base;

  const areas = Array.isArray(raw.areas)
    ? raw.areas.map((a) => normalizeArea(a)).filter(Boolean)
    : [];
  const areaIds = new Set(areas.map((a) => a.id));

  const concepts = Array.isArray(raw.concepts)
    ? raw.concepts.map((c) => normalizeConcept(c)).filter((c) => c && areaIds.has(c.areaId))
    : [];
  const conceptIds = new Set(concepts.map((c) => c.id));

  const prompts = Array.isArray(raw.prompts)
    ? raw.prompts.map((p) => normalizePrompt(p)).filter((p) => {
      if (!p) return false;
      if (p.areaId && !areaIds.has(p.areaId)) return false;
      p.conceptIds = p.conceptIds.filter((id) => conceptIds.has(id));
      return true;
    })
    : [];

  // Repair area conceptOrder / primary against surviving concepts.
  for (const area of areas) {
    const inArea = concepts.filter((c) => c.areaId === area.id).map((c) => c.id);
    const inAreaSet = new Set(inArea);
    const deduped = [];
    for (const id of area.conceptOrder || []) {
      if (!inAreaSet.has(id) || deduped.includes(id)) continue;
      deduped.push(id);
    }
    for (const id of inArea) {
      if (!deduped.includes(id)) deduped.push(id);
    }
    area.conceptOrder = deduped.slice(0, MAX_CONCEPTS_PER_AREA);
    if (area.primaryConceptId && !inAreaSet.has(area.primaryConceptId)) {
      area.primaryConceptId = area.conceptOrder[0] || null;
    }
  }

  return {
    schemaVersion: CONCEPT_LIBRARY_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    areas,
    concepts: concepts.filter((c) => {
      const area = areas.find((a) => a.id === c.areaId);
      return area && area.conceptOrder.includes(c.id);
    }),
    prompts,
  };
}

function normalizeArea(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const area = createArea({
    id: raw.id,
    name: raw.name,
    description: raw.description,
    artDirection: raw.artDirection,
  });
  area.conceptOrder = Array.isArray(raw.conceptOrder) ? raw.conceptOrder.map(String) : [];
  area.primaryConceptId = raw.primaryConceptId ? String(raw.primaryConceptId) : null;
  area.createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : area.createdAt;
  area.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : area.updatedAt;
  return area;
}

function normalizeConcept(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.areaId !== 'string' || !raw.areaId.trim()) return null;
  const concept = createConcept({ ...raw, id: raw.id, areaId: raw.areaId });
  concept.createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : concept.createdAt;
  concept.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : concept.updatedAt;
  return concept;
}

function normalizePrompt(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const prompt = createPrompt({ ...raw, id: raw.id });
  prompt.createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : prompt.createdAt;
  prompt.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : prompt.updatedAt;
  return prompt;
}

/** Relative path under concept-library/ for serving + persistence. */
export function conceptImageRelativePath(areaId, conceptId, ext = '.png') {
  const safeExt = /^\.[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : '.png';
  return `images/${areaId}/${conceptId}${safeExt}`;
}
