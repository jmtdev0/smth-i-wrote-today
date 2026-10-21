export const HEAVEN_CHIRP_MENU_HOLD_MS = 380;
export const HEAVEN_RELEASE_HOLD_MS = 700;
const MENU_RADIUS = 160;
const MENU_BUTTON_SIZE = 88;
const MENU_BUTTON_EXTENT = MENU_BUTTON_SIZE * .55 + 6;
const MENU_EDGE_GAP = 8;
const MENU_PLACEMENTS = Object.fromEntries(Object.entries({
  below: { gather: 225, greet: 112.5, white: 67.5, release: 22.5 },
  above: { gather: 225, greet: 270, white: 315, release: 15 },
}).map(([placement, angles]) => {
  const directions = Object.entries(angles).map(([name, angle]) => {
    const radians = angle * Math.PI / 180;
    return [name, { x: Math.cos(radians), y: Math.sin(radians) }];
  });
  return [placement, { directions, bounds: {
    left: Math.min(...directions.map(([, direction]) => direction.x * MENU_RADIUS)) - MENU_BUTTON_EXTENT,
    right: Math.max(...directions.map(([, direction]) => direction.x * MENU_RADIUS)) + MENU_BUTTON_EXTENT,
    top: Math.min(...directions.map(([, direction]) => direction.y * MENU_RADIUS)) - MENU_BUTTON_EXTENT,
    bottom: Math.max(...directions.map(([, direction]) => direction.y * MENU_RADIUS)) + MENU_BUTTON_EXTENT,
  } }];
}));

const CHIRP_MODES = new Set(['gather', 'greet', 'white']);

function menuScale(bounds, x, y, viewportWidth, viewportHeight) {
  return Math.max(0, Math.min(1,
    (x - MENU_EDGE_GAP) / -bounds.left,
    (viewportWidth - MENU_EDGE_GAP - x) / bounds.right,
    (y - MENU_EDGE_GAP) / -bounds.top,
    (viewportHeight - MENU_EDGE_GAP - y) / bounds.bottom,
  ));
}

// Keep the circle centered on the butterfly itself. Use the upper arc when she
// is low in the viewport, so landscape screens retain readable, touch-sized icons.
// Keep that placement for the whole gesture to avoid rearranging beneath a finger.
export function layoutHeavenChirpMenu(x, y, viewportWidth, viewportHeight, placement = null) {
  const scales = Object.fromEntries(Object.entries(MENU_PLACEMENTS).map(([name, { bounds }]) => (
    [name, menuScale(bounds, x, y, viewportWidth, viewportHeight)]
  )));
  placement ??= scales.below >= .85 || scales.below >= scales.above ? 'below' : 'above';
  const scale = scales[placement];
  const radius = MENU_RADIUS * scale;
  return {
    x, y, radius, scale, placement,
    buttonSize: MENU_BUTTON_SIZE * scale,
    options: Object.fromEntries(MENU_PLACEMENTS[placement].directions.map(([name, direction]) => [name, {
      x: direction.x * radius,
      y: direction.y * radius,
    }])),
  };
}

export function createMobileChirpMenu({
  holdMs = HEAVEN_CHIRP_MENU_HOLD_MS,
  releaseHoldMs = HEAVEN_RELEASE_HOLD_MS,
} = {}) {
  let selectedMode = 'gather';
  let holdStartedAt = null;
  let open = false;
  let hoveredOption = null;
  let releaseHoveredAt = null;

  function clearGesture() {
    holdStartedAt = null;
    open = false;
    hoveredOption = null;
    releaseHoveredAt = null;
  }

  function releaseProgress(now) {
    if (hoveredOption !== 'release' || releaseHoveredAt === null) return 0;
    return Math.min(1, Math.max(0, (now - releaseHoveredAt) / releaseHoldMs));
  }

  function releaseArmed(now) {
    return releaseProgress(now) >= 1;
  }

  return {
    get selectedMode() { return selectedMode; },
    get open() { return open; },
    get hoveredOption() { return hoveredOption; },
    selectMode(mode) {
      if (CHIRP_MODES.has(mode)) selectedMode = mode;
      return selectedMode;
    },
    releaseProgress,
    releaseArmed,
    pointerDown(now) {
      clearGesture();
      holdStartedAt = now;
    },
    update(now) {
      if (holdStartedAt === null || open || now - holdStartedAt < holdMs) return false;
      open = true;
      return true;
    },
    hover(option, now) {
      if (!open || option === hoveredOption) return;
      hoveredOption = option;
      releaseHoveredAt = option === 'release' ? now : null;
    },
    pointerUp(now) {
      this.update(now);
      if (holdStartedAt === null) return null;

      let result = null;
      if (!open) {
        result = { type: 'chirp', mode: selectedMode };
      } else if (CHIRP_MODES.has(hoveredOption)) {
        selectedMode = hoveredOption;
        result = { type: 'chirp', mode: selectedMode };
      } else if (hoveredOption === 'release' && releaseArmed(now)) {
        result = { type: 'release' };
      }

      clearGesture();
      return result;
    },
    cancel() { clearGesture(); },
  };
}
