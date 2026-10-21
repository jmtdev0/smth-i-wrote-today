export const DEFAULT_MOBILE_CONTROL_TIMINGS = Object.freeze({
  hideAfterUses: 5,
  hideAfterActiveSeconds: 8,
  hideAfterIdleSeconds: 4,
  restoreAfterIdleSeconds: 60,
});

export function createMobileControlVisibility(options = {}) {
  const timings = { ...DEFAULT_MOBILE_CONTROL_TIMINGS, ...options };
  let joystickUses = 0;
  let activeSeconds = 0;
  let idleSeconds = 0;
  let engaged = false;
  let hidden = false;

  function resetProgress() {
    joystickUses = 0;
    activeSeconds = 0;
    idleSeconds = 0;
    engaged = false;
  }

  function interact() {
    if (hidden) {
      hidden = false;
      resetProgress();
    }
    engaged = true;
    idleSeconds = 0;
    return !hidden;
  }

  return {
    interact,
    joystickPressed() {
      interact();
      joystickUses += 1;
    },
    update(deltaSeconds, { joystickActive = false, interacting = false } = {}) {
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
      if (joystickActive) {
        activeSeconds += dt;
        engaged = true;
      }
      if (interacting || joystickActive) idleSeconds = 0;
      else if (engaged) idleSeconds += dt;

      const usedEnough = joystickUses >= timings.hideAfterUses
        || activeSeconds >= timings.hideAfterActiveSeconds;
      if (!hidden && engaged && usedEnough && idleSeconds >= timings.hideAfterIdleSeconds) hidden = true;
      if (hidden && idleSeconds >= timings.restoreAfterIdleSeconds) {
        hidden = false;
        resetProgress();
      }
      return !hidden;
    },
    reset() {
      hidden = false;
      resetProgress();
      return true;
    },
    get visible() { return !hidden; },
  };
}
