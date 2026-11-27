import { ensureId } from './ids.js';

/**
 * Base serializable Component. Gameplay-facing; no React/Three coupling.
 */
export class Component {
  constructor({ id, type, enabled = true, ...props } = {}) {
    this.id = ensureId(id, 'comp');
    this.type = type || this.constructor.componentType || 'Component';
    this.enabled = enabled;
    this.actor = null;
    Object.assign(this, props);
  }

  onAttach(_actor) {}
  onDetach() {}

  toJSON() {
    const { actor: _actor, ...rest } = this;
    return structuredClone(rest);
  }

  static fromJSON(data) {
    return new Component(data);
  }
}

Component.componentType = 'Component';
