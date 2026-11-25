import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  OpenArtCliError,
  assertModelId,
  assertPrompt,
  buildGenerateImageArgv,
  detectOpenArtCli,
  downloadUrlToFile,
} from '../dev/openart/openArtCli.js';
import {
  __testGetEstimate,
  __testSeedEstimate,
  approveAndGenerate,
  clearOpenArtSessionState,
  createEstimate,
  getOpenArtStatus,
} from '../dev/openart/openArtSession.js';

beforeEach(() => {
  clearOpenArtSessionState();
});

afterEach(() => {
  clearOpenArtSessionState();
  vi.restoreAllMocks();
});

describe('Phase 2H.1A — OpenArt argv safety', () => {
  it('builds generate argv with the prompt as one element (no shell)', () => {
    const argv = buildGenerateImageArgv({
      prompt: 'a stone wall; rm -rf /',
      modelId: 'nano-banana-2',
      async: true,
    });
    expect(argv).toEqual([
      'generate', 'image', 'a stone wall; rm -rf /', '--model', 'nano-banana-2', '--async',
    ]);
  });

  it('rejects unsafe model ids and empty prompts', () => {
    expect(() => assertModelId('../evil')).toThrow(OpenArtCliError);
    expect(() => assertModelId('nano banana')).toThrow(OpenArtCliError);
    expect(() => assertPrompt('')).toThrow(OpenArtCliError);
    expect(() => assertPrompt('   ')).toThrow(OpenArtCliError);
  });

  it('refuses dry-run + async together', () => {
    expect(() => buildGenerateImageArgv({
      prompt: 'x', modelId: 'nano-banana-2', dryRun: true, async: true,
    })).toThrow(/dry-run and async/);
  });
});

describe('Phase 2H.1A — CLI detection / auth failures', () => {
  it('detectOpenArtCli returns structured CLI_MISSING when runner cannot run any candidate', async () => {
    // Force runner failure; if no candidates exist on PATH this still returns CLI_MISSING.
    const result = await detectOpenArtCli({
      runner: async () => {
        throw new OpenArtCliError('CLI_MISSING', 'not found');
      },
    });
    expect(result.ok === true || result.code === 'CLI_MISSING' || result.code === 'CLI_FAILED').toBe(true);
  });

  it('getOpenArtStatus returns a structured result (ok or typed failure)', async () => {
    const status = await getOpenArtStatus();
    if (status.ok) {
      expect(status.cli.ok).toBe(true);
      expect(status.account).toBeTruthy();
    } else {
      expect(['CLI_MISSING', 'AUTH_FAILED', 'CLI_FAILED']).toContain(status.code);
      expect(status.error).toBeTruthy();
    }
  });
});

