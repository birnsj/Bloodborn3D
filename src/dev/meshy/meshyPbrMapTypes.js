/**
 * Browser-safe Meshy PBR map slot ids / helpers (no Node fs).
 */

/** Known Meshy texture_urls / --all-assets filename slots. */
export const MESHY_MAP_SLOTS = Object.freeze([
  Object.freeze({
    id: 'base_color',
    label: 'Albedo / Base Color',
    fileHints: ['base_color', 'texture_0.png', 'texture_0_base_color'],
    gltf: 'map',
  }),
  Object.freeze({
    id: 'normal',
    label: 'Normal',
    fileHints: ['normal', 'texture_0_normal'],
    gltf: 'normalMap',
  }),
  Object.freeze({
    id: 'metallic',
    label: 'Metallic',
    fileHints: ['metallic', 'texture_0_metallic'],
    gltf: 'metalnessMap',
  }),
  Object.freeze({
    id: 'roughness',
    label: 'Roughness',
    fileHints: ['roughness', 'texture_0_roughness'],
    gltf: 'roughnessMap',
  }),
  Object.freeze({
    id: 'emission',
    label: 'Emission',
    fileHints: ['emission', 'emissive', 'texture_0_emission'],
    gltf: 'emissiveMap',
  }),
]);

/**
 * Normalize texture_urls from a Meshy task / meta.json into slot → url.
 * @param {unknown} textureUrls
 * @returns {Record<string, string>}
 */
export function normalizeMeshyTextureUrls(textureUrls) {
  const out = {};
  const list = Array.isArray(textureUrls)
    ? textureUrls
    : (textureUrls && typeof textureUrls === 'object' ? [textureUrls] : []);
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    for (const slot of MESHY_MAP_SLOTS) {
      const url = entry[slot.id];
      if (typeof url === 'string' && url && !out[slot.id]) {
        out[slot.id] = url;
      }
    }
    if (entry.base_color && !out.base_color) out.base_color = entry.base_color;
    if (entry.albedo && !out.base_color) out.base_color = entry.albedo;
  }
  return out;
}

/**
 * Classify a downloaded filename into a map slot id, or null.
 * @param {string} fileName
 */
export function classifyMeshyMapFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (!/\.(png|jpe?g|webp)$/i.test(lower)) return null;
  if (/thumbnail|preview|alpha_thumbnail/i.test(lower)) return null;
  for (const slot of MESHY_MAP_SLOTS) {
    if (slot.fileHints.some((h) => lower.includes(h))) return slot.id;
  }
  if (/texture_0\.png$/i.test(lower)) return 'base_color';
  return null;
}
