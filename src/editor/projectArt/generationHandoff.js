/**
 * Project Art → Asset Generation handoff helpers.
 * Keeps the library free of generation-construction UI while reusing OpenArt seeding.
 */
import { uploadOpenArtReference } from '../../io/openArtClient.js';
import { projectArtImageUrl } from '../../io/projectArtClient.js';
import {
  materializeSelectedGoogleDriveItem,
  projectArtFullImageUrl,
} from './projectArtStore.js';
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
import {
  assembleRegionTemplatePrompt,
  describeRegionCoords,
  getPromptTemplate,
} from './promptTemplates.js';
import { projectArtStageReferences } from './projectArtStore.js';

/** Default template for region → asset handoffs when none is selected. */
export const DEFAULT_REGION_TEMPLATE_ID = 'wall_texture';

/**
 * Add selected library items to the persistent generation reference tray.
 * Does not change the OpenArt prompt.
 */
export function addItemsAsGenerationReferences(items = []) {
  const list = (Array.isArray(items) ? items : [])
    .filter((i) => i?.id && (i?.relativePath || i?.source === 'gdrive'))
    .map((i) => ({
      id: i.id,
      relativePath: i.relativePath || null,
      title: i.title || i.relativePath || i.driveFileId || i.id,
      source: i.source || 'project-art',
      driveFileId: i.driveFileId || null,
      driveLibraryId: i.driveLibraryId || null,
      provenance: i.provenance || null,
    }));
  if (!list.length) return { added: 0 };
  addGenerationReferences(list);
  return { added: list.length };
}

/** Ensure Drive images are on local disk before OpenArt/Meshy staging. */
async function ensureLocalFileForItem(item) {
  if (!item) return null;
  if (item.source === 'gdrive' || (!item.relativePath && item.driveFileId)) {
    const { item: localItem, materialize } = await materializeSelectedGoogleDriveItem(item);
    return { item: localItem, materialize };
  }
  return { item, materialize: null };
}

/**
 * Resolve which prompt template drives a region handoff.
 * Prefer an explicit id, then the Asset Generation selection — never the
 * source concept's provenance category (that describes the old image).
 */
export function resolveRegionTemplateId(templateId = null) {
  const selected = getAiAssetsUiState().selectedPromptTemplateId;
  const tid = [templateId, selected, DEFAULT_REGION_TEMPLATE_ID]
    .find((id) => id && getPromptTemplate(id));
  return tid || DEFAULT_REGION_TEMPLATE_ID;
}

/**
 * Build the OpenArt prompt body for a region handoff.
 * Tiling language is intentionally omitted here — checkbox composition
 * appends it at estimate/generate time via composeGenerationPrompt.
 */
