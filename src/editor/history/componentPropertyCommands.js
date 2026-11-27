/**
 * Shared Set*Properties command builders (consolidation C3 / F21).
 * Component-specific apply patches stay explicit; identical scaffolding is shared.
 */

import {
  allowedSurfaceIdsForComponent,
  normalizeFaceMaterials,
  normalizeFaceUVs,
} from '../../runtime/surfaces.js';

/** Keep faceMaterials / faceUVs normalized when history applies snapshots. */
export function applySurfaceFields(comp, state) {
  const allowed = allowedSurfaceIdsForComponent(comp);
  if ('faceMaterials' in state) {
    comp.faceMaterials = normalizeFaceMaterials(state.faceMaterials, allowed);
  }
  if ('faceUVs' in state) {
    comp.faceUVs = normalizeFaceUVs(state.faceUVs, allowed);
  }
}

/** Direct key copy (Light, Environment, PrimitiveMesh, StaticMesh). */
export function applyPlainComponentPatch(comp, state) {
  for (const key of Object.keys(state)) {
    comp[key] = state[key];
  }
}

/** Shared actor UV object merge used by parametric brushes. */
export function applyActorUvPatch(comp, uv) {
  if (!uv) return;
  comp.uv = {
    scale: { ...(uv.scale || comp.uv?.scale) },
    offset: { ...(uv.offset || comp.uv?.offset) },
    rotation: uv.rotation ?? comp.uv?.rotation,
  };
}

/**
 * UV + surface-aware patch with optional per-key handlers.
 * Skips faceMaterials/faceUVs in the loop (handled by applySurfaceFields).
 */
export function applyUvSurfaceComponentPatch(comp, state, keyHandlers = {}) {
  for (const key of Object.keys(state)) {
    if (key === 'faceMaterials' || key === 'faceUVs') continue;
    if (key === 'uv' && state.uv) {
      applyActorUvPatch(comp, state.uv);
    } else if (typeof keyHandlers[key] === 'function') {
      keyHandlers[key](comp, state[key], state);
    } else {
      comp[key] = state[key];
    }
  }
  applySurfaceFields(comp, state);
}

/**
 * Factory for component property commands with identical do/undo contracts.
 * @param {{ componentType: string, applyPatch: Function, defaultLabel?: string }} config
 */
export function createComponentPropertiesCommandClass({
  componentType,
  applyPatch,
  defaultLabel = 'Edit properties',
}) {
  return class SetComponentPropertiesCommand {
    constructor({ world, actorId, before, after, label = defaultLabel }) {
      this.world = world;
      this.actorId = actorId;
      this.before = structuredClone(before);
      this.after = structuredClone(after);
      this.label = label;
      this.componentType = componentType;
    }

    do() {
      this._apply(this.after);
    }

    undo() {
      this._apply(this.before);
    }

    _apply(state) {
      const comp = this.world.getActor(this.actorId)?.getComponent(componentType);
      if (!comp) return;
      applyPatch(comp, state);
    }
  };
}

/**
 * Shared world-field replace command (scene / ambient / renderer / postProcessing).
 * `onApply` notifies SceneView; kept injectable for history unit tests.
 */
export function createWorldFieldCommandClass({
  field,
  defaultLabel = 'Edit world',
  cloneApply = true,
}) {
  return class SetWorldFieldCommand {
    constructor({
      world,
      before,
      after,
      label = defaultLabel,
      onApply = null,
    }) {
      this.world = world;
      this.before = structuredClone(before);
      this.after = structuredClone(after);
      this.label = label;
      this.onApply = onApply;
      this.field = field;
    }

    do() {
      this._apply(this.after);
    }

    undo() {
      this._apply(this.before);
    }

    _apply(state) {
      if (!this.world) return;
      this.world[field] = cloneApply ? structuredClone(state) : state;
      this.onApply?.(this.world[field]);
    }
  };
}
