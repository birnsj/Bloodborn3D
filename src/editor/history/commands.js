import { Actor } from '../../core/Actor.js';
import { createComponentFromJSON } from '../../components/componentRegistry.js';
import { getDescendants } from '../../core/hierarchy.js';
import {
  applyActorUvPatch,
  applyPlainComponentPatch,
  applySurfaceFields,
  applyUvSurfaceComponentPatch,
  createComponentPropertiesCommandClass,
  createWorldFieldCommandClass,
} from './componentPropertyCommands.js';

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
 * Batch 7.1 — pivot edit: actor transform + contentOffset + compensated children.
 * changes: [{ before: snapshotPivotState, after: snapshotPivotState }]
 */
export class SetPivotCommand {
  constructor({ world, changes, label = 'Edit pivot' }) {
    this.world = world;
    this.label = label;
    this.changes = (changes || []).map((c) => ({
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
      const state = c[key];
      if (!state?.actorId) continue;
      const actor = this.world.getActor(state.actorId);
      if (!actor) continue;
      actor.transform.copyFrom(state.transform);
      actor.contentOffset = {
        x: Number(state.contentOffset?.x) || 0,
        y: Number(state.contentOffset?.y) || 0,
        z: Number(state.contentOffset?.z) || 0,
      };
      for (const row of state.children || []) {
        const child = this.world.getActor(row.actorId);
        if (child) child.transform.copyFrom(row.transform);
      }
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
export const SetLightPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Light',
  applyPatch: applyPlainComponentPatch,
  defaultLabel: 'Edit light',
});

/** Patch PrimitiveMeshComponent properties (Batch 5). */
export const SetPrimitiveMeshPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'PrimitiveMesh',
  applyPatch: applyPlainComponentPatch,
  defaultLabel: 'Edit primitive',
});

/** Patch EnvironmentComponent properties (Batch 4). */
export const SetEnvironmentPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Environment',
  applyPatch: applyPlainComponentPatch,
  defaultLabel: 'Edit environment',
});

/** Replace map-authored world.scene settings (background, fog, environment, sky). */
export const SetWorldSceneCommand = createWorldFieldCommandClass({
  field: 'scene',
  defaultLabel: 'Edit world scene',
});

/** Replace map-authored world.ambient settings (scene fill). */
export const SetWorldAmbientCommand = createWorldFieldCommandClass({
  field: 'ambient',
  defaultLabel: 'Edit world ambient',
});

/** Replace map-authored world.renderer settings. */
export const SetWorldRendererCommand = createWorldFieldCommandClass({
  field: 'renderer',
  defaultLabel: 'Edit world renderer',
});

/**
 * Replace map-authored post-processing settings on the World.
 * `onApply` notifies the live SceneView (kept out of the command for testability).
 */
export const SetWorldPostProcessingCommand = createWorldFieldCommandClass({
  field: 'postProcessing',
  defaultLabel: 'Edit post-processing',
});

/** Patch StairComponent properties. */
export const SetStairPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Stair',
  defaultLabel: 'Edit stairs',
  applyPatch: (stair, state) => applyUvSurfaceComponentPatch(stair, state, {
    stepCount: (comp, value) => {
      comp.stepCount = Math.max(1, Math.round(Number(value) || 1));
    },
  }),
});

/** Patch RampComponent properties. */
export const SetRampPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Ramp',
  defaultLabel: 'Edit ramp',
  applyPatch: (ramp, state) => applyUvSurfaceComponentPatch(ramp, state),
});

/** Patch ColumnComponent properties. */
export const SetColumnPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Column',
  defaultLabel: 'Edit column',
  applyPatch: (column, state) => applyUvSurfaceComponentPatch(column, state, {
    sides: (comp, value) => {
      comp.sides = Math.max(3, Math.min(64, Math.round(Number(value) || 3)));
    },
  }),
});

