import { Actor } from '../../core/Actor.js';
import { createComponentFromJSON } from '../../components/componentRegistry.js';

function cloneActorJson(actor) {
  return structuredClone(actor.toJSON());
}

function restoreActorFromJson(data) {
  return Actor.fromJSON(data, createComponentFromJSON);
}

/**
 * Insert one or more actors (create / duplicate).
 */
export class AddActorsCommand {
  constructor({ world, actorsJson, label = 'Add actors' }) {
    this.world = world;
    this.actorsJson = actorsJson.map((a) => structuredClone(a));
    this.label = label;
  }

  do() {
    for (const data of this.actorsJson) {
      if (this.world.getActor(data.id)) continue;
      this.world.addActor(restoreActorFromJson(data));
    }
  }

  undo() {
    for (const data of this.actorsJson) {
      this.world.removeActor(data.id);
    }
  }
}

/**
 * Remove actors; stores full JSON for restore.
 */
export class RemoveActorsCommand {
  constructor({ world, actorIds, label = 'Delete actors' }) {
    this.world = world;
    this.actorIds = [...actorIds];
    this.label = label;
    this.actorsJson = this.actorIds
      .map((id) => world.getActor(id))
      .filter(Boolean)
      .map(cloneActorJson);
  }

  do() {
    for (const id of this.actorIds) {
      this.world.removeActor(id);
    }
  }

  undo() {
    for (const data of this.actorsJson) {
      if (this.world.getActor(data.id)) continue;
      this.world.addActor(restoreActorFromJson(data));
    }
  }
}

/**
 * Set transform position/rotation/scale for one or more actors.
 */
export class SetTransformsCommand {
  constructor({ world, changes, label = 'Move' }) {
    this.world = world;
    this.label = label;
    // changes: [{ actorId, before: transformJSON, after: transformJSON }]
    this.changes = changes.map((c) => ({
      actorId: c.actorId,
      before: structuredClone(c.before),
      after: structuredClone(c.after),
    }));
  }

  do() {
    for (const c of this.changes) {
      const actor = this.world.getActor(c.actorId);
      if (!actor) continue;
      actor.transform.copyFrom(c.after);
    }
  }

  undo() {
    for (const c of this.changes) {
      const actor = this.world.getActor(c.actorId);
      if (!actor) continue;
      actor.transform.copyFrom(c.before);
    }
  }
}

/**
 * Set brush size (and optional compensating position) for actors.
 */
export class SetBrushGeometryCommand {
  constructor({ world, changes, label = 'Resize brush' }) {
    this.world = world;
    this.label = label;
    // changes: [{ actorId, before: { size, position }, after: { size, position } }]
    this.changes = changes.map((c) => ({
      actorId: c.actorId,
      before: structuredClone(c.before),
      after: structuredClone(c.after),
    }));
  }

  do() {
    this._apply(this.changes, 'after');
  }

  undo() {
    this._apply(this.changes, 'before');
  }

  _apply(changes, key) {
    for (const c of changes) {
      const actor = this.world.getActor(c.actorId);
      const brush = actor?.getComponent('Brush');
      if (!brush) continue;
      const state = c[key];
      brush.size = { ...state.size };
      if (state.position) {
        actor.transform.position = { ...state.position };
      }
    }
  }
}

export class RenameActorCommand {
  constructor({ world, actorId, before, after }) {
    this.world = world;
    this.actorId = actorId;
    this.before = before;
    this.after = after;
    this.label = 'Rename';
  }

  do() {
    const actor = this.world.getActor(this.actorId);
    if (actor) actor.name = this.after;
  }

  undo() {
    const actor = this.world.getActor(this.actorId);
    if (actor) actor.name = this.before;
  }
}

export class SetBrushColorCommand {
  constructor({ world, actorId, before, after }) {
    this.world = world;
    this.actorId = actorId;
    this.before = before;
    this.after = after;
    this.label = 'Brush color';
  }

  do() {
    const brush = this.world.getActor(this.actorId)?.getComponent('Brush');
    if (brush) brush.color = this.after;
  }

  undo() {
    const brush = this.world.getActor(this.actorId)?.getComponent('Brush');
    if (brush) brush.color = this.before;
  }
}

/**
 * Replace brush openings array (doors/windows) with undo.
 */
