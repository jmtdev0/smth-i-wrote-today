import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_PITCH_LIMIT } from '../src/angles.js';
import { cameraRelativeMovement, advanceAltitude } from '../src/flight.js';
test('W follows the actual camera look direction, including pitch and full revolutions', () => {
  const camera = new THREE.PerspectiveCamera();
  const expected = new THREE.Vector3();
  for (const yaw of [0, .7, Math.PI / 2, Math.PI, 20 * Math.PI + .8]) {
    for (const pitch of [-CAMERA_PITCH_LIMIT, -1.35, -.6, 0, .6, 1.35, CAMERA_PITCH_LIMIT]) {
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * 15, Math.sin(pitch) * 15, Math.cos(yaw) * Math.cos(pitch) * 15);
      camera.lookAt(0, 0, 0);
      camera.getWorldDirection(expected);
      const actual = cameraRelativeMovement(yaw, pitch, 1, 0);
      assert.ok(expected.distanceTo(new THREE.Vector3(actual.x, actual.y, actual.z)) < 1e-12);
      const backwards = cameraRelativeMovement(yaw, pitch, -1, 0);
      assert.ok(new THREE.Vector3(backwards.x, backwards.y, backwards.z).add(expected).length() < 1e-12);
    }
  }
});
test('looking up with W ascends, looking down descends, sideways stays level', () => {
  assert.ok(advanceAltitude(100, cameraRelativeMovement(0, -.6, 1, 0).y, 1) > 100);
  assert.ok(advanceAltitude(100, cameraRelativeMovement(0, .6, 1, 0).y, 1) < 100);
  assert.equal(cameraRelativeMovement(.3, .8, 0, 1).y, 0);
});
test('combined controls preserve the speed cap and opposite inputs cancel', () => {
  for (const pitch of [-CAMERA_PITCH_LIMIT, 0, CAMERA_PITCH_LIMIT]) {
    for (const rise of [-1, 0, 1]) {
      const v = cameraRelativeMovement(.7, pitch, 1, 1, rise);
      assert.ok(Math.hypot(v.x, v.y, v.z) <= 1 + 1e-12);
    }
  }
  const idle = cameraRelativeMovement(1, .8, 0, 0);
  assert.equal(Math.hypot(idle.x, idle.y, idle.z), 0);
});

test('vertical orbit reaches almost 90 degrees without crossing either pole', () => {
  assert.ok(CAMERA_PITCH_LIMIT > 1.35);
  assert.ok(CAMERA_PITCH_LIMIT < Math.PI / 2);
  assert.equal(THREE.MathUtils.clamp(100, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT), CAMERA_PITCH_LIMIT);
  assert.equal(THREE.MathUtils.clamp(-100, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT), -CAMERA_PITCH_LIMIT);
});
