import * as THREE from 'three';
import { heavenFlightPosition } from './HeavenChoreography.js';

// A compact flock fans out in rows, rather than stretching indefinitely into
// the distance when a charged call reaches many Heaven inhabitants at once.
export function companionTarget(player, heading, slot, time, phase, target) {
  const row = Math.floor(slot / 6), column = slot % 6;
  const side = (column % 2 ? 1 : -1) * (1.8 + Math.floor(column / 2) * 1.8);
  const behind = 3.2 + row * 2.2;
  return target.set(player.x - heading.x * behind - heading.z * side,
    player.y + Math.sin(time * .65 + phase) * .7 + (slot % 3 - 1) * .65,
    player.z - heading.z * behind + heading.x * side);
}

export function createFlightHeading() {
  const heading = new THREE.Vector3(0, 0, -1), previous = new THREE.Vector3();
  let initialized = false;
  return {
    direction: heading,
    update(player, dt) {
      if (initialized && dt > 0) {
        const dx = player.x - previous.x, dz = player.z - previous.z;
        if (dx * dx + dz * dz > 1e-8) {
          const current = Math.atan2(heading.x, -heading.z), goal = Math.atan2(dx, -dz);
          const difference = Math.atan2(Math.sin(goal - current), Math.cos(goal - current));
          const angle = current + difference * (1 - Math.exp(-dt * 4));
          heading.set(Math.sin(angle), 0, -Math.cos(angle));
        }
      }
      initialized = true; previous.copy(player);
      return heading;
    },
  };
}

// Translate the orbit's anchor so freedom starts exactly at the current
// rendered position, without snapping back to its original home or dance.
export function releaseIntoOrbit(profile, time, position) {
  profile.dance = null;
  profile.x = 0; profile.y = 0; profile.z = 0;
  const offset = heavenFlightPosition(profile, time, new THREE.Vector3());
  profile.x = position.x - offset.x;
  profile.y = position.y - offset.y;
  profile.z = position.z - offset.z;
}
