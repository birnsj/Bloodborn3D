import { Component } from '../core/Component.js';

/**
 * Marks an actor as the first-person spawn point for Play mode.
 */
export class PlayerSpawnComponent extends Component {
  constructor({
    id,
    enabled,
    eyeHeight = 160,
    moveSpeed = 450,
  } = {}) {
    super({ id, type: PlayerSpawnComponent.componentType, enabled });
    this.eyeHeight = eyeHeight;
    this.moveSpeed = moveSpeed;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      eyeHeight: this.eyeHeight,
      moveSpeed: this.moveSpeed,
    };
  }

  static fromJSON(data) {
    return new PlayerSpawnComponent(data);
  }
}

PlayerSpawnComponent.componentType = 'PlayerSpawn';
