import { describe, expect, it } from 'vitest';
import { createMaterialDefinition } from '../materials/MaterialDefinition.js';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftFingerprint,
  materialDraftForDuplicate,
  materialDraftToSavePayload,
} from '../editor/materials/materialDraft.js';

describe('Phase 2E.4 — material draft authoring', () => {
  it('clones a normalized draft without sharing nested objects', () => {
    const src = createMaterialDefinition({
      id: 'mat_a',
      name: 'Stone',
      uvScale: { x: 2, y: 2 },
      baseColorMapId: 'tex_1',
    });
    const draft = cloneMaterialDraft(src);
    expect(draft).toMatchObject({ id: 'mat_a', name: 'Stone', uvScale: { x: 2, y: 2 } });
    draft.uvScale.x = 9;
    draft.name = 'Changed';
    expect(src.uvScale.x).toBe(2);
    expect(src.name).toBe('Stone');
  });

  it('detects dirty drafts and ignores updatedAt noise', () => {
    const baseline = createMaterialDefinition({
      id: 'mat_a',
      name: 'Wall',
      roughness: 0.5,
      updatedAt: 100,
    });
    const same = cloneMaterialDraft({ ...baseline, updatedAt: 999 });
    expect(isMaterialDraftDirty(baseline, same)).toBe(false);

    const dirty = cloneMaterialDraft(baseline);
    dirty.roughness = 0.2;
    expect(isMaterialDraftDirty(baseline, dirty)).toBe(true);
    expect(materialDraftFingerprint(baseline)).not.toBe(materialDraftFingerprint(dirty));
  });

  it('builds a save payload that keeps id and refreshes updatedAt', () => {
    const draft = createMaterialDefinition({
      id: 'mat_a',
      name: 'Wall',
      metalness: 0.1,
      uvOffset: { x: 0.25, y: 0 },
      createdAt: 10,
      updatedAt: 10,
    });
    const payload = materialDraftToSavePayload(draft);
    expect(payload.id).toBe('mat_a');
    expect(payload.name).toBe('Wall');
    expect(payload.uvOffset).toEqual({ x: 0.25, y: 0 });
    expect(payload.updatedAt).toBeGreaterThan(10);
  });

  it('builds a duplicate payload without the source id', () => {
    const src = createMaterialDefinition({
      id: 'mat_source',
      name: 'Ashlar',
      baseColorMapId: 'tex_stone',
      normalMapId: 'tex_stone_n',
      uvScale: { x: 1.5, y: 1.5 },
    });
    const dup = materialDraftForDuplicate(src);
    expect(dup.id).toBeUndefined();
    expect(dup.name).toBe('Ashlar Copy');
    expect(dup.baseColorMapId).toBe('tex_stone');
    expect(dup.normalMapId).toBe('tex_stone_n');
    expect(dup.uvScale).toEqual({ x: 1.5, y: 1.5 });
  });

  it('treats identity UV defaults as compatible with existing assets', () => {
    const legacy = {
      schemaVersion: 1,
      id: 'mat_legacy',
      name: 'Legacy',
      type: 'material',
      baseColor: '#8899aa',
      roughness: 0.7,
      metalness: 0,
      opacity: 1,
    };
    const draft = cloneMaterialDraft(legacy);
    expect(draft.uvScale).toEqual({ x: 1, y: 1 });
    expect(draft.uvOffset).toEqual({ x: 0, y: 0 });
    expect(draft.uvRotation).toBe(0);
    expect(draft.normalScale).toBe(1);
    expect(isMaterialDraftDirty(draft, cloneMaterialDraft(draft))).toBe(false);
  });
});
