import { Component } from '../core/Component.js';

/**
 * Places an imported mesh asset in the level.
 * assetId references the project asset registry (not a file path).
 * Collision is explicit and primitive-only in this phase.
 */
export class StaticMeshComponent extends Component {
  constructor({
    id,
    enabled,
    assetId = null,
    collidable = false,
    collisionType = 'none', // 'none' | 'box'
  } = {}) {
    super({ id, type: StaticMeshComponent.componentType, enabled });
    this.assetId = assetId || null;
    this.collidable = Boolean(collidable);
    this.collisionType = collisionType === 'box' ? 'box' : 'none';
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      assetId: this.assetId,
      collidable: this.collidable,
      collisionType: this.collisionType,
    };
  }

  static fromJSON(data) {
    return new StaticMeshComponent(data);
  }
}

StaticMeshComponent.componentType = 'StaticMesh';
