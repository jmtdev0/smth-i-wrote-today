export const CHIRP_RADIUS = 12;
export const MAX_CHIRP_RADIUS = 30;
export const MAX_CHIRP_CHARGE_SECONDS = 1.2;
export const CHIRP_COOLDOWN = 0.2;
export const BOOST_DURATION = 4;
export const BOOST_MULTIPLIER = 1.6;

const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// A new call refreshes the envelope from its current value, without stacking
// speed or snapping back to zero. Simulation time also freezes it when paused.
export function createResonanceCharge() {
  let startedAt = -Infinity;
  let initial = 0;
  const strength = time => {
    const age = time - startedAt;
    if (age < 0 || age >= BOOST_DURATION) return 0;
    const attack = initial + (1 - initial) * smooth(age / .3);
    const release = 1 - smooth((age - 2.4) / (BOOST_DURATION - 2.4));
    return attack * release;
  };
  return {
    strength,
    multiplier: time => 1 + (BOOST_MULTIPLIER - 1) * strength(time),
    refresh(time) { initial = strength(time); startedAt = time; },
    reset() { startedAt = -Infinity; initial = 0; },
  };
}
