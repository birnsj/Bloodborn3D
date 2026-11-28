import { describe, expect, it } from 'vitest';
import {
  bothPrimaryButtonsHeld,
  beginDualElevate,
  createDualElevateState,
  endDualElevate,
  moveMetersFromMouseDelta,
  stepDualElevate,
} from '../editor/viewport/dualButtonElevate.js';

describe('dualButtonElevate', () => {
  it('detects LMB+RMB via the buttons bitmask', () => {
    expect(bothPrimaryButtonsHeld(0)).toBe(false);
    expect(bothPrimaryButtonsHeld(1)).toBe(false);
    expect(bothPrimaryButtonsHeld(2)).toBe(false);
    expect(bothPrimaryButtonsHeld(3)).toBe(true);
    expect(bothPrimaryButtonsHeld(7)).toBe(true);
  });

  it('maps mouse delta to strafe and elevate meters', () => {
    const side = moveMetersFromMouseDelta(400, 0, 450);
    expect(side.right).toBeCloseTo(4.5, 5);
    expect(side.up).toBeCloseTo(0, 5);
    expect(moveMetersFromMouseDelta(0, -400, 450).up).toBeCloseTo(4.5, 5);
    expect(moveMetersFromMouseDelta(0, 400, 450).up).toBeCloseTo(-4.5, 5);
    expect(moveMetersFromMouseDelta(0, -400, 900).up).toBeCloseTo(9, 5);
  });

  it('tracks a gesture and reports motion on end', () => {
    const state = createDualElevateState();
    beginDualElevate(state, 100, 100);
    expect(state.active).toBe(true);
    expect(stepDualElevate(state, 100, 100, 450)).toEqual({ right: 0, up: 0 });
    const step = stepDualElevate(state, 140, 60, 450);
    expect(step.right).toBeCloseTo(4.5 * (40 / 400), 5);
    expect(step.up).toBeCloseTo(4.5 * (40 / 400), 5);
    expect(state.moved).toBe(true);
    expect(endDualElevate(state)).toBe(true);
    expect(state.active).toBe(false);
    expect(endDualElevate(state)).toBe(false);
  });
});
