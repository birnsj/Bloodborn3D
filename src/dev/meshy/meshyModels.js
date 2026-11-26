/**
 * Meshy Image-to-3D model catalog, validation, and credit estimates.
 * Sourced from https://docs.meshy.ai/en/api/{models,pricing,image-to-3d} (Nov 2026).
 *
 * Scope: static environment props via Image-to-3D only.
 * Deprecated geometry model `meshy-7` is intentionally omitted.
 */

export const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';

export const MODEL_TYPES = Object.freeze({
  standard: 'standard',
  smartTopology: 'smart-topology',
});

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
  model_type: MODEL_TYPES.smartTopology,
  ai_model: 'meshy-t2.5',
  target_polycount: 5000,
  topology: 'triangle',
  should_texture: true,
  enable_pbr: true,
  texture_model: 'meshy-7',
  texture_resolution: '2k',
  target_formats: Object.freeze(['glb']),
  should_remesh: false,
});

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

  const formats = Array.isArray(input.target_formats) && input.target_formats.length
    ? input.target_formats.map((f) => String(f).toLowerCase())
    : ['glb'];
  if (!formats.includes('glb')) {
    formats.unshift('glb');
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
    target_formats: formats,
    should_remesh: modelType === MODEL_TYPES.smartTopology
      ? false
      : Boolean(input.should_remesh),
    geometry_resolution: geometryResolution === '2k' || geometryResolution === '4k'
      ? geometryResolution
      : 'standard',
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
    target_polycount: s.target_polycount,
    topology: s.topology,
  };
  if (s.should_texture) {
    body.texture_model = s.texture_model;
    body.texture_resolution = s.texture_resolution;
    body.enable_pbr = Boolean(s.enable_pbr);
  }
  if (s.model_type === MODEL_TYPES.standard) {
    body.should_remesh = Boolean(s.should_remesh);
    if (s.geometry_resolution === '2k' || s.geometry_resolution === '4k') {
      body.geometry_resolution = s.geometry_resolution;
    }
  }
  return body;
}

export function createDefaultMeshyFormValues() {
  return { ...GAME_PROP_PRESET };
}
