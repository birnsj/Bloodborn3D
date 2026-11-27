/**
 * Meshy Image-to-3D model catalog, validation, and credit estimates.
 * Sourced from https://docs.meshy.ai/en/api/{models,pricing,image-to-3d} (Nov 2026).
 *
 * Scope: static environment props and character Image-to-3D.
 * Deprecated geometry model `meshy-7` is intentionally omitted.
 */

export const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';

export const MODEL_TYPES = Object.freeze({
  standard: 'standard',
  smartTopology: 'smart-topology',
});

/** Editor asset category for Image-to-3D (drives Character-only controls). */
export const MESHY_ASSET_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'prop', label: 'Game Prop' }),
  Object.freeze({ id: 'character', label: 'Character' }),
]);

/**
 * Meshy `pose_mode` for characters. Empty string = omit (no pose constraint).
 * Book/API: a-pose | t-pose; leave out for default.
 */
export const MESHY_POSE_MODES = Object.freeze([
  Object.freeze({ id: '', label: 'Default' }),
  Object.freeze({ id: 't-pose', label: 'T-pose' }),
  Object.freeze({ id: 'a-pose', label: 'A-pose' }),
]);

export const MESHY_POSE_MODE_IDS = Object.freeze(
  MESHY_POSE_MODES.map((p) => p.id),
);

/** Geometry models exposed in the editor (non-deprecated). */
export const GEOMETRY_MODELS = Object.freeze([
  {
    id: 'meshy-t2.5',
    label: 'Meshy T2.5',
    modelType: MODEL_TYPES.smartTopology,
    meshCredits: 5,
    polycount: { min: 100, max: 30000, default: 15000 },
    trianglesOnly: true,
  },
  {
    id: 'meshy-t2',
    label: 'Meshy T2',
    modelType: MODEL_TYPES.smartTopology,
    meshCredits: 5,
    polycount: { min: 100, max: 15000, default: 4000 },
    trianglesOnly: true,
  },
  {
    id: 'meshy-7.1',
    label: 'Meshy 7.1',
    modelType: MODEL_TYPES.standard,
    meshCredits: 20,
    polycount: { min: 100, max: 300000, default: 30000 },
    supportsUltra: true,
    trianglesOnly: false,
  },
  {
    id: 'meshy-6',
    label: 'Meshy 6',
    modelType: MODEL_TYPES.standard,
    meshCredits: 20,
    polycount: { min: 100, max: 300000, default: 30000 },
    trianglesOnly: false,
  },
  {
    id: 'meshy-6-lite',
    label: 'Meshy 6 Lite',
    modelType: MODEL_TYPES.standard,
    meshCredits: 5,
    polycount: { min: 100, max: 300000, default: 30000 },
    remeshDefault: true,
    trianglesOnly: false,
  },
]);

export const TEXTURE_MODELS = Object.freeze([
  {
    id: 'meshy-7',
    label: 'Meshy 7',
    supportsPbr: true,
    resolutions: ['2k', '4k', '8k'],
    textureCredits: { '2k': 10, '4k': 10, '8k': 15 },
  },
  {
    id: 'meshy-n1',
    label: 'Meshy N1',
    supportsPbr: false,
    resolutions: ['2k'],
    textureCredits: { '2k': 10 },
  },
  {
    id: 'meshy-6-lite',
    label: 'Meshy 6 Lite',
    supportsPbr: true,
    resolutions: ['2k'],
    textureCredits: { '2k': 10 },
  },
]);

/** Default texture model when the API leaves `texture_model` unset. */
export const DEFAULT_TEXTURE_BY_GEOMETRY = Object.freeze({
  'meshy-7.1': 'meshy-7',
  'meshy-6': 'meshy-6',
  'meshy-6-lite': 'meshy-6-lite',
  'meshy-t2.5': 'meshy-7',
  'meshy-t2': 'meshy-7',
});

/**
 * Initial game-prop preset (Smart Topology + PBR).
 * Book/API: `meshy-n1` cannot enable PBR — use `meshy-7` for PBR maps.
 */
