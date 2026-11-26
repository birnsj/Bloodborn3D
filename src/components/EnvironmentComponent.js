import { Component } from '../core/Component.js';

/**
 * Placeable environmental object (Batch 4).
 * Engine-neutral fields; Three.js Water / Water2 / Reflector / Refractor /
 * DecalGeometry / Sprite / Sky adapters live under src/runtime/.
 */

export const ENVIRONMENT_TYPES = Object.freeze([
  'water2',
  'water',
  'reflector',
  'refractor',
  'decal',
  'sprite',
  'sky',
]);

/** Texture resolution presets for RT-backed surfaces (px). */
export const ENV_RT_RESOLUTIONS = Object.freeze([128, 256, 512, 1024]);

export function normalizeEnvironmentType(raw) {
  const v = String(raw || 'water2').toLowerCase();
  return ENVIRONMENT_TYPES.includes(v) ? v : 'water2';
}

function finiteOr(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function vec2(raw, fallback = { x: 1, y: 0 }) {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  return {
    x: finiteOr(raw.x, fallback.x),
    y: finiteOr(raw.y, fallback.y),
  };
}

function vec3(raw, fallback = { x: 100, y: 100, z: 100 }) {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  return {
    x: finiteOr(raw.x, fallback.x),
    y: finiteOr(raw.y, fallback.y),
    z: finiteOr(raw.z, fallback.z),
  };
}

export class EnvironmentComponent extends Component {
  constructor(partial = {}) {
    const { id, enabled } = partial;
    super({ id, type: EnvironmentComponent.componentType, enabled });
    Object.assign(this, normalizeEnvironmentFields(partial));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      ...serializeEnvironmentFields(this),
    };
  }

  static fromJSON(data) {
    return new EnvironmentComponent(data || {});
  }
}

EnvironmentComponent.componentType = 'Environment';

export function normalizeEnvironmentFields(raw = {}) {
  const envType = normalizeEnvironmentType(raw.envType);
  const rt = Math.max(128, Math.round(finiteOr(raw.textureResolution, 512)));
  const textureResolution = ENV_RT_RESOLUTIONS.includes(rt)
    ? rt
    : ENV_RT_RESOLUTIONS.reduce((best, n) => (Math.abs(n - rt) < Math.abs(best - rt) ? n : best), 512);

  return {
    envType,
    // Planar size in editor units (100 eu = 1 m). Sprite uses sizeX/sizeY.
    width: Math.max(1, finiteOr(raw.width, envType === 'sky' ? 10000 : 400)),
    height: Math.max(1, finiteOr(raw.height, envType === 'sky' ? 10000 : 400)),
    color: raw.color || defaultColor(envType),
    opacity: clamp01(finiteOr(raw.opacity, envType === 'water' || envType === 'water2' ? 0.85 : 1)),
    textureResolution,
    clipBias: finiteOr(raw.clipBias, 0.003),
    // Water / Water2
    distortionScale: Math.max(0, finiteOr(raw.distortionScale, 3.7)),
    flowSpeed: Math.max(0, finiteOr(raw.flowSpeed, 0.03)),
    flowDirection: vec2(raw.flowDirection, { x: 1, y: 0 }),
    reflectivity: clamp01(finiteOr(raw.reflectivity, 0.08)),
    waterScale: Math.max(0.01, finiteOr(raw.waterScale, 1)),
    normalMap0Id: raw.normalMap0Id || 'tex_water_normal_0',
    normalMap1Id: raw.normalMap1Id || 'tex_water_normal_1',
    sunColor: raw.sunColor || '#ffffff',
    // Water.js sun direction (normalized-ish world vector; meters space).
    sunDirection: vec3(raw.sunDirection, { x: 0.707, y: 0.707, z: 0 }),
    // Reflector / Refractor
    multisample: Math.max(0, Math.round(finiteOr(raw.multisample, 0))),
    // Decal
    targetActorId: raw.targetActorId || null,
    decalSize: vec3(raw.decalSize, { x: 80, y: 80, z: 40 }),
    mapId: raw.mapId || null,
    materialId: raw.materialId || null,
    polygonOffset: Boolean(raw.polygonOffset ?? true),
    polygonOffsetFactor: finiteOr(raw.polygonOffsetFactor, -4),
    polygonOffsetUnits: finiteOr(raw.polygonOffsetUnits, -4),
    depthWrite: Boolean(raw.depthWrite ?? false),
    depthTest: raw.depthTest == null ? true : Boolean(raw.depthTest),
    // Sprite / billboard
    sizeAttenuation: raw.sizeAttenuation == null ? true : Boolean(raw.sizeAttenuation),
    center: vec2(raw.center, { x: 0.5, y: 0.5 }),
    spriteRotation: finiteOr(raw.spriteRotation, 0),
    fog: raw.fog == null ? true : Boolean(raw.fog),
    // Placeable Sky (align with World.sky Batch 1 fields)
    turbidity: Math.max(0, finiteOr(raw.turbidity, 10)),
    rayleigh: Math.max(0, finiteOr(raw.rayleigh, 3)),
    mieCoefficient: Math.max(0, finiteOr(raw.mieCoefficient, 0.005)),
    mieDirectionalG: clamp01(finiteOr(raw.mieDirectionalG, 0.7)),
    elevation: finiteOr(raw.elevation, 2),
    azimuth: finiteOr(raw.azimuth, 180),
    skyScale: Math.max(1, finiteOr(raw.skyScale, 450000)),
    // Quality: skip RT updates in ortho; optionally throttle nested reflections
    perspectiveOnly: raw.perspectiveOnly == null ? true : Boolean(raw.perspectiveOnly),
    quality: raw.quality === 'low' || raw.quality === 'high' ? raw.quality : 'medium',
  };
}

