import { meadowSurfaceHeight } from './MeadowSurface.js';
import { TUNNEL_EXIT_Z } from './TunnelWorld.js';

export const MEADOW_CAMERA_CLEARANCE = .75;
const SAMPLE_STEP = .5;

// The near-plane corners need clearance too, especially on wide screens.
export function cameraNearRadius(camera) {
  const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  return Math.hypot(camera.near, halfHeight, halfHeight * camera.aspect);
}

export function createMeadowCameraCollision({ surfaceHeight = meadowSurfaceHeight, recoverySpeed = 6 } = {}) {
  let currentDistance = null;
  return {
    reset() { currentDistance = null; },
    // Shorten the boom along its original direction, not by lifting the camera.
    // The returned fraction also scales the framing offset above the butterfly.
    update(anchor, position, dt, { enabled = true, openWorld = true, nearRadius = 0 } = {}) {
      if (!enabled) { currentDistance = null; return 1; }
      const dx = position.x - anchor.x, dy = position.y - anchor.y, dz = position.z - anchor.z;
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-8) { currentDistance = 0; return 1; }
      // Includes the low grass canopy and a small sampling safety margin.
      const clearance = MEADOW_CAMERA_CLEARANCE + nearRadius * 1.1;
      function blocked(t) {
        const x = anchor.x + dx * t, z = anchor.z + dz * t;
        // Before the tunnel disappears, the meadow only exists past its mouth.
        if (!openWorld && z > TUNNEL_EXIT_Z - 20) return false;
        return anchor.y + dy * t < surfaceHeight(x, z) + clearance;
      }
      let safe = 0, limit = 1;
      const steps = Math.ceil(length / SAMPLE_STEP);
      // Test the entire boom: its end can be clear with a hill in between.
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (blocked(t)) {
          let hit = t;
          for (let j = 0; j < 12; j++) {
            const middle = (safe + hit) / 2;
            if (blocked(middle)) hit = middle;
            else safe = middle;
          }
          limit = safe;
          break;
        }
        safe = t;
      }
      const allowedDistance = length * limit;
      const recovery = 1 - Math.exp(-recoverySpeed * Math.max(0, dt));
      // Contact is immediate; only the unobstructed return is smoothed. Damping
      // the collision itself would leave the camera underground for some frames.
      currentDistance = currentDistance === null ? allowedDistance
        : Math.min(allowedDistance, currentDistance + (length - currentDistance) * recovery);
      const fraction = currentDistance / length;
      position.set(anchor.x + dx * fraction, anchor.y + dy * fraction, anchor.z + dz * fraction);
      return fraction;
    },
  };
}
