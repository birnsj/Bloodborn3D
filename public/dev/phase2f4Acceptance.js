/**
 * Phase 2F.4 browser acceptance harness.
 * Load the editor, then: await window.__phase2f4Acceptance()
 *
 * Exercises face extrusion, clip keep-front / split, auto-convert,
 * invalid rejection, and undo on acceptance-extrusion-clipping.json.
 */
(function phase2f4Acceptance() {
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
      if (props?.value?.commitExtrudeFace && props?.value?.world) {
        return props.value;
      }
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

  window.__phase2f4Acceptance = async function phase2f4AcceptanceRun() {
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

      await editor.loadLevel?.('acceptance-extrusion-clipping.json');
      await settle(250);
      editor = findEditor() || editor;

      const exBox = editor.world?.getActor?.('ex_box');
      const clipBox = editor.world?.getActor?.('clip_box');
      const plain = editor.world?.getActor?.('plain_box');
      if (!exBox?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('ex_box ConvexBrush missing');
        return report;
      }
      if (!clipBox?.getComponent('ConvexBrush')?.isValid) {
        report.errors.push('clip_box ConvexBrush missing');
        return report;
      }
      if (!plain?.getComponent('Brush')) {
        report.errors.push('plain_box Brush missing');
        return report;
      }
      note('level loaded', {
        actors: editor.world.actors.length,
        schema: editor.world.schemaVersion,
      });

      const startCount = editor.world.actors.length;

      // --- Extrude ---
      editor.setGeometryMode?.('face');
      editor.setTool?.('geometry');
      editor.selectActor?.('ex_box');
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [{ actorId: 'ex_box', ids: ['pz'] }],
        primary: { actorId: 'ex_box', id: 'pz' },
      });
      await settle(80);
      editor = findEditor() || editor;

      const beforeEx = fingerprint(editor.world.getActor('ex_box').getComponent('ConvexBrush').geometry);
      const preview = editor.previewExtrudeFace?.(50, { gridSize: 25, snapEnabled: true });
      note('extrude preview', { ok: preview?.ok, distance: preview?.distance });
      if (!preview?.ok) {
        report.errors.push(`Extrude preview failed: ${preview?.code || preview?.message}`);
      }

      const extrude = editor.commitExtrudeFace?.(50, { gridSize: 25, snapEnabled: true });
      await settle(150);
      editor = findEditor() || editor;
      note('extrude commit', { ok: extrude?.ok, newActorId: extrude?.newActorId });
      if (!extrude?.ok) {
        report.errors.push(`Extrude commit failed: ${extrude?.code || extrude?.message}`);
      } else {
        const srcSame = fingerprint(editor.world.getActor('ex_box').getComponent('ConvexBrush').geometry) === beforeEx;
        if (!srcSame) report.errors.push('Extrude mutated source brush');
        const neu = editor.world.getActor(extrude.newActorId);
        if (!neu?.getComponent('ConvexBrush')?.isValid) {
          report.errors.push('Extrusion actor missing/invalid');
        }
        if (!neu?.name?.includes('Extrusion')) {
          report.errors.push(`Unexpected extrusion name: ${neu?.name}`);
        }
        if (editor.world.actors.length !== startCount + 1) {
          report.errors.push('Actor count after extrude unexpected');
        }
      }

      // Invalid distance rejected
      const badEx = editor.commitExtrudeFace?.(0);
      note('extrude reject d=0', { ok: badEx?.ok, code: badEx?.code });
      if (badEx?.ok) report.errors.push('d=0 extrude should fail');

      editor.undo?.();
      await settle(120);
      editor = findEditor() || editor;
      if (extrude?.newActorId && editor.world.getActor(extrude.newActorId)) {
        report.errors.push('Undo did not remove extrusion');
      }
      note('extrude undo', { actors: editor.world.actors.length });

      // --- Clip keep front ---
      editor.selectActor?.('clip_box');
      editor.setGeometrySelection?.({
        mode: 'face',
        items: [{ actorId: 'clip_box', ids: ['pz'] }],
        primary: { actorId: 'clip_box', id: 'pz' },
      });
      await settle(50);
      editor = findEditor() || editor;
      const beforeClip = fingerprint(
        editor.world.getActor('clip_box').getComponent('ConvexBrush').geometry,
      );

      // Mid-plane via three local-ish world points (actor at x=200,y=50,z=0; local z=0 → world z=0)
      editor.beginClipSession?.('front');
      await settle(40);
      editor = findEditor() || editor;
      editor.addClipPoint?.([150, 50, 0], { snap: true });
      editor.addClipPoint?.([250, 50, 0], { snap: true });
      editor.addClipPoint?.([200, 100, 0], { snap: true });
      await settle(60);
      editor = findEditor() || editor;
      note('clip session', {
        ready: Boolean(editor.clipSession?.plane),
        previewOk: editor.clipSession?.preview?.ok,
      });
      if (!editor.clipSession?.plane) {
        report.errors.push('Clip plane not ready after 3 points');
      } else {
        const clip = editor.commitClipSession?.('Clip keep front');
        await settle(150);
        editor = findEditor() || editor;
        note('clip front', { ok: clip?.ok });
        if (!clip?.ok) {
          report.errors.push(`Clip front failed: ${clip?.code || clip?.message}`);
        } else {
          const after = fingerprint(
            editor.world.getActor('clip_box').getComponent('ConvexBrush').geometry,
          );
          if (after === beforeClip) report.errors.push('Clip did not change geometry');
          editor.undo?.();
          await settle(100);
          editor = findEditor() || editor;
          const restored = fingerprint(
            editor.world.getActor('clip_box').getComponent('ConvexBrush').geometry,
          );
          if (restored !== beforeClip) report.errors.push('Clip undo failed');
          note('clip undo', { restored: restored === beforeClip });
        }
      }

      // --- Clip split + auto-convert plain Brush ---
      editor.selectActor?.('plain_box');
      await settle(40);
      editor = findEditor() || editor;
      if (!editor.world.getActor('plain_box')?.getComponent('Brush')) {
        report.errors.push('plain_box should still be Brush before auto-convert clip');
      }
      editor.beginClipSession?.('split');
      await settle(40);
      editor = findEditor() || editor;
      // plain at (0,50,200), size 100 → local mid plane z=0 → world z=200
      editor.addClipPoint?.([-40, 50, 200], { snap: false });
      editor.addClipPoint?.([40, 50, 200], { snap: false });
      editor.addClipPoint?.([0, 90, 200], { snap: false });
      await settle(60);
      editor = findEditor() || editor;
      const split = editor.commitClipSession?.('Clip split');
      await settle(150);
      editor = findEditor() || editor;
      note('clip split auto-convert', {
        ok: split?.ok,
        newActors: split?.newActorIds?.length,
        isConvex: Boolean(editor.world.getActor('plain_box')?.getComponent('ConvexBrush')?.isValid),
      });
      if (!split?.ok) {
        report.errors.push(`Split/auto-convert failed: ${split?.code || split?.message}`);
      } else {
        if (!editor.world.getActor('plain_box')?.getComponent('ConvexBrush')?.isValid) {
          report.errors.push('Auto-convert did not produce ConvexBrush');
        }
        if (editor.world.getActor('plain_box')?.getComponent('Brush')) {
          report.errors.push('Brush should be gone after convert+clip');
        }
        if (!split.newActorIds?.length) {
          report.errors.push('Split did not create half B');
        }
        editor.undo?.();
        await settle(120);
        editor = findEditor() || editor;
        if (!editor.world.getActor('plain_box')?.getComponent('Brush')) {
          report.errors.push('Undo did not restore Brush');
        }
        if (split.newActorIds?.[0] && editor.world.getActor(split.newActorIds[0])) {
          report.errors.push('Undo did not remove split half');
        }
        note('split undo', {
          brush: Boolean(editor.world.getActor('plain_box')?.getComponent('Brush')),
        });
      }

      // Degenerate: cancel session cleanly
      editor.beginClipSession?.('front');
      editor.cancelClipSession?.();
      await settle(40);
      editor = findEditor() || editor;
      if (editor.clipSession) report.errors.push('cancelClipSession left session active');
      note('cancel session ok');

      report.ok = report.errors.length === 0;
      return report;
    } catch (err) {
      report.errors.push(String(err?.stack || err));
      return report;
    }
  };
}());
