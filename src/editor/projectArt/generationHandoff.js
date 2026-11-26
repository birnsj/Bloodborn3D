/**
 * Project Art → Asset Generation handoff helpers.
 * Keeps the library free of generation-construction UI while reusing OpenArt seeding.
 */
import { uploadOpenArtReference } from '../../io/openArtClient.js';
import { projectArtImageUrl } from '../../io/projectArtClient.js';
import {
  addGenerationReferences,
  selectAiProvider,
  setAiAssetsSection,
  setArtSaveTargetFolder,
  setConceptSaveTargetAreaId,
  setGenerationOrigin,
  setGenerationReferences,
  setPromptComposition,
  setSelectedPromptTemplateId,
  setSelectedRegion,
  getAiAssetsUiState,
} from '../aiAssets/aiAssetsUiStore.js';
import {
  getOpenArtUiState,
  openArtApplySeed,
  openArtConnect,
  openArtSetReference,
} from '../openart/openArtUiStore.js';
import { cropImageRegionToFile } from './cropRegionImage.js';
import {
  createArtGenerationOrigin,
  openArtSupportsReferenceImages,
  preferReferenceMode,
  resolveOpenArtMaxRefs,
} from './generation.js';
import { getPromptTemplate } from './promptTemplates.js';
import { projectArtStageReferences } from './projectArtStore.js';

/**
 * Add selected library items to the persistent generation reference tray.
 * Does not change the OpenArt prompt.
 */
export function addItemsAsGenerationReferences(items = []) {
  const list = (Array.isArray(items) ? items : [])
    .filter((i) => i?.id && i?.relativePath)
    .map((i) => ({
      id: i.id,
      relativePath: i.relativePath,
      title: i.title || i.relativePath,
    }));
  if (!list.length) return { added: 0 };
  addGenerationReferences(list);
  return { added: list.length };
}

/**
 * Seed Asset Generation from a Project Art working prompt + references.
 * Does not estimate or spend credits.
 *
 * @returns {Promise<{ ok: boolean, stagedRefs: boolean, message?: string }>}
 */
export async function sendProjectArtToGeneration({
  promptText,
  items = [],
  trayRefs = null,
  folderPath = '',
  promptId = null,
  assetCategory = null,
  tileHorizontal = false,
  tileVertical = false,
} = {}) {
  const text = String(promptText || '').trim();
  if (!text) {
    const err = new Error('Create or enter a prompt before sending to Asset Generation');
    err.code = 'EMPTY_PROMPT';
    throw err;
  }

  let refs = Array.isArray(trayRefs)
    ? trayRefs.map((r) => ({
      id: r.id,
      relativePath: r.relativePath,
      title: r.title || r.relativePath,
    }))
    : [...(getAiAssetsUiState().generationReferences || [])];

  if (!refs.length && items.length) {
    addItemsAsGenerationReferences(items);
    refs = items.map((i) => ({
      id: i.id,
      relativePath: i.relativePath,
      title: i.title || i.relativePath,
    }));
  }
  setGenerationReferences(refs);

  setPromptComposition({
    tileHorizontal: Boolean(tileHorizontal),
    tileVertical: Boolean(tileVertical),
  });

  const origin = createArtGenerationOrigin({
    itemIds: refs.map((r) => r.id),
    promptId,
    finalPrompt: text,
    assetCategory: assetCategory || null,
    tileHorizontal,
    tileVertical,
    folderPath: folderPath || '',
  });
  return seedGenerationWorkspace({ text, refs, origin, folderPath });
}

/**
 * Shared tail of both handoffs: set origin, switch to Asset Generation, seed
 * OpenArt, and stage the first reference when the model supports it.
 */
async function seedGenerationWorkspace({
  text,
  refs,
  origin,
  folderPath,
  stageIds = null,
  stagedReference = null,
}) {
  setGenerationOrigin(origin);
  setConceptSaveTargetAreaId(null);
  setArtSaveTargetFolder(folderPath || '');
  selectAiProvider('openart');

  // Connect + stage references BEFORE switching the UI section so Asset
  // Generation's mount/connect cannot race and reset mode/reference mid-seed.
  await openArtConnect().catch(() => {});
  await openArtApplySeed({ prompt: text });

  const oa = getOpenArtUiState();
  const model = oa.imageModels.find((m) => m.id === oa.modelId);
  const availableModes = model?.modes?.image || [{ mode: 'text2image' }];
  const schemaProperties = oa.form?.jsonSchema?.properties || {};
  const supportsRefs = openArtSupportsReferenceImages({
    mode: oa.mode,
    schemaProperties,
    availableModes,
  }) || Boolean(stagedReference?.absolutePath);

  let referenceFileName = null;
  let referenceStagingPath = null;
  let referenceStagingId = null;
  let mode = null;

  if (supportsRefs && stagedReference?.absolutePath) {
    referenceFileName = stagedReference.originalName
      || stagedReference.fileName
      || 'region-reference.png';
    referenceStagingPath = stagedReference.absolutePath;
    referenceStagingId = stagedReference.stagingId || null;
    mode = preferReferenceMode({
      availableModes,
      currentMode: oa.mode,
      hasReference: true,
    });
  } else if (supportsRefs && refs.length) {
    const maxRefs = resolveOpenArtMaxRefs({ schemaProperties });
    try {
      const staged = await projectArtStageReferences({
        itemIds: stageIds || refs.map((r) => r.id),
        maxRefs,
      });
      const first = staged.staged?.[0];
      if (first) {
        referenceFileName = first.originalName || first.fileName || 'art-reference';
        referenceStagingPath = first.absolutePath;
        referenceStagingId = first.stagingId || null;
        mode = preferReferenceMode({
          availableModes,
          currentMode: oa.mode,
          hasReference: true,
        });
      }
    } catch (err) {
      if (err.code === 'REF_LIMIT') {
        const dropped = err.dropped || [];
        const names = dropped.map((d) => d.title || d.id).join(', ');
        const limitErr = new Error(
          `Too many references for this model (max ${maxRefs}). Would drop: ${names || 'unknown'}. Reduce the tray and try again — nothing was discarded silently.`,
        );
        limitErr.code = 'REF_LIMIT';
        throw limitErr;
      }
      throw err;
    }
  }

  if (referenceStagingPath || mode) {
    await openArtApplySeed({
      prompt: text,
      mode,
      referenceFileName,
      referenceStagingPath,
      referenceStagingId,
    });
  }
  if (!referenceStagingPath) openArtSetReference({});

  setAiAssetsSection('generation');

  return {
    ok: true,
    stagedRefs: Boolean(referenceStagingPath),
    message: referenceStagingPath
      ? 'OpenArt seeded with Project Art references — estimate before spending'
      : 'OpenArt seeded from Project Art — estimate before spending',
  };
}

