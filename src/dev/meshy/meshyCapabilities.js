/**
 * Capability matrix for Meshy Image-to-3D editor settings.
 * Sourced from https://docs.meshy.ai/en/api/image-to-3d and meshy-cli 0.8.8 help (Nov 2026).
 *
 * Rules:
 * - Unavailable options must explain why (never silently drop a user selection).
 * - Validation rejects unsupported combinations with an explicit code.
 */

import {
  MODEL_TYPES,
  getGeometryModel,
  getTextureModel,
} from './meshyModels.js';

export const MESHY_OUTPUT_FORMATS = Object.freeze([
  Object.freeze({ id: 'glb', label: 'GLB', editorDefault: true }),
  Object.freeze({ id: 'obj', label: 'OBJ' }),
  Object.freeze({ id: 'fbx', label: 'FBX' }),
  Object.freeze({ id: 'stl', label: 'STL' }),
  Object.freeze({ id: 'usdz', label: 'USDZ' }),
  Object.freeze({ id: '3mf', label: '3MF' }),
]);

export const MESHY_DECIMATION_MODES = Object.freeze([
  Object.freeze({ id: '', label: 'Off — use target polycount' }),
  Object.freeze({ id: '1', label: '1 — Ultra' }),
  Object.freeze({ id: '2', label: '2 — High' }),
  Object.freeze({ id: '3', label: '3 — Medium' }),
  Object.freeze({ id: '4', label: '4 — Low' }),
]);

export const MESHY_ORIGIN_OPTIONS = Object.freeze([
  Object.freeze({ id: 'bottom', label: 'Bottom' }),
  Object.freeze({ id: 'center', label: 'Center' }),
]);

export const MESHY_GEOMETRY_RESOLUTIONS = Object.freeze([
  Object.freeze({ id: 'standard', label: 'Standard' }),
  Object.freeze({ id: '2k', label: 'Ultra 2K (+5 credits)' }),
  Object.freeze({ id: '4k', label: 'Ultra 4K (+5 credits)' }),
]);

/**
 * @typedef {{ available: boolean, reason?: string, note?: string }} SettingCapability
 */

/**
 * Whether a named Image-to-3D setting is available for the current draft.
 * @param {string} key
 * @param {object} draft raw or partially validated form values
 * @returns {SettingCapability}
 */
export function capabilityForImageTo3dSetting(key, draft = {}) {
  const modelType = draft.model_type === MODEL_TYPES.smartTopology
    ? MODEL_TYPES.smartTopology
    : MODEL_TYPES.standard;
  const aiModel = String(draft.ai_model || (modelType === MODEL_TYPES.smartTopology ? 'meshy-t2.5' : 'meshy-7.1'));
  const geo = getGeometryModel(aiModel);
  const shouldTexture = draft.should_texture !== false;
  const textureModelId = String(draft.texture_model || 'meshy-7');
  const tm = getTextureModel(textureModelId)
    || (textureModelId === 'meshy-6'
      ? { id: 'meshy-6', supportsPbr: true, resolutions: ['2k', '4k', '8k'] }
      : null);
  const shouldRemesh = modelType === MODEL_TYPES.standard && Boolean(draft.should_remesh);
  const isCharacter = draft.asset_category === 'character';

  switch (key) {
    case 'pose_mode':
      if (!isCharacter) {
        return {
          available: false,
          reason: 'Pose mode is Character-only. Switch Category to Character to enable A-pose / T-pose.',
        };
      }
      return { available: true, note: 'Default omits pose_mode (no constraint).' };

    case 'include_objects':
      if (!isCharacter) {
        return {
          available: false,
          reason: 'Include objects is a Character workflow reminder (not a Meshy API flag).',
        };
      }
      return {
        available: true,
        note: 'Editor reminder only — Meshy meshes whatever is in the reference image.',
      };

    case 'geometry_resolution':
      if (modelType !== MODEL_TYPES.standard) {
        return {
          available: false,
          reason: 'Ultra geometry (2K/4K) requires Standard mesh type (meshy-7.1).',
        };
      }
      if (!geo?.supportsUltra) {
        return {
          available: false,
          reason: `geometry_resolution 2k/4k requires meshy-7.1 (current: ${aiModel}).`,
        };
      }
      return { available: true, note: 'Ultra adds +5 credits on meshy-7.1.' };

    case 'should_remesh':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'Smart Topology ignores remesh. Use Standard mesh type to remesh/decimate.',
        };
      }
      return { available: true };

    case 'topology':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'Smart Topology is triangle-only.',
        };
      }
      if (!shouldRemesh && draft.should_remesh !== true) {
        return {
          available: true,
          note: 'Topology applies when remesh is on (Standard).',
        };
      }
      return { available: true };

    case 'target_polycount':
      if (modelType === MODEL_TYPES.smartTopology) {
        return { available: true, note: 'Native Smart Topology face target.' };
      }
      if (draft.decimation_mode) {
        return {
          available: false,
          reason: 'Adaptive decimation is set — Meshy ignores target_polycount.',
        };
      }
      if (!shouldRemesh) {
        return {
          available: false,
          reason: 'On Standard meshes, target polycount applies only when Remesh is on.',
        };
      }
      return { available: true };

    case 'decimation_mode':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'Adaptive decimation is ignored on Smart Topology.',
        };
      }
      if (!shouldRemesh) {
        return {
          available: false,
          reason: 'Enable Remesh (Standard) before choosing adaptive decimation.',
        };
      }
      return {
        available: true,
        note: 'When set, Meshy ignores target_polycount.',
      };

    case 'save_pre_remeshed_model':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'Pre-remesh GLB is ignored on Smart Topology (no remesh phase).',
        };
      }
      if (!shouldRemesh) {
        return {
          available: false,
          reason: 'Enable Remesh to save a pre-remesh GLB.',
        };
      }
      return { available: true };

    case 'enable_pbr':
      if (!shouldTexture) {
        return {
          available: false,
          reason: 'PBR requires Generate textures.',
        };
      }
      if (tm && !tm.supportsPbr) {
        return {
          available: false,
          reason: `${textureModelId} does not support PBR — use meshy-7 or meshy-6-lite.`,
        };
      }
      return {
        available: true,
        note: 'Returns base color + normal / metallic / roughness. Emission only on Meshy 6 texture below 8K.',
      };

    case 'texture_model':
    case 'texture_resolution':
      if (!shouldTexture) {
        return { available: false, reason: 'Enable Generate textures first.' };
      }
      return { available: true };

    case 'texture_prompt':
      if (!shouldTexture) {
        return { available: false, reason: 'Enable Generate textures first.' };
      }
      if (textureModelId === 'meshy-n1') {
        return {
          available: false,
          reason: 'meshy-n1 textures from the reference image only — no texture_prompt.',
        };
      }
      return { available: true, note: 'Max 800 characters.' };

    case 'image_enhancement':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'image_enhancement returns 400 with Smart Topology.',
        };
      }
      if (aiModel === 'meshy-6-lite') {
        return {
          available: false,
          reason: 'image_enhancement returns 400 with meshy-6-lite.',
        };
      }
      return {
        available: true,
        note: 'Default API true. Off keeps the exact input look.',
      };

    case 'remove_lighting':
      if (modelType === MODEL_TYPES.smartTopology) {
        return {
          available: false,
          reason: 'remove_lighting returns 400 with Smart Topology.',
        };
      }
      if (textureModelId === 'meshy-n1' || textureModelId === 'meshy-6-lite') {
        return {
          available: false,
          reason: `${textureModelId} refuses remove_lighting: true.`,
        };
      }
      if (aiModel === 'meshy-6-lite') {
        return {
          available: false,
          reason: 'meshy-6-lite + default texture refuses remove_lighting.',
        };
      }
      return {
        available: true,
        note: 'Takes effect with the Meshy 6 texture model. Other models may 400 if forced true.',
      };

    case 'auto_size':
      return {
        available: true,
        note: 'AI vision estimates real-world height and resizes. Origin defaults to bottom unless origin_at is set.',
      };

    case 'origin_at':
      if (!draft.auto_size) {
        return {
          available: true,
          note: 'Most useful with Automatic sizing. Values: bottom | center.',
        };
      }
      return { available: true };

    case 'multi_view_thumbnails':
      if (!draft.auto_size) {
        return {
          available: false,
          reason: 'Multi-view thumbnails require Automatic sizing.',
        };
      }
      return { available: true, note: 'Adds ~5s. Returns front/right/back/left previews.' };

    case 'alpha_thumbnail':
      return { available: true };

    case 'target_formats':
      return {
        available: true,
        note: 'BloodBound imports GLB into the asset pipeline. Extra formats are stored in staging when requested.',
      };

    default:
      return { available: true };
  }
}

