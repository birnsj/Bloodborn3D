/**
 * Project Art → OpenArt asset generation helpers.
 * Thin wrappers extending conceptGeneration for multi-ref origins.
 */
import {
  buildFinalConceptPrompt,
  openArtSupportsReferenceImages,
  preferReferenceMode,
} from '../conceptLibrary/conceptGeneration.js';

export {
  buildFinalConceptPrompt,
  openArtSupportsReferenceImages,
  preferReferenceMode,
};

/**
 * Build a generationOrigin object for Project Art Library launches.
 */
export function createArtGenerationOrigin({
  itemIds = [],
  promptId = null,
  finalPrompt = '',
  assetCategory = null,
  tileHorizontal = false,
  tileVertical = false,
  folderPath = null,
  areaId = null,
  conceptId = null,
  promptTemplateId = null,
  sourceRegion = null,
  sourceItemId = null,
  croppedReference = null,
} = {}) {
  const ids = Array.isArray(itemIds) ? itemIds.map(String).filter(Boolean) : [];
  // Region/template fields are only present for region handoffs.
  const optional = {};
  if (promptTemplateId) optional.promptTemplateId = String(promptTemplateId);
  if (sourceRegion) optional.sourceRegion = sourceRegion;
  if (sourceItemId) optional.sourceItemId = String(sourceItemId);
  if (croppedReference && typeof croppedReference === 'object') {
    optional.croppedReference = {
      stagingId: croppedReference.stagingId ? String(croppedReference.stagingId) : null,
      fileName: croppedReference.fileName ? String(croppedReference.fileName) : null,
      originalName: croppedReference.originalName
        ? String(croppedReference.originalName)
        : null,
      absolutePath: croppedReference.absolutePath
        ? String(croppedReference.absolutePath)
        : null,
      sourceItemId: croppedReference.sourceItemId
        ? String(croppedReference.sourceItemId)
        : null,
    };
  }
  return {
    ...optional,
    areaId: areaId || null,
    conceptId: conceptId || ids[0] || null,
    promptId: promptId || null,
    finalPrompt: String(finalPrompt || ''),
    assetCategory: assetCategory ? String(assetCategory) : null,
    tileHorizontal: Boolean(tileHorizontal),
    tileVertical: Boolean(tileVertical),
    itemIds: ids,
    folderPath: folderPath != null ? String(folderPath) : null,
  };
}

/** Max OpenArt reference images to attempt staging (single path today → 1). */
export function resolveOpenArtMaxRefs({ schemaProperties = {} } = {}) {
  const props = schemaProperties || {};
  if (props.images) {
    const max = Number(props.images.maxItems ?? props.images.maxLength);
    if (Number.isFinite(max) && max > 0) return Math.floor(max);
    return 4;
  }
  if (props.image || props.referenceImage || props.reference) return 1;
  return 1;
}
