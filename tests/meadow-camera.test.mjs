import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMeadowCameraCollision, cameraNearRadius, MEADOW_CAMERA_CLEARANCE } from '../src/MeadowCameraCollision.js';
import { meadowHeight, meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { CAMERA_PITCH_LIMIT } from '../src/angles.js';
import { cameraRelativeMovement } from '../src/flight.js';

test('collision contracts the boom immediately and recovers smoothly without changing requested zoom', () => {
  const collision = createMeadowCameraCollision({ surfaceHeight: () => 0 });
  const player = new THREE.Vector3(0, 2, 0), position = new THREE.Vector3(0, 4, 15);
  assert.equal(collision.update(player, position, 1 / 60), 1);
  position.set(0, -8, 15);
  const requested = position.clone().sub(player);
  const fraction = collision.update(player, position, 1 / 60);
  assert.ok(fraction > 0 && fraction < .2);
  assert.ok(position.y >= MEADOW_CAMERA_CLEARANCE);
  assert.ok(position.clone().sub(player).cross(requested).length() < 1e-10);
  let previous = position.distanceTo(player);
  for (let frame = 0; frame < 120; frame++) {
    position.set(0, 4, 15);
    collision.update(player, position, 1 / 60);
    const distance = position.distanceTo(player);
    assert.ok(distance >= previous && distance - previous < 1.4);
    previous = distance;
  }
  assert.ok(position.distanceTo(new THREE.Vector3(0, 4, 15)) < .001);
});

test('an intermediate hill blocks the camera even when both ends are above ground', () => {
  const surfaceHeight = (x, z) => Math.max(0, 4 - Math.abs(z - 5));
  const collision = createMeadowCameraCollision({ surfaceHeight });
  const player = new THREE.Vector3(0, 2, 0), position = new THREE.Vector3(0, 2, 10);
  const fraction = collision.update(player, position, 1 / 60);
  assert.ok(fraction > .2 && fraction < .25);
  assert.ok(position.y >= surfaceHeight(position.x, position.z) + MEADOW_CAMERA_CLEARANCE);
});

test('all orbit angles, zooms and screen aspects stay above actual meadow triangles', () => {
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 1580);
  const direction = new THREE.Vector3();
  for (const [x, z] of [[0, -255], [67, -400], [-109, -721], [2400, -3300], [0, 873]]) {
    const player = new THREE.Vector3(x, meadowHeight(x, z) + 2, z);
    for (const aspect of [.5, 16 / 9, 4]) for (const distance of [4, 15, 42]) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const nearRadius = cameraNearRadius(camera);
      for (let yaw = 0; yaw < 2 * Math.PI; yaw += Math.PI / 6) {
        const collision = createMeadowCameraCollision();
        for (const pitch of [0, -.3, -.8, -CAMERA_PITCH_LIMIT, .8, CAMERA_PITCH_LIMIT]) {
          const lift = Math.min(3, distance * .2);
          camera.position.set(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
            player.y + Math.sin(pitch) * distance + lift, player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
          const fraction = collision.update(player, camera.position, 1 / 60, { nearRadius });
          assert.ok(fraction > 0 && fraction <= 1);
          // A padded camera point protects the full near plane from clipping.
          assert.ok(camera.position.y - meadowSurfaceHeight(camera.position.x, camera.position.z)
            >= MEADOW_CAMERA_CLEARANCE + nearRadius - 1e-6);
          for (let step = 0; step <= 100; step++) {
            const p = player.clone().lerp(camera.position, step / 100);
            assert.ok(p.y - meadowSurfaceHeight(p.x, p.z) > .7);
          }
          camera.lookAt(player.x, player.y + lift * fraction, player.z);
          camera.getWorldDirection(direction);
          const movement = cameraRelativeMovement(yaw, pitch, 1, 0);
          assert.ok(direction.distanceTo(new THREE.Vector3(movement.x, movement.y, movement.z)) < 1e-10,
            'W must keep following the camera after compression');
          const screen = player.clone().project(camera);
          assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1 && screen.z > -1 && screen.z < 1,
            'the butterfly must stay framed when the boom is compressed');
          const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360);
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const corner = new THREE.Vector3(sx * halfHeight * aspect, sy * halfHeight, -camera.near)
              .applyMatrix4(camera.matrixWorld);
            assert.ok(corner.y > meadowSurfaceHeight(corner.x, corner.z),
              'even a wide-screen near-plane corner must remain above ground');
          }
        }
      }
    }
  }
});

test('the tunnel stays untouched and the former tunnel becomes solid ground only in open Heaven', () => {
  const collision = createMeadowCameraCollision();
  const player = new THREE.Vector3(0, -20, -190), underground = new THREE.Vector3(0, -50, -170);
  const position = underground.clone();
  assert.equal(collision.update(player, position, .016, { enabled: false }), 1);
  assert.deepEqual(position, underground);
  assert.equal(collision.update(player, position, .016, { openWorld: false }), 1);
  assert.ok(collision.update(player, position, .016, { openWorld: true }) < 1);
  collision.reset();
  position.set(0, 10, -170);
  assert.equal(collision.update(player, position, .016), 1, 'reset forgets the compressed distance');
});

test('zero-length booms and paused frames remain finite and contacts are still enforced', () => {
  const collision = createMeadowCameraCollision({ surfaceHeight: () => 0 });
  const player = new THREE.Vector3(0, 2, 0), position = player.clone();
  assert.equal(collision.update(player, position, 0), 1);
  collision.reset();
  position.set(0, 4, 15);
  collision.update(player, position, .016);
  position.set(0, -8, 15);
  assert.ok(collision.update(player, position, 0) < 1);
  assert.ok(position.y >= MEADOW_CAMERA_CLEARANCE);
});
