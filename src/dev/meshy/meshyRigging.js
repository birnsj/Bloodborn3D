/**
 * Meshy Rigging settings — estimate, validate, summarize (CLI-backed).
 * Paid create requires confirmSpend via session (same gate as Image-to-3D).
 */

export const MESHY_RIG_ANIMATION_TYPES = Object.freeze([
  Object.freeze({ id: 'biped', label: 'Humanoid (biped)' }),
]);

export const MESHY_RIG_DEFAULT_HEIGHT_METERS = 1.7;
/** Documented / observed Meshy rigging credit cost for biped humanoid. */
export const MESHY_RIG_CREDITS = 5;

/**
 * @typedef {{
 *   input_task_id: string,
 *   model_url: string,
 *   height_meters: number,
 *   animation_type: 'biped',
 * }} MeshyRigSettings
 */

/**
 * Validate Auto-rig settings.
 * Prefer input_task_id (Image-to-3D task). model_url is a local absolute GLB path fallback.
 *
 * @param {object} input
 * @returns {{ ok: true, settings: MeshyRigSettings } | { ok: false, code: string, error: string }}
 */
export function validateRiggingSettings(input = {}) {
  const inputTaskId = String(input.input_task_id || input.inputTaskId || '').trim();
  const modelUrl = String(input.model_url || input.modelUrl || '').trim();

  if (!inputTaskId && !modelUrl) {
    return {
      ok: false,
      code: 'SOURCE_REQUIRED',
      error: 'Auto-rig needs an Image-to-3D task id or a staged GLB path',
    };
  }

  if (inputTaskId && !/^[A-Za-z0-9_.:-]{6,128}$/.test(inputTaskId)) {
    return {
      ok: false,
      code: 'INVALID_TASK_ID',
      error: `Invalid input task id “${inputTaskId}”`,
    };
  }

  if (!inputTaskId && modelUrl) {
    if (/^https?:\/\//i.test(modelUrl)) {
      return {
        ok: false,
        code: 'INVALID_MODEL_URL',
        error: 'model_url must be a local staged GLB path (not a remote URL)',
      };
    }
    if (!modelUrl.toLowerCase().endsWith('.glb')) {
      return {
        ok: false,
        code: 'INVALID_MODEL_URL',
        error: 'model_url must point to a .glb file',
      };
    }
  }

  let height = Number(input.height_meters ?? input.heightMeters ?? MESHY_RIG_DEFAULT_HEIGHT_METERS);
  if (!Number.isFinite(height) || height <= 0) {
    return {
      ok: false,
      code: 'INVALID_HEIGHT',
      error: 'height_meters must be a positive number',
    };
  }
  if (height > 10) {
    return {
      ok: false,
      code: 'INVALID_HEIGHT',
      error: 'height_meters must be ≤ 10 m',
    };
  }
  height = Math.round(height * 1000) / 1000;

  const animationType = String(input.animation_type || input.animationType || 'biped').toLowerCase();
  if (animationType !== 'biped') {
    return {
      ok: false,
      code: 'INVALID_ANIMATION_TYPE',
      error: 'v0 Auto-rig supports biped only',
    };
  }

  return {
    ok: true,
    settings: {
      input_task_id: inputTaskId,
      model_url: inputTaskId ? '' : modelUrl,
      height_meters: height,
      animation_type: 'biped',
    },
  };
}

export function estimateRiggingCredits(input = {}) {
  const validated = validateRiggingSettings(input);
  if (!validated.ok) {
    return { ok: false, code: validated.code, error: validated.error, credits: null };
  }
  return {
    ok: true,
    credits: MESHY_RIG_CREDITS,
    settings: validated.settings,
    breakdown: { rigging: MESHY_RIG_CREDITS },
  };
}

/** Human-readable lines for the spend confirmation dialog. */
export function summarizeRiggingSettings(settings = {}) {
  const validated = validateRiggingSettings(settings);
  const s = validated.ok ? validated.settings : settings;
  const lines = [
    'Meshy Auto-rig (humanoid biped)',
    `Height: ${s.height_meters ?? MESHY_RIG_DEFAULT_HEIGHT_METERS} m`,
  ];
  if (s.input_task_id) {
    lines.push(`Source task: ${s.input_task_id}`);
  } else if (s.model_url) {
    lines.push(`Source GLB: ${s.model_url}`);
  }
  lines.push(`Estimated credits: ${MESHY_RIG_CREDITS}`);
  return lines.join('\n');
}

/**
 * Build `meshy rigging create` argv from validated settings.
 * @param {{ settings: object, async?: boolean, operationId?: string|null }} opts
 */
export function buildRiggingCreateArgv({
  settings = {},
  async: asyncMode = false,
  operationId = null,
} = {}) {
  const validated = validateRiggingSettings(settings);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.code = validated.code;
    throw err;
  }
  const s = validated.settings;
  const argv = ['rigging', 'create'];

  if (s.input_task_id) {
    argv.push('--input-task-id', s.input_task_id);
  } else {
    argv.push('--model-url', s.model_url);
  }

  argv.push('--height-meters', String(s.height_meters));

  // biped is API default; still send via --data for explicitness.
  argv.push('--data', JSON.stringify({ animation_type: 'biped' }));

  if (asyncMode) argv.push('--async');
  if (operationId) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(operationId)) {
      const err = new Error(`Invalid operation id: ${operationId}`);
      err.code = 'INVALID_OPERATION_ID';
      throw err;
    }
    argv.push('--operation-id', operationId);
  }

  return argv;
}
