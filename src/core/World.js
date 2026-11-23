/**
 * Engine-neutral world: collection of actors and play/edit mode flag.
 * No Three.js or React dependencies.
 */
export class World {
  constructor({ name = 'Untitled Level', schemaVersion = 1 } = {}) {
    this.name = name;
    this.schemaVersion = schemaVersion;
    this.actors = [];
    this.mode = 'edit'; // 'edit' | 'play'
    this._byId = new Map();
  }

  addActor(actor) {
    if (this._byId.has(actor.id)) {
      throw new Error(`Actor id already exists: ${actor.id}`);
    }
    actor.world = this;
    this.actors.push(actor);
    this._byId.set(actor.id, actor);
    return actor;
  }

  removeActor(actorOrId) {
    const id = typeof actorOrId === 'string' ? actorOrId : actorOrId.id;
    const actor = this._byId.get(id);
    if (!actor) return false;
    this.actors = this.actors.filter((a) => a.id !== id);
    this._byId.delete(id);
    actor.world = null;
    return true;
  }

  getActor(id) {
    return this._byId.get(id) || null;
  }

  findByName(name) {
    return this.actors.find((a) => a.name === name) || null;
  }

  clear() {
    for (const actor of [...this.actors]) {
      this.removeActor(actor);
    }
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      name: this.name,
      actors: this.actors.map((a) => a.toJSON()),
    };
  }
}