export const GAME_PROP_PRESET = Object.freeze({
  id: 'game-prop',
  label: 'Game Prop (Smart Topology)',
  asset_category: 'prop',
  pose_mode: '',
  include_objects: false,
  model_type: MODEL_TYPES.smartTopology,
  ai_model: 'meshy-t2.5',
  target_polycount: 5000,
  topology: 'triangle',
  should_texture: true,
  enable_pbr: true,
  texture_model: 'meshy-7',
  texture_resolution: '2k',
  texture_prompt: '',
  target_formats: Object.freeze(['glb']),
  should_remesh: false,
  decimation_mode: '',
  save_pre_remeshed_model: false,
  geometry_resolution: 'standard',
  // Omit / false for Smart Topology — API 400 if sent true.
  image_enhancement: null,
  remove_lighting: null,
  auto_size: false,
  origin_at: 'bottom',
  alpha_thumbnail: false,
  multi_view_thumbnails: false,
});

/**
 * Character Image-to-3D preset — same mesh/texture defaults as Game Prop,
 * with Character category controls (pose_mode, include_objects).
 */
export const GAME_CHARACTER_PRESET = Object.freeze({
  id: 'game-character',
  label: 'Game Character (Smart Topology)',
  asset_category: 'character',
  pose_mode: '',
  include_objects: true,
  model_type: MODEL_TYPES.smartTopology,
  ai_model: 'meshy-t2.5',
  target_polycount: 5000,
  topology: 'triangle',
  should_texture: true,
  enable_pbr: true,
  texture_model: 'meshy-7',
  texture_resolution: '2k',
  texture_prompt: '',
  target_formats: Object.freeze(['glb']),
  should_remesh: false,
  decimation_mode: '',
  save_pre_remeshed_model: false,
  geometry_resolution: 'standard',
  image_enhancement: null,
  remove_lighting: null,
  auto_size: false,
  origin_at: 'bottom',
  alpha_thumbnail: false,
  multi_view_thumbnails: false,
});

export function presetForAssetCategory(category) {
  return category === 'character' ? GAME_CHARACTER_PRESET : GAME_PROP_PRESET;
}

export function getGeometryModel(id) {
  return GEOMETRY_MODELS.find((m) => m.id === id) || null;
}

export function getTextureModel(id) {
  return TEXTURE_MODELS.find((m) => m.id === id) || null;
}

export function geometryModelsForType(modelType) {
  return GEOMETRY_MODELS.filter((m) => m.modelType === modelType);
}

/**
 * Texture models valid for the given generation settings.
 * Excludes combinations the API rejects with 400.
 */
