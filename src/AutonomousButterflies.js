import * as THREE from 'three';
import { createButterfly } from './Butterfly.js';
import {
  HYPERBOLOID_POSITION,
  WATER_VERTICAL_FADE_START,
  hyperboloidRadius,
} from './Waterfall.js';
import { BUTTERFLY_VERTICAL_SPEED } from './flight.js';
import { CHIRP_RADIUS, MAX_CHIRP_RADIUS, CHIRP_COOLDOWN, createResonanceCharge } from './resonance.js';
import { TUNNEL_START, TUNNEL_EXIT_Z, constrainTunnelPosition, tunnelDaylight, createButterflyLantern } from './TunnelWorld.js';

export const AUTONOMOUS_BUTTERFLY_COUNT = 6;
export const AUTONOMOUS_FLIGHT_SPEED = BUTTERFLY_VERTICAL_SPEED;
const AUTONOMOUS_TANGENTIAL_SPEED = AUTONOMOUS_FLIGHT_SPEED * 0.82;

const FLIGHT_PROFILES = Object.freeze([
  { phase: 0.35, angularDirection: 1, verticalSpeed: 0.18, centerY: -58, verticalAmplitude: 10, radial: 0.42, radialWobble: 0.05, scale: 0.15 },
  { phase: 1.55, angularDirection: -1, verticalSpeed: 0.16, centerY: -22, verticalAmplitude: 12, radial: 0.58, radialWobble: 0.06, scale: 0.18 },
  { phase: 2.7, angularDirection: 1, verticalSpeed: 0.22, centerY: 6, verticalAmplitude: 6, radial: 0.28, radialWobble: 0.05, scale: 0.13 },
  { phase: 3.65, angularDirection: -1, verticalSpeed: 0.17, centerY: 48, verticalAmplitude: 8, radial: 0.63, radialWobble: 0.045, scale: 0.16 },
  { phase: 4.8, angularDirection: 1, verticalSpeed: 0.15, centerY: 70, verticalAmplitude: 7, radial: 0.48, radialWobble: 0.05, scale: 0.12 },
  { phase: 5.7, angularDirection: -1, verticalSpeed: 0.19, centerY: -78, verticalAmplitude: 6, radial: 0.55, radialWobble: 0.04, scale: 0.14 },
]);

function profileFor(index) {
  if (index < FLIGHT_PROFILES.length) return FLIGHT_PROFILES[index];
  const phase = index * 2.17;
  return {
    phase,
    angularDirection: index % 2 ? -1 : 1,
    verticalSpeed: 0.15 + (index % 3) * 0.025,
    centerY: -72 + (index % 6) * 28,
    verticalAmplitude: 6 + (index % 4) * 2,
    radial: 0.38 + (index % 4) * 0.07,
    radialWobble: 0.045,
    scale: 0.12 + (index % 3) * 0.02,
  };
}

function roamingPosition(profile, time, center, target) {
  const vertical = profile.centerY
    + Math.sin(time * profile.verticalSpeed + profile.phase) * profile.verticalAmplitude
    + Math.sin(time * .13 + profile.phase * 1.7) * 4;
  const localY = THREE.MathUtils.clamp(vertical, -WATER_VERTICAL_FADE_START + 8, WATER_VERTICAL_FADE_START - 8);
  const surfaceRadius = hyperboloidRadius(localY);
  const radial = surfaceRadius * (profile.radial + Math.sin(time * .19 + profile.phase) * profile.radialWobble);
  const nominalRadius = Math.max(4, hyperboloidRadius(profile.centerY) * profile.radial);
  const angle = profile.phase + time * profile.angularDirection * AUTONOMOUS_TANGENTIAL_SPEED / nominalRadius
    + Math.sin(time * .17 + profile.phase) * .24;
  return target.set(center.x + Math.sin(angle) * radial,
    HYPERBOLOID_POSITION.y + Math.sin(time * .45) * .1 + localY,
    center.z - Math.cos(angle) * radial);
}

function tunnelRoamingPosition(profile, time, center, target) {
  const angle = profile.phase + time * .22;
  const radius = 5 + profile.radial * 9;
  return target.set(Math.sin(angle) * radius,
    Math.cos(angle * .8 + profile.phase) * radius * .65,
    profile.tunnelZ + Math.sin(angle * .7) * 4);
}

