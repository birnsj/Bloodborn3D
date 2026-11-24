/**
 * Phase 2F.6 multi-viewport / orthographic acceptance harness.
 * Load the editor, then: await window.__phase2f6Acceptance()
 */
(function phase2f6Acceptance() {
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
      if (props?.value?.world && props.value.runtimeRef) {
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

  async function loadLevelForced(editor, name) {
    if (editor.loadLevelUnchecked) return editor.loadLevelUnchecked(name);
    const res = await fetch(`/levels/${name}`);
    if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
    const data = await res.json();
    if (editor.applyLevelData) {
      return editor.applyLevelData(data, {
        fileName: name,
        session: {
          kind: 'project',
          readOnlyDisk: false,
          lessonId: null,
          displayName: name,
        },
        statusMessage: `Loaded ${name}`,
      });
    }
    return editor.loadLevel?.(name);
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  async function run() {
    const report = {
      phase: '2F.6',
      ok: false,
      steps: [],
      perf: {},
      errors: [],
    };
    const step = (name, detail) => {
      report.steps.push({ name, ...(detail || {}) });
    };

    try {
      const editor = findEditor();
      assert(editor, 'Editor context not found');
      const vp = window.__bloodboundViewport;
      assert(vp, '__bloodboundViewport bridge missing');

      await loadLevelForced(editor, 'acceptance-convex-brushes.json');
      await settle(200);
      step('load-level', { file: 'acceptance-convex-brushes.json' });

      // Default quad cameras
      let prefs = vp.getPrefs();
      assert(prefs.layoutMode === 'quad', 'default layout should be quad');
      assert(
        prefs.panes.map((p) => p.cameraMode).join(',') === 'perspective,top,front,right',
        'default cameras Perspective/Top/Front/Right',
      );
      step('default-quad');

      const runtime = vp.getRuntime();
      assert(runtime?.sceneView, 'runtime/sceneView missing');
      assert(runtime.viewportPanes?.length === 4, 'quad should drive 4 scissor panes');
      step('scissor-panes', { count: runtime.viewportPanes.length });

      // Shared selection across panes (read selection from runtime — fiber props go stale)
      const actors = editor.world?.actors || [];
      const brush = actors.find((a) => a.getComponent?.('ConvexBrush') || a.getComponent?.('Brush'));
      assert(brush, 'expected a brush actor in acceptance level');
      editor.selectActor?.(brush.id);
      await settle(80);
      const selectedIds = () => (
        runtime.sceneView?.selectedActorIds
        || findEditor()?.selectedActorIds
        || []
      );
      assert(selectedIds().includes(brush.id), 'selection should stick');
      // Switch active pane — selection unchanged
      vp.setPrefs({ activePaneId: 'pane-1' });
      await settle(50);
      assert(selectedIds().includes(brush.id), 'selection shared across pane switch');
      step('shared-selection');

      // Ortho camera mode + display mode independence
      vp.setPrefs({
        panes: prefs.panes.map((p, i) => (
          i === 1
            ? { ...p, cameraMode: 'top', displayMode: 'wireframe' }
            : i === 0
              ? { ...p, displayMode: 'lit' }
              : p
        )),
        activePaneId: 'pane-1',
      });
      await settle(80);
      prefs = vp.getPrefs();
      assert(prefs.panes[1].displayMode === 'wireframe', 'pane-1 wireframe');
      assert(prefs.panes[0].displayMode === 'lit', 'pane-0 remains lit');
      const topCam = runtime.sceneView.getPaneCamera('pane-1');
      assert(topCam?.isOrthographicCamera, 'top pane orthographic camera');
      step('ortho-display-independent');

      // Layout switch single → dual → triple → quad
      for (const mode of ['single', 'dual-h', 'dual-v', 'triple', 'quad']) {
        vp.setPrefs({ layoutMode: mode, maximizedPaneId: null });
        await settle(40);
        const p = vp.getPrefs();
        assert(p.layoutMode === mode, `layout ${mode}`);
        const expected = mode === 'single' ? 1
          : mode.startsWith('dual') ? 2
            : mode === 'triple' ? 3
              : 4;
        assert(
          (runtime.viewportPanes || []).length === expected,
          `${mode} pane count ${runtime.viewportPanes?.length} != ${expected}`,
        );
      }
      step('layout-modes');

      // Maximize / restore
      vp.setPrefs({
        layoutMode: 'quad',
        maximizedPaneId: 'pane-0',
        maximizeRestore: {
          layoutMode: 'quad',
          splitX: 0.5,
          splitY: 0.5,
          splitY2: 0.5,
        },
      });
      await settle(40);
      assert(vp.getPrefs().maximizedPaneId === 'pane-0', 'maximized');
      assert((runtime.viewportPanes || []).length === 1, 'maximize single pane');
      vp.setPrefs({
        maximizedPaneId: null,
        maximizeRestore: null,
        layoutMode: 'quad',
      });
      await settle(40);
      assert((runtime.viewportPanes || []).length === 4, 'restore quad');
      step('maximize-restore');

      // Persistence round-trip
      vp.setPrefs({
        layoutMode: 'dual-h',
        panes: vp.getPrefs().panes.map((p, i) => (
          i === 0 ? { ...p, displayMode: 'unlit', cameraMode: 'perspective' } : p
        )),
      });
      await settle(250);
      const stored = JSON.parse(localStorage.getItem('bloodbound.editor.viewport.v1') || '{}');
      assert(stored.layoutMode === 'dual-h', 'persisted layoutMode');
      assert(stored.panes?.[0]?.displayMode === 'unlit', 'persisted displayMode');
      step('persist');

      // Focus selected
      vp.setPrefs({ layoutMode: 'quad', activePaneId: 'pane-0' });
      editor.selectActor?.(brush.id);
      await settle(40);
      vp.focusSelected?.();
      await settle(40);
      step('focus-selected');

      // Play / Stop preserves edit camera
      const before = {
        x: runtime.sceneView.camera.position.x,
        y: runtime.sceneView.camera.position.y,
        z: runtime.sceneView.camera.position.z,
      };
      await editor.play?.();
      await settle(200);
      assert(runtime.mode === 'play', 'entered play');
      editor.stop?.();
      await settle(200);
      assert(runtime.mode === 'edit', 'returned to edit');
      const after = runtime.sceneView.camera.position;
      assert(
        Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) < 0.05,
        'editor camera restored after Play/Stop',
      );
      step('play-stop-camera');

      // Perf: single vs quad
      vp.setPrefs({ layoutMode: 'single', maximizedPaneId: null });
      await settle(100);
      const single = await vp.measureFrameTimes(0.45);
      vp.setPrefs({ layoutMode: 'quad' });
      await settle(100);
      const quad = await vp.measureFrameTimes(0.45);
      report.perf = { single, quad };
      step('perf-single-vs-quad', { single, quad });

      report.ok = true;
    } catch (err) {
      report.errors.push(String(err?.stack || err));
      report.ok = false;
    }

    console.log('[phase2f6Acceptance]', report);
    return report;
  }

  window.__phase2f6Acceptance = run;
})();
