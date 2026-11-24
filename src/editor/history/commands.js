import { Actor } from '../../core/Actor.js';
import { createComponentFromJSON } from '../../components/componentRegistry.js';
import { getDescendants } from '../../core/hierarchy.js';
import {
  allowedSurfaceIdsForComponent,
  normalizeFaceMaterials,
  normalizeFaceUVs,
} from '../../runtime/surfaces.js';

function cloneActorJson(actor) {
  return structuredClone(actor.toJSON());
}

/** Keep faceMaterials / faceUVs normalized when history applies snapshots (Phase 2E.5 / 2F.0). */
function applySurfaceFields(comp, state) {
  const allowed = allowedSurfaceIdsForComponent(comp);
  if ('faceMaterials' in state) {
    comp.faceMaterials = normalizeFaceMaterials(state.faceMaterials, allowed);
  }
  if ('faceUVs' in state) {
    comp.faceUVs = normalizeFaceUVs(state.faceUVs, allowed);
  }
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
 * Remove actors together with every descendant, so no child is left pointing at
 * a missing parent. Stores full JSON plus each actor's original position in
 * `world.actors`, so Undo restores IDs, transforms, parent links, prefab
 * metadata and outliner order exactly.
 */
export class RemoveActorsCommand {
  constructor({ world, actorIds, label = 'Delete actors' }) {
    this.world = world;
    this.label = label;

    const doomed = new Set();
    for (const id of actorIds) {
      if (!world.getActor(id)) continue;
      doomed.add(id);
      for (const d of getDescendants(id, world)) doomed.add(d.id);
    }

    // Walk the world list (not the input) so entries are in original order.
    this.entries = [];
    world.actors.forEach((actor, index) => {
      if (doomed.has(actor.id)) {
        this.entries.push({ index, id: actor.id, json: cloneActorJson(actor) });
      }
    });
    this.actorIds = this.entries.map((e) => e.id);
    this.actorsJson = this.entries.map((e) => e.json);
  }

  do() {
    for (const id of this.actorIds) {
      this.world.removeActor(id);
    }
  }

  undo() {
    // Ascending original index: each insert lands where the actor used to be.
    for (const entry of this.entries) {
      if (this.world.getActor(entry.id)) continue;
      this.world.addActor(restoreActorFromJson(entry.json), entry.index);
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
    applySurfaceFields(brush, state);
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
      if (key === 'faceMaterials' || key === 'faceUVs') continue;
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
    applySurfaceFields(stair, state);
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
      if (key === 'faceMaterials' || key === 'faceUVs') continue;
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
    applySurfaceFields(ramp, state);
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
      if (key === 'faceMaterials' || key === 'faceUVs') continue;
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
    applySurfaceFields(column, state);
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
      if (key === 'faceMaterials' || key === 'faceUVs') continue;
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
    applySurfaceFields(wall, state);
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
      if (key === 'faceMaterials' || key === 'faceUVs') continue;
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
    applySurfaceFields(arch, state);
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

/**
 * Replace a Brush component with a ConvexBrush (or reverse on undo).
 * Snapshots are full component JSON; component id is preserved.
 */
export class ConvertBrushToConvexCommand {
  constructor({
    world,
    actorId,
    brushJson,
    convexJson,
    label = 'Convert to Convex Brush',
  }) {
    this.world = world;
    this.actorId = actorId;
    this.brushJson = structuredClone(brushJson);
    this.convexJson = structuredClone(convexJson);
    this.label = label;
  }

  do() {
    this._replace(this.brushJson?.type || 'Brush', this.convexJson);
  }

  undo() {
    this._replace(this.convexJson?.type || 'ConvexBrush', this.brushJson);
  }

  _replace(removeType, nextJson) {
    const actor = this.world.getActor(this.actorId);
    if (!actor || !nextJson) return;
    const existing = actor.getComponent(removeType);
    if (existing) actor.removeComponent(existing);
    // Also clear the other type if somehow both exist.
    const other = removeType === 'Brush' ? 'ConvexBrush' : 'Brush';
    const stray = actor.getComponent(other);
    if (stray) actor.removeComponent(stray);
    actor.addComponent(createComponentFromJSON(nextJson));
  }
}

/**
 * Atomically set ConvexBrush geometry (+ face maps) for one or more actors.
 * changes: [{ actorId, before: { geometry, faceMaterials, faceUVs }, after: {...} }]
 */
export class SetConvexGeometryCommand {
  constructor({ world, changes, label = 'Edit ConvexBrush geometry' }) {
    this.world = world;
    this.label = label;
    this.changes = (changes || []).map((c) => ({
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
      const convex = this.world.getActor(c.actorId)?.getComponent('ConvexBrush');
      if (!convex) continue;
      const state = c[key];
      if (!state) continue;
      if ('geometry' in state) convex.geometry = structuredClone(state.geometry);
      applySurfaceFields(convex, state);
      // Keep validity flags in sync with applied geometry.
      if (convex.geometry) {
        convex.invalidGeometry = null;
        convex.geometryError = null;
        if (convex.enabled === false && !convex.geometryError) {
          convex.enabled = true;
        }
      }
    }
  }
}

/**
 * Run several commands as one undo step.
 */
export class CompositeCommand {
  constructor({ commands, label = 'Edit' }) {
    this.commands = commands || [];
    this.label = label;
  }

  do() {
    for (const cmd of this.commands) cmd.do();
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i -= 1) {
      this.commands[i].undo();
    }
  }
}

/**
 * Patch ConvexBrush material / UV / face / color / collidable fields.
 */
export class SetConvexBrushPropertiesCommand {
  constructor({ world, actorId, before, after, label = 'ConvexBrush properties' }) {
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
    const convex = this.world.getActor(this.actorId)?.getComponent('ConvexBrush');
    if (!convex) return;
    if ('materialId' in state) convex.materialId = state.materialId;
    applySurfaceFields(convex, state);
    if ('uv' in state && state.uv) {
      convex.uv = {
        scale: { ...(state.uv.scale || convex.uv.scale) },
        offset: { ...(state.uv.offset || convex.uv.offset) },
        rotation: state.uv.rotation ?? convex.uv.rotation,
      };
    }
    if ('color' in state) convex.color = state.color;
    if ('collidable' in state) convex.collidable = state.collidable;
  }
}
