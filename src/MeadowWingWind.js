import * as THREE from 'three';
import { meadowSurfaceHeight } from './MeadowSurface.js';

export const WING_WIND_RADIUS = 4.5;
export const WING_WIND_MAX_HEIGHT = 9;

export function createMeadowWingWind() {
  // World XZ, footprint radius, pressure. All grass tiers share this one value.
  const uniform = { value: new THREE.Vector4(0, 0, WING_WIND_RADIUS, 0) };
  let previousTime = null;
  return {
    uniform,
    reset() { previousTime = null; uniform.value.set(0, 0, WING_WIND_RADIUS, 0); },
    update(time, player, wingbeat = 0) {
      const dt = previousTime === null ? 0 : THREE.MathUtils.clamp(time - previousTime, 0, .05);
      previousTime = time;
      let target = 0;
      if (player) {
        uniform.value.x = player.x;
        uniform.value.y = player.z;
        const height = Math.max(0, player.y - meadowSurfaceHeight(player.x, player.z));
        const reach = 1 - THREE.MathUtils.smoothstep(height, 2.5, WING_WIND_MAX_HEIGHT);
        target = THREE.MathUtils.clamp(Number.isFinite(wingbeat) ? wingbeat : 0, 0, 1) * reach;
      }
      const pressure = uniform.value.w;
      // Ease into each downstroke and let the grass settle gently between beats.
      uniform.value.w = THREE.MathUtils.damp(pressure, target, target > pressure ? 12 : 6, dt);
    },
  };
}

// Used by blade vertices and the continuous canopy's fibers. The finite,
// smooth footprint prevents a hard ring or a singularity below the butterfly.
export const meadowWingWindGLSL = `
uniform vec4 uWingWind;
vec2 meadowWingWind(vec2 root) {
  if (uWingWind.w < .0001) return vec2(0.);
  vec2 delta = root - uWingWind.xy;
  float distanceSquared = dot(delta, delta);
  float radiusSquared = uWingWind.z * uWingWind.z;
  if (distanceSquared >= radiusSquared) return vec2(0.);
  float falloff = 1. - distanceSquared / radiusSquared;
  return delta * inversesqrt(distanceSquared + .25) * falloff * falloff * uWingWind.w * .35;
}
`;
