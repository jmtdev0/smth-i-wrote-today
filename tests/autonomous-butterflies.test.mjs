import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  AUTONOMOUS_BUTTERFLY_COUNT,
  AUTONOMOUS_FLIGHT_SPEED,
  createAutonomousButterflies,
} from '../src/AutonomousButterflies.js';
import { BUTTERFLY_VERTICAL_SPEED } from '../src/flight.js';
import {
  HYPERBOLOID_POSITION,
  PLAYER_START_Y,
  hyperboloidRadius,
} from '../src/Waterfall.js';

function disposeSwarm(swarm) {
  const resources = new Set();
  swarm.group.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  for (const resource of resources) resource.dispose();
}

test('creates autonomous butterflies with shared geometry and independent materials', () => {
  assert.equal(AUTONOMOUS_FLIGHT_SPEED, BUTTERFLY_VERTICAL_SPEED);
  const swarm = createAutonomousButterflies();
  try {
    assert.equal(swarm.group.children.length, AUTONOMOUS_BUTTERFLY_COUNT);
    const firstMeshes = [];
    const secondMeshes = [];
    swarm.group.children[0].traverse(object => { if (object.isMesh) firstMeshes.push(object); });
    swarm.group.children[1].traverse(object => { if (object.isMesh) secondMeshes.push(object); });
    assert.ok(firstMeshes.length > 0 && secondMeshes.length > 0);
    assert.equal(firstMeshes[0].geometry, secondMeshes[0].geometry);
    assert.notEqual(firstMeshes[0].material, secondMeshes[0].material);
  } finally {
    disposeSwarm(swarm);
  }
});

test('flight paths remain inside the hyperboloid and are not synchronized', () => {
  const swarm = createAutonomousButterflies();
  const cameraQuaternion = new THREE.Quaternion();
  const center = { x: 4, z: -8 };
  try {
    swarm.update(4, center, cameraQuaternion);
    const positions = swarm.group.children.map(child => child.position.clone());
    assert.ok(positions.some((position, index) => !position.equals(positions[0]) && index > 0));
    for (const position of positions) {
      const localY = position.y - HYPERBOLOID_POSITION.y - Math.sin(4 * 0.45) * 0.1;
      const horizontal = Math.hypot(position.x - center.x, position.z - center.z);
      assert.ok(horizontal < hyperboloidRadius(localY) - 3.4);
      assert.ok(Math.abs(localY) < 96);
    }
    const first = positions[0];
    swarm.update(8, center, cameraQuaternion);
    assert.ok(swarm.group.children[0].position.distanceTo(first) > 0.1);
  } finally {
    disposeSwarm(swarm);
  }
});

test('the player starts at the lower visible base below every roaming butterfly', () => {
  const swarm = createAutonomousButterflies();
  const player = { x: 0, y: PLAYER_START_Y, z: 10 };
  try {
    swarm.update(0, player);
    assert.ok(PLAYER_START_Y < HYPERBOLOID_POSITION.y);
    for (const agent of swarm.agents) {
      assert.ok(agent.butterfly.group.position.y > PLAYER_START_Y);
    }
  } finally {
    disposeSwarm(swarm);
  }
});