/**
 * Build a human-readable summary of settings for spend confirmation.
 * @param {object} settings validated settings
 * @returns {string[]}
 */
export function summarizeImageTo3dSettings(settings = {}) {
  const lines = [];
  const cat = settings.asset_category === 'character' ? 'Character' : 'Game Prop';
  lines.push(`Category: ${cat}`);
  lines.push(`Mesh type: ${settings.model_type}`);
  lines.push(`Geometry model: ${settings.ai_model}`);
  lines.push(`Geometry resolution: ${settings.geometry_resolution || 'standard'}`);
  if (settings.model_type === MODEL_TYPES.smartTopology) {
    lines.push(`Target faces: ${settings.target_polycount}`);
    lines.push('Remesh: n/a (Smart Topology)');
  } else {
    lines.push(`Remesh: ${settings.should_remesh ? 'yes' : 'no'}`);
    if (settings.should_remesh) {
      if (settings.decimation_mode) {
        lines.push(`Adaptive decimation: ${settings.decimation_mode}`);
      } else {
        lines.push(`Target faces: ${settings.target_polycount}`);
      }
      lines.push(`Topology: ${settings.topology}`);
      lines.push(`Save pre-remesh GLB: ${settings.save_pre_remeshed_model ? 'yes' : 'no'}`);
    }
  }
  lines.push(`Textures: ${settings.should_texture ? `${settings.texture_model} @ ${settings.texture_resolution}` : 'off'}`);
  lines.push(`PBR: ${settings.enable_pbr ? 'yes' : 'no'}`);
  if (settings.texture_prompt) lines.push(`Texture prompt: ${settings.texture_prompt.slice(0, 80)}`);
  if (settings.asset_category === 'character') {
    lines.push(`Pose: ${settings.pose_mode || 'Default'}`);
    lines.push(`Include objects (reminder): ${settings.include_objects !== false ? 'yes' : 'no'}`);
  }
  if (settings.image_enhancement != null) {
    lines.push(`Image enhancement: ${settings.image_enhancement ? 'yes' : 'no'}`);
  }
  if (settings.remove_lighting != null) {
    lines.push(`Remove lighting: ${settings.remove_lighting ? 'yes' : 'no'}`);
  }
  lines.push(`Auto size: ${settings.auto_size ? 'yes' : 'no'}`);
  lines.push(`Origin: ${settings.origin_at || 'bottom'}`);
  lines.push(`Formats: ${(settings.target_formats || ['glb']).join(', ')}`);
  return lines;
}