/** Patch CurvedWallComponent properties. */
export const SetCurvedWallPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'CurvedWall',
  defaultLabel: 'Edit curved wall',
  applyPatch: (wall, state) => applyUvSurfaceComponentPatch(wall, state, {
    curveResolution: (comp, value) => {
      comp.curveResolution = Math.max(4, Math.min(128, Math.round(Number(value) || 4)));
    },
    sweepAngle: (comp, value) => {
      comp.sweepAngle = Math.max(1, Math.min(360, Number(value) || 1));
    },
  }),
});

/** Patch ArchComponent properties. */
export const SetArchPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'Arch',
  defaultLabel: 'Edit arch',
  applyPatch: (arch, state) => applyUvSurfaceComponentPatch(arch, state, {
    curveResolution: (comp, value) => {
      comp.curveResolution = Math.max(4, Math.min(64, Math.round(Number(value) || 4)));
    },
  }),
});

/** Patch StaticMeshComponent properties. */
export const SetStaticMeshPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'StaticMesh',
  applyPatch: applyPlainComponentPatch,
  defaultLabel: 'Edit mesh',
});

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
 * Replace world.actors order (Outliner sibling rearrange). IDs must match the current set.
 */
export class SetActorOrderCommand {
  constructor({ world, beforeIds, afterIds, label = 'Reorder' }) {
    this.world = world;
    this.label = label;
    this.beforeIds = [...(beforeIds || [])];
    this.afterIds = [...(afterIds || [])];
  }

  do() {
    this._apply(this.afterIds);
  }

  undo() {
    this._apply(this.beforeIds);
  }

  _apply(ids) {
    if (!this.world || !Array.isArray(ids) || !ids.length) return;
    const byId = new Map(this.world.actors.map((a) => [a.id, a]));
    if (byId.size !== ids.length) return;
    const next = [];
    for (const id of ids) {
      const actor = byId.get(id);
      if (!actor) return;
      next.push(actor);
      byId.delete(id);
    }
    if (byId.size) return;
    this.world.actors = next;
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
    if ('iconColor' in state) {
      const raw = state.iconColor;
      if (raw == null || raw === '') {
        actor.iconColor = null;
      } else {
        const hex = String(raw).trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) actor.iconColor = hex.toLowerCase();
      }
    }
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
 * Failed do() rolls back already-applied sub-commands (Phase 2F.7E).
 */
export class CompositeCommand {
  constructor({ commands, label = 'Edit' }) {
    this.commands = commands || [];
    this.label = label;
  }

  do() {
    const applied = [];
    try {
      for (const cmd of this.commands) {
        cmd.do();
        applied.push(cmd);
      }
    } catch (err) {
      for (let i = applied.length - 1; i >= 0; i -= 1) {
        applied[i].undo();
      }
      throw err;
    }
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i -= 1) {
      this.commands[i].undo();
    }
  }
}

/**
 * Patch ConvexBrush material / UV / face / color / collidable fields.
 * Intentional whitelist (not a plain full-key copy).
 */
export const SetConvexBrushPropertiesCommand = createComponentPropertiesCommandClass({
  componentType: 'ConvexBrush',
  defaultLabel: 'ConvexBrush properties',
  applyPatch: (convex, state) => {
    if ('materialId' in state) convex.materialId = state.materialId;
    applySurfaceFields(convex, state);
    if ('uv' in state && state.uv) applyActorUvPatch(convex, state.uv);
    if ('color' in state) convex.color = state.color;
    if ('collidable' in state) convex.collidable = state.collidable;
  },
});

/**
 * Batch 9 — replace world.authoringLayers tree (create/rename/color/reorder/reparent/delete).
 * Actor reassignment for deletes is applied via companion SetActorsAuthoringLayerCommand
 * or included actorPatches on this command.
 */
