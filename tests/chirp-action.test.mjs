import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { emitButterflyChirp } from '../src/chirpAction.js';
import { CHIRP_COOLDOWN, MAX_CHIRP_RADIUS } from '../src/resonance.js';
import { TUNNEL_EXIT_Z } from '../src/TunnelWorld.js';

const blue = new THREE.Color('#87dcdb');
const pink = new THREE.Color('#ffbbdc');
function fixture(t) {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const flock = createAutonomousButterflies(1, { tunnel: true });
  const player = new THREE.Vector3(12, 8, -250);
  butterfly.group.position.copy(player);
  flock.agents[0].butterfly.group.position.copy(player);
  const calls = [], pulses = [], replies = [];
  const state = { time: 5, player, butterfly, flock, tunnel: { solid: false },
    landscapeColor: blue.clone(),
    paradise: {
      chirp(time, position, radius) {
        replies.push({ time, position: position.clone(), radius });
        return { position: position.clone(), color: pink };
      },
      pulse(time, position, color, charge) { pulses.push({ time, position: position.clone(), color: color.clone(), charge }); },
    },
    effects: { call(...args) { calls.push(args); } },
  };
  butterfly.update(0, false);
  butterfly.adoptColor(blue);
  for (let i = 1; i <= 240; i++) butterfly.update(i / 60, false);
  t.after(() => {
    const resources = new Set();
    for (const group of [butterfly.group, flock.group]) group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of [object.material].flat()) if (material) resources.add(material);
    });
    for (const resource of resources) resource.dispose();
  });
  return { state, calls, pulses, replies };
}

function assertWhite(butterfly) {
  butterfly.group.traverse(object => {
    if (['fill', 'body'].includes(object.userData.visualRole)) {
      assert.equal(object.material.color.getHexString(), 'ffffff');
    }
    if (object.userData.visualRole === 'fill') assert.equal(object.material.opacity, .9);
    if (object.userData.visualRole === 'line') assert.equal(object.material.color.getHexString(), 'dedede');
  });
}

test('white chirp resets the player before the flash and remains white despite a nearby Heaven answer', t => {
  const { state, calls, pulses, replies } = fixture(t);
  const release = t.mock.method(state.butterfly, 'releaseChirp');
  const call = state.effects.call;
  state.effects.call = (...args) => { assertWhite(state.butterfly); call(...args); };
  const result = emitButterflyChirp({ ...state, restoreWhite: true });
  assert.equal(result.emitted, true);
  assert.equal(calls.length, 1);
  assert.equal(replies.length, 1, 'Heaven still replies to the call');
  assert.equal(release.mock.callCount(), 1);
  assert.deepEqual(release.mock.calls[0].arguments, [5, 0]);
  assert.equal(pulses[0].color.getHexString(), 'ffffff');
  assert.equal(state.landscapeColor.getHexString(), 'ffffff');
  for (let i = 300; i <= 360; i++) state.butterfly.update(i / 60, false);
  assertWhite(state.butterfly);
});

test('white chirp preserves position, rescued companions, their tint and normal resonance', t => {
  const { state } = fixture(t);
  state.flock.chirp(0, state.player);
  state.flock.adoptColor(blue);
  const originalPosition = state.player.clone();
  const companion = state.flock.agents[0];
  const slot = companion.slot;
  emitButterflyChirp({ ...state, restoreWhite: true });
  assert.deepEqual(state.player, originalPosition);
  assert.deepEqual(state.butterfly.group.position, originalPosition);
  assert.equal(state.tunnel.solid, false);
  assert.equal(state.flock.connectedCount, 1);
  assert.equal(companion.connected, true);
  assert.equal(companion.slot, slot);
  assert.ok(companion.targetTint.equals(blue), 'R does not recolor the group');
  assert.ok(state.flock.boost(state.time + .3) > 1, 'the call still refreshes the boost');
});

test('R and Cross white chirps also rescue nearby butterflies inside the tunnel', t => {
  const { state, calls, pulses, replies } = fixture(t);
  state.tunnel.solid = true;
  state.player.z = 0;
  state.flock.agents[0].butterfly.group.position.copy(state.player);
  emitButterflyChirp({ ...state, restoreWhite: true, recruit: false });
  assert.equal(state.flock.connectedCount, 1);
  assert.equal(calls[0][2].length, 1);
  assert.equal(replies.length, 0);
  assert.equal(pulses.length, 0);
  assertWhite(state.butterfly);
});

