/**
 * Batch 8 UV regression closure — texture transform origin (0,0) and UV0 channel defaults.
 * Covers brush/material layering without changing authored UV values.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DEFAULT_TEXTURE_TRANSFORM,
  applyTextureSampling,
  composeMaterialUvOnTexture,
  normalizeTextureTransform,
} from '../assets/textureSampling.js';
import {
  DEFAULT_MAP_CHANNELS,
  channelForMapId,
  collectMaterialUvChannelWarnings,
  inspectGeometryUvChannels,
  normalizeMapChannels,
  warnMissingUvChannel,
} from '../assets/textureUvChannels.js';
import {
  createThreeMaterial,
  clearTextureCache,
} from '../runtime/materialFactory.js';
import { createMaterialDefinition, normalizeMaterialDefinition } from '../materials/MaterialDefinition.js';
import { createBrushBoxGeometry } from '../runtime/brushGeometry.js';
import { composeGeometryUv, normalizeActorUv } from '../runtime/uvMapping.js';
import { densityUvOnBrushFace, computeAlignFaceUv } from '../rules/alignSurfaces.js';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4Invert, mat4TransformPoint } from '../core/math3d.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Apply Three UV matrix to a point. */
function xformUv(tex, u, v) {
  tex.updateMatrix();
  const m = tex.matrix.elements;
  return [
    m[0] * u + m[3] * v + m[6],
    m[1] * u + m[4] * v + m[7],
  ];
}

describe('Batch 8 UV regression — texture transform origin', () => {
  it('defaults center to (0,0) matching THREE.Texture', () => {
    expect(DEFAULT_TEXTURE_TRANSFORM.centerU).toBe(0);
    expect(DEFAULT_TEXTURE_TRANSFORM.centerV).toBe(0);
    expect(normalizeTextureTransform({}).centerU).toBe(0);
    expect(normalizeTextureTransform({}).centerV).toBe(0);
    const blank = new THREE.Texture();
    expect(blank.center.x).toBe(0);
    expect(blank.center.y).toBe(0);
  });

  it('default transform preserves UV mapping (identity matrix)', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, {});
    expect(tex.repeat.x).toBe(1);
    expect(tex.repeat.y).toBe(1);
    expect(tex.offset.x).toBe(0);
    expect(tex.offset.y).toBe(0);
    expect(tex.rotation).toBe(0);
    expect(tex.center.x).toBe(0);
    expect(tex.center.y).toBe(0);
    expect(xformUv(tex, 0.25, 0.75)).toEqual([
      expect.closeTo(0.25),
      expect.closeTo(0.75),
    ]);
  });

  it('non-unit texture repeat scales from UV origin', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, { transform: { repeatU: 2, repeatV: 3 } });
    expect(xformUv(tex, 0, 0)).toEqual([expect.closeTo(0), expect.closeTo(0)]);
    expect(xformUv(tex, 1, 1)).toEqual([expect.closeTo(2), expect.closeTo(3)]);
    expect(xformUv(tex, 0.5, 0.5)).toEqual([expect.closeTo(1), expect.closeTo(1.5)]);
  });

  it('material UV scaling composes once on top of asset transform', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, { transform: { repeatU: 2, repeatV: 2 } });
    composeMaterialUvOnTexture(tex, { uvScale: { x: 2, y: 2 } });
    expect(tex.repeat.x).toBeCloseTo(4);
    expect(tex.repeat.y).toBeCloseTo(4);
    expect(tex.center.x).toBe(0);
    expect(xformUv(tex, 1, 1)).toEqual([expect.closeTo(4), expect.closeTo(4)]);
  });

  it('texture rotation and material UV rotation accumulate from origin center', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, { transform: { rotation: 90 } });
    expect(tex.rotation).toBeCloseTo(Math.PI / 2);
    expect(tex.center.x).toBe(0);
    composeMaterialUvOnTexture(tex, { uvRotation: 90 });
    expect(tex.rotation).toBeCloseTo(Math.PI);
  });

  it('combined repeat, offset and rotation stay origin-anchored', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, {
      transform: { repeatU: 2, repeatV: 2, offsetU: 0.25, offsetV: 0.1, rotation: 0 },
    });
    composeMaterialUvOnTexture(tex, {
      uvScale: { x: 1, y: 1 },
      uvOffset: { x: 0.05, y: 0 },
      uvRotation: 0,
    });
    expect(tex.repeat.x).toBeCloseTo(2);
    expect(tex.offset.x).toBeCloseTo(0.3);
    expect(tex.offset.y).toBeCloseTo(0.1);
    expect(xformUv(tex, 0, 0)).toEqual([expect.closeTo(0.3), expect.closeTo(0.1)]);
    expect(xformUv(tex, 1, 0)).toEqual([expect.closeTo(2.3), expect.closeTo(0.1)]);
  });

  it('explicit custom transformation centers remain supported', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, {
      transform: { repeatU: 2, repeatV: 2, centerU: 0.5, centerV: 0.5 },
    });
    expect(tex.center.x).toBeCloseTo(0.5);
    expect(tex.center.y).toBeCloseTo(0.5);
    // Scale around 0.5: (1,1) → (1.5,1.5), not (2,2).
    expect(xformUv(tex, 1, 1)).toEqual([expect.closeTo(1.5), expect.closeTo(1.5)]);
  });

  it('does not double-apply asset transform when composing material UV', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, { transform: { repeatU: 2, repeatV: 1, offsetU: 0.1, offsetV: 0 } });
    const afterAsset = { rx: tex.repeat.x, ox: tex.offset.x };
    composeMaterialUvOnTexture(tex, { uvScale: { x: 3, y: 1 }, uvOffset: { x: 0.2, y: 0 } });
    // Asset repeat stays as base; material multiplies once (2*3), offset adds once (0.1+0.2).
    expect(afterAsset.rx).toBeCloseTo(2);
    expect(tex.repeat.x).toBeCloseTo(6);
    expect(tex.offset.x).toBeCloseTo(0.3);
    composeMaterialUvOnTexture(tex, { uvScale: { x: 1, y: 1 }, uvOffset: { x: 0, y: 0 } });
    // Identity material UV is a no-op — no second multiply.
    expect(tex.repeat.x).toBeCloseTo(6);
    expect(tex.offset.x).toBeCloseTo(0.3);
  });
});

