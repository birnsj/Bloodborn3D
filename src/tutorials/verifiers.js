/**
 * Pure tutorial step verifiers.
 * Pass only when a *new* or *tracked* entity matches — not because older scene content exists.
 */

import { getBrushBaseSolids, getBrushRenderSolids } from '../runtime/brushGeometry.js';

function brushOf(actor) {
  return actor?.getComponent?.('Brush') || null;
}

function lightOf(actor) {
  return actor?.getComponent?.('Light') || null;
}

function meshOf(actor) {
  return actor?.getComponent?.('StaticMesh') || null;
}

function brushKindFromTags(actor) {
  const tags = actor?.tags || [];
  if (tags.includes('wall')) return 'wall';
  if (tags.includes('ceiling')) return 'ceiling';
  if (tags.includes('floor')) return 'floor';
  if (tags.includes('box')) return 'box';
  return null;
}

function snapshotActor(actor) {
  const brush = brushOf(actor);
  const light = lightOf(actor);
  const mesh = meshOf(actor);
  return {
    id: actor.id,
    name: actor.name,
    parentId: actor.parentId || null,
    visible: actor.visible !== false,
    locked: Boolean(actor.locked),
    hasCell: Boolean(actor.getComponent?.('Cell')),
    prefabId: actor.prefab?.prefabId || actor.prefabId || null,
    isPrefabInstance: Boolean(actor.prefab?.instanceId || actor.prefabInstanceId),
    brush: brush
      ? {
        kind: brushKindFromTags(actor),
        operation: brush.operation === 'subtract' ? 'subtract' : 'add',
        size: { ...brush.size },
        materialId: brush.materialId || null,
        openings: Array.isArray(brush.openings) ? brush.openings.map((o) => ({ ...o })) : [],
        uv: brush.uv
          ? {
            scale: { ...brush.uv.scale },
            offset: { ...brush.uv.offset },
            rotation: brush.uv.rotation,
          }
          : null,
        faceMaterials: brush.faceMaterials ? { ...brush.faceMaterials } : null,
      }
      : null,
    light: light
      ? {
        type: light.lightType || light.type,
        intensity: light.intensity,
        color: light.color,
      }
      : null,
    mesh: mesh
      ? {
        meshId: mesh.assetId || mesh.meshId || null,
        collision: mesh.collisionType === 'box' || mesh.collision === 'box' ? 'box' : 'none',
      }
      : null,
    transform: actor.transform?.toJSON?.() || null,
  };
}

export function captureBaseline(world, selectedActorIds = []) {
  const actors = {};
  const actorIds = [];
  if (world?.actors) {
    for (const actor of world.actors) {
      actorIds.push(actor.id);
      actors[actor.id] = snapshotActor(actor);
    }
  }
  return {
    actorIds,
    actorIdSet: new Set(actorIds),
    actors,
    selection: [...selectedActorIds],
  };
}

export function resolveTrackedActor(world, tracked, trackAs) {
  if (!trackAs || !tracked?.[trackAs]) return null;
  return world?.getActor?.(tracked[trackAs]) || null;
}

function newActors(world, baseline) {
  if (!world?.actors) return [];
  const set = baseline?.actorIdSet || new Set(baseline?.actorIds || []);
  return world.actors.filter((a) => !set.has(a.id));
}

