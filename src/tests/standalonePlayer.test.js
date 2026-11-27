/**
 * Standalone player (runs a finished level without the editor).
 * Node-only: checks the static asset resolver against the real public/ data and that every shipped level
 * references only assets the player can resolve. Rendering itself is checked in the browser
 * (see docs/TEST_MAP.md).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticAssetResolver } from '../player/createStaticAssetResolver.js';
import { levelUrlFor } from '../player/startPlayer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { findAsset } from '../assets/AssetRegistry.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

/** Serves static files from public/ exactly like the production server would. */
async function fetchFromPublic(url) {
  const file = path.join(PUBLIC, decodeURIComponent(url.split('?')[0]));
  if (!fs.existsSync(file)) throw new Error(`Failed to load ${url}: 404`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function levelFiles() {
  const dir = path.join(PUBLIC, 'levels');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

/** Collects every asset id a level mentions (material/asset id fields and per-face material maps). */
function referencedAssetIds(node, out = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((n) => referencedAssetIds(n, out));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'faceMaterials' && value && typeof value === 'object') {
        Object.values(value).forEach((v) => typeof v === 'string' && v && out.add(v));
      } else if (/(^materialId$|AssetId$|^assetId$)/.test(key) && typeof value === 'string' && value) {
        out.add(value);
      } else {
        referencedAssetIds(value, out);
      }
    }
  }
  return out;
}

describe('standalone player', () => {
  it('builds level URLs under /levels', () => {
    expect(levelUrlFor('test-room')).toBe('/levels/test-room.json');
    expect(levelUrlFor('a b')).toBe('/levels/a%20b.json');
  });

  it('static resolver exposes the same API the runtime expects', async () => {
    const resolver = await createStaticAssetResolver({ fetchJson: fetchFromPublic });
    for (const fn of [
      'getTextureUrl', 'getTextureAsset', 'getMeshUrl', 'getMeshBoundsMeters',
      'getMeshBoundsCenterMeters', 'getMaterialDefinition', 'getPrefabDefinition', 'getPrefabDefinitionSync',
    ]) {
      expect(typeof resolver[fn]).toBe('function');
    }
  });

  it('resolves real textures, meshes and materials from static files', async () => {
    const resolver = await createStaticAssetResolver({ fetchJson: fetchFromPublic });
    const assets = resolver.registry.assets;
    const texture = assets.find((a) => a.kind === 'texture');
    const material = assets.find((a) => a.kind === 'material');
    expect(texture, 'registry has a texture').toBeTruthy();
    expect(material, 'registry has a material').toBeTruthy();
    expect(resolver.getTextureUrl(texture.id)).toMatch(/^\/assets\//);
    expect(resolver.getTextureAsset(texture.id).id).toBe(texture.id);
    const def = await resolver.getMaterialDefinition(material.id);
    expect(def?.id).toBe(material.id);
    const mesh = assets.find((a) => a.kind === 'mesh');
    if (mesh) expect(resolver.getMeshUrl(mesh.id)).toMatch(/^\/assets\//);
    // Wrong-kind and unknown ids resolve to null, never throw.
    expect(resolver.getTextureUrl(material.id)).toBeNull();
    expect(resolver.getMeshUrl('nope')).toBeNull();
    expect(await resolver.getMaterialDefinition('nope')).toBeNull();
  });

  it('retries after a transient failure instead of caching it', async () => {
    let failures = 1;
    const flaky = async (url) => {
      if (url.includes('/materials/') && failures-- > 0) throw new Error('boom');
      return fetchFromPublic(url);
    };
    const resolver = await createStaticAssetResolver({ fetchJson: flaky });
    const material = resolver.registry.assets.find((a) => a.kind === 'material');
    expect(await resolver.getMaterialDefinition(material.id)).toBeNull();
    expect((await resolver.getMaterialDefinition(material.id))?.id).toBe(material.id);
  });

  it('prefab definitions are available synchronously after startup', async () => {
    const resolver = await createStaticAssetResolver({ fetchJson: fetchFromPublic });
    for (const p of resolver.registry.assets.filter((a) => a.kind === 'prefab')) {
      expect(resolver.getPrefabDefinitionSync(p.id), p.id).toBeTruthy();
    }
  });

  // Geometry-editing test fixtures use placeholder material names (mat_cap, mat_slope, ...) that were never
  // registered. They are not game levels. Listed by name so any NEW unresolved reference still fails.
  const PLACEHOLDER_MATERIAL_FIXTURES = new Set([
    'acceptance-convex-brushes',
    'acceptance-extrusion-clipping',
    'acceptance-vertex-editing',
  ]);

  describe.each(levelFiles())('shipped level %s', (name) => {
    it('loads and every referenced asset exists in the registry', async () => {
      const resolver = await createStaticAssetResolver({ fetchJson: fetchFromPublic });
      const data = await fetchFromPublic(levelUrlFor(name));
      expect(() => deserializeLevel(data)).not.toThrow();
      if (PLACEHOLDER_MATERIAL_FIXTURES.has(name)) return;
      const missing = [...referencedAssetIds(data.actors)]
        .filter((id) => !findAsset(resolver.registry, id));
      expect(missing).toEqual([]);
    });
  });
});
