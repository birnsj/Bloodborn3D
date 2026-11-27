import { describe, expect, it } from 'vitest';
import {
  buildImageTo3dRequestBody,
  estimateImageTo3dCredits,
  validateImageTo3dSettings,
  GAME_PROP_PRESET,
  GAME_CHARACTER_PRESET,
} from '../dev/meshy/meshyModels.js';
import {
  capabilityForImageTo3dSetting,
  summarizeImageTo3dSettings,
} from '../dev/meshy/meshyCapabilities.js';
import { buildImageTo3dCreateArgv } from '../dev/meshy/meshyCli.js';
import {
  classifyMeshyMapFileName,
  normalizeMeshyTextureUrls,
} from '../dev/meshy/meshyPbrMapTypes.js';
import path from 'node:path';
import os from 'node:os';

describe('Meshy capability gates', () => {
  it('blocks image enhancement on Smart Topology', () => {
    const cap = capabilityForImageTo3dSetting('image_enhancement', GAME_PROP_PRESET);
    expect(cap.available).toBe(false);
    expect(cap.reason).toMatch(/Smart Topology/i);

    const bad = validateImageTo3dSettings({
      ...GAME_PROP_PRESET,
      image_enhancement: true,
    });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('INVALID_IMAGE_ENHANCEMENT');
  });

  it('allows ultra geometry only on meshy-7.1 Standard', () => {
    const smart = capabilityForImageTo3dSetting('geometry_resolution', GAME_PROP_PRESET);
    expect(smart.available).toBe(false);

    const ok = validateImageTo3dSettings({
      model_type: 'standard',
      ai_model: 'meshy-7.1',
      geometry_resolution: '4k',
      should_texture: true,
      enable_pbr: true,
      texture_model: 'meshy-7',
    });
    expect(ok.ok).toBe(true);
    expect(estimateImageTo3dCredits(ok.settings).breakdown.ultra).toBe(5);
  });

  it('requires remesh for adaptive decimation', () => {
    const cap = capabilityForImageTo3dSetting('decimation_mode', {
      model_type: 'standard',
      ai_model: 'meshy-7.1',
      should_remesh: false,
    });
    expect(cap.available).toBe(false);

    const bad = validateImageTo3dSettings({
      model_type: 'standard',
      ai_model: 'meshy-7.1',
      should_remesh: false,
      decimation_mode: '2',
    });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('INVALID_DECIMATION');
  });

  it('rejects prop pose_mode instead of silently clearing when explicitly set via character clear path', () => {
    // Switching to prop with empty pose is fine.
    expect(validateImageTo3dSettings({
      ...GAME_PROP_PRESET,
      pose_mode: '',
    }).ok).toBe(true);
  });

  it('forwards remesh + origin + formats on argv / request body', () => {
    const settings = {
      model_type: 'standard',
      ai_model: 'meshy-7.1',
      should_remesh: true,
      topology: 'quad',
      target_polycount: 12000,
      should_texture: true,
      enable_pbr: true,
      texture_model: 'meshy-7',
      texture_resolution: '2k',
      auto_size: true,
      origin_at: 'center',
      target_formats: ['glb', 'fbx'],
      geometry_resolution: '2k',
    };
    const body = buildImageTo3dRequestBody(settings, { imageUrl: 'data:image/png;base64,xx' });
    expect(body.should_remesh).toBe(true);
    expect(body.topology).toBe('quad');
    expect(body.auto_size).toBe(true);
    expect(body.origin_at).toBe('center');
    expect(body.geometry_resolution).toBe('2k');
    expect(body.target_formats).toContain('fbx');

    const tmp = path.join(os.tmpdir(), 'meshy-cap-ref.png');
    // Argv builder requires an absolute existing-looking path with image ext; it only checks shape.
    const argv = buildImageTo3dCreateArgv({
      settings,
      imagePath: tmp,
      async: true,
    });
    expect(argv).toContain('--geometry-resolution');
    expect(argv).toContain('2k');
    expect(argv).toContain('--target-formats');
    expect(argv.some((a) => String(a).includes('fbx'))).toBe(true);
    const dataIdx = argv.indexOf('--data');
    expect(dataIdx).toBeGreaterThan(-1);
    const data = JSON.parse(argv[dataIdx + 1]);
    expect(data.should_remesh).toBe(true);
    expect(data.auto_size).toBe(true);
    expect(data.origin_at).toBe('center');
  });

  it('summarizes character pose in spend confirmation lines', () => {
    const lines = summarizeImageTo3dSettings({
      ...GAME_CHARACTER_PRESET,
      pose_mode: 'a-pose',
    });
    expect(lines.some((l) => /Pose: a-pose/i.test(l))).toBe(true);
    expect(lines.some((l) => /PBR: yes/i.test(l))).toBe(true);
  });
});

describe('Meshy PBR map helpers', () => {
  it('normalizes texture_urls and classifies --all-assets filenames', () => {
    const urls = normalizeMeshyTextureUrls([{
      base_color: 'https://example/base.png',
      normal: 'https://example/n.png',
      metallic: 'https://example/m.png',
      roughness: 'https://example/r.png',
    }]);
    expect(urls.base_color).toMatch(/base\.png/);
    expect(urls.emission).toBeUndefined();

    expect(classifyMeshyMapFileName('texture_0_base_color.png')).toBe('base_color');
    expect(classifyMeshyMapFileName('texture_0_normal.png')).toBe('normal');
    expect(classifyMeshyMapFileName('texture_0_metallic.png')).toBe('metallic');
    expect(classifyMeshyMapFileName('texture_0_roughness.png')).toBe('roughness');
    expect(classifyMeshyMapFileName('texture_0_emission.png')).toBe('emission');
    expect(classifyMeshyMapFileName('thumbnail.png')).toBeNull();
  });
});
