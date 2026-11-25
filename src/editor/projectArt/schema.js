/**
 * Project Art Library schema v2 (filesystem browser + metadata).
 * Authoritative DB: project-art/.bb-art/library.json
 */

import {
  normalizeLibrary as normalizeConceptLibrary,
} from '../conceptLibrary/schema.js';

export const PROJECT_ART_SCHEMA_VERSION = 2;

/** Default folders created on first ensureRoot(). */
export const DEFAULT_FOLDER_TREE = Object.freeze([
  'Environments/Mansion/Concepts',
  'Environments/Mansion/References',
  'Environments/Mansion/Textures',
  'Environments/Mansion/Materials',
  'Environments/Mansion/Meshes',
  'Environments/Catacombs/Concepts',
  'Environments/Catacombs/References',
  'Environments/Catacombs/Textures',
  'Environments/Catacombs/Materials',
  'Environments/Catacombs/Meshes',
  'Characters',
  'Weapons',
  'Shared Assets',
]);

export const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const CONCEPT_CATEGORY_TO_ASSET = Object.freeze({
  environment: 'environment_concept',
  architecture: 'architectural_element',
  surface: 'wall_texture',
  doors_windows: 'door_window',
  furniture: 'furniture',
  decorative: 'decorative_object',
  props: 'prop',
  lighting: 'lighting_fixture',
  characters: 'character',
  weapons: 'weapon',
  other: 'other',
});

export function createEmptyLibrary() {
  return {
    schemaVersion: PROJECT_ART_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    migratedFrom: null,
    items: [],
    prompts: [],
    collections: [],
    referenceSets: [],
  };
}

export function createArtItem({
  id,
  relativePath = '',
  title = 'Untitled',
  description = '',
  tags = [],
  rating = 0,
  favorite = false,
  generationPrompt = '',
  /** Immutable original submitted prompt (provenance). Editable copy lives in generationPrompt. */
  originalGenerationPrompt = '',
  architecturalStyle = '',
  materials = '',
  colorPalette = '',
  lighting = '',
  atmosphere = '',
  distinctiveElements = '',
  associatedPromptIds = [],
  generatedAssetRefs = [],
  provenance = null,
  createdAt = null,
  updatedAt = null,
} = {}) {
  const now = new Date().toISOString();
  const working = String(generationPrompt || '');
  const original = String(originalGenerationPrompt || working);
  return {
    id: String(id || ''),
    relativePath: toPosixPath(relativePath),
    title: String(title || 'Untitled').trim() || 'Untitled',
    description: String(description || ''),
    tags: normalizeTags(tags),
    rating: clampRating(rating),
    favorite: Boolean(favorite),
    generationPrompt: working,
    originalGenerationPrompt: original,
    architecturalStyle: String(architecturalStyle || ''),
    materials: String(materials || ''),
    colorPalette: String(colorPalette || ''),
    lighting: String(lighting || ''),
    atmosphere: String(atmosphere || ''),
    distinctiveElements: String(distinctiveElements || ''),
    associatedPromptIds: Array.isArray(associatedPromptIds)
      ? associatedPromptIds.map(String)
      : [],
    generatedAssetRefs: normalizeAssetRefs(generatedAssetRefs),
    provenance: provenance && typeof provenance === 'object' ? { ...provenance } : null,
    createdAt: typeof createdAt === 'string' ? createdAt : now,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : now,
  };
}

