import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAutonomousButterflies, AUTONOMOUS_FLIGHT_SPEED } from '../src/AutonomousButterflies.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createButterfly } from '../src/Butterfly.js';
import { emitButterflyChirp, releaseButterflyGroup } from '../src/chirpAction.js';
import { heavenFlightPosition } from '../src/HeavenChoreography.js';
import { releaseIntoOrbit } from '../src/CompanionFlight.js';
import { createChirpButtons } from '../src/chirpInput.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';

function setup(t) {
  const player = new THREE.Vector3(0, -10, -255), q = new THREE.Quaternion();
  const flock = createAutonomousButterflies(2, { tunnel: true });
  const paradise = createButterflyParadise(3), butterfly = createButterfly({ alwaysWhite: true });
  const effects = { calls: [], call(...args) { this.calls.push(args); } };
  const state = { time: 0, player, flock, paradise, butterfly, effects,
    tunnel: { solid: false }, landscapeColor: new THREE.Color('#ffffff') };
  flock.update(0, player, q, true, 0, false);
  flock.agents.forEach((a, i) => {
    a.butterfly.group.visible = true;
    a.butterfly.group.position.copy(player).add(new THREE.Vector3(i ? 80 : 3, 0, 0));
  });
  paradise.profiles.forEach((p, i) => {
    p.orbit = 4;
    releaseIntoOrbit(p, 0, player.clone().add(new THREE.Vector3(i === 2 ? 60 : 4 + i * 4, 0, 0)));
  });
  paradise.update(0, q, player, null, true);
  t.after(() => {
    paradise.dispose();
    const resources = new Set();
    for (const group of [flock.group, paradise.group, butterfly.group]) group.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  });
  return { ...state, state, q };
}

test('greeting chirp replies, colors and boosts without recruiting either population', t => {
  const f = setup(t);
  const result = emitButterflyChirp({ ...f.state, recruit: false });
  assert.equal(result.emitted, true);
  assert.equal(f.effects.calls.length, 1);
  assert.equal(f.flock.connectedCount, 0);
  assert.equal(f.paradise.connectedCount, 0);
  assert.ok(f.flock.agents.every(a => !a.connected && a.slot === -1));
  assert.ok(f.paradise.profiles.every(p => !p.connected && p.slot === -1));
  assert.ok(f.landscapeColor.equals(f.paradise.profiles[0].color));
  assert.ok(f.flock.boost(.5) > 1);
});

test('recruiting Heaven and tunnel butterflies shares unique slots without copies or duplicates', t => {
  const f = setup(t);
  const objects = f.paradise.group.children.slice();
  const materials = objects.map(object => object.material);
  emitButterflyChirp(f.state);
  assert.equal(f.flock.connectedCount, 1);
  assert.equal(f.paradise.connectedCount, 2);
  emitButterflyChirp({ ...f.state, time: .3 });
  assert.equal(f.paradise.connectedCount, 2);
  f.flock.agents[1].butterfly.group.position.copy(f.player);
  emitButterflyChirp({ ...f.state, time: .6 });
  assert.equal(f.flock.connectedCount, 2);
  const last = f.paradise.profiles[2];
  releaseIntoOrbit(last, 1, f.player.clone().add(new THREE.Vector3(6, 0, 0)));
  emitButterflyChirp({ ...f.state, time: 1 });
  assert.equal(f.paradise.connectedCount, 3);
  const slots = [...f.flock.agents, ...f.paradise.profiles].map(p => p.slot);
  assert.equal(new Set(slots).size, 5);
  assert.ok(f.landscapeColor.equals(last.color), 'a free NPC supplies color instead of a closer companion');
  assert.deepEqual(f.paradise.group.children, objects);
  assert.deepEqual(objects.map(object => object.material), materials);
});

test('recruiting preserves every NPC tint, including existing companions and new Heaven recruits', t => {
  const f = setup(t);
  const blue = new THREE.Color('#87dcdb');
  // A previously rescued, colored companion must also keep its tint.
  f.flock.chirp(-1, f.player);
  f.flock.adoptColor(blue);
  const original = f.paradise.profiles.map(p => p.color.clone());
  for (const [time, charge] of [[0, 0], [.5, 1], [1, 0]]) {
    const result = emitButterflyChirp({ ...f.state, time, charge, recruit: true });
    assert.equal(result.emitted, true);
    assert.ok(f.flock.agents[0].targetTint.equals(blue));
    f.paradise.profiles.forEach((p, i) => {
      assert.ok(p.color.equals(original[i]));
      assert.ok(p.targetColor.equals(original[i]));
    });
  }
  assert.equal(f.flock.connectedCount, 1);
  assert.equal(f.paradise.connectedCount, 2);
  // Confirm the render update does not gradually recolor new companions.
  for (let frame = 1; frame <= 180; frame++) f.paradise.update(1 + frame / 60, f.q, f.player, null, true);
  f.paradise.profiles.forEach((p, i) => assert.ok(p.color.equals(original[i])));
});

