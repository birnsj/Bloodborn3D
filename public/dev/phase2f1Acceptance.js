/**
 * Phase 2F.1 browser acceptance harness.
 * Load the editor, then: await window.__phase2f1Acceptance()
 *
 * Exercises Face mode selection, valid face moves, rejected invalid edits,
 * and undo/redo on acceptance-face-editing.json.
 */
(function phase2f1Acceptance() {
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

  window.__phase2f1Acceptance = async function phase2f1AcceptanceRun() {
    const report = {
      ok: false,
      steps: [],
      errors: [],
    };
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

      await editor.loadLevel?.('acceptance-face-editing.json');
      await settle(250);
      editor = findEditor() || editor;

      const box = editor.world?.getActor?.('face_box');
      const wedge = editor.world?.getActor?.('face_wedge');
      if (!box?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('face_box ConvexBrush missing');
        return report;
      }
      if (!wedge?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('face_wedge ConvexBrush missing');
        return report;
      }
      note('level loaded', {
        actors: editor.world.actors.length,
        schema: editor.world.schemaVersion,
      });

      // Enter Face mode and select a face.
      editor.setGeometryMode?.('face');
      editor.setTool?.('geometry');
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [{ actorId: 'face_box', ids: ['pz'] }],
        primary: { actorId: 'face_box', id: 'pz' },
      });
      await settle(100);
      editor = findEditor() || editor;
      const sel = editor.geometrySelection;
      note('face selected', {
        items: sel?.items,
        tool: editor.tool,
      });
      if (!sel?.items?.length) {
        report.errors.push('geometrySelection empty after set');
      }

      // Valid face move along +Z.
      const convex = editor.world.getActor('face_box').getComponent('ConvexBrush');
      const beforeFp = fingerprint(convex.geometry);
      const started = editor.beginFaceMoveDrag();
      if (!started) {
        report.errors.push('beginFaceMoveDrag failed');
        return report;
      }
      const preview = editor.previewFaceMove('z', 20, {
        gridSize: 10,
        snapEnabled: true,
      });
      note('preview valid', { ok: preview?.ok, code: preview?.code });
      if (!preview?.ok) {
        report.errors.push(`Valid preview failed: ${preview?.code || preview?.message}`);
      }
      const commit = editor.commitFaceMove('Move faces');
      await settle(150);
      editor = findEditor() || editor;
      note('commit valid', { ok: commit?.ok });
      if (!commit?.ok) report.errors.push('Valid commit failed');
      const afterMove = editor.world.getActor('face_box').getComponent('ConvexBrush');
      if (fingerprint(afterMove.geometry) === beforeFp) {
        report.errors.push('Geometry unchanged after valid move');
      }
      if (afterMove.faceMaterials && Object.keys(afterMove.faceMaterials).length === 0) {
        /* ok — may be null */
      }

      // Undo restores exact geometry.
      editor.undo?.();
      await settle(150);
      editor = findEditor() || editor;
      const undone = editor.world.getActor('face_box').getComponent('ConvexBrush');
      const undoneSame = fingerprint(undone.geometry) === beforeFp;
      note('undo', { same: undoneSame });
      if (!undoneSame) report.errors.push('Undo did not restore geometry');

      editor.redo?.();
      await settle(150);
      editor = findEditor() || editor;
      note('redo', {
        ok: Boolean(editor.world.getActor('face_box').getComponent('ConvexBrush')?.isValid),
      });

      // Invalid move: collapse brush thinner than MIN_THICKNESS (0.5 eu).
      // face_box is 200 eu wide (±100); moving +X by -199.8 → thickness 0.2.
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [{ actorId: 'face_box', ids: ['px'] }],
        primary: { actorId: 'face_box', id: 'px' },
      });
      await settle(50);
      editor = findEditor() || editor;
      const live = editor.world.getActor('face_box').getComponent('ConvexBrush');
      const rejectBefore = fingerprint(live.geometry);
      editor.beginFaceMoveDrag();
      const bad = editor.previewFaceMove('x', -199.8, {
        gridSize: 10,
        snapEnabled: false,
      });
      note('preview invalid', { ok: bad?.ok, code: bad?.code, message: bad?.message });
      const badCommit = editor.commitFaceMove('Move faces');
      await settle(100);
      editor = findEditor() || editor;
      const afterBad = editor.world.getActor('face_box').getComponent('ConvexBrush');
      const identical = fingerprint(afterBad.geometry) === rejectBefore;
      note('reject preserves geometry', { identical, commitOk: badCommit?.ok });
      if (!identical) {
        report.errors.push('Invalid edit mutated authored geometry');
      }
      if (badCommit?.ok) {
        report.errors.push('Invalid edit was committed to history');
      }
      if (bad?.ok) {
        report.errors.push('Expected invalid preview to be rejected');
      }

      // Angled wedge still valid and selectable.
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [{ actorId: 'face_wedge', ids: ['pz'] }],
        primary: { actorId: 'face_wedge', id: 'pz' },
      });
      await settle(50);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const wedgePreview = editor.previewFaceMove('z', 10, {
        gridSize: 10,
        snapEnabled: true,
      });
      note('wedge move', { ok: wedgePreview?.ok });
      if (!wedgePreview?.ok) {
        report.errors.push(`Angled wedge move failed: ${wedgePreview?.code}`);
        editor.cancelFaceMove?.();
      } else {
        const wCommit = editor.commitFaceMove('Move faces');
        if (!wCommit?.ok) report.errors.push('Wedge commit failed');
      }

      // Multi-face selection across two actors.
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [
          { actorId: 'face_box', ids: ['py'] },
          { actorId: 'face_box_b', ids: ['py'] },
        ],
        primary: { actorId: 'face_box', id: 'py' },
      });
      await settle(50);
      editor = findEditor() || editor;
      editor.beginFaceMoveDrag();
      const multi = editor.previewFaceMove('y', 10, { gridSize: 10, snapEnabled: true });
      note('multi-actor move', { ok: multi?.ok, changes: multi?.changes?.length });
      if (!multi?.ok) {
        report.errors.push(`Multi-actor preview failed: ${multi?.code}`);
        editor.cancelFaceMove?.();
      } else {
        const mCommit = editor.commitFaceMove('Move faces');
        if (!mCommit?.ok) report.errors.push('Multi-actor commit failed');
        else {
          // Exactly one undo step for the drag.
          editor.undo?.();
          await settle(80);
        }
      }

      // Leaving geometry tool clears selection.
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
