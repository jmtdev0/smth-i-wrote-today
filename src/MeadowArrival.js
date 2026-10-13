import { MathUtils } from 'three';
import { TUNNEL_EXIT_Z } from './TunnelWorld.js';

// Prepare the exterior before entering the first mist layer. Position, rather
// than a second timer after the tunnel fade, also handles fast flight and pause.
export const MEADOW_PREPARE_START_Z = TUNNEL_EXIT_Z + 60;
export const MEADOW_PREPARE_READY_Z = TUNNEL_EXIT_Z + 14;
export const MEADOW_EXTERIOR_EDGE_Z = TUNNEL_EXIT_Z - 20;

export function meadowReadiness(playerZ, openWorld) {
  if (openWorld) return 1;
  if (!Number.isFinite(playerZ)) return 0;
  return 1 - MathUtils.smootherstep(playerZ, MEADOW_PREPARE_READY_Z, MEADOW_PREPARE_START_Z);
}