test('greeting still shares color with both companion populations; white chirp changes only the player', t => {
  const f = setup(t);
  emitButterflyChirp(f.state);
  const pink = new THREE.Color('#ffbbdc'), blue = new THREE.Color('#87dcdb');
  f.flock.adoptColor(blue);
  f.paradise.adoptColor(blue);
  const free = f.paradise.profiles[2];
  free.color.copy(pink); free.targetColor.copy(pink);
  releaseIntoOrbit(free, .5, f.player.clone().add(new THREE.Vector3(3, 0, 0)));
  emitButterflyChirp({ ...f.state, time: .5, recruit: false });
  assert.ok(f.flock.agents[0].targetTint.equals(pink));
  assert.ok(f.paradise.profiles[0].targetColor.equals(pink));
  assert.ok(f.paradise.profiles[1].targetColor.equals(pink));
  assert.equal(free.connected, false);
  emitButterflyChirp({ ...f.state, time: 1, recruit: false, restoreWhite: true });
  assert.equal(f.butterfly.group.getObjectByName('butterfly body').material.color.getHexString(), 'ffffff');
  assert.ok(f.flock.agents[0].targetTint.equals(pink));
  assert.ok(f.paradise.profiles[0].targetColor.equals(pink));
  assert.ok(f.paradise.profiles[1].targetColor.equals(pink));
  assert.equal(free.connected, false);
});

test('release is Heaven-only, preserves position/color and leaves visible free flyers instead of tunnel ghosts', t => {
  const f = setup(t);
  emitButterflyChirp(f.state);
  for (let i = 1; i <= 180; i++) {
    f.flock.update(i / 60, f.player, f.q, true, 0, false);
    f.paradise.update(i / 60, f.q, f.player, null, true, 0, f.flock.boost(i / 60));
  }
  assert.equal(releaseButterflyGroup({ ...f.state, time: 3, tunnel: { solid: true } }), 0);
  const rescued = f.flock.agents[0], heaven = f.paradise.profiles[0];
  const rescuePosition = rescued.butterfly.group.position.clone(), rescueTint = rescued.tint.clone();
  const heavenPosition = heaven.followPosition.clone(), heavenTint = heaven.color.clone();
  assert.equal(releaseButterflyGroup({ ...f.state, time: 3 }), 3);
  assert.equal(f.flock.connectedCount + f.paradise.connectedCount, 0);
  assert.ok(rescued.butterfly.group.position.equals(rescuePosition));
  assert.ok(heavenFlightPosition(heaven, 3, new THREE.Vector3()).distanceTo(heavenPosition) < 1e-10);
  assert.ok(rescued.tint.equals(rescueTint) && heaven.color.equals(heavenTint));
  assert.equal(rescued.freed, true);
  assert.equal(rescued.slot, -1);
  f.player.x += 100;
  for (let i = 181; i <= 480; i++) f.flock.update(i / 60, f.player, f.q, true, 0, false);
  assert.equal(rescued.butterfly.group.visible, true);
  assert.equal(f.flock.agents[1].butterfly.group.visible, false, 'unrescued tunnel occupants remain hidden');
  assert.ok(rescued.butterfly.group.position.distanceTo(rescuePosition) > 1);
  assert.ok(rescued.butterfly.group.position.distanceTo(rescuePosition) < 20, 'freed butterfly stays by its own orbit, not the player');
  assert.ok(rescued.tint.equals(rescueTint));
  assert.equal(rescued.whiteness, 1);
  assert.equal(rescued.lantern.group.children.find(o => o.isPointLight).intensity, 0);
});

