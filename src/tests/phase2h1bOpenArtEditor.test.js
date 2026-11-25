/**
 * Phase 2H.1B — OpenArt editor integration (mocked; never spends credits).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __testSetOpenArtUiState,
  getOpenArtUiState,
  openArtConnect,
  openArtDiscardResult,
  openArtEstimate,
  openArtGenerate,
  openArtResetSession,
  openArtSetPrompt,
  subscribeOpenArtUi,
} from '../editor/openart/openArtUiStore.js';
import { buildGenerateImageArgv } from '../dev/openart/openArtCli.js';
import { DOCK_PANELS, PANEL_VISIBILITY_KEYS } from '../editor/layout/dockLayout.js';
import { ASSET_FOLDERS } from '../data/sampleAssets.js';

const fetchMock = vi.fn();

beforeEach(() => {
  openArtResetSession();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  openArtResetSession();
  vi.restoreAllMocks();
});

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

describe('Phase 2H.1B — dock / browser registration', () => {
  it('registers an OpenArt dock panel and visibility key', () => {
    expect(DOCK_PANELS.openart).toMatchObject({ id: 'openart', component: 'openart', title: 'OpenArt' });
    expect(PANEL_VISIBILITY_KEYS.openart).toBe('openartVisible');
  });

  it('keeps registry asset folders unchanged (OpenArt is a tool folder in the browser context)', () => {
    expect(ASSET_FOLDERS).not.toContain('OpenArt');
    expect(ASSET_FOLDERS).toContain('Textures');
  });

  it('builds generate argv with optional local --image references', () => {
    const argv = buildGenerateImageArgv({
      prompt: 'stone wall',
      modelId: 'nano-banana-2',
      imagePaths: ['C:\\\\tmp\\\\ref.png'],
      async: true,
    });
    expect(argv).toContain('--image');
    expect(argv).toContain('C:\\\\tmp\\\\ref.png');
    expect(argv).toContain('--async');
  });
});

describe('Phase 2H.1B — UI store (mocked API, no spend)', () => {
  it('connects, loads models, and preserves state across subscriber remounts', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('action=status')) {
        return jsonResponse({
          ok: true,
          cli: { ok: true, version: { version: '0.1.1' } },
          account: { credits: 1000, plan: 'Plus', user: { email: 'dev@example.com' } },
        });
      }
      if (u.includes('action=models')) {
        return jsonResponse({
          ok: true,
          models: [{
            id: 'nano-banana-2',
            displayName: 'Nano Banana 2',
            modes: { image: [{ mode: 'text2image' }, { mode: 'image2image' }] },
          }],
        });
      }
      if (u.includes('action=form')) {
        return jsonResponse({
          ok: true,
          form: {
            model: 'nano-banana-2',
            mode: 'text2image',
            jsonSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                aspectRatio: { type: 'string', enum: ['1:1', '16:9'], default: '1:1' },
                resolution: { type: 'string', enum: ['1K', '2K'], default: '1K' },
              },
            },
          },
        });
      }
      return jsonResponse({ ok: false, error: `unexpected ${u}` }, 500);
    });

    const seen = [];
    const unsub = subscribeOpenArtUi((s) => seen.push(s.phase));
    await openArtConnect();
    unsub();

    expect(getOpenArtUiState().phase).toBe('ready');
    expect(getOpenArtUiState().lastCredits).toBe(1000);
    expect(getOpenArtUiState().imageModels).toHaveLength(1);
    expect(getOpenArtUiState().formValues.aspectRatio).toBe('1:1');

    // Remount subscriber — state must still be ready (panel switch persistence).
    const snap = getOpenArtUiState();
    expect(snap.phase).toBe('ready');
    expect(seen).toContain('connecting');
    expect(seen).toContain('ready');
  });

  it('estimates without calling generate', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('action=estimate') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        expect(body.prompt).toContain('ashlar');
        return jsonResponse({
          ok: true,
          estimateId: 'est_testestimate',
          totalCredits: 20,
          costConfig: { aspectRatio: '1:1', resolution: '1K', imageCount: 1 },
          approvalRequired: true,
        });
      }
      return jsonResponse({ ok: false, error: `unexpected ${u}` }, 500);
    });

    __testSetOpenArtUiState({
      phase: 'ready',
      status: { ok: true, account: { credits: 1000 } },
      busy: false,
      submitLocked: false,
      prompt: '',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      formValues: { aspectRatio: '1:1', resolution: '1K' },
    });
    openArtSetPrompt('seamless ashlar stone');
    const estimate = await openArtEstimate();
    expect(estimate.estimateId).toBe('est_testestimate');
    expect(getOpenArtUiState().phase).toBe('estimated');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('action=generate'))).toBe(false);
  });

  it('blocks generate without confirmSpend and blocks duplicate submits', async () => {
    __testSetOpenArtUiState({
      phase: 'estimated',
      status: { ok: true },
      estimate: { estimateId: 'est_x', totalCredits: 20 },
      busy: false,
      submitLocked: false,
      prompt: 'x',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      formValues: {},
    });

    await expect(openArtGenerate({ confirmSpend: false }))
      .rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });

    __testSetOpenArtUiState({ submitLocked: true, phase: 'running' });
    await expect(openArtGenerate({ confirmSpend: true }))
      .rejects.toMatchObject({ code: 'DUPLICATE_SUBMIT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs approved generate → wait → download with mocked responses (no real CLI)', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes('action=generate') && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        expect(body.confirmSpend).toBe(true);
        return jsonResponse({
          ok: true,
          jobId: 'job_1',
          generationId: 'hist_1',
          status: 'submitted',
        });
      }
      if (u.includes('action=wait')) {
        return jsonResponse({
          ok: true,
          job: {
            jobId: 'job_1',
            generationId: 'hist_1',
            status: 'completed',
            resultUrls: ['https://cdn.openart.ai/x.png'],
          },
        });
      }
      if (u.includes('action=download')) {
        return jsonResponse({
          ok: true,
          staging: { stagingId: 'stg_aabbccddeeff', fileName: 'stg_aabbccddeeff.png' },
          job: { jobId: 'job_1', generationId: 'hist_1', status: 'completed' },
        });
      }
      if (u.includes('action=status')) {
        return jsonResponse({
          ok: true,
          account: { credits: 980 },
          cli: { ok: true },
        });
      }
      return jsonResponse({ ok: false, error: `unexpected ${u}` }, 500);
    });

    __testSetOpenArtUiState({
      phase: 'estimated',
      status: { ok: true, account: { credits: 1000 } },
      estimate: { estimateId: 'est_pay', totalCredits: 20 },
      busy: false,
      submitLocked: false,
      prompt: 'wall',
      modelId: 'nano-banana-2',
      mode: 'text2image',
      formValues: {},
      lastCredits: 1000,
    });

    await openArtGenerate({ confirmSpend: true });
    const s = getOpenArtUiState();
    expect(s.phase).toBe('completed');
    expect(s.staging.stagingId).toBe('stg_aabbccddeeff');
    expect(s.previewUrl).toContain('stg_aabbccddeeff');
    expect(s.lastCredits).toBe(980);
    expect(s.submitLocked).toBe(false);
  });

  it('discards result without touching the registry', () => {
    __testSetOpenArtUiState({
      phase: 'completed',
      status: { ok: true },
      staging: { stagingId: 'stg_x' },
      previewUrl: '/api/openart?action=staging-file&stagingId=stg_x',
      estimate: { estimateId: 'est_x' },
    });
    openArtDiscardResult();
    expect(getOpenArtUiState().staging).toBeNull();
    expect(getOpenArtUiState().previewUrl).toBeNull();
    expect(getOpenArtUiState().estimate).toBeNull();
  });

  it('surfaces missing CLI from status without spending', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ok: false,
      code: 'CLI_MISSING',
      error: 'OpenArt CLI not found',
      cli: { ok: false },
      account: null,
    }));
    await openArtConnect();
    expect(getOpenArtUiState().phase).toBe('failed');
    expect(getOpenArtUiState().errorCode).toBe('CLI_MISSING');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('action=generate'))).toBe(false);
  });
});
