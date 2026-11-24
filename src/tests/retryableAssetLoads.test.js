import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRetryableCache } from '../runtime/retryableCache.js';

const loaders = vi.hoisted(() => ({
  textureCalls: [],
  textureOutcomes: [],
  gltfCalls: [],
  gltfOutcomes: [],
}));

// Stand-in loaders: each call consumes the next scripted outcome.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  class ScriptedTextureLoader {
    load(url, onLoad, _onProgress, onError) {
      loaders.textureCalls.push(url);
      const outcome = loaders.textureOutcomes.shift() ?? 'ok';
      queueMicrotask(() => {
        if (outcome === 'ok') onLoad({ isTexture: true, url });
        else onError(new Error('network'));
      });
    }
  }
  return { ...actual, TextureLoader: ScriptedTextureLoader };
});

vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three');
  class ScriptedGLTFLoader {
    load(url, onLoad, _onProgress, onError) {
      loaders.gltfCalls.push(url);
      const outcome = loaders.gltfOutcomes.shift() ?? 'ok';
      queueMicrotask(() => {
        if (outcome === 'ok') {
          const scene = new THREE.Group();
          scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
          onLoad({ scene, animations: [] });
        } else if (outcome === 'empty') {
          onLoad({ scene: null, scenes: [] });
        } else {
          onError(new Error('404'));
        }
      });
    }
  }
  return { GLTFLoader: ScriptedGLTFLoader };
});

const { loadTexture, clearTextureCache } = await import('../runtime/materialFactory.js');
const { loadGltfScene, clearMeshCache } = await import('../runtime/meshLoader.js');

beforeEach(() => {
  loaders.textureCalls.length = 0;
  loaders.textureOutcomes.length = 0;
  loaders.gltfCalls.length = 0;
  loaders.gltfOutcomes.length = 0;
  clearTextureCache();
  clearMeshCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createRetryableCache', () => {
  it('shares one in-flight request and caches a successful result', async () => {
    const cache = createRetryableCache();
    const start = vi.fn(async () => ({ ok: true }));
    const [a, b] = await Promise.all([cache.get('k', start), cache.get('k', start)]);
    expect(a).toBe(b);
    await cache.get('k', start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('evicts a nullish result so the next request starts a new load', async () => {
    const cache = createRetryableCache();
    const start = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('texture');
    expect(await cache.get('k', start)).toBeNull();
    await Promise.resolve();
    expect(cache.has('k')).toBe(false);
    expect(await cache.get('k', start)).toBe('texture');
    expect(start).toHaveBeenCalledTimes(2);
    expect(cache.has('k')).toBe(true);
  });

  it('evicts a rejected load and surfaces the rejection to its caller', async () => {
    const cache = createRetryableCache();
    const start = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('fine');
    await expect(cache.get('k', start)).rejects.toThrow('boom');
    await Promise.resolve();
    expect(await cache.get('k', start)).toBe('fine');
  });

  it('does not evict a newer entry when an older failure settles late', async () => {
    const cache = createRetryableCache();
    let failOld;
    const old = cache.get('k', () => new Promise((resolve) => { failOld = resolve; }));
    cache.clear();
    const fresh = cache.get('k', async () => 'new');
    expect(await fresh).toBe('new');
    failOld(null);
    await old;
    await Promise.resolve();
    expect(cache.has('k')).toBe(true);
  });

  it('keys are independent', async () => {
    const cache = createRetryableCache();
    await cache.get('a', async () => null);
    await cache.get('b', async () => 'b');
    await Promise.resolve();
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
  });
});

describe('texture loading stays retryable (M4)', () => {
  it('retries after a failed load instead of returning a cached null', async () => {
    loaders.textureOutcomes.push('error', 'ok');

    expect(await loadTexture('/assets/wall.png')).toBeNull();
    const retry = await loadTexture('/assets/wall.png');

    expect(retry).toMatchObject({ isTexture: true, url: '/assets/wall.png' });
    expect(loaders.textureCalls).toEqual(['/assets/wall.png', '/assets/wall.png']);
  });

  it('caches a successful load', async () => {
    const a = await loadTexture('/assets/ok.png');
    const b = await loadTexture('/assets/ok.png');
    expect(a).toBe(b);
    expect(loaders.textureCalls).toHaveLength(1);
  });

  it('shares an in-flight load between concurrent callers', async () => {
    await Promise.all([loadTexture('/assets/x.png'), loadTexture('/assets/x.png')]);
    expect(loaders.textureCalls).toHaveLength(1);
  });

  it('keeps color and normal-map variants of one URL separate', async () => {
    await loadTexture('/assets/same.png');
    await loadTexture('/assets/same.png', { normal: true });
    expect(loaders.textureCalls).toHaveLength(2);
  });

  it('keeps retrying while the failure persists', async () => {
    loaders.textureOutcomes.push('error', 'error', 'error');
    for (let i = 0; i < 3; i += 1) {
      expect(await loadTexture('/assets/down.png')).toBeNull();
    }
    expect(loaders.textureCalls).toHaveLength(3);
  });
});

describe('mesh loading stays retryable (M4)', () => {
  it('retries after a failed glTF load', async () => {
    loaders.gltfOutcomes.push('error', 'ok');

    expect(await loadGltfScene('/assets/chair.glb')).toBeNull();
    const retry = await loadGltfScene('/assets/chair.glb');

    expect(retry?.scene).toBeTruthy();
    expect(loaders.gltfCalls).toHaveLength(2);
  });

  it('retries after a file that contains no scene', async () => {
    loaders.gltfOutcomes.push('empty', 'ok');
    expect(await loadGltfScene('/assets/empty.glb')).toBeNull();
    expect((await loadGltfScene('/assets/empty.glb'))?.scene).toBeTruthy();
  });

  it('caches a successful glTF load', async () => {
    const a = await loadGltfScene('/assets/table.glb');
    const b = await loadGltfScene('/assets/table.glb');
    expect(a).toBe(b);
    expect(loaders.gltfCalls).toHaveLength(1);
  });
});
