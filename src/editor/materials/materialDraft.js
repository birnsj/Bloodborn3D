import {
  materialAuthorableKeys,
  normalizeMaterialDefinition,
  serializeAttenuationDistance,
} from '../../materials/MaterialDefinition.js';

/**
 * Phase 2E.4 / Batch 2 — draft helpers for material asset authoring.
 * Drafts are local until Save; Cancel restores the last persisted baseline.
 * Numeric scrub gestures can push entries onto a workspace draft history stack.
 */

const DRAFT_KEYS = materialAuthorableKeys();

/** Deep-clone a normalized material definition for editing. */
export function cloneMaterialDraft(raw) {
  const def = normalizeMaterialDefinition(raw);
  if (!def) return null;
  // JSON round-trip drops Infinity; normalize restores attenuationDistance.
  return normalizeMaterialDefinition(JSON.parse(JSON.stringify(def)));
}

/** Stable fingerprint of authorable fields (ignores updatedAt / preview). */
export function materialDraftFingerprint(def) {
  const normalized = normalizeMaterialDefinition(def);
  if (!normalized) return '';
  const slice = {};
  for (const key of DRAFT_KEYS) {
    let value = normalized[key];
    if (key === 'attenuationDistance') {
      value = serializeAttenuationDistance(value);
    }
    slice[key] = value;
  }
  return JSON.stringify(slice);
}

export function isMaterialDraftDirty(baseline, draft) {
  if (!baseline && !draft) return false;
  if (!baseline || !draft) return true;
  return materialDraftFingerprint(baseline) !== materialDraftFingerprint(draft);
}

/** Payload suitable for updateMaterial / createMaterial (keeps id). */
export function materialDraftToSavePayload(draft) {
  const normalized = normalizeMaterialDefinition(draft);
  if (!normalized) return null;
  const { createdAt, ...rest } = normalized;
  return {
    ...rest,
    attenuationDistance: serializeAttenuationDistance(normalized.attenuationDistance),
    createdAt: createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/** Build a create payload from an existing definition (new id assigned by API). */
export function materialDraftForDuplicate(source, nameSuffix = ' Copy') {
  const normalized = normalizeMaterialDefinition(source);
  if (!normalized) return null;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = normalized;
  return {
    ...rest,
    name: `${normalized.name || 'Material'}${nameSuffix}`,
  };
}

export { DRAFT_KEYS };