function defaultColor(envType) {
  switch (envType) {
    case 'water':
    case 'water2':
      return '#001e0f';
    case 'reflector':
      return '#7f7f7f';
    case 'refractor':
      return '#c1cbcb';
    case 'decal':
      return '#ffffff';
    case 'sprite':
      return '#ffffff';
    case 'sky':
      return '#ffffff';
    default:
      return '#4a90a4';
  }
}

export function serializeEnvironmentFields(comp) {
  const n = normalizeEnvironmentFields(comp);
  return {
    envType: n.envType,
    width: n.width,
    height: n.height,
    color: n.color,
    opacity: n.opacity,
    textureResolution: n.textureResolution,
    clipBias: n.clipBias,
    distortionScale: n.distortionScale,
    flowSpeed: n.flowSpeed,
    flowDirection: { ...n.flowDirection },
    reflectivity: n.reflectivity,
    waterScale: n.waterScale,
    normalMap0Id: n.normalMap0Id,
    normalMap1Id: n.normalMap1Id,
    sunColor: n.sunColor,
    sunDirection: { ...n.sunDirection },
    multisample: n.multisample,
    targetActorId: n.targetActorId,
    decalSize: { ...n.decalSize },
    mapId: n.mapId,
    materialId: n.materialId,
    polygonOffset: n.polygonOffset,
    polygonOffsetFactor: n.polygonOffsetFactor,
    polygonOffsetUnits: n.polygonOffsetUnits,
    depthWrite: n.depthWrite,
    depthTest: n.depthTest,
    sizeAttenuation: n.sizeAttenuation,
    center: { ...n.center },
    spriteRotation: n.spriteRotation,
    fog: n.fog,
    turbidity: n.turbidity,
    rayleigh: n.rayleigh,
    mieCoefficient: n.mieCoefficient,
    mieDirectionalG: n.mieDirectionalG,
    elevation: n.elevation,
    azimuth: n.azimuth,
    skyScale: n.skyScale,
    perspectiveOnly: n.perspectiveOnly,
    quality: n.quality,
  };
}

/** Snapshot authorable fields for scrub undo. */
export function environmentAuthorableSnapshot(comp) {
  return serializeEnvironmentFields(comp);
}
