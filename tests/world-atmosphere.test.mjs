import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldAtmosphere, HEAVEN_SKY } from '../src/WorldAtmosphere.js';
import { createTunnelWorld, TUNNEL_FADE_EXIT_Z, TUNNEL_FADE_SECONDS, TUNNEL_VIEW_DISTANCE } from '../src/TunnelWorld.js';

test('Heaven has zero visible distance fog, without changing shader variants; reset restores limbo', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, .1, TUNNEL_VIEW_DISTANCE);
  const atmosphere = createWorldAtmosphere(scene, camera);
  const fog = scene.fog;
  let lastNear = 0;
  for (const visibility of [1, .9, .75, .5, .25, .1, 0]) {
    atmosphere.update(visibility);
    assert.equal(scene.fog, fog, 'keep the same fog type and object for every material');
    assert.ok(fog.near >= lastNear);
    assert.ok(fog.far > fog.near);
    lastNear = fog.near;
  }
  assert.ok(fog.near > camera.far, 'all rendered fragments are before the start of fog');
  assert.equal(fog.color.getHexString(), HEAVEN_SKY.horizon.slice(1));
  camera.far = 3000;
  atmosphere.update(0);
  assert.ok(fog.near > camera.far, 'remain clear if the view distance changes');
  atmosphere.update(1);
  assert.equal(fog.near, 130);
  assert.equal(fog.far, 430);
  assert.equal(fog.color.getHexString(), 'e7f0e9');
});

test('the atmosphere follows the actual limbo fade and direct Heaven spawn, preserving local mist', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, .1, TUNNEL_VIEW_DISTANCE);
  const atmosphere = createWorldAtmosphere(scene, camera);
  const tunnel = createTunnelWorld();
  scene.add(tunnel.group);
  const player = new THREE.Vector3(0, 0, TUNNEL_FADE_EXIT_Z + 20);
  try {
    tunnel.update(0, player);
    const mist = tunnel.group.children.filter(mesh => mesh.geometry.type === 'CircleGeometry');
    assert.ok(mist.length >= 12);
    atmosphere.update(tunnel.visibility);
    assert.equal(scene.fog.near, 130);
    assert.ok(mist.every(mesh => mesh.material.uniforms.uVisibility.value === 1));
    player.z = TUNNEL_FADE_EXIT_Z - 1;
    tunnel.update(1, player);
    tunnel.update(1 + TUNNEL_FADE_SECONDS / 2, player);
    atmosphere.update(tunnel.visibility);
    assert.equal(tunnel.visibility, .5);
    assert.ok(scene.fog.near > 130 && scene.fog.near < camera.far);
    tunnel.update(1 + TUNNEL_FADE_SECONDS, player);
    atmosphere.update(tunnel.visibility);
    assert.ok(scene.fog.near > camera.far);
    assert.equal(tunnel.group.parent, null);
    tunnel.reset();
    tunnel.update(10, player); // Direct Heaven start should already be clear.
    atmosphere.update(tunnel.visibility);
    assert.ok(scene.fog.near > camera.far);
    tunnel.reset();
    player.z = TUNNEL_FADE_EXIT_Z + 20;
    tunnel.update(11, player);
    atmosphere.update(tunnel.visibility);
    assert.equal(scene.fog.near, 130);
    assert.ok(mist.every(mesh => mesh.material.uniforms.uVisibility.value === 1));
  } finally {
    const resources = new Set();
    tunnel.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});
