/**
 * Phase 2F.3 browser acceptance harness.
 * Load the editor, then: await window.__phase2f3Acceptance()
 */
(function phase2f3Acceptance() {
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

  window.__phase2f3Acceptance = async function phase2f3AcceptanceRun() {
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

      await editor.loadLevel?.('acceptance-vertex-editing.json');
      await settle(250);
      editor = findEditor() || editor;

      const box = editor.world?.getActor?.('vert_box');
      const pyramid = editor.world?.getActor?.('vert_pyramid');
      if (!box?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('vert_box ConvexBrush missing');
        return report;
      }
      if (!pyramid?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('vert_pyramid ConvexBrush missing');
        return report;
      }
      note('level loaded', {
        actors: editor.world.actors.length,
        schema: editor.world.schemaVersion,
      });

      editor.setGeometryMode?.('vertex');
      editor.setTool?.('geometry');
      const corner = box.getComponent('ConvexBrush').geometry.vertices.find(
        (v) => v.p[0] > 0 && v.p[1] > 0 && v.p[2] > 0,
      );
      editor.setGeometrySelection?.({
        mode: 'vertex',
        items: [{ actorId: 'vert_box', ids: [corner.id] }],
        primary: { actorId: 'vert_box', id: corner.id },
      });
      await settle(100);
      editor = findEditor() || editor;
      note('vertex selected', {
        items: editor.geometrySelection?.items,
        mode: editor.geometryMode,
      });
      if (editor.geometryMode !== 'vertex' || !editor.geometrySelection?.items?.length) {
        report.errors.push('Vertex selection not active');
      }

      const beforeFp = fingerprint(box.getComponent('ConvexBrush').geometry);
      if (!editor.beginFaceMoveDrag()) {
        report.errors.push('beginFaceMoveDrag failed');
        return report;
      }
      const preview = editor.previewFaceMove('y', 20, { gridSize: 10, snapEnabled: true });
      note('preview valid', { ok: preview?.ok, code: preview?.code });
      if (!preview?.ok) report.errors.push(`Valid vertex preview failed: ${preview?.code}`);
      const commit = editor.commitFaceMove('Move vertices');
      await settle(150);
      editor = findEditor() || editor;
      note('commit valid', { ok: commit?.ok });
      if (!commit?.ok) report.errors.push('Valid vertex commit failed');
      if (fingerprint(editor.world.getActor('vert_box').getComponent('ConvexBrush').geometry) === beforeFp) {
        report.errors.push('Geometry unchanged after valid vertex move');
      }

      editor.undo?.();
      await settle(120);
      editor = findEditor() || editor;
      const same = fingerprint(editor.world.getActor('vert_box').getComponent('ConvexBrush').geometry) === beforeFp;
      note('undo', { same });
      if (!same) report.errors.push('Undo did not restore geometry');
      editor.redo?.();
      await settle(80);

      // Reject interior move
      editor = findEditor() || editor;
      const live = editor.world.getActor('vert_box').getComponent('ConvexBrush');
      const rejectBefore = fingerprint(live.geometry);
      const c = live.geometry.vertices[0];
      editor.setGeometrySelection?.({
        mode: 'vertex',
        items: [{ actorId: 'vert_box', ids: [c.id] }],
        primary: { actorId: 'vert_box', id: c.id },
      });
      await settle(40);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      // Pull toward origin hard enough to go interior on the 200×100×100 box.
      const bad = editor.previewFaceMove('x', c.p[0] > 0 ? -180 : 180, {
        gridSize: 10,
        snapEnabled: false,
      });
      // Also try a combined invalid sample via cancel path if axis alone is valid.
      let rejectOk = !bad?.ok;
      let badCommit = editor.commitFaceMove('Move vertices');
      if (bad?.ok) {
        // Restore and try merge toward another vertex.
        editor.undo?.();
        await settle(60);
        editor = findEditor() || editor;
        const g = editor.world.getActor('vert_box').getComponent('ConvexBrush').geometry;
        const a = g.vertices[0];
        const b = g.vertices[1];
        editor.setGeometrySelection?.({
          mode: 'vertex',
          items: [{ actorId: 'vert_box', ids: [a.id] }],
          primary: { actorId: 'vert_box', id: a.id },
        });
        await settle(40);
        editor = findEditor() || editor;
        const rejectBefore2 = fingerprint(
          editor.world.getActor('vert_box').getComponent('ConvexBrush').geometry,
        );
        editor.beginFaceMoveDrag();
        const merge = editor.previewFaceMove(
          a.p[0] !== b.p[0] ? 'x' : (a.p[1] !== b.p[1] ? 'y' : 'z'),
          (a.p[0] !== b.p[0] ? (b.p[0] - a.p[0]) : (a.p[1] !== b.p[1] ? (b.p[1] - a.p[1]) : (b.p[2] - a.p[2]))),
          { snapEnabled: false },
        );
        note('preview merge invalid', { ok: merge?.ok, code: merge?.code });
        badCommit = editor.commitFaceMove('Move vertices');
        rejectOk = !merge?.ok;
        const afterMerge = editor.world.getActor('vert_box').getComponent('ConvexBrush');
        const identical = fingerprint(afterMerge.geometry) === rejectBefore2;
        note('reject preserves geometry', { identical, commitOk: badCommit?.ok, rejectOk });
        if (!identical) report.errors.push('Invalid vertex edit mutated authored geometry');
        if (badCommit?.ok) report.errors.push('Invalid vertex edit was committed');
        if (!rejectOk) report.errors.push('Expected invalid vertex preview to be rejected');
      } else {
        await settle(80);
        editor = findEditor() || editor;
        const afterBad = editor.world.getActor('vert_box').getComponent('ConvexBrush');
        const identical = fingerprint(afterBad.geometry) === rejectBefore;
        note('preview invalid', { ok: bad?.ok, code: bad?.code });
        note('reject preserves geometry', { identical, commitOk: badCommit?.ok });
        if (!identical) report.errors.push('Invalid vertex edit mutated authored geometry');
        if (badCommit?.ok) report.errors.push('Invalid vertex edit was committed');
      }

      // Degree-4 apex move on pyramid
      editor.setGeometrySelection?.({
        mode: 'vertex',
        items: [{ actorId: 'vert_pyramid', ids: ['v4'] }],
        primary: { actorId: 'vert_pyramid', id: 'v4' },
      });
      await settle(40);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const apex = editor.previewFaceMove('y', 10, { gridSize: 10, snapEnabled: true });
      note('degree4 apex move', { ok: apex?.ok });
      if (!apex?.ok) {
        report.errors.push(`Apex move failed: ${apex?.code}`);
        editor.cancelFaceMove?.();
      } else {
        editor.commitFaceMove('Move vertices');
      }

      // Multi-actor
      const boxB = editor.world.getActor('vert_box_b');
      const va = editor.world.getActor('vert_box').getComponent('ConvexBrush').geometry.vertices[0].id;
      const vb = boxB.getComponent('ConvexBrush').geometry.vertices[0].id;
      editor.setGeometrySelection?.({
        mode: 'vertex',
        items: [
          { actorId: 'vert_box', ids: [va] },
          { actorId: 'vert_box_b', ids: [vb] },
        ],
        primary: { actorId: 'vert_box', id: va },
      });
      await settle(40);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const multi = editor.previewFaceMove('y', 10, { gridSize: 10, snapEnabled: true });
      note('multi-actor vertex move', { ok: multi?.ok, changes: multi?.changes?.length });
      if (!multi?.ok) {
        report.errors.push(`Multi-actor vertex preview failed: ${multi?.code}`);
        editor.cancelFaceMove?.();
      } else {
        const mCommit = editor.commitFaceMove('Move vertices');
        if (!mCommit?.ok) report.errors.push('Multi-actor vertex commit failed');
        else {
          editor.undo?.();
          await settle(60);
        }
      }

      editor.setTool?.('select');
      await settle(40);
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