test('free butterflies can be greeted repeatedly and deliberately re-recruited', t => {
  const f = setup(t);
  emitButterflyChirp(f.state);
  releaseButterflyGroup({ ...f.state, time: 0 });
  for (const time of [.3, .6, 1]) emitButterflyChirp({ ...f.state, time, recruit: false });
  assert.equal(f.flock.connectedCount + f.paradise.connectedCount, 0);
  emitButterflyChirp({ ...f.state, time: 1.5 });
  assert.equal(f.flock.connectedCount, 1);
  assert.equal(f.paradise.connectedCount, 2);
  assert.equal(f.paradise.profiles.length, 3);
});

test('Heaven companions render their actual follow position, obey speed limits, pause and retain shadows', t => {
  const f = setup(t);
  f.player.y = -24;
  f.paradise.chirp(0, f.player, 30, { recruit: true });
  const p = f.paradise.profiles[0], matrix = new THREE.Matrix4(), rendered = new THREE.Vector3();
  for (let frame = 1; frame <= 600; frame++) {
    const before = p.followPosition.clone(), time = frame / 60;
    f.player.x += 2 / 60;
    f.paradise.update(time, f.q, f.player, null, true);
    assert.ok(p.followPosition.distanceTo(before) <= AUTONOMOUS_FLIGHT_SPEED / 60 + 1e-8);
    f.paradise.group.children[0].getMatrixAt(0, matrix);
    rendered.setFromMatrixPosition(matrix);
    assert.ok(rendered.distanceTo(p.followPosition) < .0001);
  }
  assert.ok(p.followPosition.distanceTo(f.player) < 10);
  assert.ok(f.paradise.npcShadowCount > 0);
  const before = p.followPosition.clone();
  f.paradise.update(10, f.q, f.player, null, true);
  assert.ok(p.followPosition.equals(before));
});

test('keyboard and controller holds keep recruit/greet intent, charge limits and cancellation separate', () => {
  const calls = [], input = createChirpButtons((...args) => calls.push(args));
  input.down('KeyE', 0, true); input.down('KeyE', 200, false);
  input.up('KeyE', 600);
  assert.deepEqual(calls.pop(), [.5, { recruit: true }]);
  input.down('KeyQ', 1000, false); input.up('KeyQ', 3000);
  assert.deepEqual(calls.pop(), [1, { recruit: false }]);
  input.down('gamepad1', 4000, true); input.down('gamepad2', 4500, false);
  assert.equal(input.charge(4600), .5);
  input.up('gamepad2', 5100);
  assert.deepEqual(calls.pop(), [.5, { recruit: false }]);
  input.cancel('gamepad'); input.up('gamepad1', 5300);
  assert.equal(calls.length, 0, 'disconnect cannot emit a pending call');
  input.down('KeyE', 6000, true); input.cancel(); input.up('KeyE', 8000);
  assert.equal(calls.length, 0, 'opening the menu or losing focus cancels a charged call');
  assert.equal(input.charge(8000), 0);
});

test('Heaven disables sustained chirp charge while still emitting a normal chirp', () => {
  let tunnelSolid = false;
  const calls = [];
  const input = createChirpButtons((...args) => calls.push(args), { canCharge: () => tunnelSolid });
  input.down('mobile-butterfly', 0, true);
  assert.equal(input.charge(2000), 0);
  input.up('mobile-butterfly', 2000);
  assert.deepEqual(calls.pop(), [0, { recruit: true }]);

  tunnelSolid = true;
  input.down('KeyE', 3000, true);
  assert.equal(input.charge(3600), .5);
  input.up('KeyE', 3600);
  assert.deepEqual(calls.pop(), [.5, { recruit: true }]);
});

test('released Heaven flyers stay above the meadow, and chirps hit their rendered positions', t => {
  const f = setup(t), p = f.paradise.profiles[0];
  f.paradise.chirp(0, f.player, 12, { recruit: true });
  p.followPosition.set(0, meadowSurfaceHeight(0, -255) + 2, -255);
  f.paradise.releaseAll(0);
  const matrix = new THREE.Matrix4(), rendered = new THREE.Vector3();
  for (let step = 0; step <= 120; step++) {
    const time = step / 2;
    f.paradise.update(time, f.q, f.player, null, true);
    f.paradise.group.children[0].getMatrixAt(0, matrix);
    rendered.setFromMatrixPosition(matrix);
    assert.ok(rendered.y >= meadowSurfaceHeight(rendered.x, rendered.z) + 1.9999);
    const answer = f.paradise.chirp(time, rendered, .001);
    assert.ok(answer && answer.position.distanceTo(rendered) < .0001);
    assert.equal(f.paradise.connectedCount, 0, 'ordinary replies must not reconnect a released butterfly');
  }
});
