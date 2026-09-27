import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TUNNEL_RADIUS, TUNNEL_BACK_Z, TUNNEL_EXIT_Z, TUNNEL_START,
  RESCUE_COUNT, TUNNEL_LENGTH, TUNNEL_VIEW_DISTANCE, createTunnelWorld,
  constrainTunnelPosition, tunnelDaylight } from '../src/TunnelWorld.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { createButterflyParadise, PARADISE_BUTTERFLY_COUNT } from '../src/ButterflyParadise.js';

function dispose(group) {
  const resources = new Set();
  group.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  for (const resource of resources) resource.dispose();
}

test('the triple-length tube meets both ends and the exit remains within camera range', () => {
  const tunnel = createTunnelWorld();
  try {
    assert.equal(TUNNEL_LENGTH, 360 * 3);
    assert.equal(TUNNEL_BACK_Z - TUNNEL_EXIT_Z, TUNNEL_LENGTH);
    assert.equal(TUNNEL_BACK_Z - TUNNEL_START.z, 27);
    const tube = tunnel.group.children.find(child => child.geometry?.type === 'CylinderGeometry');
    tube.geometry.computeBoundingBox();
    const bounds = tube.geometry.boundingBox.clone().translate(tube.position);
    assert.ok(Math.abs(bounds.min.z - TUNNEL_EXIT_Z) < .001);
    assert.ok(Math.abs(bounds.max.z - TUNNEL_BACK_Z) < .001);
    assert.ok(TUNNEL_VIEW_DISTANCE > TUNNEL_START.z + TUNNEL_RADIUS - TUNNEL_EXIT_Z);
  } finally { dispose(tunnel.group); }
});

test('the tunnel contains radial/backward flight but opens into an unrestricted exterior', () => {
  const p = new THREE.Vector3(80, 60, TUNNEL_BACK_Z + 4);
  constrainTunnelPosition(p);
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - (TUNNEL_RADIUS - 2)) < 1e-9);
  assert.equal(p.z, TUNNEL_BACK_Z - 2);
  p.set(140, 70, TUNNEL_EXIT_Z - 10);
  const outside = p.clone();
  constrainTunnelPosition(p);
  assert.ok(p.equals(outside));
  p.z = TUNNEL_EXIT_Z + 1;
  constrainTunnelPosition(p, 2, outside);
  assert.ok(p.z < TUNNEL_EXIT_Z, 'entering beside the opening must not teleport the player inside');
  assert.equal(p.x, outside.x);
  p.set(0, 0, TUNNEL_EXIT_Z + 1);
  constrainTunnelPosition(p, 2, new THREE.Vector3(0, 0, TUNNEL_EXIT_Z - 1));
  assert.equal(p.z, TUNNEL_EXIT_Z + 1, 'returning through the opening remains possible');
  assert.ok(tunnelDaylight(TUNNEL_START.z) < .002);
  assert.equal(tunnelDaylight(TUNNEL_EXIT_Z), 1);
});

test('tunnel rescue anchors stay in world space and rescued companions acquire light gradually', () => {
  const flock = createAutonomousButterflies(RESCUE_COUNT, { tunnel: true });
  const player = new THREE.Vector3(TUNNEL_START.x, TUNNEL_START.y, TUNNEL_START.z);
  const q = new THREE.Quaternion();
  try {
    flock.update(0, player, q);
    for (const agent of flock.agents) {
      const p = agent.butterfly.group.position;
      assert.ok(Math.hypot(p.x, p.y) < TUNNEL_RADIUS - 3);
      assert.ok(p.z > TUNNEL_EXIT_Z && p.z < player.z);
      assert.equal(agent.lantern.group.children.find(c => c.isMesh).visible, false);
      assert.equal(agent.lantern.group.children.find(c => c.isPointLight).intensity, 0);
    }
    const before = flock.agents[5].butterfly.group.position.clone();
    player.x += 20;
    flock.update(0, player, q, false, 20);
    assert.ok(flock.agents[5].butterfly.group.position.equals(before));
    player.copy(flock.agents[0].butterfly.group.position);
    const result = flock.chirp(0, player);
    assert.ok(result.receivers.length > 0);
    assert.equal(flock.agents[0].whiteness, 0);
    flock.update(1 / 60, player, q);
    assert.ok(flock.agents[0].whiteness > 0 && flock.agents[0].whiteness < 1);
    assert.equal(flock.agents[0].lantern.group.children.find(c => c.isMesh).visible, true);
    for (let i = 2; i <= 180; i++) flock.update(i / 60, player, q);
    assert.ok(flock.agents[0].whiteness > .99);
    assert.ok(flock.agents[0].lantern.group.children.find(c => c.isPointLight).intensity > 0);
    flock.reset(3, player);
    assert.equal(flock.connectedCount, 0);
    assert.equal(flock.agents[0].lantern.group.children.find(c => c.isMesh).visible, false);
    assert.equal(flock.agents[0].lantern.group.children.find(c => c.isPointLight).intensity, 0);
  } finally { dispose(flock.group); }
});

test('the colorful exterior swarm stays beyond the fog and shares instanced geometry', () => {
  const paradise = createButterflyParadise();
  try {
    assert.equal(paradise.profiles.length, PARADISE_BUTTERFLY_COUNT);
    assert.ok(paradise.profiles.every(p => p.z + p.orbit < TUNNEL_EXIT_Z - 20));
    paradise.update(5, new THREE.Quaternion());
    const wing = paradise.group.children[0];
    assert.ok(wing.isInstancedMesh);
    const a = new THREE.Color(), b = new THREE.Color();
    wing.getColorAt(0, a); wing.getColorAt(1, b);
    assert.ok(!a.equals(b));
    const matrix = new THREE.Matrix4();
    wing.getMatrixAt(0, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
  } finally { dispose(paradise.group); }
});
