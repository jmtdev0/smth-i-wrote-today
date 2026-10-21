export function detectControlsMode({ touchLayout = false, gamepads = [] } = {}) {
  if (Array.from(gamepads ?? []).some(gamepad => gamepad?.connected)) return 'gamepad';
  return touchLayout ? 'touch' : 'keyboard-mouse';
}

export function controlsModeForPointer(pointerType, touchLayout = false) {
  if (pointerType === 'touch') return 'touch';
  if (pointerType === 'mouse') return 'keyboard-mouse';
  if (pointerType === 'pen') return touchLayout ? 'touch' : 'keyboard-mouse';
  return null;
}