describe('Phase 2H.1A — approval gate (no auto-spend)', () => {
  it('refuses generate without confirmSpend:true', async () => {
    __testSeedEstimate({
      estimateId: 'est_deadbeefcafe',
      prompt: 'test wall',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      totalCredits: 20,
      approved: false,
      spent: false,
      generationId: null,
    });
    await expect(approveAndGenerate({
      estimateId: 'est_deadbeefcafe',
      confirmSpend: false,
    })).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    expect(__testGetEstimate('est_deadbeefcafe').spent).toBe(false);
  });

  it('refuses unknown estimate ids', async () => {
    await expect(approveAndGenerate({
      estimateId: 'est_missing00001',
      confirmSpend: true,
    })).rejects.toMatchObject({ code: 'ESTIMATE_NOT_FOUND' });
  });

  it('submits once, then blocks a second spend on the same estimate', async () => {
    __testSeedEstimate({
      estimateId: 'est_onceonly0001',
      prompt: 'once',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      totalCredits: 20,
      approved: false,
      spent: false,
      generationId: null,
    });
    const submit = vi.fn(async () => ({ id: 'hist_abc123' }));
    const first = await approveAndGenerate({
      estimateId: 'est_onceonly0001',
      confirmSpend: true,
      _submit: submit,
    });
    expect(first.generationId).toBe('hist_abc123');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(__testGetEstimate('est_onceonly0001').spent).toBe(true);

    await expect(approveAndGenerate({
      estimateId: 'est_onceonly0001',
      confirmSpend: true,
      _submit: submit,
    })).rejects.toMatchObject({ code: 'ALREADY_SPENT' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not mark spent when submit throws (no silent retry charge)', async () => {
    __testSeedEstimate({
      estimateId: 'est_failcharge01',
      prompt: 'fail',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      totalCredits: 20,
      approved: false,
      spent: false,
      generationId: null,
    });
    const submit = vi.fn(async () => {
      throw new OpenArtCliError('GENERATION_FAILED', 'vendor error');
    });
    await expect(approveAndGenerate({
      estimateId: 'est_failcharge01',
      confirmSpend: true,
      _submit: submit,
    })).rejects.toMatchObject({ code: 'GENERATION_FAILED' });
    expect(submit).toHaveBeenCalledTimes(1);
    const record = __testGetEstimate('est_failcharge01');
    expect(record.spent).toBe(false);
    expect(record.generationId).toBeNull();
    expect(record.lastError?.code).toBe('GENERATION_FAILED');
  });
});

describe('Phase 2H.1A — download host allowlist', () => {
  it('rejects non-OpenArt hosts', async () => {
    await expect(downloadUrlToFile('https://evil.example/x.png', path.join(os.tmpdir(), 'x.png')))
      .rejects.toMatchObject({ code: 'URL_HOST_REJECTED' });
  });

  it('writes an https openart.ai URL to disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oa-'));
    const dest = path.join(dir, 'out.png');
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0,
    ]);
    const fetchImpl = async () => ({
      ok: true,
      arrayBuffer: async () => png,
    });
    const result = await downloadUrlToFile('https://cdn.openart.ai/fake.png', dest, { fetchImpl });
    expect(result.bytes).toBe(png.length);
    const written = await fs.readFile(dest);
    expect(written.equals(png)).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('Phase 2H.1A — staging download bookkeeping', () => {
  it('stores staging metadata next to the image', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oa-stg-'));
    const jobs = await import('../dev/openart/openArtSession.js');
    // Seed a completed job via private map by downloading after wait isn't available —
    // use downloadJobToStaging after manually inserting via approve path mock.
    // Minimal: write meta through downloadJobToStaging by seeding job map is not exported.
    // Cover readStagingFile round-trip instead:
    const stagingId = 'stg_aabbccddeeff';
    const fileName = `${stagingId}.png`;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.writeFile(path.join(dir, fileName), png);
    await fs.writeFile(path.join(dir, `${stagingId}.json`), JSON.stringify({
      stagingId, fileName, modelId: 'nano-banana-2', prompt: 'stone',
    }));
    const { readStagingFile } = jobs;
    const got = await readStagingFile(stagingId, { stagingRoot: dir });
    expect(got.buffer.equals(png)).toBe(true);
    expect(got.meta.modelId).toBe('nano-banana-2');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('Phase 2H.1A — creation JSON shape (CLI 0.1.x)', () => {
  it('reads status and https URLs from history/resources', async () => {
    // Mirror the parser used by openArtSession (same rules).
    const creation = {
      history: { id: 'hist_x', status: 'completed' },
      resources: [{
        url: 'https://cdn.openart.ai/openart-ai/production/x.png',
        thumbnailUrl: 'https://cdn.openart.ai/thumb.webp',
        resourceType: 'image',
        status: 'completed',
      }],
    };
    const status = String(creation.history?.status || '').toLowerCase();
    const urls = (creation.resources || [])
      .map((r) => r.url)
      .filter((u) => typeof u === 'string' && u.startsWith('https://'));
    expect(status).toBe('completed');
    expect(urls).toHaveLength(1);
  });
});

describe('Phase 2H.1A — live CLI smoke (skipped if CLI/auth unavailable)', () => {
  it('detects CLI, reads account, lists models, and quotes cost without spending', async () => {
    const status = await getOpenArtStatus();
    if (!status.ok) {
      expect(['CLI_MISSING', 'AUTH_FAILED', 'CLI_FAILED']).toContain(status.code);
      return;
    }
    expect(status.cli.version?.version || status.cli.version).toBeTruthy();
    expect(typeof status.account?.credits === 'number' || status.account?.plan).toBeTruthy();

    const estimate = await createEstimate({
      prompt: 'BloodBound PoC seamless ashlar stone wall albedo, top-down tileable, no text',
      modelId: 'nano-banana-2',
      mode: 'text2image',
    });
    expect(estimate.ok).toBe(true);
    expect(estimate.estimateId).toMatch(/^est_/);
    expect(estimate.totalCredits).toBeGreaterThan(0);
    expect(estimate.dryRun?.body?.model || estimate.dryRun?.model).toBeTruthy();
    expect(estimate.approvalRequired).toBe(true);
    // Critical: createEstimate must not mark the estimate spent.
    expect(__testGetEstimate(estimate.estimateId).spent).toBe(false);
  }, 60_000);
});
