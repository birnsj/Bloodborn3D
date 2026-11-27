import { ensureId } from './ids.js';
import { Transform } from './Transform.js';
import {
  normalizeContentOffset,
  contentOffsetIsIdentity,
} from './contentOffset.js';
import { normalizeIconColor } from './iconColor.js';

function normalizePrefabLink(prefab) {
  if (!prefab?.prefabId) return null;
  const link = {
    prefabId: String(prefab.prefabId),
    instanceId: prefab.instanceId || null,
    templateId: prefab.templateId || null,
    isRoot: Boolean(prefab.isRoot),
  };
  if (prefab.ownerPrefabId) link.ownerPrefabId = String(prefab.ownerPrefabId);
  if (prefab.ownerInstanceId) link.ownerInstanceId = String(prefab.ownerInstanceId);
  if (prefab.ownerTemplateId) link.ownerTemplateId = String(prefab.ownerTemplateId);
  if (prefab.overrides && typeof prefab.overrides === 'object') {
    link.overrides = structuredClone(prefab.overrides);
  }
  return link;
}

/**
 * Serializable Actor / GameObject with persistent ID and components.
 * transform is LOCAL relative to parentId (or world if unparented).
 */
export class Actor {
  constructor({
    id,
    name = 'Actor',
    transform,
    components = [],
    tags = [],
    parentId = null,
    visible = true,
    locked = false,
    authoringLayerId = null,
    iconColor = null,
    prefab = null,
    contentOffset = null,
  } = {}) {
    this.id = ensureId(id, 'actor');
    this.name = name;
    this.transform = transform instanceof Transform
      ? transform
      : Transform.fromJSON(transform);
    /**
     * Content frame relative to pivot (Actor.transform origin), editor units.
     * Pivot editing moves transform and compensates this offset so visuals stay put.
     */
    this.contentOffset = normalizeContentOffset(contentOffset);
    this.components = [];
    this.tags = [...tags];
    this.parentId = parentId || null;
    this.visible = visible !== false;
    this.locked = Boolean(locked);
    /** Optional Outliner icon tint (#rrggbb). Editor chrome only. */
    this.iconColor = normalizeIconColor(iconColor);
    /** Batch 9 — membership in world.authoringLayers (independent of parentId). */
    this.authoringLayerId = authoringLayerId ? String(authoringLayerId) : null;
    /** @type {null | object} Prefab instance linkage (engine-neutral). */
    this.prefab = prefab && typeof prefab === 'object' && prefab.prefabId
      ? normalizePrefabLink(prefab)
      : null;
    this.world = null;

    for (const comp of components) {
      this.addComponent(comp);
    }
  }

  addComponent(component) {
    if (component.actor && component.actor !== this) {
      component.actor.removeComponent(component);
    }
    component.actor = this;
    this.components.push(component);
    component.onAttach(this);
    return component;
  }

  removeComponent(component) {
    const idx = this.components.indexOf(component);
    if (idx === -1) return false;
    this.components.splice(idx, 1);
    component.onDetach();
    component.actor = null;
    return true;
  }

  getComponent(type) {
    return this.components.find((c) => c.type === type) || null;
  }

  getComponents(type) {
    return this.components.filter((c) => c.type === type);
  }

  toJSON() {
    const json = {
      id: this.id,
      name: this.name,
      transform: this.transform.toJSON(),
      tags: [...this.tags],
      parentId: this.parentId,
      visible: this.visible,
      locked: this.locked,
      components: this.components.map((c) => c.toJSON()),
    };
    // Backward compatible: omit identity offset so legacy levels stay unchanged.
    if (!contentOffsetIsIdentity(this.contentOffset)) {
      json.contentOffset = normalizeContentOffset(this.contentOffset);
    }
    if (this.authoringLayerId) {
      json.authoringLayerId = this.authoringLayerId;
    }
    if (this.iconColor) {
      json.iconColor = this.iconColor;
    }
    if (this.prefab?.prefabId) {
      json.prefab = normalizePrefabLink(this.prefab);
    }
    return json;
  }

  static fromJSON(data, componentFactory) {
    const components = (data.components || []).map((c) =>
      componentFactory ? componentFactory(c) : c,
    );
    return new Actor({
      id: data.id,
      name: data.name,
      transform: data.transform,
      tags: data.tags,
      parentId: data.parentId ?? null,
      visible: data.visible !== false,
      locked: Boolean(data.locked),
      authoringLayerId: data.authoringLayerId || null,
      iconColor: data.iconColor || null,
      prefab: data.prefab || null,
      contentOffset: data.contentOffset || null,
      components,
    });
  }
}
