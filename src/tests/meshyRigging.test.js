import { describe, expect, it } from 'vitest';
import {
  MESHY_RIG_CREDITS,
  buildRiggingCreateArgv,
  estimateRiggingCredits,
  summarizeRiggingSettings,
  validateRiggingSettings,
} from '../dev/meshy/meshyRigging.js';

const TASK = '018b314a-a1b5-716d-c222-2f1776f7f579';

describe('meshyRigging', () => {
  it('validates task id source and height', () => {
    const ok = validateRiggingSettings({
      input_task_id: TASK,
      height_meters: 1.75,
    });
    expect(ok.ok).toBe(true);
    expect(ok.settings.input_task_id).toBe(TASK);
    expect(ok.settings.height_meters).toBe(1.75);
    expect(ok.settings.animation_type).toBe('biped');
    expect(ok.settings.model_url).toBe('');
  });

  it('rejects missing source', () => {
    const bad = validateRiggingSettings({});
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('SOURCE_REQUIRED');
  });

  it('rejects remote model_url and non-glb paths', () => {
    expect(validateRiggingSettings({
      model_url: 'https://example.com/a.glb',
    }).code).toBe('INVALID_MODEL_URL');
    expect(validateRiggingSettings({
      model_url: 'D:/tmp/model.obj',
    }).code).toBe('INVALID_MODEL_URL');
  });

  it('rejects quadruped in v0', () => {
    expect(validateRiggingSettings({
      input_task_id: TASK,
      animation_type: 'quadruped',
    }).code).toBe('INVALID_ANIMATION_TYPE');
  });

  it('estimates fixed credits', () => {
    const quote = estimateRiggingCredits({ input_task_id: TASK });
    expect(quote.ok).toBe(true);
    expect(quote.credits).toBe(MESHY_RIG_CREDITS);
    expect(quote.breakdown.rigging).toBe(MESHY_RIG_CREDITS);
  });

  it('builds CLI argv preferring input-task-id', () => {
    const argv = buildRiggingCreateArgv({
      settings: { input_task_id: TASK, height_meters: 1.8 },
      async: true,
      operationId: 'op_testrig01',
    });
    expect(argv).toContain('rigging');
    expect(argv).toContain('create');
    expect(argv).toContain('--input-task-id');
    expect(argv).toContain(TASK);
    expect(argv).toContain('--height-meters');
    expect(argv).toContain('1.8');
    expect(argv).toContain('--async');
    expect(argv).toContain('--operation-id');
    expect(argv).not.toContain('--model-url');
  });

  it('falls back to --model-url when no task id', () => {
    const argv = buildRiggingCreateArgv({
      settings: { model_url: 'D:/BloodBound3D/.meshy-staging/models/x.glb' },
    });
    expect(argv).toContain('--model-url');
    expect(argv).not.toContain('--input-task-id');
  });

  it('summarizes for spend confirm', () => {
    const text = summarizeRiggingSettings({ input_task_id: TASK, height_meters: 1.7 });
    expect(text).toMatch(/Auto-rig/);
    expect(text).toMatch(/1\.7/);
    expect(text).toMatch(String(MESHY_RIG_CREDITS));
    expect(text).toMatch(TASK);
  });
});
