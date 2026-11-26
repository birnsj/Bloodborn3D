/**
 * Phase 2H.1C — browser acceptance for AI Assets workspace.
 *
 *   await import('/dev/phase2h1cAiAssets.js');
 *   await window.__phase2h1cAiAssets();
 *
 * Never spends credits. Default mock stubs /api/openart.
 */
(function phase2h1cAiAssets() {
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
        negativePrompt: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['1:1', '16:9'], default: '1:1' },
        resolution: { type: 'string', enum: ['1K', '2K'], default: '1K' },
        seed: { type: 'integer', minimum: 0, maximum: 999999, default: 0 },
        guidance: { type: 'number', minimum: 1, maximum: 20, default: 7 },
        stylePreset: { type: 'object' },
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
          account: { credits: 1000, plan: 'Plus' },
        });
      }
      if (action === 'models') return json({ ok: true, models: MOCK_MODELS });
      if (action === 'form') return json({ ok: true, form: MOCK_FORM });
      if (action === 'estimate') {
        return json({
          ok: true,
          estimateId: 'est_ai_assets',
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
          jobId: 'job_ai',
          generationId: 'hist_ai',
          status: 'submitted',
        });
      }
      if (action === 'wait') {
        return json({
          ok: true,
          job: {
            jobId: 'job_ai',
            generationId: 'hist_ai',
            status: 'completed',
            resultUrls: ['https://cdn.openart.ai/mock.png'],
          },
        });
      }
      if (action === 'download') {
        return json({
          ok: true,
          staging: { stagingId: 'stg_ai_assets', fileName: 'stg_ai_assets.png' },
          job: { jobId: 'job_ai', generationId: 'hist_ai', status: 'completed' },
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

  function clickWorkspace(label) {
    const btn = [...document.querySelectorAll('.bb-workspace-tab, nav.bb-workspace-nav button')]
      .find((el) => el.textContent?.includes(label));
    btn?.click();
    return Boolean(btn);
  }

  window.__phase2h1cAiAssets = async function run(opts = {}) {
    const mock = opts.mock !== false;
    const steps = [];
    const restore = mock ? installFetchMock() : null;
    const openArt = window.__bloodboundOpenArtUi;
    const ai = window.__bloodboundAiAssetsUi;

    try {
      openArt?.reset?.();
      ai?.reset?.();

      steps.push({ step: 'open-workspace', ok: clickWorkspace('AI Assets') });
      await new Promise((r) => setTimeout(r, 120));

      const workspace = document.querySelector('.bb-ai-assets');
      steps.push({ step: 'workspace-mounted', ok: Boolean(workspace) });

      const providers = [...document.querySelectorAll('.bb-ai-assets__provider')]
        .map((el) => el.textContent);
      steps.push({
        step: 'provider-nav',
        ok: providers.some((t) => t.includes('OpenArt'))
          && providers.some((t) => t.includes('ComfyUI'))
          && providers.some((t) => t.includes('Meshy')),
        providers,
      });

      steps.push({
        step: 'no-content-browser-openart',
        ok: ![...document.querySelectorAll('.bb-content-folder')]
          .some((el) => el.textContent?.includes('OpenArt')),
      });

      if (!openArt) {
        const report = { ok: false, error: 'OpenArt store hook missing', steps };
        window.__phase2h1cAiAssetsReport = report;
        return report;
      }

      await openArt.connect();
      openArt.setPrompt('ashlar stone albedo');
      const estimate = await openArt.estimate();
      steps.push({
        step: 'estimate',
        ok: Boolean(estimate?.estimateId) && estimate.totalCredits === 20,
      });

      let blocked = false;
      try { await openArt.generate({ confirmSpend: false }); } catch (err) {
        blocked = err.code === 'APPROVAL_REQUIRED';
      }
      steps.push({ step: 'block-unapproved', ok: blocked });

      if (mock) {
        await openArt.generate({ confirmSpend: true });
        const s = openArt.get();
        steps.push({
          step: 'mocked-generate',
          ok: s.phase === 'completed' && Boolean(s.staging?.stagingId),
        });
        await new Promise((r) => setTimeout(r, 40));
        steps.push({
          step: 'results-preview',
          ok: Boolean(document.querySelector('.bb-openart__preview-img')),
        });
        steps.push({
          step: 'advanced-params-present',
          ok: Boolean(document.querySelector('.bb-openart-advanced'))
            || Boolean(document.querySelector('.bb-schema-slider'))
            || document.body.innerText.includes('Advanced parameters'),
        });
      } else {
        steps.push({ step: 'mocked-generate', ok: true, skipped: true });
        steps.push({ step: 'results-preview', ok: true, skipped: true });
        steps.push({ step: 'advanced-params-present', ok: true, skipped: true });
      }

      // Provider switch must keep OpenArt store (selection only) and mount Meshy UI.
      ai?.select('meshy');
      await new Promise((r) => setTimeout(r, 40));
      steps.push({
        step: 'meshy-controls',
        ok: Boolean(document.querySelector('.bb-meshy-controls')),
      });
      steps.push({
        step: 'meshy-results',
        ok: Boolean(document.querySelector('.bb-meshy-results')),
      });
      ai?.select('openart');
      await new Promise((r) => setTimeout(r, 40));
      steps.push({
        step: 'return-to-openart',
        ok: Boolean(document.querySelector('.bb-openart-controls')),
      });

      const ok = steps.every((s) => s.ok);
      const report = { ok, mock, spentCredits: false, steps, at: new Date().toISOString() };
      window.__phase2h1cAiAssetsReport = report;
      console.info('[phase2h1cAiAssets]', report);
      return report;
    } finally {
      openArt?.reset?.();
      ai?.reset?.();
      if (restore) restore();
    }
  };

  console.info('[phase2h1cAiAssets] ready — await window.__phase2h1cAiAssets()');
}());
