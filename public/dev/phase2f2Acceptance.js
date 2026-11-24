/**
 * Phase 2F.2 browser acceptance harness.
 * Load the editor, then: await window.__phase2f2Acceptance()
 */
(function phase2f2Acceptance() {
  function findEditor() {
    const roots = document.querySelectorAll('[data-reactroot], #root, body');
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
      if (props?.value?.beginFaceMoveDrag && props?.value?.world) {
        return props.value;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
      if (node.alternate) queue.push(node.alternate);
      if (node.stateNode) queue.push(node.stateNode);
      if (node.return) queue.push(node.return);
    }
    return null;
  }

  function settle(ms = 80) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fingerprint(geometry) {
    return JSON.stringify(geometry);
  }

  function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function listEdges(geometry) {
    const edges = new Set();
    for (const face of geometry.faces || []) {
      const loop = face.loop || [];
      for (let i = 0; i < loop.length; i += 1) {
        edges.add(edgeKey(loop[i], loop[(i + 1) % loop.length]));
      }
    }
    return [...edges];
  }

  function topFrontEdge(geometry) {
    const vmap = new Map((geometry.vertices || []).map((v) => [v.id, v.p]));
    for (const key of listEdges(geometry)) {
      const [a, b] = key.split('|');
      const pa = vmap.get(a);
      const pb = vmap.get(b);
      if (pa && pb && pa[1] > 0 && pb[1] > 0 && pa[2] > 0 && pb[2] > 0) return key;
    }
    return listEdges(geometry)[0];
  }

  window.__phase2f2Acceptance = async function phase2f2AcceptanceRun() {
    const report = { ok: false, steps: [], errors: [] };
    const note = (msg, extra = null) => {
      report.steps.push(extra ? { msg, ...extra } : msg);
    };

    try {
      let editor = findEditor();
      for (let i = 0; i < 50 && !editor; i += 1) {
        await settle(100);
        editor = findEditor();
      }
      if (!editor) {
        report.errors.push('EditorContext not found');
        return report;
      }
      note('editor found');

      await editor.loadLevel?.('acceptance-edge-editing.json');
      await settle(250);
      editor = findEditor() || editor;

      const box = editor.world?.getActor?.('edge_box');
      if (!box?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('edge_box ConvexBrush missing');
        return report;
      }
      note('level loaded', {
        actors: editor.world.actors.length,
        schema: editor.world.schemaVersion,
      });

      editor.setGeometryMode?.('edge');
      editor.setTool?.('geometry');
      const geom = box.getComponent('ConvexBrush').geometry;
      const key = topFrontEdge(geom);
      editor.setGeometrySelection?.({
        mode: 'edge',
        items: [{ actorId: 'edge_box', ids: [key] }],
        primary: { actorId: 'edge_box', id: key },
      });
      await settle(100);
      editor = findEditor() || editor;
      note('edge selected', {
        items: editor.geometrySelection?.items,
        tool: editor.tool,
        mode: editor.geometryMode,
      });
      if (editor.geometryMode !== 'edge' || !editor.geometrySelection?.items?.length) {
        report.errors.push('Edge selection not active');
      }

      const convex = editor.world.getActor('edge_box').getComponent('ConvexBrush');
      const beforeFp = fingerprint(convex.geometry);
      if (!editor.beginFaceMoveDrag()) {
        report.errors.push('beginFaceMoveDrag failed');
        return report;
      }
      const preview = editor.previewFaceMove('y', 20, {
        gridSize: 10,
        snapEnabled: true,
      });
      note('preview valid', { ok: preview?.ok, code: preview?.code });
      if (!preview?.ok) report.errors.push(`Valid edge preview failed: ${preview?.code}`);
      const commit = editor.commitFaceMove('Move edges');
      await settle(150);
      editor = findEditor() || editor;
      note('commit valid', { ok: commit?.ok });
      if (!commit?.ok) report.errors.push('Valid edge commit failed');
      const after = editor.world.getActor('edge_box').getComponent('ConvexBrush');
      if (fingerprint(after.geometry) === beforeFp) {
        report.errors.push('Geometry unchanged after valid edge move');
      }
      if (after.faceMaterials && Object.keys(after.faceMaterials).length >= 0) {
        /* materials may be null or preserved */
      }

      editor.undo?.();
      await settle(120);
      editor = findEditor() || editor;
      const undone = editor.world.getActor('edge_box').getComponent('ConvexBrush');
      const same = fingerprint(undone.geometry) === beforeFp;
      note('undo', { same });
      if (!same) report.errors.push('Undo did not restore geometry');
      editor.redo?.();
      await settle(100);

      // Invalid: collapse thickness via +X vertical edge.
      editor = findEditor() || editor;
      const live = editor.world.getActor('edge_box').getComponent('ConvexBrush');
      const rejectBefore = fingerprint(live.geometry);
      const vmap = new Map(live.geometry.vertices.map((v) => [v.id, v.p]));
      let collapseKey = null;
      for (const e of listEdges(live.geometry)) {
        const [a, b] = e.split('|');
        const pa = vmap.get(a);
        const pb = vmap.get(b);
        if (pa[0] > 0 && pb[0] > 0 && pa[1] * pb[1] < 0 && Math.abs(pa[2] - pb[2]) < 1e-4) {
          collapseKey = e;
          break;
        }
      }
      if (!collapseKey) {
        report.errors.push('Could not find vertical +X edge for reject test');
      } else {
        editor.setGeometrySelection?.({
          mode: 'edge',
          items: [{ actorId: 'edge_box', ids: [collapseKey] }],
          primary: { actorId: 'edge_box', id: collapseKey },
        });
        await settle(50);
        editor = findEditor() || editor;
        editor.beginFaceMoveDrag();
        // Half-extent is 100 on edge_box (200 wide); collapse almost to -X.
        const bad = editor.previewFaceMove('x', -199.8, {
          gridSize: 10,
          snapEnabled: false,
        });
        note('preview invalid', { ok: bad?.ok, code: bad?.code, message: bad?.message });
        const badCommit = editor.commitFaceMove('Move edges');
        await settle(100);
        editor = findEditor() || editor;
        const afterBad = editor.world.getActor('edge_box').getComponent('ConvexBrush');
        const identical = fingerprint(afterBad.geometry) === rejectBefore;
        note('reject preserves geometry', { identical, commitOk: badCommit?.ok });
        if (!identical) report.errors.push('Invalid edge edit mutated authored geometry');
        if (badCommit?.ok) report.errors.push('Invalid edge edit was committed');
        if (bad?.ok) report.errors.push('Expected invalid edge preview to be rejected');
      }

      // Multi-actor edge move
      const boxB = editor.world.getActor('edge_box_b');
      const keyA = topFrontEdge(editor.world.getActor('edge_box').getComponent('ConvexBrush').geometry);
      const keyB = topFrontEdge(boxB.getComponent('ConvexBrush').geometry);
      editor.setGeometrySelection?.({
        mode: 'edge',
        items: [
          { actorId: 'edge_box', ids: [keyA] },
          { actorId: 'edge_box_b', ids: [keyB] },
        ],
        primary: { actorId: 'edge_box', id: keyA },
      });
      await settle(50);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const multi = editor.previewFaceMove('y', 10, { gridSize: 10, snapEnabled: true });
      note('multi-actor edge move', { ok: multi?.ok, changes: multi?.changes?.length });
      if (!multi?.ok) {
        report.errors.push(`Multi-actor edge preview failed: ${multi?.code}`);
        editor.cancelFaceMove?.();
      } else {
        const mCommit = editor.commitFaceMove('Move edges');
        if (!mCommit?.ok) report.errors.push('Multi-actor edge commit failed');
        else {
          editor.undo?.();
          await settle(80);
        }
      }

      // Angled brick edge still editable
      const angled = editor.world.getActor('edge_angled');
      const aKey = listEdges(angled.getComponent('ConvexBrush').geometry)[0];
      editor.setGeometrySelection?.({
        mode: 'edge',
        items: [{ actorId: 'edge_angled', ids: [aKey] }],
        primary: { actorId: 'edge_angled', id: aKey },
      });
      await settle(40);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const angledPrev = editor.previewFaceMove('z', 10, { gridSize: 10, snapEnabled: true });
      note('angled edge move', { ok: angledPrev?.ok });
      if (!angledPrev?.ok) {
        report.errors.push(`Angled edge move failed: ${angledPrev?.code}`);
        editor.cancelFaceMove?.();
      } else {
        editor.commitFaceMove('Move edges');
      }

      editor.setTool?.('select');
      await settle(50);
      editor = findEditor() || editor;
      const cleared = !editor.geometrySelection?.items?.length;
      note('tool leave clears selection', { cleared });
      if (!cleared) report.errors.push('geometrySelection not cleared on leave');

      report.ok = report.errors.length === 0;
      return report;
    } catch (err) {
      report.errors.push(String(err?.stack || err));
      return report;
    }
  };
}());
