import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCameraView, FIRST_PERSON_DISTANCE, FIRST_PERSON_EYE_HEIGHT,
  FIRST_PERSON_FORWARD_OFFSET } from '../src/CameraView.js';
import { createMeadowCameraCollision, cameraNearRadius, MEADOW_CAMERA_CLEARANCE } from '../src/MeadowCameraCollision.js';
import { meadowHeight, meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { cameraRelativeMovement } from '../src/flight.js';
import { CAMERA_PITCH_LIMIT } from '../src/angles.js';
import { TUNNEL_RADIUS, TUNNEL_BACK_Z } from '../src/TunnelWorld.js';

const camera = () => new THREE.PerspectiveCamera(48, 16 / 9, .1, 1580);
const settle = (view, lens, player, yaw = 0, pitch = 0, options = { meadowEnabled: false }) => {
  for (let i = 0; i < 150; i++) view.update(lens, player, yaw, pitch, 1 / 60, options);
};

test('ordinary third person retains the existing position, lift and camera-relative heading', () => {
  const player = new THREE.Vector3(10, 8, -300), lens = camera();
  for (const distance of [6, 15, 42]) for (const yaw of [0, 2.1, 18 * Math.PI + .3]) {
    for (const pitch of [-1.4, 0, .4, 1.4]) {
      const view = createCameraView({ initialDistance: distance });
      view.update(lens, player, yaw, pitch, .016, { meadowEnabled: false });
      const expected = new THREE.Vector3(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        player.y + Math.sin(pitch) * distance + Math.min(3, distance * .2),
        player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
      assert.ok(lens.position.distanceTo(expected) < 1e-10);
      assert.equal(view.blend, 0);
      assert.equal(view.avatarVisible, true);
      const movement = cameraRelativeMovement(yaw, pitch, 1, 0);
      assert.ok(lens.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(movement.x, movement.y, movement.z)) < 1e-10);
    }
  }
});

test('zooming all the way in reaches the eye, hides the avatar and leaves the player untouched', () => {
  const player = new THREE.Vector3(0, 5, -300), original = player.clone(), lens = camera();
  const view = createCameraView();
  view.zoom(-1000);
  assert.equal(view.targetDistance, FIRST_PERSON_DISTANCE);
  settle(view, lens, player, .8, -.4);
  const movement = cameraRelativeMovement(.8, -.4, 1, 0);
  const forward = new THREE.Vector3(movement.x, movement.y, movement.z);
  const eye = player.clone().add(new THREE.Vector3(0, FIRST_PERSON_EYE_HEIGHT, 0)).addScaledVector(forward, FIRST_PERSON_FORWARD_OFFSET);
  assert.ok(lens.position.distanceTo(eye) < 1e-10);
  assert.equal(view.blend, 1);
  assert.equal(view.avatarVisible, false);
  assert.ok(player.equals(original));
  assert.ok(lens.getWorldDirection(new THREE.Vector3()).distanceTo(forward) < 1e-10);
});

test('continuous zoom has a gentler near-eye blend without camera flips', () => {
  const player = new THREE.Vector3(0, 5, -300), lens = camera(), view = createCameraView({ initialDistance: 23 });
  view.update(lens, player, 1, .2, .016, { meadowEnabled: false });
  view.zoom(-100);
  const forward = lens.getWorldDirection(new THREE.Vector3());
  let previous = lens.position.clone(), blendedFrames = 0;
  for (let frame = 0; frame < 150; frame++) {
    view.update(lens, player, 1, .2, 1 / 60, { meadowEnabled: false });
    assert.ok(lens.position.distanceTo(previous) < 4, 'no jump straight into the eye');
    assert.ok(lens.getWorldDirection(new THREE.Vector3()).distanceTo(forward) < 1e-10, 'never look back at the avatar');
    if (view.blend > 0 && view.blend < 1) blendedFrames++;
    previous.copy(lens.position);
  }
  assert.ok(blendedFrames > 30, 'the near-eye blend lasts well beyond a few frames');
  assert.equal(view.firstPerson, true);
  assert.equal(view.avatarVisible, false);
  view.setDistance(23);
  view.update(lens, player, 1, .2, 1 / 60, { meadowEnabled: false });
  assert.ok(view.distance > FIRST_PERSON_DISTANCE && view.distance < 23, 'zoom out is still eased');
  settle(view, lens, player, 1, .2);
  assert.equal(view.distance, 23);
  assert.equal(view.avatarVisible, true);
});

test('R3 cuts in both directions on the next rendered frame, without collision recovery gliding', () => {
  const player = new THREE.Vector3(0, 5, -300), original = player.clone(), lens = camera();
  const view = createCameraView({ initialDistance: 23,
    collision: createMeadowCameraCollision({ surfaceHeight: () => 0 }) });
  view.update(lens, player, 1, .2, .016);
  const orbit = lens.position.clone(), heading = lens.quaternion.clone();
  view.toggle();
  view.update(lens, player, 1, .2, 1 / 60);
  assert.equal(view.distance, FIRST_PERSON_DISTANCE);
  assert.equal(view.blend, 1);
  assert.equal(view.avatarVisible, false);
  assert.ok(lens.position.distanceTo(player) < .6);
  view.toggle();
  view.update(lens, player, 1, .2, 1 / 60);
  assert.equal(view.distance, 23);
  assert.equal(view.blend, 0);
  assert.equal(view.avatarVisible, true);
  assert.ok(lens.position.distanceTo(orbit) < 1e-10, 'no intermediate zoom or collision recovery');
  assert.ok(lens.quaternion.angleTo(heading) < 1e-7);
  assert.ok(player.equals(original));
});

test('a cut can interrupt a zoom, and later wheel zoom remains smooth', () => {
  const view = createCameraView(), lens = camera(), player = new THREE.Vector3(0, 5, -300);
  view.zoom(-100);
  for (let i = 0; i < 25; i++) view.update(lens, player, 0, 0, 1 / 60, { meadowEnabled: false });
  assert.ok(view.blend > 0 && view.blend < 1);
  view.toggle();
  view.update(lens, player, 0, 0, 1 / 60, { meadowEnabled: false });
  assert.equal(view.distance, 15);
  assert.equal(view.blend, 0);
  view.zoom(-100);
  view.update(lens, player, 0, 0, 1 / 60, { meadowEnabled: false });
  assert.ok(view.distance > FIRST_PERSON_DISTANCE && view.distance < 15);
});

test('instant switching never bypasses ground collision on the first frame', () => {
  const lens = camera(), player = new THREE.Vector3(0, 2, 0);
  const view = createCameraView({ collision: createMeadowCameraCollision({ surfaceHeight: () => 0 }) });
  for (let i = 0; i < 4; i++) {
    view.toggle();
    view.update(lens, player, .7, -1.4, 1 / 60);
    assert.ok(lens.position.y >= MEADOW_CAMERA_CLEARANCE + cameraNearRadius(lens));
    assert.equal(view.blend, i % 2 === 0 ? 1 : 0);
    assert.ok(lens.position.distanceTo(player) < 2);
  }
});

test('zoom out returns to third person and repeated toggles during a transition are reversible', () => {
  const view = createCameraView(), lens = camera(), player = new THREE.Vector3();
  view.toggle(); view.toggle();
  assert.equal(view.targetDistance, 15);
  view.zoom(-100); settle(view, lens, player);
  view.zoom(12.2); settle(view, lens, player);
  assert.equal(view.targetDistance, 15);
  assert.equal(view.blend, 0);
  assert.equal(view.avatarVisible, true);
  view.zoom(1000); assert.equal(view.targetDistance, 42);
});

test('ground collision alone does not select first person or change the requested zoom', () => {
  const collision = createMeadowCameraCollision({ surfaceHeight: () => 0 });
  const view = createCameraView({ collision }), lens = camera(), player = new THREE.Vector3(0, 2, 0);
  settle(view, lens, player, .7, -1.4, { meadowEnabled: true });
  assert.ok(lens.position.distanceTo(player) < 2);
  assert.equal(view.firstPerson, false);
  assert.equal(view.targetDistance, 15);
  assert.equal(view.blend, 0);
  assert.ok(lens.position.y >= MEADOW_CAMERA_CLEARANCE + cameraNearRadius(lens));
});

test('all view blends and extreme pitches retain meadow clearance and finite forward headings', () => {
  for (const [x, z] of [[0, -255], [67, -400], [-109, -721], [0, 873]]) {
    const player = new THREE.Vector3(x, meadowHeight(x, z) + 2, z);
    for (const aspect of [.5, 16 / 9, 4]) for (const distance of [2.8, 3, 3.5, 4.5, 5.5, 15]) {
      const lens = camera(); lens.aspect = aspect; lens.updateProjectionMatrix();
      for (const yaw of [0, 1.6, 3.5, 5]) for (const pitch of [-CAMERA_PITCH_LIMIT, -.7, 0, .7, CAMERA_PITCH_LIMIT]) {
        const view = createCameraView({ initialDistance: distance });
        view.update(lens, player, yaw, pitch, .016);
        assert.ok(lens.position.y - meadowSurfaceHeight(lens.position.x, lens.position.z)
          >= MEADOW_CAMERA_CLEARANCE + cameraNearRadius(lens) - 1e-6);
        const movement = cameraRelativeMovement(yaw, pitch, 1, 0);
        assert.ok(lens.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(movement.x, movement.y, movement.z)) < 1e-9);
        assert.ok(lens.quaternion.toArray().every(Number.isFinite));
      }
    }
  }
});

test('first person also respects the tunnel wall and back cap', () => {
  const lens = camera();
  for (const player of [new THREE.Vector3(0, 0, 873), new THREE.Vector3(TUNNEL_RADIUS - 2, 0, 850)]) {
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      const view = createCameraView(); view.toggle();
      settle(view, lens, player, yaw, .2, { tunnelSolid: true, meadowEnabled: false });
      assert.ok(Math.hypot(lens.position.x, lens.position.y) <= TUNNEL_RADIUS - .8 + 1e-6);
      assert.ok(lens.position.z <= TUNNEL_BACK_Z - .8 + 1e-6);
      assert.equal(view.avatarVisible, false);
    }
  }
});