export class SetBrushOpeningsCommand {
  constructor({ world, actorId, before, after, label = 'Edit openings' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before || []);
    this.after = structuredClone(after || []);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(openings) {
    const brush = this.world.getActor(this.actorId)?.getComponent('Brush');
    if (!brush) return;
    brush.openings = Array.isArray(openings) ? structuredClone(openings) : [];
  }
}

/**
 * Patch brush material / UV / face material fields.
 * before/after are partial property bags applied onto BrushComponent.
 */
export class SetBrushMaterialCommand {
  constructor({ world, actorId, before, after, label = 'Brush material' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const brush = this.world.getActor(this.actorId)?.getComponent('Brush');
    if (!brush) return;
    if ('materialId' in state) brush.materialId = state.materialId;
    if ('faceMaterials' in state) {
      brush.faceMaterials = state.faceMaterials
        ? { ...state.faceMaterials }
        : null;
    }
    if ('uv' in state && state.uv) {
      brush.uv = {
        scale: { ...(state.uv.scale || brush.uv.scale) },
        offset: { ...(state.uv.offset || brush.uv.offset) },
        rotation: state.uv.rotation ?? brush.uv.rotation,
      };
    }
    if ('color' in state) brush.color = state.color;
    if ('collidable' in state) brush.collidable = state.collidable;
    if ('operation' in state) {
      brush.operation = state.operation === 'subtract' ? 'subtract' : 'add';
    }
    if ('miterStart' in state) brush.miterStart = Number(state.miterStart) || 0;
    if ('miterEnd' in state) brush.miterEnd = Number(state.miterEnd) || 0;
  }
}

/**
 * Composite: move/rotate a wall onto another endpoint and set miters on both.
 * patches: [{ actorId, transform?: {before, after}, brushMiters?: {before, after}, curvedMiters?: {before, after} }]
 */
export class JoinWallEndpointsCommand {
  constructor({ world, patches, label = 'Join walls' }) {
    this.world = world;
    this.patches = structuredClone(patches || []);
    this.label = label;
  }

  do() {
    this._apply('after');
  }

  undo() {
    this._apply('before');
  }

  _apply(which) {
    for (const p of this.patches) {
      const actor = this.world.getActor(p.actorId);
      if (!actor) continue;
      if (p.transform) {
        const t = p.transform[which];
        if (t?.position) actor.transform.position = { ...t.position };
        if (t?.rotation) actor.transform.rotation = { ...t.rotation };
      }
      if (p.brushMiters) {
        const brush = actor.getComponent('Brush');
        const m = p.brushMiters[which];
        if (brush && m) {
          if ('miterStart' in m) brush.miterStart = Number(m.miterStart) || 0;
          if ('miterEnd' in m) brush.miterEnd = Number(m.miterEnd) || 0;
        }
      }
      if (p.curvedMiters) {
        const wall = actor.getComponent('CurvedWall');
        const m = p.curvedMiters[which];
        if (wall && m) {
          if ('miterStart' in m) wall.miterStart = Number(m.miterStart) || 0;
          if ('miterEnd' in m) wall.miterEnd = Number(m.miterEnd) || 0;
        }
      }
    }
  }
}

/**
 * Patch LightComponent properties.
 */
export class SetLightPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit light' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const light = this.world.getActor(this.actorId)?.getComponent('Light');
    if (!light) return;
    for (const key of Object.keys(state)) {
      light[key] = state[key];
    }
  }
}

/**
 * Patch StairComponent properties.
 */
export class SetStairPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit stairs' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const stair = this.world.getActor(this.actorId)?.getComponent('Stair');
    if (!stair) return;
    for (const key of Object.keys(state)) {
      if (key === 'uv' && state.uv) {
        stair.uv = {
          scale: { ...(state.uv.scale || stair.uv.scale) },
          offset: { ...(state.uv.offset || stair.uv.offset) },
          rotation: state.uv.rotation ?? stair.uv.rotation,
        };
      } else if (key === 'stepCount') {
        stair.stepCount = Math.max(1, Math.round(Number(state.stepCount) || 1));
      } else {
        stair[key] = state[key];
      }
    }
  }
}

/**
 * Patch RampComponent properties.
 */
export class SetRampPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit ramp' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const ramp = this.world.getActor(this.actorId)?.getComponent('Ramp');
    if (!ramp) return;
    for (const key of Object.keys(state)) {
      if (key === 'uv' && state.uv) {
        ramp.uv = {
          scale: { ...(state.uv.scale || ramp.uv.scale) },
          offset: { ...(state.uv.offset || ramp.uv.offset) },
          rotation: state.uv.rotation ?? ramp.uv.rotation,
        };
      } else {
        ramp[key] = state[key];
      }
    }
  }
}

/**
 * Patch ColumnComponent properties.
 */
export class SetColumnPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit column' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const column = this.world.getActor(this.actorId)?.getComponent('Column');
    if (!column) return;
    for (const key of Object.keys(state)) {
      if (key === 'uv' && state.uv) {
        column.uv = {
          scale: { ...(state.uv.scale || column.uv.scale) },
          offset: { ...(state.uv.offset || column.uv.offset) },
          rotation: state.uv.rotation ?? column.uv.rotation,
        };
      } else if (key === 'sides') {
        column.sides = Math.max(3, Math.min(64, Math.round(Number(state.sides) || 3)));
      } else {
        column[key] = state[key];
      }
    }
  }
}

