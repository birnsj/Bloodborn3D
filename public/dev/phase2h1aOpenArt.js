/**
 * Phase 2H.1A — browser harness for the OpenArt PoC.
 * Load the editor, then:
 *   await import('/dev/phase2h1aOpenArt.js')
 *   await window.__phase2h1aOpenArt({ approveSpend: false })
 *
 * approveSpend:true will spend credits after printing the estimate.
 */
(function phase2h1aOpenArt() {
  async function api(action, { method = 'GET', body, query = {} } = {}) {
    const qs = new URLSearchParams({ action, ...query });
    const res = await fetch(`/api/openart?${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.code = data.code;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function findEditor() {
    const roots = document.querySelectorAll('#root, body');
    const visited = new Set();
    const queue = [];
    for (const el of roots) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
      if (key) queue.push(el[key]);
    }
    while (queue.length) {
      const node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);
      const props = node.memoizedProps || node.pendingProps;
      if (props?.value?.world && props.value.applySelectedMaterialToBrush) return props.value;
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
      if (node.alternate) queue.push(node.alternate);
      if (node.stateNode) queue.push(node.stateNode);
      if (node.return) queue.push(node.return);
    }
    return null;
  }

  window.__phase2h1aOpenArt = async function run(opts = {}) {
    const approveSpend = opts.approveSpend === true;
    const prompt = opts.prompt || 'Seamless tileable ashlar stone wall albedo, game texture, no text';
    const modelId = opts.modelId || 'nano-banana-2';
    const report = { phase: '2H.1A-browser', approveSpend, steps: [] };

    const status = await api('status');
    report.steps.push({ name: 'status', ok: status.ok, code: status.code, credits: status.account?.credits });
    if (!status.ok) {
      report.ok = false;
      report.error = status.error;
      window.__phase2h1aOpenArtReport = report;
      return report;
    }

    const estimate = await api('estimate', {
      method: 'POST',
      body: { prompt, modelId, mode: 'text2image' },
    });
    report.steps.push({
      name: 'estimate',
      estimateId: estimate.estimateId,
      totalCredits: estimate.totalCredits,
      costConfig: estimate.costConfig,
    });

    if (!approveSpend) {
      report.ok = true;
      report.stoppedBeforeSpend = true;
      window.__phase2h1aOpenArtReport = report;
      return report;
    }

    const gen = await api('generate', {
      method: 'POST',
      body: { estimateId: estimate.estimateId, confirmSpend: true },
    });
    report.steps.push({ name: 'generate', generationId: gen.generationId, jobId: gen.jobId });

    const waited = await api('wait', {
      method: 'POST',
      body: { jobId: gen.jobId, generationId: gen.generationId, timeout: '5m' },
    });
    report.steps.push({ name: 'wait', status: waited.job?.status, urls: waited.job?.resultUrls });

    const downloaded = await api('download', {
      method: 'POST',
      body: { jobId: gen.jobId },
    });
    report.steps.push({ name: 'download', stagingId: downloaded.staging?.stagingId });

    const imported = await api('import', {
      method: 'POST',
      body: {
        stagingId: downloaded.staging.stagingId,
        createMaterial: true,
        materialName: 'OpenArt PoC Ashlar',
        textureName: 'OpenArt PoC Ashlar',
      },
    });
    report.steps.push({
      name: 'import',
      textureId: imported.texture?.id,
      materialId: imported.material?.id,
      previewUrl: imported.previewUrl,
    });

    // Assign material to the current selection when the editor context is available.
    const editor = findEditor();
    if (editor?.applySelectedMaterialToBrush && imported.material?.id) {
      editor.applySelectedMaterialToBrush(imported.material.id);
      report.steps.push({ name: 'assign', materialId: imported.material.id, ok: true });
    } else {
      report.steps.push({
        name: 'assign',
        ok: false,
        note: 'Select a brush in the editor, then call applySelectedMaterialToBrush manually',
        materialId: imported.material?.id || null,
      });
    }

    report.ok = true;
    window.__phase2h1aOpenArtReport = report;
    return report;
  };

  console.info('[phase2h1aOpenArt] ready — await window.__phase2h1aOpenArt({ approveSpend: false })');
}());