export class SetAuthoringLayersTreeCommand {
  constructor({
    world,
    before,
    after,
    actorPatches = null,
    label = 'Edit authoring layers',
    onApply = null,
  }) {
    this.world = world;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.actorPatches = actorPatches
      ? actorPatches.map((p) => structuredClone(p))
      : null;
    this.label = label;
    this.onApply = onApply;
    this._beforeActors = null;
  }

  do() {
    if (this.actorPatches?.length && !this._beforeActors) {
      this._beforeActors = this.actorPatches.map(({ actorId }) => {
        const actor = this.world.getActor(actorId);
        return {
          actorId,
          authoringLayerId: actor?.authoringLayerId || null,
        };
      });
    }
    this._apply(this.after, this.actorPatches);
  }

  undo() {
    this._apply(this.before, this._beforeActors);
  }

  _apply(state, patches) {
    this.world.authoringLayers = structuredClone(state);
    if (patches?.length) {
      for (const { actorId, authoringLayerId } of patches) {
        const actor = this.world.getActor(actorId);
        if (actor) actor.authoringLayerId = authoringLayerId || null;
      }
    }
    this.onApply?.(this.world.authoringLayers);
  }
}

/**
 * Replace world.outliner layout (category headers + root display order).
 * Optional afterActorIds also rewrites world.actors order (same contract as SetActorOrderCommand).
 */
export class SetOutlinerLayoutCommand {
  constructor({
    world,
    before,
    after,
    beforeActorIds = null,
    afterActorIds = null,
    label = 'Edit outliner',
  }) {
    this.world = world;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
    this.beforeActorIds = beforeActorIds ? [...beforeActorIds] : null;
    this.afterActorIds = afterActorIds ? [...afterActorIds] : null;
    this.label = label;
  }

  do() {
    this._apply(this.after, this.afterActorIds);
  }

  undo() {
    this._apply(this.before, this.beforeActorIds);
  }

  _apply(layout, actorIds) {
    if (!this.world) return;
    this.world.outliner = structuredClone(layout);
    if (!actorIds?.length) return;
    const byId = new Map(this.world.actors.map((a) => [a.id, a]));
    if (byId.size !== actorIds.length) return;
    const next = [];
    for (const id of actorIds) {
      const actor = byId.get(id);
      if (!actor) return;
      next.push(actor);
      byId.delete(id);
    }
    if (byId.size) return;
    this.world.actors = next;
  }
}

/** Batch 9 — assign one or more actors to an authoring layer. */
export class SetActorsAuthoringLayerCommand {
  constructor({ world, assignments, label = 'Assign authoring layer' }) {
    this.world = world;
    this.label = label;
    this.after = assignments.map((a) => ({
      actorId: a.actorId,
      authoringLayerId: a.authoringLayerId || null,
    }));
    this.before = this.after.map(({ actorId }) => {
      const actor = world.getActor(actorId);
      return {
        actorId,
        authoringLayerId: actor?.authoringLayerId || null,
      };
    });
  }

  do() {
    this._apply(this.after);
  }

  undo() {
    this._apply(this.before);
  }

  _apply(list) {
    for (const { actorId, authoringLayerId } of list) {
      const actor = this.world.getActor(actorId);
      if (actor) actor.authoringLayerId = authoringLayerId || null;
    }
  }
}

/** Batch 9 — change active authoring layer (serialized with the level). */
export class SetActiveAuthoringLayerCommand {
  constructor({ world, beforeId, afterId, label = 'Set active authoring layer', onApply = null }) {
    this.world = world;
    this.beforeId = beforeId || null;
    this.afterId = afterId || null;
    this.label = label;
    this.onApply = onApply;
  }

  do() {
    this._apply(this.afterId);
  }

  undo() {
    this._apply(this.beforeId);
  }

  _apply(id) {
    if (!this.world.authoringLayers) return;
    this.world.authoringLayers = {
      ...this.world.authoringLayers,
      activeLayerId: id,
    };
    this.onApply?.(id);
  }
}