export function createAutonomousButterflies(count = AUTONOMOUS_BUTTERFLY_COUNT, { tunnel = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Autonomous butterflies';
  const agents = [];
  const amount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const roam = tunnel ? tunnelRoamingPosition : roamingPosition;

  const template = amount ? createButterfly() : null;
  for (let index = 0; index < amount; index++) {
    const butterfly = index === 0 ? template : template.clone();
    const profile = { ...profileFor(index) };
    if (tunnel) {
      profile.tunnelZ = TUNNEL_START.z - 8 - index / Math.max(1, amount - 1) * (TUNNEL_START.z - TUNNEL_EXIT_Z - 35);
      profile.scale = .29 + (index % 3) * .035;
      butterfly.group.traverse(object => { if (object.material) object.material.fog = false; });
    }
    butterfly.group.name = `Autonomous butterfly ${index + 1}`;
    butterfly.group.scale.setScalar(profile.scale);
    group.add(butterfly.group);
    roam(profile, 0, HYPERBOLOID_POSITION, butterfly.group.position);
    const lantern = tunnel ? createButterflyLantern() : null;
    if (lantern) group.add(lantern.group);
    agents.push({ butterfly, profile, connected: false, slot: -1, whiteness: 0,
      lantern, tint: new THREE.Color('#ffffff'), targetTint: new THREE.Color('#ffffff'),
      velocity: new THREE.Vector3(), charge: createResonanceCharge() });
  }

  const playerCharge = createResonanceCharge();
  const lastPlayer = new THREE.Vector3();
  const heading = new THREE.Vector3(0, 0, -1);
  const target = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  const travel = new THREE.Vector3();
  const separation = new THREE.Vector3();
  let lastTime = null, startTime = 0, lastChirp = -Infinity, connectedCount = 0;

  return {
    group,
    agents,
    get connectedCount() { return connectedCount; },
    boost: time => playerCharge.multiplier(time),
    glow: time => playerCharge.strength(time),
    adoptColor(color) {
      for (const agent of agents) if (agent.connected) agent.targetTint.copy(color);
    },
    chirp(time, player, power = 0) {
      const charge = Number.isFinite(power) ? THREE.MathUtils.clamp(power, 0, 1) : 0;
      const radius = CHIRP_RADIUS + (MAX_CHIRP_RADIUS - CHIRP_RADIUS) * charge;
      if (time - lastChirp < CHIRP_COOLDOWN) return { emitted: false, receivers: [], charge, radius };
      lastChirp = time;
      const receivers = agents.filter(agent => agent.butterfly.group.visible
        && agent.butterfly.group.position.distanceToSquared(player) <= radius ** 2);
      for (const agent of receivers) {
        if (!agent.connected) {
          agent.connected = true;
          agent.slot = connectedCount++;
        }
        agent.charge.refresh(time);
      }
      if (receivers.length) playerCharge.refresh(time);
      return { emitted: true, receivers, charge, radius };
    },
    reset(time = 0, center = HYPERBOLOID_POSITION) {
      startTime = time; lastTime = time; lastChirp = -Infinity; connectedCount = 0;
      lastPlayer.copy(center); heading.set(0, 0, -1); playerCharge.reset();
      for (const agent of agents) {
        agent.connected = false; agent.slot = -1; agent.whiteness = 0;
        agent.butterfly.group.visible = true;
        agent.tint.set('#ffffff'); agent.targetTint.set('#ffffff');
        agent.butterfly.setWhiteness(0);
        agent.charge.reset(); agent.velocity.set(0, 0, 0);
        roam(agent.profile, 0, center, agent.butterfly.group.position);
        agent.lantern?.reset();
      }
    },
    update(time, center = HYPERBOLOID_POSITION, cameraQuaternion = null, moving = true, lateralStep = 0, tunnelSolid = true) {
      const firstFrame = lastTime === null;
      const dt = moving && !firstFrame ? THREE.MathUtils.clamp(time - lastTime, 0, .1) : 0;
      const flightTime = time - startTime;
      if (!firstFrame && dt > 0) {
        travel.set(center.x - lastPlayer.x + (tunnel ? 0 : lateralStep), 0, center.z - lastPlayer.z);
        if (travel.lengthSq() > 1e-8) {
          const current = Math.atan2(heading.x, -heading.z);
          const goal = Math.atan2(travel.x, -travel.z);
          const difference = Math.atan2(Math.sin(goal - current), Math.cos(goal - current));
          const angle = current + difference * (1 - Math.exp(-dt * 4));
          heading.set(Math.sin(angle), 0, -Math.cos(angle));
        }
      }
      lastTime = time; lastPlayer.copy(center);

      // Lateral flight scrolls the original scene instead of moving player.x.
      // Apply that same frame shift once, so companions can approach and follow.
      if (!tunnel && dt > 0) for (const agent of agents) agent.butterfly.group.position.x -= lateralStep;

      for (const agent of agents) {
        const { butterfly, profile, velocity } = agent;
        // Unrescued inhabitants belong to the departed tunnel, not Heaven.
        // Keep zero-power lights in the lighting layout to avoid shader churn.
        butterfly.group.visible = !tunnel || tunnelSolid || agent.connected;
        if (!butterfly.group.visible) {
          agent.lantern?.reset();
          continue;
        }
        const position = butterfly.group.position;
        const targetWhiteness = agent.connected ? 1 : 0;
        if (dt > 0) {
          agent.whiteness += (targetWhiteness - agent.whiteness) * (1 - Math.exp(-dt * 4.2));
          if (Math.abs(targetWhiteness - agent.whiteness) < .001) agent.whiteness = targetWhiteness;
        }
        butterfly.setWhiteness(agent.whiteness);
        if (dt > 0) agent.tint.lerp(agent.targetTint, 1 - Math.exp(-dt * 4.2));
        butterfly.setTint(agent.tint);
        if (firstFrame && !agent.connected) roam(profile, flightTime, center, position);
        if (dt > 0) {
          if (agent.connected) {
            const side = (agent.slot % 2 ? 1 : -1) * (1.8 + Math.floor(agent.slot / 2) * .85);
            const behind = 3.2 + Math.floor(agent.slot / 2) * 1.35;
            target.set(center.x - heading.x * behind - heading.z * side,
              center.y + Math.sin(flightTime * .65 + profile.phase) * .7 + (agent.slot % 3 - 1) * .65,
              center.z - heading.z * behind + heading.x * side);
            for (const other of agents) {
              if (!other.connected || other === agent) continue;
              separation.subVectors(position, other.butterfly.group.position);
              const gap = separation.length();
              if (gap > 1e-5 && gap < 1.6) target.addScaledVector(separation, (1.6 - gap) / gap);
            }
            separation.subVectors(position, center);
            const playerGap = separation.length();
            if (playerGap > 1e-5 && playerGap < 2) target.addScaledVector(separation, (2 - playerGap) * 2 / playerGap);
          } else roam(profile, flightTime, center, target);

          const maxSpeed = AUTONOMOUS_FLIGHT_SPEED * agent.charge.multiplier(time);
          desiredVelocity.subVectors(target, position).multiplyScalar(agent.connected ? 1.8 : 3).clampLength(0, maxSpeed);
          velocity.lerp(desiredVelocity, 1 - Math.exp(-dt * 5)).clampLength(0, maxSpeed);
          position.addScaledVector(velocity, dt);
          // Free butterflies stay inside the finite water; bonded ones may
          // accompany the player above or below it without losing the bond.
          if (tunnel) {
            if (tunnelSolid || !agent.connected) constrainTunnelPosition(position, 3);
          }
          else if (!agent.connected) {
            const localY = position.y - HYPERBOLOID_POSITION.y;
            const allowed = hyperboloidRadius(localY) - 3.5;
            const dx = position.x - center.x, dz = position.z - center.z;
            const radial = Math.hypot(dx, dz);
            if (radial > allowed) {
              position.x = center.x + dx * allowed / radial;
              position.z = center.z + dz * allowed / radial;
            }
          }
        }
        if (cameraQuaternion) butterfly.group.quaternion.copy(cameraQuaternion);
        else butterfly.group.quaternion.identity();
        butterfly.group.rotateZ(Math.sin(time * 0.7 + profile.phase) * 0.07);
        butterfly.update(time + profile.phase * 2, true);
        if (tunnel) {
          const nearby = Math.exp(-position.distanceTo(center) / 9);
          const daylight = tunnelDaylight(position.z);
          const illumination = THREE.MathUtils.clamp(.018 + nearby * .3 + daylight * .8 + agent.whiteness, 0, 1);
          butterfly.setIllumination(illumination, agent.whiteness * .65, agent.tint);
          agent.lantern.update(position, butterfly.group.quaternion, agent.whiteness * .75);
        }
      }
    },
  };
}
