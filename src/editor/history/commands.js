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
