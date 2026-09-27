import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { createButterfly } from '../src/Butterfly.js';
import { createResonanceEffects } from '../src/ResonanceEffects.js';

function cleanup(t, ...groups) {
  t.after(() => {
    const resources = new Set();
    for (const group of groups) group.traverse(object => {
      if (object.isInstancedMesh) resources.add(object);
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat()) if (material) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
  });
}
const difference = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

test('Heaven replies from the nearest rendered butterfly within the actual chirp radius', t => {
  const paradise = createButterflyParadise(2);
  cleanup(t, paradise.group);
  const q = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  for (const time of [0, 12, 20, 47, 61]) {
    paradise.update(time, q);
    paradise.group.children[0].getMatrixAt(1, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const reply = paradise.chirp(time, position, .01);
    assert.ok(reply);
    assert.ok(reply.position.distanceTo(position) < .001);
    assert.ok(reply.color.equals(paradise.profiles[1].color));
    assert.equal(paradise.profiles[1].replyAt, time);
    assert.equal(paradise.profiles.length, 2);
    assert.ok(paradise.profiles.every(p => !p.connected));
  }
  Object.assign(paradise.profiles[0], { x: 2, y: 0, z: -250, orbit: 0 });
  Object.assign(paradise.profiles[1], { x: 5, y: 0, z: -250, orbit: 0 });
  const player = new THREE.Vector3(0, 0, -250);
  assert.equal(paradise.chirp(50, player, 1.99), null);
  assert.ok(paradise.chirp(50, player, 2).color.equals(paradise.profiles[0].color));
  assert.ok(paradise.chirp(50, player, 30).color.equals(paradise.profiles[0].color));
  assert.equal(paradise.chirp(50, player, NaN), null);
});

test('only rescued companions adopt color smoothly, keep it, can change it and reset to white', t => {
  const flock = createAutonomousButterflies(2, { tunnel: true });
  cleanup(t, flock.group);
  const q = new THREE.Quaternion();
  const player = flock.agents[0].butterfly.group.position.clone();
  flock.update(0, player, q);
  flock.chirp(0, player);
  assert.equal(flock.connectedCount, 1);
  const linked = flock.agents[0], unlinked = flock.agents[1];
  const pink = new THREE.Color('#ffbbdc'), blue = new THREE.Color('#87dcdb');
  flock.adoptColor(pink);
  assert.ok(unlinked.targetTint.equals(new THREE.Color('#ffffff')));
  flock.update(1 / 60, player, q);
  assert.ok(difference(linked.tint, pink) > .01, 'transition must not jump instantly');
  for (let i = 2; i <= 600; i++) flock.update(i / 60, player, q);
  assert.ok(difference(linked.tint, pink) < .001);
  let fill;
  linked.butterfly.group.traverse(object => { if (object.userData.visualRole === 'fill') fill = object.material; });
  assert.ok(difference(fill.color, pink) < .001, 'rendered color survives whitening and illumination');
  flock.adoptColor(blue);
  for (let i = 601; i <= 900; i++) flock.update(i / 60, player, q);
  assert.ok(difference(fill.color, blue) < .001);
  assert.equal(flock.connectedCount, 1);
  flock.reset(15, player);
  assert.ok(linked.tint.equals(new THREE.Color('#ffffff')));
  assert.ok(linked.targetTint.equals(new THREE.Color('#ffffff')));
});

test('player adopts Heaven color even without companions, retaining unlit translucent wings and gray strokes', t => {
  const player = createButterfly({ whiteness: 1, alwaysWhite: true });
  const flock = createAutonomousButterflies(0, { tunnel: true });
  const effects = createResonanceEffects(player, flock);
  cleanup(t, player.group, flock.group, effects.group);
  t.after(() => effects.dispose());
  const color = new THREE.Color('#87dcdb');
  player.update(0, false);
  player.adoptColor(color);
  player.update(1 / 60, false);
  player.group.traverse(object => {
    if (object.userData.visualRole === 'fill') assert.ok(difference(object.material.color, color) > .01);
  });
  for (let i = 2; i <= 300; i++) player.update(i / 60, false);
  player.group.traverse(object => {
    if (['fill', 'body'].includes(object.userData.visualRole)) assert.ok(difference(object.material.color, color) < .001);
    if (object.userData.visualRole === 'fill') {
      assert.ok(object.material.isMeshBasicMaterial);
      assert.equal(object.material.opacity, .9);
      assert.equal(object.material.depthWrite, true);
    }
    if (object.userData.visualRole === 'line') assert.equal(object.material.color.getHexString(), 'dedede');
  });
  player.resetTint();
  player.update(6, false);
  player.group.traverse(object => {
    if (object.userData.visualRole === 'fill') assert.equal(object.material.color.getHexString(), 'ffffff');
  });
  flock.adoptColor(color);
  assert.equal(flock.connectedCount, 0);
  const answer = { position: new THREE.Vector3(0, 0, -250), color };
  effects.call(answer.position, 0, [], 12, 0, answer);
  effects.update(.3, new THREE.Quaternion());
  const colored = effects.group.children.filter(o => o.visible && o.material?.color?.equals(color));
  assert.equal(colored.length, 1);
  effects.update(5, new THREE.Quaternion());
  assert.equal(colored[0].visible, false);
});