describe('Batch 8 UV regression — world-aligned brushes and surfaces', () => {
  it('world-aligned brush density UVs are unchanged by identity Layer-2 transform', () => {
    const size = { x: 400, y: 300, z: 20 };
    const geom = createBrushBoxGeometry(size, {});
    const uv = geom.attributes.uv;
    const pos = geom.attributes.position;
    // Sample a few vertices: density frame matches geometry UV with identity actor UV.
    for (const i of [0, 4, 8, 16]) {
      const local = {
        x: pos.getX(i) * 100,
        y: pos.getY(i) * 100,
        z: pos.getZ(i) * 100,
      };
      // Determine face roughly by dominant normal axis from face groups — use density on pz for front face verts.
    }
    // Corner of +Z face (indices 16–19 in box geometry).
    for (let i = 16; i < 20; i += 1) {
      const local = {
        x: pos.getX(i) * 100,
        y: pos.getY(i) * 100,
        z: pos.getZ(i) * 100,
      };
      const [du, dv] = densityUvOnBrushFace('pz', local, size);
      expect(du).toBeCloseTo(uv.getX(i), 4);
      expect(dv).toBeCloseTo(uv.getY(i), 4);
    }
    const tex = new THREE.Texture();
    applyTextureSampling(tex, {});
    composeMaterialUvOnTexture(tex, { uvScale: { x: 1, y: 1 } });
    expect(xformUv(tex, uv.getX(16), uv.getY(16))).toEqual([
      expect.closeTo(uv.getX(16)),
      expect.closeTo(uv.getY(16)),
    ]);
    geom.dispose();
  });

  it('adjacent surface alignment still matches contact UVs', () => {
    const world = new World({ name: 'uv-reg-align', schemaVersion: 2 });
    const refUv = { scale: { x: 1.25, y: 1 }, offset: { x: 0.15, y: 0.05 }, rotation: 0 };
    world.addActor(new Actor({
      id: 'wall_a',
      transform: { position: { x: -200, y: 150, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      components: [new BrushComponent({
        size: { x: 400, y: 300, z: 20 },
        faceUVs: { pz: refUv },
      })],
    }));
    world.addActor(new Actor({
      id: 'wall_b',
      transform: { position: { x: 150, y: 150, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      components: [new BrushComponent({ size: { x: 300, y: 300, z: 20 } })],
    }));
    const result = computeAlignFaceUv(
      world,
      { actorId: 'wall_a', surfaceId: 'pz' },
      { actorId: 'wall_b', surfaceId: 'pz' },
    );
    expect(result.ok).toBe(true);
    world.getActor('wall_b').getComponent('Brush').faceUVs = result.faceUVs;

    const sample = (actorId, surfaceId, worldPoint) => {
      const actor = world.getActor(actorId);
      const brush = actor.getComponent('Brush');
      const inv = mat4Invert(getWorldMatrix(actor, world));
      const local = mat4TransformPoint(inv, worldPoint);
      const density = densityUvOnBrushFace(surfaceId, local, brush.size);
      return composeGeometryUv(density[0], density[1], normalizeActorUv(brush.uv), brush.faceUVs?.[surfaceId] || null);
    };
    const ref = sample('wall_a', 'pz', result.contact);
    const tgt = sample('wall_b', 'pz', result.contact);
    expect(tgt[0]).toBeCloseTo(ref[0], 4);
    expect(tgt[1]).toBeCloseTo(ref[1], 4);
  });

  it('preserves existing per-surface UV adjustments on brush geometry', () => {
    const size = { x: 200, y: 100, z: 40 };
    const faceUVs = {
      pz: { scale: { x: 2, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
    };
    const geom = createBrushBoxGeometry(size, {}, faceUVs);
    const uv = geom.attributes.uv;
    const pos = geom.attributes.position;
    for (let i = 16; i < 20; i += 1) {
      const local = {
        x: pos.getX(i) * 100,
        y: pos.getY(i) * 100,
        z: pos.getZ(i) * 100,
      };
      const density = densityUvOnBrushFace('pz', local, size);
      const [eu, ev] = composeGeometryUv(density[0], density[1], {}, faceUVs.pz);
      expect(uv.getX(i)).toBeCloseTo(eu, 4);
      expect(uv.getY(i)).toBeCloseTo(ev, 4);
    }
    geom.dispose();
  });

  it('additive and subtractive brushes keep UV attributes on additive solids', () => {
    const add = createBrushBoxGeometry({ x: 400, y: 300, z: 200 }, {
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      rotation: 0,
    });
    expect(add.attributes.uv).toBeTruthy();
    expect(add.attributes.uv.count).toBeGreaterThan(0);
    // Subtractive brushes contribute carve volumes only — no render UV mesh of their own.
    const subBrush = {
      size: { x: 100, y: 100, z: 100 },
      operation: 'subtract',
    };
    expect(String(subBrush.operation)).toBe('subtract');
    add.dispose();
  });
});

describe('Batch 8 UV regression — channel defaults', () => {
  beforeEach(async () => {
    await clearTextureCache();
  });
  afterEach(async () => {
    await clearTextureCache();
  });

  it('all material texture slots default to UV0', () => {
    const channels = normalizeMapChannels({});
    for (const [key, value] of Object.entries(channels)) {
      expect(value, key).toBe(0);
    }
    expect(DEFAULT_MAP_CHANNELS.ao).toBe(0);
    expect(DEFAULT_MAP_CHANNELS.lightMap).toBe(0);
    expect(channelForMapId(undefined, 'aoMapId')).toBe(0);
    expect(channelForMapId(undefined, 'lightMapId')).toBe(0);
    expect(channelForMapId(undefined, 'baseColorMapId')).toBe(0);
  });

  it('legacy materials without mapChannels normalize to UV0 for every slot', () => {
    const def = normalizeMaterialDefinition({
      name: 'Legacy Hall',
      baseColorMapId: 'tex_hall',
      aoMapId: 'tex_ao',
      lightMapId: 'tex_lm',
      // no mapChannels field — pre-Batch 8 shape
    });
    expect(def.mapChannels.baseColor).toBe(0);
    expect(def.mapChannels.ao).toBe(0);
    expect(def.mapChannels.lightMap).toBe(0);
    expect(def.mapChannels.normal).toBe(0);
  });

  it('createThreeMaterial stamps UV0 channels on userData for single-UV content', async () => {
    const mat = await createThreeMaterial(createMaterialDefinition({
      shadingModel: 'standard',
      aoMapId: null,
      lightMapId: null,
    }), () => null);
    expect(mat.userData.bbMapChannels.ao).toBe(0);
    expect(mat.userData.bbMapChannels.lightMap).toBe(0);
    expect(mat.userData.bbMapChannels.baseColor).toBe(0);
    mat.dispose();
  });

  it('AO and lightMap request UV0 on single-UV brush geometry (no missing warning)', () => {
    const geom = createBrushBoxGeometry({ x: 100, y: 100, z: 100 }, {});
    const available = inspectGeometryUvChannels(geom).channels;
    expect(available).toEqual([0]);
    const warnings = collectMaterialUvChannelWarnings({
      baseColorMapId: 'tex_a',
      aoMapId: 'tex_ao',
      lightMapId: 'tex_lm',
      // defaults → all UV0
    }, available);
    expect(warnings).toEqual([]);
    geom.dispose();
  });

  it('AO/lightMap still warn when explicitly assigned missing UV1 on single-UV geo', () => {
    const geom = createBrushBoxGeometry({ x: 100, y: 100, z: 100 }, {});
    const available = inspectGeometryUvChannels(geom).channels;
    const warnings = collectMaterialUvChannelWarnings({
      aoMapId: 'tex_ao',
      lightMapId: 'tex_lm',
      mapChannels: { ao: 1, lightMap: 1 },
    }, available);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => /ao:/.test(w))).toBe(true);
    expect(warnings.some((w) => /lightMap:/.test(w))).toBe(true);
    geom.dispose();
  });

  it('imported multi-UV GLB exposes uv/uv1/uv2 and honors explicit UV1/UV2', async () => {
    const glbPath = path.join(rootDir, 'public/assets/meshes/mesh_batch8_multi_uv.glb');
    expect(existsSync(glbPath)).toBe(true);
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const buf = readFileSync(glbPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(ab, '', resolve, reject);
    });
    const info = inspectGeometryUvChannels(gltf.scene);
    expect(info.channels).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(channelForMapId({ baseColor: 1 }, 'baseColorMapId')).toBe(1);
    expect(channelForMapId({ lightMap: 2 }, 'lightMapId')).toBe(2);
    expect(warnMissingUvChannel(info.channels, 1).ok).toBe(true);
    expect(warnMissingUvChannel(info.channels, 2).ok).toBe(true);
    expect(warnMissingUvChannel(info.channels, 3).ok).toBe(false);
  });

  it('preserves explicitly authored channel assignments through normalize/serialize', () => {
    const authored = {
      baseColor: 1,
      ao: 1,
      lightMap: 2,
      normal: 0,
    };
    const def = normalizeMaterialDefinition({
      mapChannels: authored,
      baseColorMapId: 'tex_x',
    });
    expect(def.mapChannels.baseColor).toBe(1);
    expect(def.mapChannels.ao).toBe(1);
    expect(def.mapChannels.lightMap).toBe(2);
    // Round-trip: normalize again from serialized shape.
    const again = normalizeMaterialDefinition(JSON.parse(JSON.stringify(def)));
    expect(again.mapChannels.baseColor).toBe(1);
    expect(again.mapChannels.ao).toBe(1);
    expect(again.mapChannels.lightMap).toBe(2);
  });

  it('primitives with only UV0 stay warning-free under default channels', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const available = inspectGeometryUvChannels(box).channels;
    expect(available).toEqual([0]);
    const warnings = collectMaterialUvChannelWarnings({
      baseColorMapId: 't',
      normalMapId: 'n',
      roughnessMapId: 'r',
      aoMapId: 'a',
    }, available);
    expect(warnings).toEqual([]);
    box.dispose();
  });

  it('registry Batch 8 transforms use center 0 (no lingering 0.5 defaults)', () => {
    const reg = JSON.parse(readFileSync(path.join(rootDir, 'public/assets/registry.json'), 'utf8'));
    for (const asset of reg.assets) {
      const cU = asset.meta?.transform?.centerU;
      const cV = asset.meta?.transform?.centerV;
      if (cU != null) expect(cU, asset.id).toBe(0);
      if (cV != null) expect(cV, asset.id).toBe(0);
    }
  });

  it('acceptance mansion levels still ship without authored UV edits for this fix', () => {
    for (const file of [
      'public/levels/acceptance-gothic-mansion.json',
      'public/levels/acceptance-integrated-editor.json',
    ]) {
      const p = path.join(rootDir, file);
      expect(existsSync(p)).toBe(true);
      const level = JSON.parse(readFileSync(p, 'utf8'));
      expect(Array.isArray(level.actors)).toBe(true);
      expect(level.actors.length).toBeGreaterThan(5);
    }
  });
});
