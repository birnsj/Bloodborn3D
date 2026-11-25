import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  UNSUPPORTED_GENERATE_CLI_PARAMS,
  buildGenerateImageArgv,
} from '../dev/openart/openArtCli.js';
import {
  __testGetEstimate,
  __testSeedEstimate,
  approveAndGenerate,
  clearOpenArtSessionState,
  recoverJobsFromDisk,
} from '../dev/openart/openArtSession.js';
import {
  coerceFiniteNumber,
  validateLevelData,
} from '../serialization/LevelDeserializer.js';
import {
  DEFAULT_UPLOAD_LIMIT,
  createAsyncMutex,
  detectImageMagic,
  isLocalDevHost,
  readBodyBufferLimited,
  resolveContainedPath,
} from '../../vite-plugins/fsSafety.js';
import {
  __testResetAssetRoots,
  __testSetAssetRoots,
  importTextureBuffer,
} from '../../vite-plugins/assetFileApi.js';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 0, 0, 0, 0, 0,
]);

beforeEach(() => {
  clearOpenArtSessionState();
});

afterEach(async () => {
  clearOpenArtSessionState();
  __testResetAssetRoots();
  vi.restoreAllMocks();
});

describe('OpenArt spending safeguards', () => {
  it('blocks concurrent approval of the same estimate (synchronous reservation)', async () => {
    __testSeedEstimate({
      estimateId: 'est_concurrent01',
      prompt: 'stone',
      modelId: 'nano-banana-2',
      totalCredits: 20,
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let enteredSubmit;
    const entered = new Promise((resolve) => { enteredSubmit = resolve; });
    const submit = vi.fn(async () => {
      enteredSubmit();
      await gate;
      return { id: 'hist_concurrent' };
    });

    const first = approveAndGenerate({
      estimateId: 'est_concurrent01',
      confirmSpend: true,
      _submit: submit,
    });
    await entered;
    await expect(approveAndGenerate({
      estimateId: 'est_concurrent01',
      confirmSpend: true,
      _submit: submit,
    })).rejects.toMatchObject({ code: 'SPEND_RESERVED' });

    release();
    const result = await first;
    expect(result.generationId).toBe('hist_concurrent');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('submits only CLI-supported params and lists unsupported estimate fields', async () => {
    __testSeedEstimate({
      estimateId: 'est_params00001',
      prompt: 'wall',
      modelId: 'nano-banana-2',
      aspectRatio: '16:9',
      resolution: '2K',
      formValues: { seed: 7 },
      mode: 'text2image',
      imagePaths: [],
      totalCredits: 20,
    });
    const submit = vi.fn(async (params) => {
      expect(params).toEqual({
        prompt: 'wall',
        modelId: 'nano-banana-2',
        imagePaths: null,
      });
      expect(params.aspectRatio).toBeUndefined();
      expect(params.resolution).toBeUndefined();
      expect(params.formValues).toBeUndefined();
      return { id: 'hist_params' };
    });
    const result = await approveAndGenerate({
      estimateId: 'est_params00001',
      confirmSpend: true,
      _submit: submit,
    });
    expect(result.submittedParams).toEqual({
      prompt: 'wall',
      modelId: 'nano-banana-2',
      imagePaths: null,
    });
    expect(result.unsupportedForCliSubmit).toEqual([...UNSUPPORTED_GENERATE_CLI_PARAMS]);
    expect(buildGenerateImageArgv({
      prompt: 'wall',
      modelId: 'nano-banana-2',
      async: true,
    })).not.toContain('--aspect');
  });

  it('marks missing generation id as ambiguous and blocks resubmit', async () => {
    __testSeedEstimate({
      estimateId: 'est_noid0000001',
      prompt: 'x',
      modelId: 'nano-banana-2',
      totalCredits: 20,
    });
    const submit = vi.fn(async () => ({ ok: true }));
    await expect(approveAndGenerate({
      estimateId: 'est_noid0000001',
      confirmSpend: true,
      _submit: submit,
    })).rejects.toMatchObject({ code: 'NO_GENERATION_ID' });
    expect(__testGetEstimate('est_noid0000001').reservation).toBe('ambiguous');
    await expect(approveAndGenerate({
      estimateId: 'est_noid0000001',
      confirmSpend: true,
      _submit: submit,
    })).rejects.toMatchObject({ code: 'SPEND_AMBIGUOUS' });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('OpenArt job recovery without re-spend', () => {
  it('persists and reloads jobs from disk without calling generate', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oa-jobs-'));
    __testSeedEstimate({
      estimateId: 'est_persist0001',
      prompt: 'persist',
      modelId: 'nano-banana-2',
      totalCredits: 20,
    });
    const submit = vi.fn(async () => ({ id: 'hist_persist01' }));
    const created = await approveAndGenerate({
      estimateId: 'est_persist0001',
      confirmSpend: true,
      _submit: submit,
      stagingRoot: dir,
    });
    expect(submit).toHaveBeenCalledTimes(1);

    clearOpenArtSessionState();
    const recovered = await recoverJobsFromDisk({ stagingRoot: dir });
    expect(recovered.loaded).toBe(1);
    expect(recovered.jobs[0].generationId).toBe('hist_persist01');
    expect(recovered.jobs[0].recovered).toBe(true);
    expect(created.generationId).toBe('hist_persist01');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reloads persisted jobs after restart without spending', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oa-rec-'));
    await fs.mkdir(path.join(dir, 'jobs'), { recursive: true });
    await fs.writeFile(path.join(dir, 'jobs', 'job_deadbeefcafe.json'), JSON.stringify({
      jobId: 'job_deadbeefcafe',
      generationId: 'hist_recover01',
      prompt: 'recovered',
      modelId: 'nano-banana-2',
      status: 'completed',
      resultUrls: ['https://cdn.openart.ai/x.png'],
      createdAt: Date.now(),
    }));
    clearOpenArtSessionState();
    const loaded = await recoverJobsFromDisk({ stagingRoot: dir });
    expect(loaded.loaded).toBe(1);
    expect(loaded.jobs[0].generationId).toBe('hist_recover01');
    expect(loaded.jobs[0].recovered).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('fsSafety + asset registry integrity', () => {
  it('detects image magic and rejects non-images', () => {
    expect(detectImageMagic(PNG)).toBe('png');
    expect(detectImageMagic(Buffer.from('not-an-image'))).toBeNull();
  });

  it('enforces path containment', () => {
    const root = path.join(os.tmpdir(), 'assets-root-test');
    expect(() => resolveContainedPath(root, '../etc/passwd')).toThrow(/traversal/i);
  });

  it('limits request bodies', async () => {
    const req = new EventEmitter();
    const pending = readBodyBufferLimited(req, 8);
    queueMicrotask(() => {
      req.emit('data', Buffer.alloc(4));
      req.emit('data', Buffer.alloc(8));
    });
    await expect(pending).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
  });

  it('serializes concurrent registry mutations and rolls back failed imports', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-assets-'));
    __testSetAssetRoots(dir);
    const mutex = createAsyncMutex();
    const order = [];
    await Promise.all([
      mutex(async () => { order.push('a-start'); await new Promise((r) => setTimeout(r, 20)); order.push('a-end'); }),
      mutex(async () => { order.push('b-start'); order.push('b-end'); }),
    ]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);

    const first = importTextureBuffer(PNG, 'a.png', { name: 'A' });
    const second = importTextureBuffer(PNG, 'b.png', { name: 'B' });
    const [a, b] = await Promise.all([first, second]);
    expect(a.registry.assets.length + b.registry.assets.length).toBeGreaterThanOrEqual(2);
    const registry = JSON.parse(await fs.readFile(path.join(dir, 'registry.json'), 'utf8'));
    expect(registry.assets).toHaveLength(2);

    await expect(importTextureBuffer(Buffer.from('nope'), 'evil.png'))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    const after = JSON.parse(await fs.readFile(path.join(dir, 'registry.json'), 'utf8'));
    expect(after.assets).toHaveLength(2);
    await fs.rm(dir, { recursive: true, force: true });
  }, 15_000);

  it('rejects oversized texture buffers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-assets-big-'));
    __testSetAssetRoots(dir);
    const huge = Buffer.alloc(DEFAULT_UPLOAD_LIMIT + 1, 0x89);
    // Not a valid PNG either, but size check comes first after length.
    await expect(importTextureBuffer(huge, 'big.png')).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('restricts OpenArt API to localhost hosts', () => {
    expect(isLocalDevHost({ headers: { host: 'localhost:5173' } })).toBe(true);
    expect(isLocalDevHost({ headers: { host: '127.0.0.1:5173' } })).toBe(true);
    expect(isLocalDevHost({ headers: { host: 'evil.example' } })).toBe(false);
  });
});

describe('LevelDeserializer transform hardening', () => {
  function levelWithTransform(position) {
    return {
      schemaVersion: 2,
      name: 't',
      actors: [{
        id: 'actor_a',
        name: 'A',
        transform: {
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        components: [],
      }],
    };
  }

  it('rejects null, empty string, and boolean transform axes', () => {
    expect(() => validateLevelData(levelWithTransform({ x: null, y: 0, z: 0 }))).toThrow(/finite number/);
    expect(() => validateLevelData(levelWithTransform({ x: '', y: 0, z: 0 }))).toThrow(/finite number/);
    expect(() => validateLevelData(levelWithTransform({ x: true, y: 0, z: 0 }))).toThrow(/finite number/);
  });

  it('still accepts legacy numeric strings', () => {
    expect(coerceFiniteNumber('1.5', 'a', 'x')).toBe(1.5);
    expect(() => validateLevelData(levelWithTransform({ x: '10', y: '0', z: '0' }))).not.toThrow();
  });

  it('preserves valid levels and detects hierarchy cycles via indexed lookup', () => {
    expect(() => validateLevelData(levelWithTransform({ x: 0, y: 0, z: 0 }))).not.toThrow();
    expect(() => validateLevelData({
      schemaVersion: 2,
      actors: [
        {
          id: 'a',
          transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          parentId: 'b',
          components: [],
        },
        {
          id: 'b',
          transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          parentId: 'a',
          components: [],
        },
      ],
    })).toThrow(/Circular hierarchy/);
  });
});
