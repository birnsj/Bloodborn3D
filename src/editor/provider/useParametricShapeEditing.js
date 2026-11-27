// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { snapToGrid } from '../../core/units.js';
import { SetStaticMeshPropertiesCommand, SetRampPropertiesCommand, SetStairPropertiesCommand, SetColumnPropertiesCommand, SetArchPropertiesCommand, SetCurvedWallPropertiesCommand, JoinWallEndpointsCommand } from '../history/commands.js';
import { RAMP_DIRECTIONS } from '../../components/RampComponent.js';
import { defaultsForStairType, STAIR_TYPES } from '../../components/StairComponent.js';
import { COLUMN_SHAPES } from '../../components/ColumnComponent.js';
import { ARCH_TYPES } from '../../components/ArchComponent.js';
import { findNearestWallEndpoint, getWallEndpoints, planWallEndpointJoin, WALL_ENDPOINT_SNAP_DIST } from '../../runtime/wallEndpoints.js';
import { normalizeStaticMeshFields } from '../../components/StaticMeshComponent.js';
import { commitSelectedComponentGesture } from '../propertyEditing.js';

export function useParametricShapeEditing({
  autoCapturePrefabOverrides,
  bump,
  executeCommand,
  gridRef,
  isEditorActorLocked,
  mode,
  rebuildSelectedActorVisual,
  recordCommand,
  selectedRef,
  setStatus,
  world,
}) {
const updateSelectedStaticMesh = useCallback((partial, options = {}) => {
    // Collision fields are co-normalized — keep specialized before/after assembly.
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit static mesh: actor or authoring layer is locked.');
      return;
    }
    const mesh = world.getActor(actorId)?.getComponent('StaticMesh');
    if (!mesh) return;
    const { undoable = true, label = 'Edit static mesh' } = options;
    const normalized = normalizeStaticMeshFields({ ...mesh, ...partial });
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = structuredClone(mesh[key]);
      after[key] = structuredClone(normalized[key]);
    }
    if ('collidable' in partial || 'collisionType' in partial) {
      before.collidable = structuredClone(mesh.collidable);
      before.collisionType = structuredClone(mesh.collisionType);
      after.collidable = normalized.collidable;
      after.collisionType = normalized.collisionType;
    }
    if (!undoable) {
      for (const key of Object.keys(after)) {
        mesh[key] = after[key];
      }
      const actor = world.getActor(actorId);
      if (actor) rebuildSelectedActorVisual(actor, world);
      bump();
      return;
    }
    executeCommand(
      new SetStaticMeshPropertiesCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, isEditorActorLocked, setStatus, executeCommand, autoCapturePrefabOverrides, rebuildSelectedActorVisual, bump]);

  const commitStaticMeshGesture = useCallback((beforeSnapshot, label = 'Edit static mesh') => {
    commitSelectedComponentGesture({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'StaticMesh',
      beforeSnapshot,
      label,
      CommandClass: SetStaticMeshPropertiesCommand,
      recordCommand,
      autoCapturePrefabOverrides,
    });
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedRamp = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit ramp: actor or authoring layer is locked.');
      return;
    }
    const ramp = world.getActor(actorId)?.getComponent('Ramp');
    if (!ramp) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['width', 'length', 'rise', 'thickness'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = ramp[key];
        after[key] = Math.max(gridRef.current, snapToGrid(raw, gridRef.current));
      } else if (key === 'direction') {
        if (!RAMP_DIRECTIONS.includes(partial.direction)) continue;
        before.direction = ramp.direction;
        after.direction = partial.direction;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...ramp.uv.scale },
          offset: { ...ramp.uv.offset },
          rotation: ramp.uv.rotation,
        };
        after.uv = partial.uv;
      } else {
        before[key] = ramp[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetRampPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign ramp material' : 'Edit ramp',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedStair = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit stair: actor or authoring layer is locked.');
      return;
    }
    const stair = world.getActor(actorId)?.getComponent('Stair');
    if (!stair) return;
    const before = {};
    const after = {};

    if (partial.stairType != null && STAIR_TYPES.includes(partial.stairType)) {
      const nextType = partial.stairType;
      if (nextType !== stair.stairType) {
        const defaults = defaultsForStairType(nextType, stair);
        for (const key of Object.keys(defaults)) {
          before[key] = stair[key];
          after[key] = defaults[key];
        }
      }
    }

    for (const key of Object.keys(partial)) {
      if (key === 'stairType') continue;
      if (['width', 'stepHeight', 'treadDepth', 'innerRadius'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = stair[key];
        after[key] = Math.max(key === 'innerRadius' ? 0 : 1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'stepCount') {
        before.stepCount = stair.stepCount;
        after.stepCount = Math.max(1, Math.round(Number(partial.stepCount) || 1));
      } else if (key === 'sweepAngle') {
        const raw = Math.abs(Number(partial.sweepAngle));
        if (!Number.isFinite(raw)) continue;
        before.sweepAngle = stair.sweepAngle;
        after.sweepAngle = Math.max(1, Math.min(720, raw));
      } else if (key === 'startAngle') {
        const raw = Number(partial.startAngle);
        if (!Number.isFinite(raw)) continue;
        before.startAngle = stair.startAngle;
        after.startAngle = raw;
      } else if (key === 'clockwise') {
        before.clockwise = stair.clockwise;
        after.clockwise = Boolean(partial.clockwise);
      } else if (key === 'totalRise') {
        const rise = Math.max(gridRef.current, snapToGrid(Number(partial.totalRise), gridRef.current));
        before.stepHeight = stair.stepHeight;
        after.stepHeight = rise / Math.max(1, stair.stepCount);
      } else if (key === 'direction') {
        if (!RAMP_DIRECTIONS.includes(partial.direction)) continue;
        before.direction = stair.direction;
        after.direction = partial.direction;
      } else {
        before[key] = stair[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetStairPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.stairType !== undefined
          ? `Set ${partial.stairType} stairs`
          : partial.materialId !== undefined
            ? 'Assign stair material'
            : 'Edit stairs',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedColumn = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit column: actor or authoring layer is locked.');
      return;
    }
    const column = world.getActor(actorId)?.getComponent('Column');
    if (!column) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['height', 'radius', 'baseHeight', 'baseRadius', 'capitalHeight', 'capitalRadius'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = column[key];
        after[key] = Math.max(key.includes('Height') && key !== 'height' ? 0 : 1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'sides') {
        before.sides = column.sides;
        after.sides = Math.max(3, Math.min(64, Math.round(Number(partial.sides) || 3)));
      } else if (key === 'shape') {
        if (!COLUMN_SHAPES.includes(partial.shape)) continue;
        before.shape = column.shape;
        after.shape = partial.shape;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...column.uv.scale },
          offset: { ...column.uv.offset },
          rotation: column.uv.rotation,
        };
        after.uv = partial.uv;
      } else if (key === 'baseEnabled' || key === 'capitalEnabled' || key === 'collidable') {
        before[key] = column[key];
        after[key] = Boolean(partial[key]);
      } else {
        before[key] = column[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetColumnPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign column material' : 'Edit column',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedCurvedWall = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit curved wall: actor or authoring layer is locked.');
      return;
    }
    const wall = world.getActor(actorId)?.getComponent('CurvedWall');
    if (!wall) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['radius', 'height', 'thickness'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = wall[key];
        after[key] = Math.max(1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'sweepAngle') {
        const raw = Number(partial.sweepAngle);
        if (!Number.isFinite(raw)) continue;
        before.sweepAngle = wall.sweepAngle;
        after.sweepAngle = Math.max(1, Math.min(360, raw));
      } else if (key === 'startAngle' || key === 'miterStart' || key === 'miterEnd') {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = wall[key];
        after[key] = raw;
      } else if (key === 'curveResolution') {
        before.curveResolution = wall.curveResolution;
        after.curveResolution = Math.max(4, Math.min(128, Math.round(Number(partial.curveResolution) || 4)));
      } else if (key === 'clockwise' || key === 'collidable') {
        before[key] = wall[key];
        after[key] = Boolean(partial[key]);
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...wall.uv.scale },
          offset: { ...wall.uv.offset },
          rotation: wall.uv.rotation,
        };
        after.uv = partial.uv;
      } else {
        before[key] = wall[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetCurvedWallPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign curved wall material' : 'Edit curved wall',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  /**
   * Snap selected wall endpoint to nearest neighboring wall endpoint and apply miters.
   */
  const joinSelectedWallToNearest = useCallback(({
    movingEndId = 'end',
    orient = false,
    maxDist = WALL_ENDPOINT_SNAP_DIST,
  } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return false;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (!actor) return false;
    const eps = getWallEndpoints(actor, world);
    if (!eps) return false;
    const movingEnd = eps[movingEndId] || eps.end;
    const hit = findNearestWallEndpoint(world, movingEnd.position, {
      excludeActorId: actorId,
      maxDist,
    });
    if (!hit) return false;

    const plan = planWallEndpointJoin({
      movingActor: actor,
      movingEndId: movingEnd.id,
      targetActor: hit.actor,
      targetEndId: hit.end.id,
      world,
      orient,
      applyMiter: true,
    });
    if (!plan?.position) return false;

    const patches = [];
    const beforeXform = {
      position: { ...actor.transform.position },
      rotation: { ...actor.transform.rotation },
    };
    const afterXform = {
      position: { ...plan.position },
      rotation: plan.rotation
        ? { ...plan.rotation }
        : { ...actor.transform.rotation },
    };
    const movingPatch = {
      actorId,
      transform: { before: beforeXform, after: afterXform },
    };

    const brush = actor.getComponent('Brush');
    const curved = actor.getComponent('CurvedWall');
    if (brush) {
      movingPatch.brushMiters = {
        before: { miterStart: brush.miterStart, miterEnd: brush.miterEnd },
        after: {
          miterStart: movingEndId === 'start' ? plan.miterMoving : brush.miterStart,
          miterEnd: movingEndId === 'end' ? plan.miterMoving : brush.miterEnd,
        },
      };
    }
    if (curved) {
      movingPatch.curvedMiters = {
        before: { miterStart: curved.miterStart, miterEnd: curved.miterEnd },
        after: {
          miterStart: movingEndId === 'start' ? plan.miterMoving : curved.miterStart,
          miterEnd: movingEndId === 'end' ? plan.miterMoving : curved.miterEnd,
        },
      };
    }
    patches.push(movingPatch);

    const targetBrush = hit.actor.getComponent('Brush');
    const targetCurved = hit.actor.getComponent('CurvedWall');
    if (targetBrush) {
      patches.push({
        actorId: hit.actor.id,
        brushMiters: {
          before: { miterStart: targetBrush.miterStart, miterEnd: targetBrush.miterEnd },
          after: {
            miterStart: hit.end.id === 'start' ? plan.miterTarget : targetBrush.miterStart,
            miterEnd: hit.end.id === 'end' ? plan.miterTarget : targetBrush.miterEnd,
          },
        },
      });
    }
    if (targetCurved) {
      patches.push({
        actorId: hit.actor.id,
        curvedMiters: {
          before: { miterStart: targetCurved.miterStart, miterEnd: targetCurved.miterEnd },
          after: {
            miterStart: hit.end.id === 'start' ? plan.miterTarget : targetCurved.miterStart,
            miterEnd: hit.end.id === 'end' ? plan.miterTarget : targetCurved.miterEnd,
          },
        },
      });
    }

    executeCommand(
      new JoinWallEndpointsCommand({
        world,
        patches,
        label: orient ? 'Join wall (orient)' : 'Join walls',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId, hit.actor.id]);
    return true;
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedArch = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    if (isEditorActorLocked(world.getActor(actorId))) {
      setStatus('Cannot edit arch: actor or authoring layer is locked.');
      return;
    }
    const arch = world.getActor(actorId)?.getComponent('Arch');
    if (!arch) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['openingWidth', 'openingHeight', 'archRise', 'thickness', 'depth'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = arch[key];
        after[key] = Math.max(1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'curveResolution') {
        before.curveResolution = arch.curveResolution;
        after.curveResolution = Math.max(4, Math.min(64, Math.round(Number(partial.curveResolution) || 4)));
      } else if (key === 'archType') {
        if (!ARCH_TYPES.includes(partial.archType)) continue;
        before.archType = arch.archType;
        after.archType = partial.archType;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...arch.uv.scale },
          offset: { ...arch.uv.offset },
          rotation: arch.uv.rotation,
        };
        after.uv = partial.uv;
      } else if (key === 'collidable') {
        before.collidable = arch.collidable;
        after.collidable = Boolean(partial.collidable);
      } else {
        before[key] = arch[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetArchPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign arch material' : 'Edit arch',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  return {
    commitStaticMeshGesture,
    joinSelectedWallToNearest,
    updateSelectedArch,
    updateSelectedColumn,
    updateSelectedCurvedWall,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedStaticMesh,
  };
}
