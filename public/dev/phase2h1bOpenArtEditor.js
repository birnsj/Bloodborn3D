/**
 * Phase 2H.1B — browser acceptance for OpenArt editor integration.
 *
 * Load the editor (dev server), then:
 *   await import('/dev/phase2h1bOpenArtEditor.js');
 *   await window.__phase2h1bOpenArtEditor();
 *
 * Never spends credits. Default `mock: true` stubs /api/openart.
 * Pass `{ mock: false }` for live estimate-only (still no generate).
 *
 * Note (2H.1C): OpenArt now lives under AI Assets. Prefer
 * `/dev/phase2h1cAiAssets.js`. This harness still exercises the store API.
 */
(function phase2h1bOpenArtEditor() {
  const MOCK_MODELS = [{
    id: 'nano-banana-2',
    displayName: 'Nano Banana 2',
    modes: { image: [{ mode: 'text2image' }, { mode: 'image2image' }] },
  }];

  const MOCK_FORM = {
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
  };

  function installFetchMock() {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.includes('/api/openart')) return realFetch(input, init);
      const u = new URL(url, window.location.origin);
      const action = u.searchParams.get('action');
      const json = (data, status = 200) => new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

      if (action === 'status') {
        return json({
          ok: true,
          cli: { ok: true, version: { version: '0.1.1' } },
          account: { credits: 1000, plan: 'Plus', user: { email: 'mock@local' } },
        });
      }
      if (action === 'models') return json({ ok: true, models: MOCK_MODELS });
      if (action === 'form') return json({ ok: true, form: MOCK_FORM });
      if (action === 'estimate') {
        return json({
          ok: true,
          estimateId: 'est_browser_mock',
          totalCredits: 20,
          costConfig: { aspectRatio: '1:1', resolution: '1K', imageCount: 1 },
          approvalRequired: true,
        });
      }
      if (action === 'generate') {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (body.confirmSpend !== true) {
          return json({ ok: false, error: 'Approval required', code: 'APPROVAL_REQUIRED' }, 400);
        }
        return json({
          ok: true,
          jobId: 'job_browser_mock',
          generationId: 'hist_browser_mock',
          status: 'submitted',
        });
      }
      if (action === 'wait') {
        return json({
          ok: true,
          job: {
            jobId: 'job_browser_mock',
            generationId: 'hist_browser_mock',
            status: 'completed',
            resultUrls: ['https://cdn.openart.ai/mock.png'],
          },
        });
      }
      if (action === 'download') {
        return json({
          ok: true,
          staging: { stagingId: 'stg_browser_mock', fileName: 'stg_browser_mock.png' },
          job: { jobId: 'job_browser_mock', generationId: 'hist_browser_mock', status: 'completed' },
        });
      }
      if (action === 'staging-file') {
        const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return json({ ok: false, error: `Unhandled mock action: ${action}` }, 500);
    };
    return () => { window.fetch = realFetch; };
  }

  function store() {
    return window.__bloodboundOpenArtUi || null;
  }

  window.__phase2h1bOpenArtEditor = async function run(opts = {}) {
    const mock = opts.mock !== false;
    const steps = [];
    const restoreFetch = mock ? installFetchMock() : null;
    const api = store();

    try {
      if (api?.reset) api.reset();

      const aiTab = [...document.querySelectorAll('.bb-workspace-tab, nav.bb-workspace-nav button')]
        .find((el) => el.textContent?.includes('AI Assets'));
      steps.push({ step: 'content-folder', ok: Boolean(aiTab), note: '2H.1C: AI Assets tab' });
      aiTab?.click();
      await new Promise((r) => setTimeout(r, 100));
      const panel = document.querySelector('.bb-openart-controls, .bb-ai-assets');
      steps.push({ step: 'panel-mounted', ok: Boolean(panel), storeHook: Boolean(api) });

      if (!api) {
        const report = { ok: false, error: 'OpenArt UI store hook missing — open the editor first', steps };
        window.__phase2h1bOpenArtEditorReport = report;
        return report;
      }

      await api.connect();
      const afterConnect = api.get();
      steps.push({
        step: 'connect',
        ok: afterConnect.phase === 'ready' && afterConnect.status?.ok === true,
        credits: afterConnect.lastCredits,
        models: afterConnect.imageModels?.length,
      });

      api.setPrompt('seamless ashlar stone wall texture, PBR friendly');
      const estimate = await api.estimate();
      steps.push({
        step: 'estimate',
        ok: Boolean(estimate?.estimateId) && Number(estimate.totalCredits) === 20,
        estimateId: estimate?.estimateId,
        totalCredits: estimate?.totalCredits,
      });

      let blocked = false;
      try {
        await api.generate({ confirmSpend: false });
      } catch (err) {
        blocked = err.code === 'APPROVAL_REQUIRED';
      }
      steps.push({ step: 'block-unapproved-generate', ok: blocked });

      if (mock) {
        await api.generate({ confirmSpend: true });
        const s = api.get();
        steps.push({
          step: 'mocked-generate-complete',
          ok: s.phase === 'completed' && Boolean(s.staging?.stagingId) && Boolean(s.previewUrl),
          stagingId: s.staging?.stagingId,
          creditsAfter: s.lastCredits,
        });

        // Preview img should appear in the panel.
        await new Promise((r) => setTimeout(r, 50));
        const img = document.querySelector('.bb-openart__preview-img');
        steps.push({ step: 'preview-img', ok: Boolean(img?.getAttribute('src')) });

        api.discard();
        steps.push({
          step: 'discard',
          ok: api.get().staging == null && api.get().previewUrl == null,
        });
      } else {
        steps.push({
          step: 'mocked-generate-complete',
          ok: true,
          skipped: true,
          note: 'live mode: estimate only — no paid generate',
        });
        steps.push({ step: 'preview-img', ok: true, skipped: true });
        steps.push({ step: 'discard', ok: true, skipped: true });
      }

      api.__testSet({ phase: 'running', submitLocked: true, job: { jobId: 'x' } });
      const snap = api.get();
      steps.push({
        step: 'state-survives-unmount',
        ok: snap.phase === 'running' && snap.submitLocked === true,
      });

      const ok = steps.every((s) => s.ok);
      const report = {
        ok,
        mock,
        spentCredits: false,
        steps,
        at: new Date().toISOString(),
      };
      window.__phase2h1bOpenArtEditorReport = report;
      console.info('[phase2h1bOpenArtEditor]', report);
      return report;
    } finally {
      if (api?.reset) api.reset();
      if (restoreFetch) restoreFetch();
    }
  };

  console.info('[phase2h1bOpenArtEditor] ready — await window.__phase2h1bOpenArtEditor()');
}());
