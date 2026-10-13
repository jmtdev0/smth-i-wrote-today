import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterflyLantern, createTunnelWorld, TUNNEL_FADE_EXIT_Z,
  TUNNEL_FADE_SECONDS } from '../src/TunnelWorld.js';
import { resolveStartPosition } from '../src/startPosition.js';
import { createCameraView, FIRST_PERSON_DISTANCE } from '../src/CameraView.js';

function fixture(t, start = 'underworld') {
  const scene = new THREE.Scene();
  const tunnel = createTunnelWorld(), lantern = createButterflyLantern();
  const player = new THREE.Vector3().copy(resolveStartPosition(`?start=${start}`));
  const quaternion = new THREE.Quaternion();
  scene.add(tunnel.group, lantern.group);
  const light = lantern.group.children.find(object => object.isPointLight);
  const halo = lantern.group.children.find(object => object.isMesh);
  t.after(() => {
    const resources = new Set();
    for (const group of [tunnel.group, lantern.group]) group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  });
  return { scene, tunnel, lantern, player, light, halo,
    update(time, strength = 1, firstPersonBlend = 0) {
      tunnel.update(time, player);
      lantern.update(player, quaternion, strength, tunnel.visibility, firstPersonBlend);
    },
  };
}

test('player lantern keeps its full strength in underworld and limbo', t => {
  for (const start of ['underworld', 'limbo']) {
    const f = fixture(t, start);
    f.update(0);
    assert.equal(f.light.intensity, 5);
    assert.equal(f.halo.visible, true);
    f.update(1, 1.25);
    assert.equal(f.light.intensity, 6.25, 'resonance still strengthens the tunnel lantern');
  }
});

test('player lantern fades with the tunnel and stays off after leaving Heaven coordinates', t => {
  const f = fixture(t, 'limbo');
  f.update(0);
  f.player.z = TUNNEL_FADE_EXIT_Z - 1;
  f.update(1);
  let previous = f.light.intensity;
  const materialVersion = f.halo.material.version;
  for (let step = 1; step <= 10; step++) {
    f.update(1 + TUNNEL_FADE_SECONDS * step / 10);
    assert.ok(f.light.intensity < previous);
    assert.equal(f.halo.material.uniforms.uStrength.value, f.tunnel.visibility);
    const lights = [];
    f.scene.traverseVisible(object => { if (object.isPointLight) lights.push(object); });
    assert.deepEqual(lights, [f.light], 'turning off must preserve the shader lighting layout');
    assert.equal(f.halo.material.version, materialVersion);
    previous = f.light.intensity;
  }
  assert.equal(f.light.intensity, 0);
  assert.equal(f.halo.visible, false);
  f.player.z = 0;
  f.update(10, 1.25);
  assert.equal(f.light.intensity, 0, 'neither movement nor resonance may restore the Heaven lantern');
});

test('direct Heaven starts have no lantern light or luminous envelope from the first update', t => {
  const f = fixture(t, 'heaven');
  f.update(0, 1.25);
  assert.equal(f.light.intensity, 0);
  assert.equal(f.halo.material.uniforms.uStrength.value, 0);
  assert.equal(f.halo.visible, false);
  f.tunnel.reset();
  f.player.copy(resolveStartPosition('?start=limbo'));
  f.update(1);
  assert.equal(f.light.intensity, 5, 'a genuine tunnel reset restores its light');
  assert.equal(f.halo.visible, true);
});

test('first-person blend fades the halo and light without changing the shader lighting layout', t => {
  const f = fixture(t);
  const version = f.halo.material.version;
  let previous = Infinity;
  for (const blend of [0, .2, .4, .6, .8, .85, .9, 1]) {
    f.update(0, 1.25, blend);
    assert.ok(f.light.intensity <= previous);
    assert.equal(f.light.intensity, f.halo.material.uniforms.uStrength.value * 5);
    assert.equal(f.halo.material.version, version);
    const lights = [];
    f.scene.traverseVisible(object => { if (object.isPointLight) lights.push(object); });
    assert.deepEqual(lights, [f.light]);
    if (blend >= .85) {
      assert.equal(f.light.intensity, 0, 'off before entering the avatar or halo');
      assert.equal(f.halo.visible, false);
    }
    previous = f.light.intensity;
  }
  f.update(0, 1.25, 0);
  assert.equal(f.light.intensity, 6.25);
  assert.equal(f.halo.visible, true);
});

test('R3 cuts switch the player lantern on the same frame in both tunnel starts', t => {
  for (const start of ['underworld', 'limbo']) {
    const f = fixture(t, start), view = createCameraView(), camera = new THREE.PerspectiveCamera();
    const tick = () => {
      view.update(camera, f.player, 0, 0, 1 / 60, { tunnelSolid: true, meadowEnabled: false });
      f.update(0, 1.25, view.blend);
    };
    tick();
    assert.equal(f.light.intensity, 6.25);
    view.toggle(); tick();
    assert.equal(view.avatarVisible, false);
    assert.equal(f.light.intensity, 0);
    assert.equal(f.halo.visible, false);
    view.toggle(); tick();
    assert.equal(view.avatarVisible, true);
    assert.equal(f.light.intensity, 6.25);
    assert.equal(f.halo.visible, true);
  }
});

test('continuous camera zoom fades the lantern smoothly and is reversible', t => {
  const f = fixture(t), view = createCameraView(), camera = new THREE.PerspectiveCamera();
  f.update(0);
  for (const inward of [true, false]) {
    let previous = f.light.intensity, intermediate = 0;
    for (let frame = 0; frame < 150; frame++) {
      // Match continuous stick/wheel input rather than a one-frame target cut.
      view.setDistance(THREE.MathUtils.clamp(view.targetDistance + (inward ? -.12 : .12), FIRST_PERSON_DISTANCE, 15));
      view.update(camera, f.player, 0, 0, 1 / 60, { tunnelSolid: true, meadowEnabled: false });
      f.update(frame / 60, 1, view.blend);
      const intensity = f.light.intensity;
      assert.ok(inward ? intensity <= previous : intensity >= previous);
      assert.ok(Math.abs(intensity - previous) < 1, 'no abrupt light jump during continuous zoom');
      if (intensity > 0 && intensity < 5) intermediate++;
      if (!view.avatarVisible) assert.equal(intensity, 0);
      previous = intensity;
    }
    assert.ok(intermediate > 5);
    assert.equal(f.light.intensity, inward ? 0 : 5);
  }
});

test('first person suppresses only the player lantern, not a companion lantern', t => {
  const player = fixture(t), companion = fixture(t);
  player.update(0, 1.25, 1);
  companion.update(0, .75);
  assert.equal(player.light.intensity, 0);
  assert.equal(companion.light.intensity, 3.75);
  assert.equal(companion.halo.visible, true);
});

test('changing view cannot restore player light in Heaven or bypass the tunnel fade', t => {
  const f = fixture(t, 'limbo');
  f.update(0);
  f.player.z = TUNNEL_FADE_EXIT_Z - 1;
  f.update(1);
  f.update(1 + TUNNEL_FADE_SECONDS / 2, 1, 1);
  assert.equal(f.light.intensity, 0);
  f.update(1 + TUNNEL_FADE_SECONDS / 2, 1, 0);
  assert.equal(f.light.intensity, 2.5, 'third person restores only the remaining tunnel light');
  for (const blend of [1, .5, 0, 1, 0]) {
    f.update(1 + TUNNEL_FADE_SECONDS, 1.25, blend);
    assert.equal(f.light.intensity, 0);
    assert.equal(f.halo.visible, false);
  }
});
