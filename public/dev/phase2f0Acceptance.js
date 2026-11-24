/**
 * Phase 2F.0 browser acceptance harness.
 * Load the editor, then: await window.__phase2f0Acceptance()
 */
(function phase2f0Acceptance() {
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
      if (props?.value?.convertSelectedToConvexBrush && props?.value?.world) {
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

  window.__phase2f0Acceptance = async function phase2f0AcceptanceRun() {
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
      for (let i = 0; i < 40 && !editor; i += 1) {
        await settle(100);
        editor = findEditor();
      }
      if (!editor) {
        report.errors.push('EditorContext not found');
        return report;
      }
      note('editor found');

      // Prefer an existing additive Brush without openings.
      let brushActor = (editor.world?.actors || []).find((a) => {
        const b = a.getComponent?.('Brush');
        return b && b.operation !== 'subtract' && !(b.openings?.length);
      });

      if (!brushActor) {
        // Create a simple box via the construction API.
        const created = editor.createBrushAtBounds?.(
          'box',
          { x: 0, y: 0, z: 0 },
          { x: 200, y: 100, z: 40 },
        );
        await settle(150);
        editor = findEditor() || editor;
        brushActor = editor.world?.getActor?.(created?.id)
          || (editor.world?.actors || []).find((a) => a.getComponent?.('Brush'));
      }

      if (!brushActor) {
        report.errors.push('No Brush actor available to convert');
        return report;
      }

      editor.selectActor?.(brushActor.id);
      await settle(120);
      editor = findEditor() || editor;

      const beforeBrush = editor.world.getActor(brushActor.id).getComponent('Brush');
      const beforeJson = beforeBrush.toJSON();
      note('selected brush', { id: brushActor.id, size: beforeBrush.size });

      const converted = editor.convertSelectedToConvexBrush();
      await settle(200);
      editor = findEditor() || editor;
      if (!converted) {
        report.errors.push('convertSelectedToConvexBrush returned false');
        return report;
      }

      const after = editor.world.getActor(brushActor.id);
      const convex = after.getComponent('ConvexBrush');
      if (!convex?.isValid) {
        report.errors.push('ConvexBrush missing or invalid after convert');
        return report;
      }
      note('converted', {
        verts: convex.geometry.vertices.length,
        faces: convex.geometry.faces.length,
        faceIds: convex.geometry.faces.map((f) => f.id),
      });

      // Scene mesh present
      const sceneView = editor.runtimeRef?.current?.sceneView;
      const entry = sceneView?._actorMeshes?.get(brushActor.id);
      const hasMesh = Boolean(
        entry?.group?.children?.some((c) => c.isMesh && c.userData?.convexBrush),
      );
      note('scene mesh', { hasMesh });
      if (!hasMesh) report.errors.push('ConvexBrush mesh not found in SceneView');

      // Undo restores Brush
      editor.undo?.();
      await settle(150);
      editor = findEditor() || editor;
      const restored = editor.world.getActor(brushActor.id).getComponent('Brush');
      if (!restored) {
        report.errors.push('Undo did not restore Brush');
      } else {
        const same = JSON.stringify(restored.toJSON()) === JSON.stringify(beforeJson);
        note('undo restored brush', { same });
        if (!same) report.errors.push('Undo Brush JSON mismatch');
      }

      // Redo back to convex
      editor.redo?.();
      await settle(150);
      editor = findEditor() || editor;
      const redone = editor.world.getActor(brushActor.id).getComponent('ConvexBrush');
      note('redo convex', { ok: Boolean(redone?.isValid) });
      if (!redone?.isValid) report.errors.push('Redo did not restore ConvexBrush');

      report.ok = report.errors.length === 0;
      return report;
    } catch (err) {
      report.errors.push(String(err?.stack || err));
      return report;
    }
  };
}());
