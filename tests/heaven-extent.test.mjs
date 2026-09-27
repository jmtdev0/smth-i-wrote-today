import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterflyParadise, PARADISE_BUTTERFLY_COUNT, meadowHeight } from '../src/ButterflyParadise.js';
import { createTunnelWorld, TUNNEL_FADE_SECONDS, TUNNEL_FADE_EXIT_Z, TUNNEL_START } from '../src/TunnelWorld.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';

test('the meadow and swarm cover long trips without a visible edge or drifting ground height', () => {
  const paradise = createButterflyParadise();
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 1600);
  const q = new THREE.Quaternion();
  try {
    assert.equal(paradise.profiles.length, 1400);
    assert.equal(PARADISE_BUTTERFLY_COUNT, 1400);
    const ground = paradise.group.getObjectByName('Endless Heaven meadow');
    for (const position of [new THREE.Vector3(0, 0, -255), new THREE.Vector3(2400, 30, -3300)]) {
      camera.position.copy(position);
      paradise.update(10, q, position, camera, true);
      const bounds = new THREE.Box3().setFromObject(ground);
      assert.ok(position.x - bounds.min.x > 1000 && bounds.max.x - position.x > 1000);
      assert.ok(position.z - bounds.min.z > 1000 && bounds.max.z - position.z > 1000);
      assert.ok(paradise.profiles.every(p => Math.abs(p.x - position.x) <= 800 && Math.abs(p.z - position.z) <= 800));
      const vertices = ground.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i += 127) {
        assert.ok(Math.abs(vertices.getY(i) - meadowHeight(vertices.getX(i), vertices.getZ(i))) < .001);
      }
    }
  } finally {
    const resources = new Set();
    paradise.group.traverse(object => {
      if (object.isInstancedMesh) resources.add(object);
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('Heaven retires unrescued tunnel inhabitants but keeps bonded companions and supports reset', () => {
  const flock = createAutonomousButterflies(2, { tunnel: true });
  const player = flock.agents[0].butterfly.group.position.clone();
  try {
    flock.update(0, player);
    flock.chirp(1, player);
    assert.equal(flock.connectedCount, 1);
    flock.update(2, player, new THREE.Quaternion(), true, 0, false);
    assert.equal(flock.agents[0].butterfly.group.visible, true);
    assert.equal(flock.agents[1].butterfly.group.visible, false);
    assert.equal(flock.agents[1].lantern.group.children[1].intensity, 0);
    const response = flock.chirp(3, flock.agents[1].butterfly.group.position);
    assert.ok(!response.receivers.includes(flock.agents[1]));
    flock.reset(4, player);
    assert.ok(flock.agents.every(agent => agent.butterfly.group.visible));
  } finally {
    const resources = new Set();
    flock.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat()) if (material) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('completed limbo leaves continuous meadow in every direction, including the former tunnel', () => {
  const scene = new THREE.Scene();
  const paradise = createButterflyParadise(0), tunnel = createTunnelWorld();
  scene.add(paradise.group, tunnel.group);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, .1, 1580);
  const player = new THREE.Vector3(0, 0, TUNNEL_FADE_EXIT_Z + 20);
  try {
    tunnel.update(0, player);
    player.z = TUNNEL_FADE_EXIT_Z - 1;
    tunnel.update(1, player);
    tunnel.update(1 + TUNNEL_FADE_SECONDS, player);
    assert.equal(tunnel.solid, false);
    assert.equal(tunnel.group.parent, null, 'tube, cap and mist are detached together');
    assert.ok(!scene.children.includes(tunnel.group));
    assert.equal(paradise.group.children.filter(o => o.isMesh && !o.isInstancedMesh).length, 2,
      'only terrain and sky remain: no flowers, stems or directional backdrop');
    const ground = paradise.group.getObjectByName('Endless Heaven meadow');
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    for (const location of [player.clone(), new THREE.Vector3(TUNNEL_START.x, 0, TUNNEL_START.z), new THREE.Vector3(2400, 0, -3300)]) {
      player.copy(location);
      tunnel.update(10, player);
      assert.equal(tunnel.solid, false, 'returning through the old tube does not restore it');
      camera.position.copy(player);
      paradise.update(10, camera.quaternion, player, camera, !tunnel.solid);
      scene.updateMatrixWorld(true);
      for (let degrees = 0; degrees < 360; degrees += 15) {
        const angle = degrees * Math.PI / 180;
        for (const radius of [0, 200, 430]) {
          origin.set(player.x + Math.sin(angle) * radius, 100, player.z + Math.cos(angle) * radius);
          ray.set(origin, down);
          assert.ok(ray.intersectObject(ground).length > 0, `no gap at ${degrees} degrees / ${radius} units`);
        }
      }
    }
    tunnel.reset();
    assert.equal(tunnel.group.parent, scene, 'reset can restore the tunnel without rebuilding shaders');
  } finally {
    const resources = new Set();
    for (const root of [paradise.group, tunnel.group]) root.traverse(object => {
      if (object.isInstancedMesh) resources.add(object);
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});
