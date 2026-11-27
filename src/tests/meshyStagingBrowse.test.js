import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listMeshyStagingDir,
  normalizeStagingRelPath,
  resolveStagingPath,
} from '../dev/meshy/meshyStagingBrowse.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = path.join(rootDir, '.meshy-staging', 'browse-test-fixture');

describe('meshyStagingBrowse', () => {
  beforeEach(() => {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(path.join(staging, 'refs'), { recursive: true });
    mkdirSync(path.join(staging, 'jobs', 'job_a'), { recursive: true });
    writeFileSync(path.join(staging, 'refs', 'ref.png'), Buffer.from([1, 2, 3]));
    writeFileSync(path.join(staging, 'jobs', 'job_a', 'model.glb'), Buffer.from('glTF'));
  });

  afterEach(() => {
    rmSync(staging, { recursive: true, force: true });
  });

  it('normalizes and rejects traversal', () => {
    expect(normalizeStagingRelPath('refs\\a.png')).toBe('refs/a.png');
    expect(normalizeStagingRelPath('../secret')).toBe(null);
    expect(() => resolveStagingPath(staging, '../package.json')).toThrow(/Invalid/);
  });

  it('lists root and nested folders', async () => {
    const root = await listMeshyStagingDir(staging, '');
    expect(root.ok).toBe(true);
    expect(root.entries.map((e) => e.name).sort()).toEqual(['jobs', 'refs']);
    const refs = await listMeshyStagingDir(staging, 'refs');
    expect(refs.entries).toHaveLength(1);
    expect(refs.entries[0]).toMatchObject({
      name: 'ref.png',
      kind: 'file',
      fileKind: 'image',
      previewable: true,
    });
  });

  it('reports missing staging root', async () => {
    rmSync(staging, { recursive: true, force: true });
    const listed = await listMeshyStagingDir(staging, '');
    expect(listed.missing).toBe(true);
    expect(listed.entries).toEqual([]);
  });
});