export function availableTextureModels({
  shouldTexture = true,
  enablePbr = false,
  textureResolution = '2k',
} = {}) {
  if (!shouldTexture) return [];
  return TEXTURE_MODELS.filter((tm) => {
    if (enablePbr && !tm.supportsPbr) return false;
    if (!tm.resolutions.includes(String(textureResolution || '2k').toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function availableResolutionsForTexture(textureModelId) {
  return getTextureModel(textureModelId)?.resolutions?.slice() || ['2k'];
}

/**
 * Normalize + validate Image-to-3D settings before estimate / submit.
 * @returns {{ ok: true, settings: object } | { ok: false, code: string, error: string }}
 */
export function validateImageTo3dSettings(input = {}) {
  const modelType = input.model_type === MODEL_TYPES.smartTopology
    ? MODEL_TYPES.smartTopology
    : MODEL_TYPES.standard;

  let aiModelId = String(input.ai_model || '').trim();
  if (!aiModelId || aiModelId === 'latest') {
    aiModelId = modelType === MODEL_TYPES.smartTopology ? 'meshy-t2.5' : 'meshy-7.1';
  }
  if (aiModelId === 'meshy-7') {
    return {
      ok: false,
      code: 'DEPRECATED_MODEL',
      error: 'meshy-7 is deprecated for 3D generation — use meshy-7.1 or a Smart Topology model',
    };
  }

  const geo = getGeometryModel(aiModelId);
  if (!geo) {
    return { ok: false, code: 'INVALID_MODEL', error: `Unknown geometry model “${aiModelId}”` };
  }
  if (geo.modelType !== modelType) {
    return {
      ok: false,
      code: 'MODEL_TYPE_MISMATCH',
      error: `${aiModelId} requires model_type “${geo.modelType}”`,
    };
  }

  const shouldTexture = input.should_texture !== false;
  const enablePbr = Boolean(input.enable_pbr);
  if (enablePbr && !shouldTexture) {
    return {
      ok: false,
      code: 'INVALID_PBR',
      error: 'enable_pbr requires should_texture: true',
    };
  }

  let textureModelId = input.texture_model
    ? String(input.texture_model).trim()
    : (shouldTexture ? (DEFAULT_TEXTURE_BY_GEOMETRY[aiModelId] || 'meshy-7') : null);

  // API only allows meshy-6 texture model as default for meshy-6 geometry.
  if (textureModelId === 'meshy-6' && aiModelId !== 'meshy-6') {
    return {
      ok: false,
      code: 'INVALID_TEXTURE_MODEL',
      error: 'texture_model “meshy-6” is only available with ai_model “meshy-6”',
    };
  }

  const textureResolution = String(input.texture_resolution || '2k').toLowerCase();
  if (shouldTexture) {
    const tm = getTextureModel(textureModelId)
      || (textureModelId === 'meshy-6'
        ? { id: 'meshy-6', supportsPbr: true, resolutions: ['2k', '4k', '8k'] }
        : null);
    if (!tm) {
      return {
        ok: false,
        code: 'INVALID_TEXTURE_MODEL',
        error: `Unknown texture model “${textureModelId}”`,
      };
    }
    if (enablePbr && !tm.supportsPbr) {
      return {
        ok: false,
        code: 'INVALID_PBR',
        error: `${textureModelId} does not support PBR maps — use meshy-7 or meshy-6-lite`,
      };
    }
    if (!tm.resolutions.includes(textureResolution)) {
      return {
        ok: false,
        code: 'INVALID_RESOLUTION',
        error: `${textureModelId} does not support texture_resolution “${textureResolution}”`,
      };
    }
  }

  const topology = String(input.topology || 'triangle').toLowerCase();
  if (modelType === MODEL_TYPES.smartTopology && topology !== 'triangle') {
    return {
      ok: false,
      code: 'INVALID_TOPOLOGY',
      error: 'Smart Topology models only support triangle topology',
    };
  }

  let targetPolycount = Number(input.target_polycount);
  if (!Number.isFinite(targetPolycount)) {
    targetPolycount = geo.polycount.default;
  }
  targetPolycount = Math.round(targetPolycount);
  if (targetPolycount < geo.polycount.min || targetPolycount > geo.polycount.max) {
    return {
      ok: false,
      code: 'INVALID_POLYCOUNT',
      error: `target_polycount for ${aiModelId} must be ${geo.polycount.min}–${geo.polycount.max}`,
    };
  }

  const geometryResolution = String(input.geometry_resolution || 'standard').toLowerCase();
  if ((geometryResolution === '2k' || geometryResolution === '4k') && !geo.supportsUltra) {
    return {
      ok: false,
      code: 'INVALID_GEOMETRY_RESOLUTION',
      error: `geometry_resolution “${geometryResolution}” requires meshy-7.1`,
    };
  }
  if ((geometryResolution === '2k' || geometryResolution === '4k')
    && modelType === MODEL_TYPES.smartTopology) {
    return {
      ok: false,
      code: 'INVALID_GEOMETRY_RESOLUTION',
      error: 'geometry_resolution 2k/4k is not available with Smart Topology',
    };
  }

  const allowedFormats = new Set(['glb', 'obj', 'fbx', 'stl', 'usdz', '3mf']);
  const formats = Array.isArray(input.target_formats) && input.target_formats.length
    ? input.target_formats.map((f) => String(f).toLowerCase())
    : ['glb'];
  for (const f of formats) {
    if (!allowedFormats.has(f)) {
      return {
        ok: false,
        code: 'INVALID_FORMAT',
        error: `Unsupported target format “${f}”`,
      };
    }
  }
  if (!formats.includes('glb')) {
    formats.unshift('glb');
  }

  const assetCategory = input.asset_category === 'character' ? 'character' : 'prop';
  let poseMode = String(input.pose_mode || '').trim().toLowerCase();
  if (poseMode === 'tpose') poseMode = 't-pose';
  if (poseMode === 'apose') poseMode = 'a-pose';
  if (poseMode === 'auto') poseMode = ''; // CLI "auto" ≡ omit (API default)
  if (poseMode && !MESHY_POSE_MODE_IDS.includes(poseMode)) {
    return {
      ok: false,
      code: 'INVALID_POSE_MODE',
      error: `pose_mode must be empty, "t-pose", or "a-pose" (got “${input.pose_mode}”)`,
    };
  }
  // Pose constraint is Character-only in the editor; reject if set on props.
  if (assetCategory !== 'character') {
    if (poseMode) {
      return {
        ok: false,
        code: 'INVALID_POSE_MODE',
        error: 'pose_mode is Character-only — switch Category to Character or clear Pose',
      };
    }
    poseMode = '';
  }

  const shouldRemesh = modelType === MODEL_TYPES.smartTopology
    ? false
    : Boolean(input.should_remesh);

  let decimationMode = input.decimation_mode == null || input.decimation_mode === ''
    ? ''
    : String(input.decimation_mode);
  if (decimationMode) {
    if (!['1', '2', '3', '4'].includes(decimationMode)) {
      return {
        ok: false,
        code: 'INVALID_DECIMATION',
        error: 'decimation_mode must be 1–4 or empty',
      };
    }
    if (modelType === MODEL_TYPES.smartTopology) {
      return {
        ok: false,
        code: 'INVALID_DECIMATION',
        error: 'decimation_mode is ignored/rejected on Smart Topology — clear it or use Standard + Remesh',
      };
    }
    if (!shouldRemesh) {
      return {
        ok: false,
        code: 'INVALID_DECIMATION',
        error: 'decimation_mode requires should_remesh: true',
      };
    }
  }

  const savePreRemesh = Boolean(input.save_pre_remeshed_model);
  if (savePreRemesh && (modelType === MODEL_TYPES.smartTopology || !shouldRemesh)) {
    return {
      ok: false,
      code: 'INVALID_PRE_REMESH',
      error: 'save_pre_remeshed_model requires Standard mesh type with Remesh on',
    };
  }

  // image_enhancement: API default true, but 400 on smart-topology / meshy-6-lite.
  let imageEnhancement = input.image_enhancement;
  if (imageEnhancement === true || imageEnhancement === false) {
    if (imageEnhancement === true
      && (modelType === MODEL_TYPES.smartTopology || aiModelId === 'meshy-6-lite')) {
      return {
        ok: false,
        code: 'INVALID_IMAGE_ENHANCEMENT',
        error: 'image_enhancement is not supported for Smart Topology or meshy-6-lite',
      };
    }
  } else {
    imageEnhancement = null; // omit from request
  }

  // remove_lighting: 400 on smart-topology / n1 / 6-lite.
  let removeLighting = input.remove_lighting;
  if (removeLighting === true || removeLighting === false) {
    if (removeLighting === true) {
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          ok: false,
          code: 'INVALID_REMOVE_LIGHTING',
          error: 'remove_lighting returns 400 with Smart Topology',
        };
      }
      if (textureModelId === 'meshy-n1' || textureModelId === 'meshy-6-lite') {
        return {
          ok: false,
          code: 'INVALID_REMOVE_LIGHTING',
          error: `${textureModelId} refuses remove_lighting: true`,
        };
      }
    }
  } else {
    removeLighting = null;
  }

  let texturePrompt = shouldTexture ? String(input.texture_prompt || '').trim() : '';
  if (texturePrompt && textureModelId === 'meshy-n1') {
    return {
      ok: false,
      code: 'INVALID_TEXTURE_PROMPT',
      error: 'texture_prompt is not allowed with meshy-n1',
    };
  }
  if (texturePrompt.length > 800) {
    return {
      ok: false,
      code: 'INVALID_TEXTURE_PROMPT',
      error: 'texture_prompt max length is 800 characters',
    };
  }

  const autoSize = Boolean(input.auto_size);
  const originAt = String(input.origin_at || 'bottom').toLowerCase();
  if (originAt !== 'bottom' && originAt !== 'center') {
    return {
      ok: false,
      code: 'INVALID_ORIGIN',
      error: 'origin_at must be “bottom” or “center”',
    };
  }
  const multiViewThumbs = Boolean(input.multi_view_thumbnails);
  if (multiViewThumbs && !autoSize) {
    return {
      ok: false,
      code: 'INVALID_THUMBNAILS',
      error: 'multi_view_thumbnails requires auto_size: true',
    };
  }

  const settings = {
    model_type: modelType,
    ai_model: aiModelId,
    target_polycount: targetPolycount,
    topology,
    should_texture: shouldTexture,
    enable_pbr: enablePbr && shouldTexture,
    texture_model: shouldTexture ? textureModelId : undefined,
    texture_resolution: shouldTexture ? textureResolution : undefined,
    texture_prompt: texturePrompt || undefined,
    target_formats: formats,
    should_remesh: shouldRemesh,
    decimation_mode: decimationMode || undefined,
    save_pre_remeshed_model: savePreRemesh,
    geometry_resolution: geometryResolution === '2k' || geometryResolution === '4k'
      ? geometryResolution
      : 'standard',
    image_enhancement: imageEnhancement,
    remove_lighting: removeLighting,
    auto_size: autoSize,
    origin_at: originAt,
    alpha_thumbnail: Boolean(input.alpha_thumbnail),
    multi_view_thumbnails: multiViewThumbs,
    // Editor-only fields (pose_mode is also an API key when set).
    asset_category: assetCategory,
    include_objects: assetCategory === 'character'
      ? input.include_objects !== false
      : false,
    pose_mode: poseMode,
  };

  return { ok: true, settings };
}

/**
 * Estimate credits for a validated Image-to-3D request (documented API pricing).
 * PBR does not add credits; Ultra geometry adds +5 on meshy-7.1.
 */
export function estimateImageTo3dCredits(settings = {}) {
  const validated = validateImageTo3dSettings(settings);
  if (!validated.ok) {
    return { ok: false, code: validated.code, error: validated.error, credits: null };
  }
  const s = validated.settings;
  const geo = getGeometryModel(s.ai_model);
  let credits = geo.meshCredits;

  if (s.should_texture) {
    // Documented bundled price = mesh + texture at resolution.
    // 2K/4K texture add-on is 10; 8K is 15 (mesh-only + retexture).
    const texAdd = s.texture_resolution === '8k' ? 15 : 10;
    credits += texAdd;
  }

  if (s.geometry_resolution === '2k' || s.geometry_resolution === '4k') {
    credits += 5;
  }

  return {
    ok: true,
    credits,
    settings: s,
    breakdown: {
      mesh: geo.meshCredits,
      texture: s.should_texture ? (s.texture_resolution === '8k' ? 15 : 10) : 0,
      ultra: (s.geometry_resolution === '2k' || s.geometry_resolution === '4k') ? 5 : 0,
    },
  };
}

/** Build the JSON body for POST /image-to-3d (excluding image_url). */
export function buildImageTo3dRequestBody(settings, { imageUrl } = {}) {
  const validated = validateImageTo3dSettings(settings);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.code = validated.code;
    throw err;
  }
  const s = validated.settings;
  const body = {
    image_url: imageUrl,
    model_type: s.model_type,
    ai_model: s.ai_model,
    should_texture: s.should_texture,
    target_formats: s.target_formats,
  };
  if (s.should_texture) {
    body.texture_model = s.texture_model;
    body.texture_resolution = s.texture_resolution;
    body.enable_pbr = Boolean(s.enable_pbr);
    if (s.texture_prompt) body.texture_prompt = s.texture_prompt;
  }
  if (s.model_type === MODEL_TYPES.smartTopology) {
    body.target_polycount = s.target_polycount;
    body.topology = 'triangle';
  } else {
    body.should_remesh = Boolean(s.should_remesh);
    if (s.should_remesh) {
      body.topology = s.topology || 'triangle';
      if (s.decimation_mode) {
        body.decimation_mode = Number(s.decimation_mode);
      } else {
        body.target_polycount = s.target_polycount;
      }
      if (s.save_pre_remeshed_model) body.save_pre_remeshed_model = true;
    }
    if (s.geometry_resolution === '2k' || s.geometry_resolution === '4k') {
      body.geometry_resolution = s.geometry_resolution;
    }
  }
  // Book/API: omit pose_mode entirely for default (no constraint).
  if (s.pose_mode === 't-pose' || s.pose_mode === 'a-pose') {
    body.pose_mode = s.pose_mode;
  }
  if (s.image_enhancement === true || s.image_enhancement === false) {
    body.image_enhancement = s.image_enhancement;
  }
  if (s.remove_lighting === true || s.remove_lighting === false) {
    body.remove_lighting = s.remove_lighting;
  }
  if (s.auto_size) {
    body.auto_size = true;
    body.origin_at = s.origin_at || 'bottom';
    if (s.multi_view_thumbnails) body.multi_view_thumbnails = true;
  } else if (s.origin_at && s.origin_at !== 'bottom') {
    body.origin_at = s.origin_at;
  }
  if (s.alpha_thumbnail) body.alpha_thumbnail = true;
  return body;
}

export function createDefaultMeshyFormValues() {
  return { ...GAME_PROP_PRESET };
}