/**
 * Send a selected region of a Project Art item to Asset Generation.
 * Crops the region and stages it as the OpenArt --image reference so Nano Banana 2
 * can interpret material / surface details directly (no separate vision analysis).
 * Region coordinates, source image, template and crop staging metadata travel in
 * generationOrigin. Does not estimate or spend credits.
 *
 * @returns {Promise<{ ok: boolean, stagedRefs: boolean, message?: string }>}
 */
export async function sendRegionToGeneration({
  item,
  region,
  promptText = '',
  templateId = null,
  tileHorizontal,
  tileVertical,
  folderPath = '',
  promptId = null,
} = {}) {
  if (!item?.id || !item?.relativePath) {
    const err = new Error('Select an image before sending a region');
    err.code = 'NO_ITEM';
    throw err;
  }
  setSelectedRegion(region);
  const stored = getAiAssetsUiState().selectedRegion;
  if (!stored || stored.itemId !== item.id) {
    const err = new Error('Draw a region on the preview before sending');
    err.code = 'NO_REGION';
    throw err;
  }

  addItemsAsGenerationReferences([item]);
  // The region's source image goes first in the tray (provenance of the crop).
  const tray = getAiAssetsUiState().generationReferences || [];
  const source = tray.find((r) => r.id === item.id);
  const refs = [source, ...tray.filter((r) => r.id !== item.id)].filter(Boolean);
  setGenerationReferences(refs);

  const tid = templateId && getPromptTemplate(templateId) ? templateId : null;
  if (tid) setSelectedPromptTemplateId(tid);

  const tpl = tid ? getPromptTemplate(tid) : null;
  const tilingPatch = {};
  if (typeof tileHorizontal === 'boolean') tilingPatch.tileHorizontal = tileHorizontal;
  else if (typeof tpl?.suggestedDefaults?.tileHorizontal === 'boolean') {
    tilingPatch.tileHorizontal = tpl.suggestedDefaults.tileHorizontal;
  }
  if (typeof tileVertical === 'boolean') tilingPatch.tileVertical = tileVertical;
  else if (typeof tpl?.suggestedDefaults?.tileVertical === 'boolean') {
    tilingPatch.tileVertical = tpl.suggestedDefaults.tileVertical;
  }
  if (Object.keys(tilingPatch).length) setPromptComposition(tilingPatch);
  const composition = getAiAssetsUiState().promptComposition || {};

  // Keep any prompt already in OpenArt when the item has none; Asset Generation
  // composes a template prompt on demand via Compose Prompt.
  const text = String(promptText || '').trim() || getOpenArtUiState().prompt || '';

  const imageUrl = projectArtImageUrl(item.relativePath);
  const cropFile = await cropImageRegionToFile({
    imageUrl,
    region: stored,
    fileName: `${(item.title || 'region').replace(/[^\w.-]+/g, '_').slice(0, 48)}-crop.png`,
  });
  const uploaded = await uploadOpenArtReference(cropFile);
  const croppedReference = {
    stagingId: uploaded.stagingId || null,
    fileName: uploaded.fileName || null,
    originalName: uploaded.originalName || cropFile.name,
    absolutePath: uploaded.absolutePath || null,
    sourceItemId: item.id,
  };

  const origin = createArtGenerationOrigin({
    itemIds: refs.map((r) => r.id),
    promptId,
    finalPrompt: text,
    assetCategory: tid,
    tileHorizontal: composition.tileHorizontal,
    tileVertical: composition.tileVertical,
    folderPath: folderPath || '',
    promptTemplateId: tid,
    sourceRegion: stored,
    sourceItemId: item.id,
    croppedReference,
  });
  const res = await seedGenerationWorkspace({
    text,
    refs,
    origin,
    folderPath,
    stagedReference: croppedReference,
  });
  return {
    ...res,
    message: res.stagedRefs
      ? 'Cropped region staged as image reference — Compose Prompt, then estimate before spending'
      : 'Region sent to Asset Generation — Compose Prompt, then estimate before spending',
  };
}