/**
 * Patch CurvedWallComponent properties.
 */
export class SetCurvedWallPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit curved wall' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const wall = this.world.getActor(this.actorId)?.getComponent('CurvedWall');
    if (!wall) return;
    for (const key of Object.keys(state)) {
      if (key === 'uv' && state.uv) {
        wall.uv = {
          scale: { ...(state.uv.scale || wall.uv.scale) },
          offset: { ...(state.uv.offset || wall.uv.offset) },
          rotation: state.uv.rotation ?? wall.uv.rotation,
        };
      } else if (key === 'curveResolution') {
        wall.curveResolution = Math.max(4, Math.min(128, Math.round(Number(state.curveResolution) || 4)));
      } else if (key === 'sweepAngle') {
        wall.sweepAngle = Math.max(1, Math.min(360, Number(state.sweepAngle) || 1));
      } else {
        wall[key] = state[key];
      }
    }
  }
}

/**
 * Patch ArchComponent properties.
 */
export class SetArchPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit arch' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const arch = this.world.getActor(this.actorId)?.getComponent('Arch');
    if (!arch) return;
    for (const key of Object.keys(state)) {
      if (key === 'uv' && state.uv) {
        arch.uv = {
          scale: { ...(state.uv.scale || arch.uv.scale) },
          offset: { ...(state.uv.offset || arch.uv.offset) },
          rotation: state.uv.rotation ?? arch.uv.rotation,
        };
      } else if (key === 'curveResolution') {
        arch.curveResolution = Math.max(4, Math.min(64, Math.round(Number(state.curveResolution) || 4)));
      } else {
        arch[key] = state[key];
      }
    }
  }
}

/**
 * Patch StaticMeshComponent properties.
 */
export class SetStaticMeshPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'Edit mesh' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const mesh = this.world.getActor(this.actorId)?.getComponent('StaticMesh');
    if (!mesh) return;
    for (const key of Object.keys(state)) {
      mesh[key] = state[key];
    }
  }
}

/**
 * Reparent actors while storing before/after parentId + local transform.
 * changes: [{ actorId, before: { parentId, transform }, after: { parentId, transform } }]
 */
export class ReparentActorsCommand {
  constructor({ world, changes, label = 'Reparent' }) {
    this.world = world;
    this.label = label;
    this.changes = changes.map((c) => ({
      actorId: c.actorId,
      before: structuredClone(c.before),
      after: structuredClone(c.after),
    }));
  }

  do() {
    this._apply('after');
  }

  undo() {
    this._apply('before');
  }

  _apply(key) {
    for (const c of this.changes) {
      const actor = this.world.getActor(c.actorId);
      if (!actor) continue;
      const state = c[key];
      actor.parentId = state.parentId || null;
      if (state.transform) {
        actor.transform.copyFrom(state.transform);
      }
      if ('visible' in state) actor.visible = state.visible !== false;
      if ('locked' in state) actor.locked = Boolean(state.locked);
    }
  }
}

/**
 * Set actor flags (visible / locked / name tags) with undo.
 */
export class SetActorFlagsCommand {
  constructor({ world, actorId, before, after, label = 'Actor flags' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(state) {
    const actor = this.world.getActor(this.actorId);
    if (!actor) return;
    if ('visible' in state) actor.visible = state.visible !== false;
    if ('locked' in state) actor.locked = Boolean(state.locked);
    if ('name' in state) actor.name = state.name;
  }
}

/**
 * Replace a set of actors (used for prefab sync / unpack snapshots).
 * beforeJson / afterJson are full actor JSON arrays.
 */
export class ReplaceActorsCommand {
  constructor({ world, beforeJson, afterJson, label = 'Replace actors' }) {
    this.world = world;
    this.beforeJson = beforeJson.map((a) => structuredClone(a));
    this.afterJson = afterJson.map((a) => structuredClone(a));
    this.label = label;
  }

  do() {
    this._swap(this.beforeJson, this.afterJson);
  }

  undo() {
    this._swap(this.afterJson, this.beforeJson);
  }

  _swap(removeList, addList) {
    const removeIds = new Set(removeList.map((a) => a.id));
    for (const id of removeIds) {
      this.world.removeActor(id);
    }
    for (const data of addList) {
      if (this.world.getActor(data.id)) continue;
      this.world.addActor(restoreActorFromJson(data));
    }
  }
}

/**
 * Update prefab overrides blob on a root actor.
 */
export class SetPrefabOverridesCommand {
  constructor({ world, actorId, before, after, label = 'Prefab override' }) {
    this.world = world;
    this.actorId = actorId;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.label = label;
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(overrides) {
    const actor = this.world.getActor(this.actorId);
    if (!actor?.prefab) return;
    actor.prefab.overrides = structuredClone(overrides || {});
  }
}