export function createArtPrompt({
  id,
  name = 'New prompt',
  category = 'other',
  promptText = '',
  negativePrompt = '',
  itemIds = [],
  assetCategory = '',
  tileHorizontal = false,
  tileVertical = false,
  preferredProvider = 'openart',
  preferredModel = '',
  generationParams = {},
  tags = [],
  generatedAssetRefs = [],
  createdAt = null,
  updatedAt = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: String(id || ''),
    name: String(name || 'New prompt').trim() || 'New prompt',
    category: String(category || 'other'),
    promptText: String(promptText || ''),
    negativePrompt: String(negativePrompt || ''),
    itemIds: Array.isArray(itemIds) ? itemIds.map(String) : [],
    assetCategory: String(assetCategory || ''),
    tileHorizontal: Boolean(tileHorizontal),
    tileVertical: Boolean(tileVertical),
    preferredProvider: String(preferredProvider || 'openart'),
    preferredModel: String(preferredModel || ''),
    generationParams: generationParams && typeof generationParams === 'object'
      ? { ...generationParams }
      : {},
    tags: normalizeTags(tags),
    generatedAssetRefs: normalizeAssetRefs(generatedAssetRefs),
    createdAt: typeof createdAt === 'string' ? createdAt : now,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : now,
  };
}

export function createCollection({
  id,
  name = 'New collection',
  itemIds = [],
  createdAt = null,
  updatedAt = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: String(id || ''),
    name: String(name || 'New collection').trim() || 'New collection',
    itemIds: Array.isArray(itemIds) ? itemIds.map(String) : [],
    createdAt: typeof createdAt === 'string' ? createdAt : now,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : now,
  };
}

export function createReferenceSet({
  id,
  name = 'New reference set',
  itemIds = [],
  createdAt = null,
  updatedAt = null,
} = {}) {
  const now = new Date().toISOString();
  return {
    id: String(id || ''),
    name: String(name || 'New reference set').trim() || 'New reference set',
    itemIds: Array.isArray(itemIds) ? itemIds.map(String) : [],
    createdAt: typeof createdAt === 'string' ? createdAt : now,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : now,
  };
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

export function normalizeAssetRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  for (const raw of refs) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.kind) continue;
    out.push({
      id: String(raw.id),
      kind: String(raw.kind),
      name: String(raw.name || raw.id),
      areaId: raw.areaId ? String(raw.areaId) : null,
      conceptId: raw.conceptId ? String(raw.conceptId) : null,
      promptId: raw.promptId ? String(raw.promptId) : null,
      itemId: raw.itemId ? String(raw.itemId) : (raw.conceptId ? String(raw.conceptId) : null),
      attachedAt: typeof raw.attachedAt === 'string' ? raw.attachedAt : null,
    });
  }
  return out;
}

export function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

export function toPosixPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Sanitize a single path segment (folder or file base name). */
export function sanitizePathSegment(name) {
  const cleaned = String(name || 'Untitled')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned || 'Untitled';
}

export function extensionFromPath(filePath) {
  const m = String(filePath || '').match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '.png';
}

export function isImagePath(filePath) {
  const ext = extensionFromPath(filePath);
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Normalize / repair a raw project-art library document.
 */
export function normalizeLibrary(raw) {
  const base = createEmptyLibrary();
  if (!raw || typeof raw !== 'object') return base;

  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => normalizeItem(item)).filter(Boolean)
    : [];
  const itemIds = new Set(items.map((i) => i.id));

  const prompts = Array.isArray(raw.prompts)
    ? raw.prompts.map((p) => normalizePrompt(p)).filter(Boolean).map((p) => {
      p.itemIds = p.itemIds.filter((id) => itemIds.has(id));
      return p;
    })
    : [];

  const collections = Array.isArray(raw.collections)
    ? raw.collections.map((c) => normalizeNamedList(c, createCollection)).filter(Boolean).map((c) => {
      c.itemIds = c.itemIds.filter((id) => itemIds.has(id));
      return c;
    })
    : [];

  const referenceSets = Array.isArray(raw.referenceSets)
    ? raw.referenceSets.map((c) => normalizeNamedList(c, createReferenceSet)).filter(Boolean).map((c) => {
      c.itemIds = c.itemIds.filter((id) => itemIds.has(id));
      return c;
    })
    : [];

  // Repair associatedPromptIds against surviving prompts.
  const promptIds = new Set(prompts.map((p) => p.id));
  for (const item of items) {
    item.associatedPromptIds = item.associatedPromptIds.filter((id) => promptIds.has(id));
  }

  const migratedFrom = raw.migratedFrom === 'concept-library' ? 'concept-library' : null;

  return {
    schemaVersion: PROJECT_ART_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    migratedFrom,
    items,
    prompts,
    collections,
    referenceSets,
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const item = createArtItem({ ...raw, id: raw.id });
  return item;
}

function normalizePrompt(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  return createArtPrompt({ ...raw, id: raw.id });
}

function normalizeNamedList(raw, factory) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  return factory({ ...raw, id: raw.id });
}

