/**
 * LMB + RMB held together: translate the editor camera without turning.
 *
 * Mouse X → strafe · Mouse Y → up / down (world Y).
 * Freelook is paused for the whole dual-button hold.
 */

/** PointerEvent.buttons mask: bit0 LMB + bit1 RMB. */
export const BOTH_PRIMARY_BUTTONS = 3;

export function createDualElevateState() {
  return { active: false, lastX: 0, lastY: 0, moved: false };
}

export function bothPrimaryButtonsHeld(buttons) {
  return (Number(buttons) & BOTH_PRIMARY_BUTTONS) === BOTH_PRIMARY_BUTTONS;
}

/**
 * Pixels → meters. ~400 px at default fly speed ≈ one second of WASD travel.
 * @returns {{ right: number, up: number }}
 */
export function moveMetersFromMouseDelta(dxPixels, dyPixels, flySpeed = 450) {
  const speed = Number(flySpeed);
  const s = Number.isFinite(speed) && speed > 0 ? speed : 450;
  const scale = (s * 0.01) / 400;
  const dx = Number(dxPixels);
  const dy = Number(dyPixels);
  return {
    // Mouse right → strafe right.
    right: Number.isFinite(dx) ? dx * scale : 0,
    // Screen y grows downward; mouse-up → raise the camera.
    up: Number.isFinite(dy) ? -dy * scale : 0,
  };
}

export function beginDualElevate(state, clientX, clientY) {
  if (!state) return;
  state.active = true;
  state.lastX = Number(clientX) || 0;
  state.lastY = Number(clientY) || 0;
}

/**
 * @returns {{ right: number, up: number } | null}
 */
export function stepDualElevate(state, clientX, clientY, flySpeed = 450) {
  if (!state?.active) return null;
  const x = Number(clientX) || 0;
  const y = Number(clientY) || 0;
  const dx = x - state.lastX;
  const dy = y - state.lastY;
  state.lastX = x;
  state.lastY = y;
  if (dx === 0 && dy === 0) return { right: 0, up: 0 };
  state.moved = true;
  return moveMetersFromMouseDelta(dx, dy, flySpeed);
}

/** @returns {boolean} whether any dual-button motion happened this gesture. */
export function endDualElevate(state) {
  if (!state) return false;
  const moved = Boolean(state.moved);
  state.active = false;
  state.lastX = 0;
  state.lastY = 0;
  state.moved = false;
  return moved;
}
