import * as THREE from 'three';
import { createMeadowCameraCollision, cameraNearRadius } from './MeadowCameraCollision.js';
import { constrainTunnelPosition } from './TunnelWorld.js';

// Belmont's continuous orbit-to-eye transition, scaled to this butterfly.
export const FIRST_PERSON_DISTANCE = 2.8;
export const FIRST_PERSON_BLEND_START = 5.5;
export const FIRST_PERSON_EYE_HEIGHT = .35;
export const FIRST_PERSON_FORWARD_OFFSET = .18;
export const NEAR_CAMERA_ZOOM_DAMPING = 5.5;

export function createCameraView({ initialDistance = 15, maxDistance = 42,
  collision = createMeadowCameraCollision() } = {}) {
  let targetDistance = THREE.MathUtils.clamp(initialDistance, FIRST_PERSON_DISTANCE, maxDistance);
  let distance = targetDistance, blend = 0, avatarVisible = true;
  let thirdPersonDistance = Math.max(FIRST_PERSON_BLEND_START, targetDistance);
  const forward = new THREE.Vector3(), eye = new THREE.Vector3(), lookTarget = new THREE.Vector3();

  function setDistance(value) {
    if (!Number.isFinite(value)) return;
    targetDistance = THREE.MathUtils.clamp(value, FIRST_PERSON_DISTANCE, maxDistance);
    if (targetDistance >= FIRST_PERSON_BLEND_START) thirdPersonDistance = targetDistance;
  }

  return {
    get targetDistance() { return targetDistance; },
    get distance() { return distance; },
    get blend() { return blend; },
    get firstPerson() { return targetDistance <= FIRST_PERSON_DISTANCE + 1e-6; },
    get avatarVisible() { return avatarVisible; },
    setDistance,
    zoom(delta) { setDistance(targetDistance + delta); },
    toggle() {
      setDistance(targetDistance <= FIRST_PERSON_DISTANCE + 1e-6 ? thirdPersonDistance : FIRST_PERSON_DISTANCE);
      // The R3 shortcut is a cut, unlike continuous wheel/pinch/stick zoom.
      // Reset collision recovery too, or leaving the eye would still glide out.
      distance = targetDistance;
      collision.reset();
    },
    update(camera, player, yaw, pitch, dt, { tunnelSolid = false, meadowEnabled = true,
      openWorld = true } = {}) {
      // Ease the final approach to the eye without making normal orbit zoom
      // sluggish. Smootherstep also removes acceleration corners at both ends.
      const near = Math.min(distance, targetDistance);
      const damping = THREE.MathUtils.lerp(NEAR_CAMERA_ZOOM_DAMPING, 12,
        THREE.MathUtils.smoothstep(near, FIRST_PERSON_BLEND_START, 9));
      distance = THREE.MathUtils.damp(distance, targetDistance, damping, Math.max(0, dt));
      if (Math.abs(distance - targetDistance) < .001) distance = targetDistance;
      blend = 1 - THREE.MathUtils.smootherstep(distance, FIRST_PERSON_DISTANCE, FIRST_PERSON_BLEND_START);
      forward.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const lift = Math.min(3, distance * .2);
      camera.position.copy(player).addScaledVector(forward, -distance);
      camera.position.y += lift;
      eye.copy(player).addScaledVector(forward, FIRST_PERSON_FORWARD_OFFSET);
      eye.y += FIRST_PERSON_EYE_HEIGHT;
      camera.position.lerp(eye, blend);
      if (tunnelSolid) constrainTunnelPosition(camera.position, .8, player);
      collision.update(player, camera.position, dt, { enabled: meadowEnabled, openWorld,
        nearRadius: cameraNearRadius(camera) });
      // Looking toward the old player target would turn the camera backwards
      // as it crosses the avatar. Keep the flight/look heading in both views.
      lookTarget.copy(camera.position).add(forward);
      camera.lookAt(lookTarget);
      const separation = camera.position.distanceTo(player);
      if (blend > .9 || separation < .75) avatarVisible = false;
      else if (blend < .85 && separation > 1.1) avatarVisible = true;
      return avatarVisible;
    },
  };
}