/**
 * Migrate concept-library schema v1 → project-art schema v2 (pure data).
 * Returns the new library plus a file-copy plan (API performs the copies).
 *
 * Area → Environments/{sanitizedAreaName}/Concepts/
 * Concept ids preserved as item ids; prompts keep ids and map conceptIds → itemIds.
 */
export function migrateConceptLibraryToProjectArt(conceptLibraryRaw) {
  const source = normalizeConceptLibrary(conceptLibraryRaw);
  const library = createEmptyLibrary();
  library.migratedFrom = 'concept-library';
  const fileCopies = [];
  const usedNamesByDir = new Map();

  const areaById = new Map(source.areas.map((a) => [a.id, a]));

  for (const concept of source.concepts) {
    const area = areaById.get(concept.areaId);
    const areaName = sanitizePathSegment(area?.name || concept.areaId || 'Migrated');
    const folder = `Environments/${areaName}/Concepts`;
    const ext = concept.imagePath ? extensionFromPath(concept.imagePath) : '.png';
    const base = uniqueFileBase(
      folder,
      sanitizePathSegment(concept.title || concept.id),
      usedNamesByDir,
    );
    const fileName = `${base}${ext}`;
    const relativePath = `${folder}/${fileName}`;

    const item = createArtItem({
      id: concept.id,
      relativePath,
      title: concept.title,
      description: concept.description,
      tags: concept.tags,
      generationPrompt: concept.generationPrompt,
      architecturalStyle: concept.architecturalStyle,
      materials: concept.materials,
      colorPalette: concept.colorPalette,
      lighting: concept.lighting,
      atmosphere: concept.atmosphere,
      distinctiveElements: concept.distinctiveElements,
      associatedPromptIds: concept.associatedPromptIds,
      generatedAssetRefs: (concept.generatedAssetRefs || []).map((ref) => ({
        ...ref,
        itemId: concept.id,
      })),
      provenance: concept.provenance,
      createdAt: concept.createdAt,
      updatedAt: concept.updatedAt,
    });
    library.items.push(item);

    if (concept.imagePath) {
      fileCopies.push({
        sourceRelative: toPosixPath(concept.imagePath),
        destRelative: relativePath,
        itemId: concept.id,
      });
    }
  }

  for (const prompt of source.prompts) {
    const assetCategory = CONCEPT_CATEGORY_TO_ASSET[prompt.category] || 'other';
    library.prompts.push(createArtPrompt({
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      promptText: prompt.promptText,
      negativePrompt: prompt.negativePrompt,
      itemIds: [...(prompt.conceptIds || [])],
      assetCategory,
      preferredProvider: prompt.preferredProvider,
      preferredModel: prompt.preferredModel,
      generationParams: prompt.generationParams,
      tags: prompt.tags,
      generatedAssetRefs: (prompt.generatedAssetRefs || []).map((ref) => ({
        ...ref,
        itemId: ref.conceptId || ref.itemId || null,
      })),
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    }));
  }

  return {
    library: normalizeLibrary(library),
    fileCopies,
  };
}

function uniqueFileBase(folder, base, usedNamesByDir) {
  const key = folder;
  if (!usedNamesByDir.has(key)) usedNamesByDir.set(key, new Set());
  const used = usedNamesByDir.get(key);
  let candidate = base;
  let i = 1;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${i}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
