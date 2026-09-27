export const SKY_APPARITION_OPACITY = .12;
export const SKY_APPARITION_DURATION = 10;

function smoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Count only time spent looking up between appearances. Use simulation time,
// so pausing or backgrounding the scene cannot skip to a sudden full image.
export function createSkyApparition(random = Math.random) {
  let previous = null, waiting = 6, age = null, gaze = 0;
  return {
    update(time, heaven, forwardY, ready = true) {
      const dt = previous === null ? 0 : Math.max(0, Math.min(.1, time - previous));
      previous = time;
      if (!heaven || !ready) {
        waiting = 6; age = null; gaze = 0;
        return 0;
      }
      const looking = smoothstep(.15, .55, forwardY);
      gaze += (looking - gaze) * (1 - Math.exp(-dt * 2.5));
      if (age === null) {
        if (forwardY > .25) waiting -= dt;
        if (waiting > 0) return 0;
        age = 0;
      } else age += dt;
      if (age >= SKY_APPARITION_DURATION) {
        age = null; waiting = 22 + random() * 14;
        return 0;
      }
      const envelope = smoothstep(0, 4, age) * (1 - smoothstep(6, 10, age));
      return SKY_APPARITION_OPACITY * envelope * gaze;
    },
  };
}
