// Only two short, stationary, single-finger taps count as a call. Camera drags,
// pinches and cancelled pointers invalidate the gesture.
export function createChirpGesture(onChirp) {
  const fingers = new Map();
  let previousTap = null;
  const reset = () => { fingers.clear(); previousTap = null; };
  return {
    reset,
    down(event) {
      if (event.pointerType !== 'touch') return;
      const multi = fingers.size > 0;
      if (multi) {
        for (const finger of fingers.values()) finger.valid = false;
        previousTap = null;
      }
      fingers.set(event.pointerId, {
        x: event.clientX, y: event.clientY, time: event.timeStamp, valid: !multi,
      });
    },
    move(event) {
      const finger = fingers.get(event.pointerId);
      if (finger && Math.hypot(event.clientX - finger.x, event.clientY - finger.y) > 12) {
        finger.valid = false;
        previousTap = null;
      }
    },
    up(event) {
      const finger = fingers.get(event.pointerId);
      fingers.delete(event.pointerId);
      if (!finger) return;
      if (!finger.valid || event.timeStamp - finger.time > 250
          || Math.hypot(event.clientX - finger.x, event.clientY - finger.y) > 12) {
        previousTap = null;
        return;
      }
      if (previousTap && event.timeStamp - previousTap.time <= 350
          && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 32) {
        previousTap = null;
        onChirp();
      } else {
        previousTap = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      }
    },
    cancel(event) { if (fingers.has(event.pointerId)) reset(); },
  };
}
