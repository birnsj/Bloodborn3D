import { beforeEach, describe, expect, it, vi } from 'vitest';

const factory = vi.hoisted(() => ({ pending: [], created: [] }));

// createThreeMaterial is made controllable so a rebuild can land mid-load.
vi.mock('../runtime/materialFactory.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createThreeMaterial: vi.fn(() => new Promise((resolve) => {
      factory.pending.push((value) => resolve(value));
    })),
  };
});

const { SceneView } = await import('../runtime/SceneView.js');

function fakeMaterial(label) {
  return {
    label,
    map: { dispose: vi.fn() },
    dispose: vi.fn(),
  };
}

function makeView(token = 1) {
  return {
    _syncToken: token,
    _actorMeshes: new Map(),
    maxAnisotropy: 4,
    assetResolver: {
      getMaterialDefinition: async (id) => ({ id }),
      getTextureUrl: () => null,
    },
    _isActorVisualCurrent: SceneView.prototype._isActorVisualCurrent,
    _applyHiddenHullFaces() {},
  };
}

function makeMesh() {
  const material = Array.from({ length: 6 }, (_, i) => fakeMaterial(`old${i}`));
  return { material, originals: [...material] };
}

/** Let queued microtasks (awaited resolver calls) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  factory.pending.length = 0;
});

describe('brush material application vs. scene rebuild (M5)', () => {
  const comp = { materialId: 'mat_a', faceMaterials: {} };

  it('disposes a material that finishes loading after the scene was rebuilt', async () => {
    const view = makeView(1);
    const mesh = makeMesh();

    const run = SceneView.prototype._applyBrushMaterials.call(view, mesh, comp, 1);
    await flush();
    expect(factory.pending).toHaveLength(1);

    // syncFromWorld ran while textures were loading: new token, old meshes disposed.
    view._syncToken = 2;
    const late = fakeMaterial('late');
    factory.pending[0](late);
    await run;

    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(late.map.dispose).toHaveBeenCalledTimes(1);
    // The stale mesh keeps its original materials and is not given the late one.
    expect(mesh.material).toEqual(mesh.originals);
    for (const original of mesh.originals) expect(original.dispose).not.toHaveBeenCalled();
    // And no further faces are loaded for a dead mesh.
    await flush();
    expect(factory.pending).toHaveLength(1);
  });

  it('stops after the first stale face even if later faces were still queued', async () => {
    const view = makeView(1);
    const mesh = makeMesh();
    const run = SceneView.prototype._applyBrushMaterials.call(view, mesh, comp, 1);
    await flush();

    const first = fakeMaterial('first');
    factory.pending[0](first);
    await flush();
    expect(mesh.material[0]).toBe(first);
    expect(factory.pending).toHaveLength(2);

    view._syncToken = 3;
    const second = fakeMaterial('second');
    factory.pending[1](second);
    await run;

    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(mesh.material[1]).toBe(mesh.originals[1]);
    expect(factory.pending).toHaveLength(2);
  });

  it('still applies all six materials and releases the old ones when current', async () => {
    const view = makeView(1);
    const mesh = makeMesh();
    const run = SceneView.prototype._applyBrushMaterials.call(view, mesh, comp, 1);

    const created = [];
    for (let i = 0; i < 6; i += 1) {
      await flush();
      const mat = fakeMaterial(`new${i}`);
      created.push(mat);
      factory.pending[i](mat);
    }
    await run;

    expect(Array.from(mesh.material)).toEqual(created);
    for (const original of mesh.originals) {
      expect(original.dispose).toHaveBeenCalledTimes(1);
      expect(original.map.dispose).toHaveBeenCalledTimes(1);
    }
    for (const mat of created) expect(mat.dispose).not.toHaveBeenCalled();
  });
});