for (const [kind, options] of [
  ['recruit', { recruit: true }],
  ['greeting', { recruit: false }],
  ['white', { recruit: false, restoreWhite: true }],
]) {
  test(`${kind} calls recruit in the tunnel and limbo, respecting radius, cooldown and unique slots`, t => {
    const { state, calls } = fixture(t);
    state.tunnel.solid = true;
    const agent = state.flock.agents[0];
    for (const z of [800, TUNNEL_EXIT_Z + 5, TUNNEL_EXIT_Z]) {
      state.flock.reset(0);
      state.player.z = z;
      agent.butterfly.group.position.copy(state.player);
      agent.butterfly.group.position.x += 20;
      emitButterflyChirp({ ...state, ...options, time: 5, charge: 0 });
      assert.equal(state.flock.connectedCount, 0, 'short calls do not rescue outside their radius');
      const blocked = emitButterflyChirp({ ...state, ...options, time: 5.1, charge: 1 });
      assert.equal(blocked.emitted, false);
      assert.equal(state.flock.connectedCount, 0, 'cooldown also gates rescue');
      const result = emitButterflyChirp({ ...state, ...options, time: 6, charge: 1 });
      assert.equal(result.radius, MAX_CHIRP_RADIUS);
      assert.equal(state.flock.connectedCount, 1);
      assert.equal(agent.connected, true);
      assert.equal(agent.slot, 0);
      assert.equal(calls.at(-1)[2].length, 1);
      emitButterflyChirp({ ...state, ...options, time: 7 });
      assert.equal(state.flock.connectedCount, 1, 'no duplicate recruitment');
      if (options.restoreWhite) assertWhite(state.butterfly);
    }
  });
}

test('greeting and white calls retain non-recruiting Heaven intent outside the tunnel, even during its fade', t => {
  const { state } = fixture(t);
  const heavenChirp = t.mock.method(state.paradise, 'chirp');
  for (const [solid, z] of [[true, TUNNEL_EXIT_Z - .1], [false, -255], [false, 800]]) {
    for (const restoreWhite of [false, true]) {
      state.flock.reset(0);
      state.tunnel.solid = solid;
      state.player.z = z;
      state.flock.agents[0].butterfly.group.position.copy(state.player);
      emitButterflyChirp({ ...state, recruit: false, restoreWhite });
      assert.equal(state.flock.connectedCount, 0, 'released tunnel companions stay free in Heaven');
      assert.equal(heavenChirp.mock.calls.at(-1).arguments[3].recruit, false,
        'the tunnel rescue override must not leak into Heaven NPC recruitment');
    }
  }
});

test('cooldown blocks tint reset and effects together, then allows the white call again', t => {
  const { state, calls, pulses, replies } = fixture(t);
  emitButterflyChirp(state);
  const tintBefore = state.butterfly.group.getObjectByName('butterfly body').material.color.clone();
  const blocked = emitButterflyChirp({ ...state, time: 5.1, restoreWhite: true });
  assert.equal(blocked.emitted, false);
  assert.equal(calls.length, 1);
  assert.equal(replies.length, 1);
  assert.equal(pulses.length, 1);
  assert.ok(state.butterfly.group.getObjectByName('butterfly body').material.color.equals(tintBefore));
  assert.ok(state.landscapeColor.equals(pink));
  assert.equal(emitButterflyChirp({ ...state, time: 5 + CHIRP_COOLDOWN + .001, restoreWhite: true }).emitted, true);
  assertWhite(state.butterfly);
});

test('a later greeting charged chirp can acquire Heaven colors again for player and group', t => {
  const { state, pulses, calls } = fixture(t);
  emitButterflyChirp({ ...state, restoreWhite: true });
  const result = emitButterflyChirp({ ...state, time: 6, charge: 1, recruit: false });
  assert.equal(result.radius, MAX_CHIRP_RADIUS);
  assert.ok(state.flock.agents[0].targetTint.equals(pink));
  assert.ok(state.landscapeColor.equals(pink));
  assert.ok(pulses[1].color.equals(pink));
  assert.equal(calls[1][4], 1);
  for (let i = 360; i <= 600; i++) state.butterfly.update(i / 60, false);
  const actual = state.butterfly.group.getObjectByName('butterfly body').material.color;
  assert.ok(Math.abs(actual.r - pink.r) + Math.abs(actual.g - pink.g) + Math.abs(actual.b - pink.b) < .001);
});
