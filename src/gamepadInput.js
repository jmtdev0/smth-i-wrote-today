export const GAMEPAD_ZOOM_SPEED = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function gamepadAxis(gamepad, index) {
  const value = Number(gamepad.axes?.[index] ?? 0);
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.min(1, Math.abs(value));
  const deadzone = .16;
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

export function gamepadButton(gamepad, index) {
  const button = gamepad.buttons?.[index];
  if (!button) return 0;
  const value = Number(button.value ?? 0);
  return button.pressed ? 1 : Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

// Standard DualShock mapping. In Heaven, Cross behaves like keyboard R: one
// immediate white chirp, never a charged recruitment.
export const GAMEPAD_ACTION_BUTTONS = [9, 3, 0, 1, 2];
export function dispatchGamepadAction(index, pressed, now,
  { enabled, heaven = true, toggleSettings, releaseGroup, chirp, chirpButtons }) {
  if (index === 9) {
    if (pressed) toggleSettings();
    return;
  }
  if (!enabled) {
    chirpButtons.cancel(`gamepad${index}`);
    return;
  }
  if (pressed) {
    if (index === 0 && heaven) chirp(0, { restoreWhite: true, recruit: false });
    else if (index === 3) releaseGroup();
    else if (index === 1 || (index === 2 && heaven)) chirpButtons.down(`gamepad${index}`, now, index === 1);
  } else if (index === 1 || index === 2) chirpButtons.up(`gamepad${index}`, now);
}

export function resetGamepadMotion(input = {}) {
  input.moveX = input.moveY = input.lookX = input.lookY = 0;
  input.ascend = input.descend = input.zoom = 0;
  return input;
}

// Standard mapping: hold R3 (button 11) to repurpose the left stick for zoom.
// Both left-stick movement axes are consumed; D-pad, triggers and orbit remain
// independent. This is sampled every frame, not a toggle that can get stuck.
export function readGamepadMotion(gamepad, input, enabled = true) {
  resetGamepadMotion(input);
  if (!enabled || !gamepad || gamepad.connected === false) return input;
  const zooming = gamepadButton(gamepad, 11) > .5;
  const dpadX = gamepadButton(gamepad, 15) - gamepadButton(gamepad, 14);
  const dpadY = gamepadButton(gamepad, 13) - gamepadButton(gamepad, 12);
  input.moveX = clamp((zooming ? 0 : gamepadAxis(gamepad, 0)) + dpadX, -1, 1);
  input.moveY = clamp((zooming ? 0 : gamepadAxis(gamepad, 1)) + dpadY, -1, 1);
  input.zoom = zooming ? gamepadAxis(gamepad, 1) : 0;
  input.lookX = gamepadAxis(gamepad, 2);
  input.lookY = gamepadAxis(gamepad, 3);
  // L2/R2 remain buttons 6/7 on a DualShock 4.
  input.descend = gamepadButton(gamepad, 6);
  input.ascend = gamepadButton(gamepad, 7);
  return input;
}

export function advanceGamepadZoom(distance, zoom, dt, minDistance, maxDistance) {
  // Up is negative in the Gamepad API: forward brings the camera closer.
  return clamp(distance + zoom * GAMEPAD_ZOOM_SPEED * Math.max(0, dt), minDistance, maxDistance);
}

export const R3_TAP_MAX_MS = 350;
export const R3_DOUBLE_TAP_MS = 450;
export const R3_ZOOM_CANCEL_MS = 100;
export const R3_ZOOM_CANCEL_AXIS = .4;

export function createR3ViewGesture() {
  let previousPressed = null, started = null, valid = false, lastTap = -Infinity, source = null;
  let zoomStarted = null, suppressZoom = false;
  const reset = () => {
    previousPressed = null; started = null; valid = false; lastTap = -Infinity; source = null;
    zoomStarted = null; suppressZoom = false;
  };
  return {
    reset,
    get suppressZoom() { return suppressZoom; },
    update(gamepad, now, enabled = true) {
      if (!enabled || !gamepad || gamepad.connected === false) { reset(); return false; }
      const index = gamepad.index ?? 0;
      if (source !== index) { reset(); source = index; }
      const pressed = gamepadButton(gamepad, 11) > .5;
      // A button held on reconnect/focus recovery is not a new click.
      if (previousPressed === null) { previousPressed = pressed; return false; }
      let toggle = false;
      if (pressed && !previousPressed) {
        toggle = now - lastTap <= R3_DOUBLE_TAP_MS;
        started = now; valid = !toggle; zoomStarted = null;
        // Act on the second down edge, not its release. Consume the rest of
        // that click so stick drift cannot immediately undo the camera cut.
        suppressZoom = toggle;
        lastTap = -Infinity;
      }
      if (pressed && !suppressZoom) {
        // Tiny drift and horizontal movement do not mean intentional zoom.
        // A meaningful vertical tilt must persist before cancelling the tap.
        if (Math.abs(gamepadAxis(gamepad, 1)) > R3_ZOOM_CANCEL_AXIS) zoomStarted ??= now;
        else zoomStarted = null;
        if ((zoomStarted !== null && now - zoomStarted >= R3_ZOOM_CANCEL_MS)
            || (started !== null && now - started > R3_TAP_MAX_MS)) {
          valid = false; lastTap = -Infinity;
        }
      }
      if (!pressed && previousPressed) {
        const zoomHeld = zoomStarted !== null && now - zoomStarted >= R3_ZOOM_CANCEL_MS;
        if (valid && !zoomHeld && started !== null && now - started <= R3_TAP_MAX_MS) {
          lastTap = now;
        } else lastTap = -Infinity;
        started = null; valid = false; zoomStarted = null; suppressZoom = false;
      }
      previousPressed = pressed;
      return toggle;
    },
  };
}