export function composeRegionHandoffPrompt({
  templateId,
  region,
  itemTitle = '',
  instruction = '',
} = {}) {
  const tid = resolveRegionTemplateId(templateId);
  const regionDescription = [
    region?.description,
    region ? describeRegionCoords(region) : '',
  ].filter(Boolean).join('; ');
  const assembled = assembleRegionTemplatePrompt({
    templateId: tid,
    regionDescription,
    instruction,
    itemTitle,
    tileHorizontal: false,
    tileVertical: false,
    includeTiling: false,
    referenceTitles: [],
  });
  return {
    templateId: tid,
    promptText: String(assembled.promptText || '').trim(),
    notes: assembled.notes || [],
  };
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
  // Prompt is optional here — Asset Generation / OpenArt validate at estimate/generate.
  // Transfer any saved prompt when present; otherwise seed an empty prompt so the
  // designer can pick a template or type one in Asset Generation.
  const text = String(promptText || '').trim();

  const toRef = (r) => ({
    id: r.id,
    relativePath: r.relativePath || null,
    title: r.title || r.relativePath || r.driveFileId || r.id,
    source: r.source || null,
    driveFileId: r.driveFileId || null,
    driveLibraryId: r.driveLibraryId || null,
    provenance: r.provenance || null,
  });

  let refs = Array.isArray(trayRefs)
    ? trayRefs.map(toRef).filter((r) => r.id)
    : [...(getAiAssetsUiState().generationReferences || [])];

  if (!refs.length && items.length) {
    addItemsAsGenerationReferences(items);
    refs = items.map(toRef).filter((r) => r.id);
  }
  if (!refs.length) {
    const err = new Error('Select an image before sending to Asset Generation');
    err.code = 'NO_ITEM';
    throw err;
  }
  setGenerationReferences(refs);

  setPromptComposition({
    tileHorizontal: Boolean(tileHorizontal),
    tileVertical: Boolean(tileVertical),
  });

  const origin = createArtGenerationOrigin({
    itemIds: refs.map((r) => r.id),
    promptId,
    finalPrompt: text || null,
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
 *
 * When `stagedReference` is provided (region crop), that file is the only
 * OpenArt --image path. Tray items stay library pins and are not re-staged.
 */
export async function seedGenerationWorkspace({
  text,
  refs,
  origin,
  folderPath,
  stageIds = null,
  stagedReference = null,
} = {}) {
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
    const firstRef = refs[0];
    const isDrive = firstRef?.source === 'gdrive' || Boolean(firstRef?.driveFileId);
    try {
      if (isDrive) {
        const ensured = await ensureLocalFileForItem(firstRef);
        // Prefer project-art cache path after materialize (never ephemeral Drive URLs).
        const url = projectArtImageUrl(ensured.item.relativePath)
          || projectArtFullImageUrl(ensured.item);
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File(
          [blob],
          `${firstRef.title || 'drive-reference'}.png`,
          { type: blob.type || 'image/png' },
        );
        const uploaded = await uploadOpenArtReference(file);
        referenceFileName = uploaded.originalName || file.name;
        referenceStagingPath = uploaded.absolutePath;
        referenceStagingId = uploaded.stagingId || null;
        mode = preferReferenceMode({
          availableModes,
          currentMode: oa.mode,
          hasReference: true,
        });
      } else {
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

  const hasPrompt = Boolean(String(text || '').trim());
  return {
    ok: true,
    stagedRefs: Boolean(referenceStagingPath),
    mode: mode || getOpenArtUiState().mode,
    prompt: text,
    referenceStagingPath,
    referenceStagingId,
    referenceFileName,
    message: referenceStagingPath
      ? (hasPrompt
        ? 'OpenArt seeded with Project Art references — estimate before spending'
        : 'Reference staged — choose a template or enter a prompt, then estimate')
      : (hasPrompt
        ? 'OpenArt seeded from Project Art — estimate before spending'
        : 'Opened Asset Generation — choose a template or enter a prompt, then estimate'),
  };
}

/**
 * Send a selected region of a Project Art item to Asset Generation.
 *
 * - Crops the region and stages it as the sole OpenArt --image reference.
 * - Does NOT carry the source concept's generation prompt.
 * - Auto-composes a template prompt (default Wall Texture) so Compose Prompt
 *   is optional recomposition, not a mandatory pre-generate step.
 * - Tiling comes from template suggestedDefaults / checkboxes — not concept provenance.
 * - Does not estimate or spend credits.
 *
 * @returns {Promise<object>}
 */
export async function sendRegionToGeneration({
  item,
  region,
  templateId = null,
  instruction = '',
  tileHorizontal,
  tileVertical,
  folderPath = '',
  promptId = null,
} = {}) {
  if (!item?.id || (!item?.relativePath && item?.source !== 'gdrive')) {
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

  // Tray provenance only — OpenArt --image uses the crop below, not these full images.
  addItemsAsGenerationReferences([item]);
  const tray = getAiAssetsUiState().generationReferences || [];
  const source = tray.find((r) => r.id === item.id);
  const refs = [source, ...tray.filter((r) => r.id !== item.id)].filter(Boolean);
  setGenerationReferences(refs);

  const tid = resolveRegionTemplateId(templateId);
  setSelectedPromptTemplateId(tid);
  const tpl = getPromptTemplate(tid);

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

  // Never seed the concept's original generation prompt into a region asset request.
  const composed = composeRegionHandoffPrompt({
    templateId: tid,
    region: stored,
    itemTitle: item.title || '',
    instruction,
  });
  const text = composed.promptText;
  if (!text) {
    const err = new Error('Could not compose a template prompt for the selected region');
    err.code = 'EMPTY_PROMPT';
    throw err;
  }

  const ensured = await ensureLocalFileForItem(item);
  const localItem = ensured?.item || item;
  const imageUrl = projectArtImageUrl(localItem.relativePath)
    || projectArtFullImageUrl(localItem)
    || projectArtImageUrl(item.relativePath);
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
    driveFileId: item.driveFileId || null,
    sourceFolder: item.provenance?.driveLibraryName || item.provenance?.driveFolderId || null,
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
    templateId: tid,
    croppedReference,
    promptSource: 'template',
    message: res.stagedRefs
      ? `Cropped region staged with ${tpl?.label || tid} prompt — estimate before spending`
      : `Region sent with ${tpl?.label || tid} prompt — estimate before spending`,
  };
}

/**
 * Send a Project Art image (or crop file) to Meshy without starting generation.
 * Does not estimate or spend credits.
 */
export async function sendProjectArtToMeshy({
  item = null,
  items = [],
  region = null,
  folderPath = '',
  openArtAssociation = null,
} = {}) {
  const primary = item || items[0];
  if (!primary?.relativePath && !primary?.id) {
    const err = new Error('Select an image to send to Meshy');
    err.code = 'NO_ITEM';
    throw err;
  }

  const { uploadMeshyReference } = await import('../../io/meshyClient.js');
  const {
    meshyApplySeed,
    meshyConnect,
    meshyApplyPreset,
  } = await import('../meshy/meshyUiStore.js');
  const { GAME_PROP_PRESET } = await import('../../dev/meshy/meshyModels.js');

  let file;
  let provenance = {
    projectArtItemId: primary.id,
    relativePath: primary.relativePath,
    title: primary.title || primary.relativePath,
    folderPath: folderPath || '',
    openArtAssociation: openArtAssociation || null,
  };

  if (region && primary) {
    const ensured = await ensureLocalFileForItem(primary);
    const localItem = ensured?.item || primary;
    const imageUrl = projectArtImageUrl(localItem.relativePath)
      || projectArtFullImageUrl(localItem)
      || projectArtImageUrl(primary.relativePath);
    const cropFile = await cropImageRegionToFile({
      imageUrl,
      region,
      fileName: `${(primary.title || 'region').replace(/[^\w.-]+/g, '_').slice(0, 48)}-meshy.png`,
    });
    file = cropFile;
    provenance = {
      ...provenance,
      ...(localItem.provenance || primary.provenance || {}),
      region: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
      sourceConceptPath: localItem.relativePath || primary.relativePath || null,
      driveFileId: primary.driveFileId || null,
    };
  } else {
    const ensured = await ensureLocalFileForItem(primary);
    const url = projectArtImageUrl(ensured.item.relativePath)
      || projectArtFullImageUrl(ensured.item);
    const res = await fetch(url);
    const blob = await res.blob();
    file = new File(
      [blob],
      `${primary.title || 'reference'}.png`,
      { type: blob.type || 'image/png' },
    );
    provenance = {
      ...provenance,
      ...(ensured.item.provenance || {}),
      driveFileId: primary.driveFileId || null,
      relativePath: ensured.item.relativePath || primary.relativePath,
    };
  }

  selectAiProvider('meshy');
  setAiAssetsSection('generation');
  setArtSaveTargetFolder(folderPath || '');
  setConceptSaveTargetAreaId(null);

  await meshyConnect().catch(() => {});
  meshyApplyPreset(GAME_PROP_PRESET);
  const uploaded = await uploadMeshyReference(file);
  meshyApplySeed({
    reference: {
      stagingPath: uploaded.relativePath,
      previewUrl: uploaded.previewUrl,
      title: primary.title || file.name,
      source: region ? 'project-art-region' : 'project-art',
      provenance,
    },
    settings: { ...GAME_PROP_PRESET },
    provenance,
  });

  return {
    ok: true,
    message: 'Sent to Meshy — configure settings and estimate before spending',
    stagingPath: uploaded.relativePath,
  };
}

/**
 * Send an approved OpenArt result (or its staging preview) to Meshy.
 * Does not start Meshy generation.
 */
export async function sendOpenArtResultToMeshy({
  previewUrl,
  title = 'OpenArt reference',
  provenance = null,
} = {}) {
  if (!previewUrl) {
    const err = new Error('No OpenArt result image to send to Meshy');
    err.code = 'NO_RESULT';
    throw err;
  }
  const { uploadMeshyReference } = await import('../../io/meshyClient.js');
  const {
    meshyApplySeed,
    meshyConnect,
    meshyApplyPreset,
  } = await import('../meshy/meshyUiStore.js');
  const { GAME_PROP_PRESET } = await import('../../dev/meshy/meshyModels.js');

  const res = await fetch(previewUrl);
  const blob = await res.blob();
  const file = new File([blob], `${title}.png`, { type: blob.type || 'image/png' });

  selectAiProvider('meshy');
  setAiAssetsSection('generation');

  await meshyConnect().catch(() => {});
  meshyApplyPreset(GAME_PROP_PRESET);
  const uploaded = await uploadMeshyReference(file);
  const prov = {
    ...(provenance || {}),
    openArtPreviewUrl: previewUrl,
    title,
  };
  meshyApplySeed({
    reference: {
      stagingPath: uploaded.relativePath,
      previewUrl: uploaded.previewUrl,
      title,
      source: 'openart-result',
      provenance: prov,
    },
    settings: { ...GAME_PROP_PRESET },
    provenance: prov,
  });

  return {
    ok: true,
    message: 'OpenArt result sent to Meshy — estimate before spending',
  };
}