function sizesEqual(a, b) {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * @returns {{ ok: boolean, track?: Record<string, string>, hint?: string }}
 */
export function evaluateVerify(verify, ctx) {
  if (!verify || verify.type === 'none') return { ok: true };
  const {
    world,
    mode,
    tool,
    geometryMode,
    geometrySelection,
    transformMode,
    clipSession,
    selectedActorIds = [],
    baseline,
    tracked = {},
    modeHistory = [],
    gridSize,
    canUndo,
    canRedo,
    viewportLayoutMode,
    viewportCameraMode,
    selectedSurface,
  } = ctx;

  switch (verify.type) {
    case 'manualConfirm':
      return { ok: Boolean(ctx.manualConfirmed) };

    case 'actorSelected': {
      if (!selectedActorIds.length) return { ok: false };
      const id = selectedActorIds[selectedActorIds.length - 1];
      const actor = world?.getActor?.(id);
      if (!actor) return { ok: false };
      if (verify.nameIncludes) {
        const name = String(actor.name || '').toLowerCase();
        if (!name.includes(String(verify.nameIncludes).toLowerCase())) {
          return { ok: false, hint: `Select an object whose name includes “${verify.nameIncludes}”.` };
        }
      }
      if (verify.hasBrush && !brushOf(actor)) {
        return { ok: false, hint: 'Select a brush (floor, wall, or box) in the viewport or Outliner.' };
      }
      if (verify.hasLight && !lightOf(actor)) {
        return { ok: false, hint: 'Select a light.' };
      }
      if (verify.hasMesh && !meshOf(actor)) {
        return { ok: false, hint: 'Select a mesh object.' };
      }
      if (verify.hasCell && !actor.getComponent?.('Cell')) {
        return { ok: false, hint: 'Select a Cell.' };
      }
      if (verify.actorId && actor.id !== verify.actorId) {
        return { ok: false };
      }
      const track = verify.trackAs ? { [verify.trackAs]: actor.id } : undefined;
      return { ok: true, track };
    }

    case 'brushCreated': {
      const created = newActors(world, baseline).filter((a) => {
        const b = brushOf(a);
        if (!b) return false;
        if (verify.kind && brushKindFromTags(a) !== verify.kind) return false;
        if (verify.operation === 'subtract' && b.operation !== 'subtract') return false;
        if (verify.operation === 'add' && b.operation === 'subtract') return false;
        return true;
      });
      if (!created.length) {
        return {
          ok: false,
          hint: verify.failHint
            || (verify.operation === 'subtract'
              ? 'Create a Subtract Box with the toolbar tool, then drag in the viewport.'
              : `Create a new ${verify.kind || 'brush'} with the toolbar tool, then drag in the viewport.`),
        };
      }
      const actor = created[created.length - 1];
      const track = verify.trackAs ? { [verify.trackAs]: actor.id } : undefined;
      return { ok: true, track };
    }

    case 'rampCreated': {
      const created = newActors(world, baseline).filter((a) => a.getComponent?.('Ramp'));
      if (!created.length) {
        return { ok: false, hint: verify.failHint || 'Create a ramp with the Ramp toolbar tool.' };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'stairCreated': {
      const created = newActors(world, baseline).filter((a) => a.getComponent?.('Stair'));
      if (!created.length) {
        return { ok: false, hint: verify.failHint || 'Create stairs with the Stairs toolbar tool.' };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'stairTypeIs': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      const stair = actor?.getComponent?.('Stair');
      if (!stair) {
        return { ok: false, hint: 'Select the stairs from the earlier step.' };
      }
      const want = verify.stairType || 'curved';
      if ((stair.stairType || 'straight') !== want) {
        return {
          ok: false,
          hint: verify.failHint || `Set staircase Type to ${want} in Details.`,
        };
      }
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'stairSweepSet': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      const stair = actor?.getComponent?.('Stair');
      if (!stair || (stair.stairType !== 'curved' && stair.stairType !== 'spiral')) {
        return { ok: false, hint: 'Select curved or spiral stairs first.' };
      }
      const minSweep = Number(verify.minSweep) || 90;
      if (Number(stair.sweepAngle) < minSweep) {
        return {
          ok: false,
          hint: verify.failHint || `Set Sweep Angle to at least ${minSweep}°.`,
        };
      }
      return { ok: true };
    }

    case 'brushCarved': {
      const wall = resolveTrackedActor(world, tracked, verify.trackAs);
      if (!wall) return { ok: false, hint: 'Select the wall from the earlier step first.' };
      const brush = brushOf(wall);
      if (!brush || brush.operation === 'subtract') {
        return { ok: false, hint: 'Track an additive wall brush.' };
      }
      const cutter = verify.byCutter
        ? resolveTrackedActor(world, tracked, verify.byCutter)
        : null;
      if (verify.byCutter && (!cutter || brushOf(cutter)?.operation !== 'subtract')) {
        return { ok: false, hint: 'Place a subtractive brush first.' };
      }
      const base = getBrushBaseSolids(brush);
      const carved = getBrushRenderSolids(brush, { world, actor: wall });
      const changed = JSON.stringify(base.solids) !== JSON.stringify(carved.solids);
      if (!changed) {
        return {
          ok: false,
          hint: verify.failHint || 'Move the subtractive brush so it overlaps the additive wall.',
        };
      }
      return { ok: true };
    }

    case 'brushResized': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs);
      if (!actor) return { ok: false, hint: 'Select or create the brush from the previous step first.' };
      const brush = brushOf(actor);
      const before = baseline?.actors?.[actor.id]?.brush;
      if (!brush || !before) return { ok: false };
      if (sizesEqual(brush.size, before.size)) {
        return { ok: false, hint: verify.failHint || 'Resize a face with the gizmo or change Size in Details.' };
      }
      return { ok: true };
    }

    case 'openingAdded': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false, hint: 'Select a wall brush.' };
      const brush = brushOf(actor);
      const before = baseline?.actors?.[actor.id]?.brush;
      const beforeCount = before?.openings?.length || 0;
      const afterCount = brush?.openings?.length || 0;
      if (afterCount <= beforeCount) {
        return { ok: false, hint: verify.failHint || 'Add a Door or Window in Details → Openings.' };
      }
      if (verify.openingType) {
        const newest = brush.openings[brush.openings.length - 1];
        if (newest?.type !== verify.openingType) {
          return { ok: false, hint: `Add a ${verify.openingType} opening.` };
        }
      }
      const track = verify.trackAs ? { [verify.trackAs]: actor.id } : undefined;
      return { ok: true, track };
    }

    case 'materialAssigned': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false, hint: 'Select a brush.' };
      const brush = brushOf(actor);
      if (!brush) return { ok: false };
      const want = verify.materialId;
      if (want && brush.materialId !== want) {
        return { ok: false, hint: verify.failHint || `Assign material “${want}” in Details.` };
      }
      if (!want && !brush.materialId) {
        return { ok: false, hint: 'Assign a material in Details.' };
      }
      const before = baseline?.actors?.[actor.id]?.brush?.materialId;
      if (before === brush.materialId && !verify.allowUnchanged) {
        // Still ok if they already had it from a prior step but we require change from baseline
        if (before === want) return { ok: true, track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined };
        return { ok: false, hint: 'Assign a different material than before this step.' };
      }
      return { ok: true, track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined };
    }

    case 'uvChanged': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false };
      const brush = brushOf(actor);
      const before = baseline?.actors?.[actor.id]?.brush?.uv;
      if (!brush?.uv || !before) return { ok: false, hint: 'Change UV Scale, Offset, or Rotation in Details.' };
      const changed = JSON.stringify(brush.uv) !== JSON.stringify(before);
      return changed
        ? { ok: true }
        : { ok: false, hint: 'Change UV Scale, Offset, or Rotation in Details.' };
    }

    case 'faceMaterialAssigned': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false };
      const structural = brushOf(actor)
        || actor.getComponent?.('ConvexBrush')
        || actor.getComponent?.('Ramp')
        || actor.getComponent?.('Stair')
        || actor.getComponent?.('Column')
        || actor.getComponent?.('Arch')
        || actor.getComponent?.('CurvedWall');
      const faces = structural?.faceMaterials || {};
      const before = baseline?.actors?.[actor.id]?.brush?.faceMaterials || {};
      const hasAny = Object.keys(faces).some((k) => faces[k]);
      const changed = JSON.stringify(faces) !== JSON.stringify(before) && hasAny;
      const wantMat = verify.materialId;
      const hasWant = wantMat
        ? Object.values(faces).includes(wantMat)
        : hasAny;
      if (!hasWant || (!changed && !verify.allowUnchanged)) {
        return {
          ok: false,
          hint: verify.failHint
            || (wantMat
              ? `Paint “${wantMat}” onto a face (drag from Asset Viewer or Details → Selected Surface).`
              : 'Paint a material onto a face — drag from Asset Viewer onto a poly, or use Surface + Details.'),
        };
      }
      return { ok: true };
    }

    case 'surfaceSelected': {
      if (!selectedSurface?.actorId || !selectedSurface?.surfaceId) {
        return {
          ok: false,
          hint: verify.failHint
            || 'Click a face in the Viewport (Surface tool), or drag a material onto a poly.',
        };
      }
      if (verify.trackAs) {
        const trackedId = tracked?.[verify.trackAs];
        if (trackedId && selectedSurface.actorId !== trackedId) {
          return { ok: false, hint: 'Pick a face on the object from the earlier step.' };
        }
      }
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: selectedSurface.actorId } : undefined,
      };
    }

    case 'lightPlaced': {
      const created = newActors(world, baseline).filter((a) => {
        const light = lightOf(a);
        if (!light) return false;
        const lt = light.lightType || light.type;
        if (verify.lightType && lt !== verify.lightType) return false;
        return true;
      });
      if (!created.length) {
        return { ok: false, hint: verify.failHint || 'Place a light from the toolbar.' };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'lightEdited': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor || !lightOf(actor)) return { ok: false, hint: 'Select the light you placed.' };
      const before = baseline?.actors?.[actor.id]?.light;
      const after = lightOf(actor);
      if (!before) return { ok: true };
      const afterType = after.lightType || after.type;
      const changed = before.intensity !== after.intensity
        || before.color !== after.color
        || before.type !== afterType;
      return changed
        ? { ok: true }
        : { ok: false, hint: 'Change Intensity or Color in Details.' };
    }

    case 'meshPlaced': {
      const created = newActors(world, baseline).filter((a) => {
        const mesh = meshOf(a);
        if (!mesh) return false;
        const assetId = mesh.assetId || mesh.meshId || null;
        if (verify.meshId && assetId !== verify.meshId) {
          return false;
        }
        return true;
      });
      if (!created.length) {
        return {
          ok: false,
          hint: verify.failHint || 'Drag Verify Cube from Content Browser into the Viewport.',
        };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'meshCollision': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      const mesh = meshOf(actor);
      if (!mesh) return { ok: false, hint: 'Select the mesh.' };
      const want = verify.collision || 'box';
      const current = mesh.collisionType === 'box' || mesh.collision === 'box' ? 'box' : 'none';
      if (current !== want) {
        return { ok: false, hint: `Set Collision to “${want}” in Details.` };
      }
      return { ok: true };
    }

    case 'cellCreated': {
      const created = newActors(world, baseline).filter((a) => a.getComponent?.('Cell'));
      if (!created.length) {
        return { ok: false, hint: 'Click + Cell in the Scene Outliner.' };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'actorParented': {
      const child = resolveTrackedActor(world, tracked, verify.childTrackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!child) return { ok: false };
      const parentId = child.parentId;
      if (!parentId) {
        return { ok: false, hint: verify.failHint || 'Parent the selected object under another actor or Cell.' };
      }
      if (verify.parentTrackAs) {
        const parent = resolveTrackedActor(world, tracked, verify.parentTrackAs);
        if (!parent || parent.id !== parentId) {
          return { ok: false, hint: 'Parent it under the Cell from the previous step.' };
        }
      }
      if (verify.parentHasCell) {
        const parent = world.getActor(parentId);
        if (!parent?.getComponent?.('Cell')) {
          return { ok: false, hint: 'Parent the object under a Cell.' };
        }
      }
      return { ok: true };
    }

    case 'actorFlag': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false };
      if (verify.flag === 'locked' && !actor.locked) {
        return { ok: false, hint: 'Turn on Locked in Details.' };
      }
      if (verify.flag === 'hidden' && actor.visible !== false) {
        return { ok: false, hint: 'Turn off Visible in Details (hide the object).' };
      }
      if (verify.flag === 'visible' && actor.visible === false) {
        return { ok: false, hint: 'Turn Visible back on.' };
      }
      return { ok: true };
    }

    case 'prefabInstancePlaced': {
      const created = newActors(world, baseline).filter((a) => Boolean(a.prefab?.prefabId));
      if (!created.length) {
        return { ok: false, hint: 'Drag a Prefab from Content Browser into the Viewport.' };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'prefabOverridePresent': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false, hint: 'Select a prefab instance.' };
      const overrides = actor.prefab?.overrides || actor.prefabOverrides;
      const has = overrides && (
        (Array.isArray(overrides) && overrides.length > 0)
        || (typeof overrides === 'object' && Object.keys(overrides).length > 0)
      );
      // Also accept transform differing from baseline on a prefab instance
      const before = baseline?.actors?.[actor.id];
      const transformChanged = before?.transform
        && JSON.stringify(actor.transform?.toJSON?.()) !== JSON.stringify(before.transform);
      if (!has && !transformChanged) {
        return {
          ok: false,
          hint: 'Move or edit the prefab instance so it differs from the source, then use Record Override if needed.',
        };
      }
      return { ok: true };
    }

    case 'transformChanged': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false };
      const before = baseline?.actors?.[actor.id]?.transform;
      if (!before) return { ok: false };
      const after = actor.transform?.toJSON?.();
      if (JSON.stringify(before) === JSON.stringify(after)) {
        return { ok: false, hint: verify.failHint || 'Move the object (gizmo or Details Position).' };
      }
      return { ok: true };
    }

    case 'modeIs': {
      return mode === verify.mode
        ? { ok: true }
        : { ok: false, hint: verify.mode === 'play' ? 'Click Play.' : 'Click Stop to return to Edit.' };
    }

    case 'modeSequence': {
      const want = verify.sequence || [];
      if (want.length === 0) return { ok: true };
      // Check that modeHistory contains the sequence as a subsequence of recent modes
      const hist = modeHistory || [];
      let i = 0;
      for (const m of hist) {
        if (m === want[i]) i += 1;
        if (i >= want.length) return { ok: true };
      }
      return {
        ok: false,
        hint: verify.failHint || `Enter ${want.join(' → ')} using Play and Stop.`,
      };
    }

    case 'canUndo': {
      return canUndo
        ? { ok: true }
        : { ok: false, hint: 'Make an edit, then you can Undo.' };
    }

    case 'undoConsumed': {
      // baseline stores canUndo true; after undo, either canRedo or revision changed with canUndo false relative to action
      if (ctx.undoObserved) return { ok: true };
      return { ok: false, hint: 'Press Undo (or click Undo) after making a change.' };
    }

    case 'gridSizeIs': {
      if (Number(gridSize) === Number(verify.value)) return { ok: true };
      return { ok: false, hint: `Set Grid to ${verify.value} in the toolbar.` };
    }

    case 'selectionCount': {
      const n = selectedActorIds.length;
      const min = verify.min ?? verify.count ?? 1;
      if (n >= min) return { ok: true };
      return { ok: false, hint: `Select at least ${min} objects (Ctrl+click to add).` };
    }

    case 'toolIs': {
      const want = verify.tool;
      if (tool === want) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || `Activate the ${want} tool from the toolbar.`,
      };
    }

    case 'geometryModeIs': {
      const want = verify.mode || 'face';
      if (tool !== 'geometry') {
        return { ok: false, hint: 'Click Face, Edge, or Vertex on the toolbar first.' };
      }
      if (geometryMode === want) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || `Switch to ${want} mode on the toolbar.`,
      };
    }

    case 'geometrySelected': {
      if (tool !== 'geometry') {
        return { ok: false, hint: 'Enter Face / Edge / Vertex mode first.' };
      }
      if (verify.mode && geometrySelection?.mode !== verify.mode) {
        return { ok: false, hint: `Select something in ${verify.mode} mode.` };
      }
      const count = (geometrySelection?.items || []).reduce(
        (n, it) => n + (it.ids?.length || 0),
        0,
      );
      const min = verify.min ?? 1;
      if (count >= min) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || 'Click a face, edge, or vertex on the brush in the Viewport.',
      };
    }

    case 'transformModeIs': {
      const want = verify.mode || 'move';
      if (transformMode === want) return { ok: true };
      const key = want === 'rotate' ? 'E' : want === 'scale' ? 'R' : 'W';
      return {
        ok: false,
        hint: verify.failHint || `Press ${key} (or use the transform buttons) for ${want}.`,
      };
    }

    case 'componentCreated': {
      const type = verify.component;
      if (!type) return { ok: false, hint: 'Tutorial misconfigured (missing component).' };
      const created = newActors(world, baseline).filter((a) => a.getComponent?.(type));
      if (!created.length) {
        return {
          ok: false,
          hint: verify.failHint || `Create a new ${type} with the creation toolbar.`,
        };
      }
      const actor = created[created.length - 1];
      return {
        ok: true,
        track: verify.trackAs ? { [verify.trackAs]: actor.id } : undefined,
      };
    }

    case 'hasComponent': {
      const actor = resolveTrackedActor(world, tracked, verify.trackAs)
        || world?.getActor?.(selectedActorIds[selectedActorIds.length - 1]);
      if (!actor) return { ok: false, hint: 'Select the object from the earlier step.' };
      if (actor.getComponent?.(verify.component)) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || `Convert or create so this object has ${verify.component}.`,
      };
    }

    case 'clipSessionActive': {
      if (clipSession) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || 'Start Clip from Details → Extrude / Clip.',
      };
    }

    case 'viewportLayoutIs': {
      const want = verify.layoutMode || 'quad';
      if (viewportLayoutMode === want) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint || `Click the ${want} layout box on the Viewport chrome.`,
      };
    }

    case 'viewportCameraIs': {
      const want = verify.cameraMode || 'isometric';
      if (viewportCameraMode === want) return { ok: true };
      return {
        ok: false,
        hint: verify.failHint
          || `On the Viewport chrome, set Cam to ${want === 'isometric' ? 'Isometric' : want}.`,
      };
    }

    default:
      return { ok: false, hint: `Unknown verify type: ${verify.type}` };
  }
}
