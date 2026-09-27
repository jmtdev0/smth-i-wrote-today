export const BUTTERFLY_VERTICAL_SPEED = 5;
export const WATERFALL_SPEED = 4.5;
export function advanceAltitude(altitude, input, delta) {
  return altitude + Math.max(-1, Math.min(1, input)) * Math.max(0, delta) * BUTTERFLY_VERTICAL_SPEED;
}
export function flowPhase(time) {
  return time * WATERFALL_SPEED;
}

// Direction uses the same yaw/pitch convention as the orbit camera.
// The vertical coordinate is now the butterfly's actual world-space Y position.
export function cameraRelativeMovement(yaw, pitch, forward, sideways, rise = 0) {
  const x = Math.cos(yaw) * sideways - Math.sin(yaw) * Math.cos(pitch) * forward;
  const y = -Math.sin(pitch) * forward + rise;
  const z = -Math.sin(yaw) * sideways - Math.cos(yaw) * Math.cos(pitch) * forward;
  const norm = Math.max(1, Math.hypot(x, y, z));
  return { x: x / norm, y: y / norm, z: z / norm };
}

export const LATERAL_PERIOD = 51200;
export function lateralPhase(distance) {
  return ((distance % LATERAL_PERIOD) + LATERAL_PERIOD) % LATERAL_PERIOD;
}
