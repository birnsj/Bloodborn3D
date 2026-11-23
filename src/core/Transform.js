/**
 * Transform stored in editor units / degrees for serialization.
 * Runtime adapters convert to meters / radians at the engine boundary.
 */
export class Transform {
  constructor({
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
    scale = { x: 1, y: 1, z: 1 },
  } = {}) {
    this.position = { ...position };
    this.rotation = { ...rotation };
    this.scale = { ...scale };
  }

  clone() {
    return new Transform({
      position: { ...this.position },
      rotation: { ...this.rotation },
      scale: { ...this.scale },
    });
  }

  copyFrom(other) {
    this.position = { ...other.position };
    this.rotation = { ...other.rotation };
    this.scale = { ...other.scale };
    return this;
  }

  setPosition(x, y, z) {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    return this;
  }

  toJSON() {
    return {
      position: { ...this.position },
      rotation: { ...this.rotation },
      scale: { ...this.scale },
    };
  }

  static fromJSON(data = {}) {
    return new Transform(data);
  }
}
