/**
 * Batch 8 — UV channel selection for material texture slots (Three.js Texture.channel).
 * Channel 0 = uv, 1 = uv1/uv2 attribute naming varies; Three uses geometry.attributes[`uv${n||''}`].
 */

/**
 * Default every slot to UV0 so brushes / single-UV meshes keep authored mapping.
 * Author mapChannels.ao / lightMap explicitly when geometry has uv1/uv2.
 */
export const DEFAULT_MAP_CHANNELS = Object.freeze({
  baseColor: 0,
  normal: 0,
  roughness: 0,
  metalness: 0,
  emissive: 0,
  alpha: 0,
  bump: 0,
  displacement: 0,
  ao: 0,
  lightMap: 0,
  clearcoat: 0,
  clearcoatNormal: 0,
  clearcoatRoughness: 0,
  transmission: 0,
  thickness: 0,
  sheenColor: 0,
  sheenRoughness: 0,
  specularIntensity: 0,
  specularColor: 0,
  iridescence: 0,
  iridescenceThickness: 0,
  anisotropy: 0,
  matcap: 0,
  gradient: 0,
});

/** Map MaterialDefinition *MapId field → channel key */
export const MAP_ID_TO_CHANNEL_KEY = Object.freeze({
  baseColorMapId: 'baseColor',
  normalMapId: 'normal',
  roughnessMapId: 'roughness',
  metalnessMapId: 'metalness',
  emissiveMapId: 'emissive',
  alphaMapId: 'alpha',
  bumpMapId: 'bump',
  displacementMapId: 'displacement',
  aoMapId: 'ao',
  lightMapId: 'lightMap',
  clearcoatMapId: 'clearcoat',
  clearcoatNormalMapId: 'clearcoatNormal',
  clearcoatRoughnessMapId: 'clearcoatRoughness',
  transmissionMapId: 'transmission',
  thicknessMapId: 'thickness',
  sheenColorMapId: 'sheenColor',
  sheenRoughnessMapId: 'sheenRoughness',
  specularIntensityMapId: 'specularIntensity',
  specularColorMapId: 'specularColor',
  iridescenceMapId: 'iridescence',
  iridescenceThicknessMapId: 'iridescenceThickness',
  anisotropyMapId: 'anisotropy',
  matcapMapId: 'matcap',
  gradientMapId: 'gradient',
});

export function normalizeMapChannels(raw = {}) {
  const out = { ...DEFAULT_MAP_CHANNELS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(out)) {
    if (raw[key] == null) continue;
    const n = Math.round(Number(raw[key]));
    if (!Number.isFinite(n) || n < 0 || n > 3) continue;
    out[key] = n;
  }
  return out;
}

export function channelForMapId(mapChannels, mapIdField) {
  const key = MAP_ID_TO_CHANNEL_KEY[mapIdField];
  if (!key) return 0;
  const channels = normalizeMapChannels(mapChannels);
  return channels[key] ?? 0;
}

/**
 * Inspect a Three.js BufferGeometry / Object3D for available UV attributes.
 * @returns {{ channels: number[], labels: string[], missing: string[] }}
 */
export function inspectGeometryUvChannels(root) {
  const found = new Set();
  const visit = (geo) => {
    if (!geo?.attributes) return;
    if (geo.attributes.uv) found.add(0);
    // Three.js Texture.channel N → attribute `uv` (0) or `uvN` (1–3).
    for (let i = 1; i <= 3; i += 1) {
      if (geo.attributes[`uv${i}`]) found.add(i);
    }
  };
  if (root?.isBufferGeometry) visit(root);
  else if (root?.traverse) {
    root.traverse((o) => {
      if (o.isMesh && o.geometry) visit(o.geometry);
    });
  }
  const channels = [...found].sort((a, b) => a - b);
  if (!channels.includes(0) && channels.length === 0) {
    // Empty mesh — report UV0 missing
    return {
      channels: [],
      labels: [],
      missing: ['UV0 (uv)'],
    };
  }
  const labels = channels.map((c) => (c === 0 ? 'UV0 (uv)' : `UV${c}`));
  const missing = [];
  if (!found.has(0)) missing.push('UV0 (uv)');
  return { channels, labels, missing };
}

export function warnMissingUvChannel(availableChannels, requestedChannel) {
  const ch = Math.round(Number(requestedChannel) || 0);
  const avail = Array.isArray(availableChannels) ? availableChannels : [];
  if (avail.length === 0) {
    return {
      ok: false,
      warning: `No UV channels found on geometry; requested UV${ch} cannot be sampled.`,
    };
  }
  if (!avail.includes(ch)) {
    return {
      ok: false,
      warning: `UV${ch} is not present on this mesh (available: ${avail.map((c) => `UV${c}`).join(', ')}).`,
    };
  }
  return { ok: true, warning: null };
}

/**
 * Collect missing-channel warnings for every assigned map on a material definition.
 * @returns {string[]}
 */
export function collectMaterialUvChannelWarnings(definition = {}, availableChannels = []) {
  const def = definition && typeof definition === 'object' ? definition : {};
  const channels = normalizeMapChannels(def.mapChannels);
  const warnings = [];
  for (const [mapIdField, channelKey] of Object.entries(MAP_ID_TO_CHANNEL_KEY)) {
    if (!def[mapIdField]) continue;
    const requested = channels[channelKey] ?? DEFAULT_MAP_CHANNELS[channelKey] ?? 0;
    const result = warnMissingUvChannel(availableChannels, requested);
    if (!result.ok && result.warning) {
      warnings.push(`${channelKey}: ${result.warning}`);
    }
  }
  return warnings;
}
