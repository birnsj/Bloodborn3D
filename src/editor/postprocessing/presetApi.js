/**
 * Client API for project-level post-processing presets.
 */

import { BUILTIN_POST_PROCESSING_PRESETS } from '../../runtime/postprocessing/presets.js';
import { normalizePostProcessing } from '../../runtime/postprocessing/postProcessingState.js';

export async function fetchProjectPostProcessingPresets() {
  const res = await fetch('/api/assets?action=postprocessing-presets');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Load presets failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    schemaVersion: 1,
    presets: Array.isArray(data.presets) ? data.presets : [],
  };
}

export async function saveProjectPostProcessingPresets(presets) {
  const res = await fetch('/api/assets?action=postprocessing-presets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 1,
      presets: (presets || []).map((p) => ({
        id: p.id,
        label: p.label || p.id,
        builtin: false,
        settings: normalizePostProcessing(p.settings),
        updatedAt: p.updatedAt || Date.now(),
      })),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Save presets failed: ${res.status}`);
  }
  return res.json();
}

export function listAllPostProcessingPresets(projectPresets = []) {
  const project = (projectPresets || []).map((p) => ({
    ...p,
    builtin: false,
    settings: normalizePostProcessing(p.settings),
  }));
  return [...BUILTIN_POST_PROCESSING_PRESETS, ...project];
}

export function makePresetId(label) {
  const slug = String(label || 'preset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'preset';
  return `user-${slug}-${Date.now().toString(36)}`;
}
