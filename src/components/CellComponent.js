import { Component } from '../core/Component.js';

/**
 * Marks an Actor as a Cell root — a logical level section.
 * Membership is hierarchy: actors parented under this cell (directly or nested).
 * Streaming is not implemented; this marker keeps the door open.
 */
export class CellComponent extends Component {
  constructor({
    id,
    enabled,
    color = '#4d7ea8',
  } = {}) {
    super({ id, type: CellComponent.componentType, enabled });
    this.color = color;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      color: this.color,
    };
  }

  static fromJSON(data) {
    return new CellComponent(data);
  }
}

CellComponent.componentType = 'Cell';
