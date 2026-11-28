import { describe, expect, it } from 'vitest';
import {
  createCharacterDoc,
  normalizeCharacter,
  normalizeCharacterIndex,
} from '../characters/characterSchema.js';

describe('characterSchema', () => {
  it('creates and normalizes a character doc', () => {
    const doc = createCharacterDoc({
      id: 'char_test',
      name: 'Hero',
      meshAssetId: 'mesh_1',
      heightMeters: 1.75,
      meshyRigTaskId: '018b314a-a1b5-716d-c222-2f1776f7f579',
    });
    expect(doc.schemaVersion).toBe(1);
    expect(doc.name).toBe('Hero');
    expect(doc.meshAssetId).toBe('mesh_1');
    expect(doc.heightMeters).toBe(1.75);
    expect(normalizeCharacter(doc)).toEqual(doc);
  });

  it('rejects missing mesh', () => {
    expect(normalizeCharacter({ id: 'x', name: 'No Mesh' })).toBeNull();
  });

  it('round-trips an index', () => {
    const index = normalizeCharacterIndex({
      characters: [
        { id: 'a', name: 'A', meshAssetId: 'm1' },
        { id: 'bad' },
      ],
    });
    expect(index.characters).toHaveLength(1);
    expect(index.characters[0].id).toBe('a');
  });
});
