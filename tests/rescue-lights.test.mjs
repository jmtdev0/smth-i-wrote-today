import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { createResonanceEffects } from '../src/ResonanceEffects.js';
import { createButterflyLantern, RESCUE_COUNT, TUNNEL_START } from '../src/TunnelWorld.js';
import { BOOST_DURATION } from '../src/resonance.js';

test('bonded halos fade after a call, refresh on another and do not extinguish companion light', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const flock = createAutonomousButterflies(1, { tunnel: true });
  const effects = createResonanceEffects(butterfly, flock);
  const player = flock.agents[0].butterfly.group.position.clone();
  const q = new THREE.Quaternion();
  const halo = effects.group.getObjectByName('Resonance halo 1');
  const playerHalo = effects.group.getObjectByName('Resonance halo 0');
  try {
    flock.update(0, player, q);
    effects.update(0, q);
    assert.equal(halo.visible, false);
    flock.chirp(0, player);
    effects.update(.5, q);
    const peak = halo.material.opacity;
    assert.ok(halo.visible && peak > 0);
    assert.ok(playerHalo.visible);
    effects.update(3.5, q);
    assert.ok(halo.visible && halo.material.opacity < peak);
    effects.update(BOOST_DURATION, q);
    assert.equal(halo.visible, false);
    assert.equal(halo.material.opacity, 0);
    assert.equal(playerHalo.visible, false);
    for (let i = 1; i <= 300; i++) flock.update(i / 60, player, q);
    assert.equal(flock.connectedCount, 1);
    assert.ok(flock.agents[0].lantern.group.children.find(c => c.isPointLight).intensity > 0);
    player.copy(flock.agents[0].butterfly.group.position);
    flock.chirp(5, player);
    effects.update(5.5, q);
    assert.ok(halo.visible && halo.material.opacity > 0);
    effects.reset();
    assert.equal(halo.visible, false);
    assert.equal(halo.material.opacity, 0);
  } finally {
    effects.dispose();
    const resources = new Set();
    for (const group of [butterfly.group, flock.group, effects.group]) group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat()) if (material) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('rescues, flash expiry and reset preserve the visible lighting layout', () => {
  const scene = new THREE.Scene();
  const player = new THREE.Vector3(TUNNEL_START.x, TUNNEL_START.y, TUNNEL_START.z);
  const q = new THREE.Quaternion();
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const flock = createAutonomousButterflies(RESCUE_COUNT, { tunnel: true });
  const effects = createResonanceEffects(butterfly, flock);
  const lantern = createButterflyLantern();
  scene.add(butterfly.group, flock.group, effects.group, lantern.group);
  const activeLayout = () => {
    const lights = [];
    scene.traverseVisible(object => { if (object.isPointLight) lights.push(object); });
    return lights;
  };
  const initial = activeLayout();
  assert.equal(initial.length, RESCUE_COUNT + 2);
  try {
    flock.update(0, player, q);
    effects.update(0, q);
    assert.deepEqual(activeLayout(), initial);
    assert.ok(initial.every(light => light.intensity === 0));
    for (let i = 0; i < RESCUE_COUNT; i++) {
      const time = i * 3;
      player.copy(flock.agents[i].butterfly.group.position);
      const result = flock.chirp(time, player);
      effects.call(player, time, result.receivers, result.radius, result.charge);
      for (let frame = 1; frame <= 150; frame++) {
        const now = time + frame / 60;
        flock.update(now, player, q);
        effects.update(now, q);
        assert.deepEqual(activeLayout(), initial);
      }
      assert.ok(flock.agents[i].lantern.group.children.find(c => c.isPointLight).intensity > 0);
    }
    assert.equal(flock.connectedCount, RESCUE_COUNT);
    flock.reset(40, player);
    effects.reset();
    lantern.reset();
    assert.deepEqual(activeLayout(), initial);
    assert.ok(initial.every(light => light.intensity === 0), 'reset must actually extinguish all lights');
  } finally {
    effects.dispose();
    const resources = new Set();
    scene.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat()) if (material) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
  }
});
