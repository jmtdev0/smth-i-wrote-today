import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { BUTTERFLY_VERTICAL_SPEED } from '../src/flight.js';
import { CHIRP_RADIUS, CHIRP_COOLDOWN, BOOST_DURATION, BOOST_MULTIPLIER } from '../src/resonance.js';
import { createChirpGesture } from '../src/chirpInput.js';

function flockFor(t, count = 3) {
  const flock = createAutonomousButterflies(count);
  const player = new THREE.Vector3(0, -1.3, 10);
  flock.update(0, player);
  t.after(() => {
    const resources = new Set();
    flock.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  });
  return { flock, player };
}

test('calls connect only nearby butterflies, persist after separation and cannot stack boosts', t => {
  const { flock, player } = flockFor(t);
  flock.agents[0].butterfly.group.position.copy(player).add(new THREE.Vector3(4, 0, 0));
  flock.agents[1].butterfly.group.position.copy(player).add(new THREE.Vector3(0, CHIRP_RADIUS + .01, 0));
  flock.agents[2].butterfly.group.position.copy(player).add(new THREE.Vector3(0, 0, CHIRP_RADIUS));
  const before = flock.agents.map(agent => agent.butterfly.group.position.clone());
  const call = flock.chirp(0, player);
  assert.equal(call.receivers.length, 2);
  assert.deepEqual(flock.agents.map(agent => agent.connected), [true, false, true]);
  flock.agents.forEach((agent, index) => assert.ok(agent.butterfly.group.position.equals(before[index])));
  assert.equal(flock.boost(0), 1, 'boost ramps in rather than jumping');
  assert.equal(flock.boost(1), BOOST_MULTIPLIER);
  assert.equal(flock.chirp(.1, player).emitted, false);
  const boostAtRefresh = flock.boost(CHIRP_COOLDOWN);
  assert.equal(flock.chirp(CHIRP_COOLDOWN, player).emitted, true);
  assert.equal(flock.connectedCount, 2, 'a second call does not duplicate companions');
  assert.equal(flock.boost(CHIRP_COOLDOWN), boostAtRefresh, 'refresh preserves the current ramp without a jump');
  assert.equal(flock.agents[0].charge.multiplier(2), flock.boost(2));
  assert.ok(flock.boost(CHIRP_COOLDOWN + BOOST_DURATION - .1) < 1.01);
  assert.equal(flock.boost(CHIRP_COOLDOWN + BOOST_DURATION), 1);
  player.y += 200;
  assert.equal(flock.chirp(10, player).receivers.length, 0);
  assert.equal(flock.connectedCount, 2);
  assert.equal(flock.boost(10.5), 1, 'an unanswered call cannot boost the player');
});

test('connected butterflies transition to the player white independently', t => {
  const { flock, player } = flockFor(t, 2);
  const linked = flock.agents[0];
  const unlinked = flock.agents[1];
  linked.butterfly.group.position.copy(player).add(new THREE.Vector3(3, 0, 0));
  unlinked.butterfly.group.position.copy(player).add(new THREE.Vector3(0, CHIRP_RADIUS + 1, 0));
  flock.chirp(0, player);
  assert.equal(linked.connected, true);
  assert.equal(linked.butterfly.whiteness, 0);
  assert.equal(unlinked.butterfly.whiteness, 0);
  flock.update(1 / 60, player);
  assert.ok(linked.butterfly.whiteness > 0 && linked.butterfly.whiteness < 1);
  for (let frame = 2; frame <= 150; frame++) flock.update(frame / 60, player);
  assert.ok(linked.butterfly.whiteness > .99);
  assert.equal(unlinked.butterfly.whiteness, 0);
  flock.reset(3, player);
  assert.equal(linked.butterfly.whiteness, 0);
});

test('companions follow in all directions at the shared speed limit without teleporting', t => {
  const { flock, player } = flockFor(t, 1);
  const agent = flock.agents[0];
  agent.butterfly.group.position.copy(player).add(new THREE.Vector3(8, 0, 0));
  flock.chirp(0, player);
  for (let frame = 1; frame <= 900; frame++) {
    const dt = 1 / 60, time = frame * dt;
    const speed = BUTTERFLY_VERTICAL_SPEED * flock.boost(time);
    player.y += dt * speed * .35;
    player.z -= dt * speed * .35;
    const lateralStep = frame > 300 && frame < 500 ? dt * speed * .25 : 0;
    const before = agent.butterfly.group.position.clone();
    flock.update(time, player, null, true, lateralStep);
    before.x -= lateralStep;
    assert.ok(agent.butterfly.group.position.distanceTo(before) <= speed * dt + 1e-8);
  }
  assert.ok(agent.butterfly.group.position.distanceTo(player) < 8);
  assert.ok(agent.butterfly.group.position.y > 10);
  assert.equal(agent.connected, true);
  const frozen = agent.butterfly.group.position.clone();
  const wing = agent.butterfly.group.getObjectByName('left wings').rotation.y;
  flock.update(15, player, null, false);
  assert.ok(agent.butterfly.group.position.equals(frozen));
  assert.equal(agent.butterfly.group.getObjectByName('left wings').rotation.y, wing);
  flock.reset(15, player);
  assert.equal(flock.connectedCount, 0);
  assert.equal(flock.boost(15), 1);
  assert.equal(agent.connected, false);
});

test('every companion keeps a separate resting position and follows outside the finite water', t => {
  const { flock, player } = flockFor(t, 6);
  flock.agents.forEach((agent, index) => agent.butterfly.group.position.copy(player).add(new THREE.Vector3(index - 3, index * .3, -2)));
  flock.chirp(0, player);
  for (let frame = 1; frame <= 600; frame++) flock.update(frame / 60, player);
  for (let i = 0; i < flock.agents.length; i++) {
    const position = flock.agents[i].butterfly.group.position;
    assert.ok(position.distanceTo(player) > 2);
    for (let j = i + 1; j < flock.agents.length; j++) {
      assert.ok(position.distanceTo(flock.agents[j].butterfly.group.position) > 1);
    }
  }
  for (let frame = 601; frame <= 3000; frame++) {
    player.y += 3 / 60;
    flock.update(frame / 60, player);
  }
  assert.ok(flock.agents.every(agent => agent.connected && agent.butterfly.group.position.y > 110));
});

test('following is stable at different frame rates', t => {
  const snapshots = [30, 60, 120].map(fps => {
    const { flock, player } = flockFor(t, 1);
    const agent = flock.agents[0];
    agent.butterfly.group.position.copy(player).add(new THREE.Vector3(6, 0, 0));
    flock.chirp(0, player);
    for (let frame = 1; frame <= 8 * fps; frame++) {
      player.z -= 3 / fps;
      flock.update(frame / fps, player);
    }
    return agent.butterfly.group.position.clone();
  });
  assert.ok(snapshots[0].distanceTo(snapshots[2]) < .25);
});

function touch(time, x = 10, y = 10, id = 1) {
  return { timeStamp: time, clientX: x, clientY: y, pointerId: id, pointerType: 'touch' };
}

test('double tap calls once while drags, pinches, holds and cancelled touches do not', () => {
  let calls = 0;
  const gesture = createChirpGesture(() => calls++);
  gesture.down(touch(0)); gesture.up(touch(50));
  gesture.down(touch(150)); gesture.up(touch(200));
  assert.equal(calls, 1);
  gesture.down(touch(500)); gesture.move(touch(550, 50)); gesture.up(touch(600));
  gesture.down(touch(700)); gesture.up(touch(750));
  assert.equal(calls, 1, 'dragging and returning to the start is not a tap');
  gesture.reset();
  gesture.down(touch(1000)); gesture.down(touch(1050, 30, 10, 2));
  gesture.up(touch(1100)); gesture.up(touch(1150, 30, 10, 2));
  gesture.down(touch(1200)); gesture.up(touch(1250));
  assert.equal(calls, 1, 'pinching cannot leave a pending double tap');
  gesture.reset();
  gesture.down(touch(2000)); gesture.up(touch(2400));
  gesture.down(touch(2500)); gesture.up(touch(2550));
  assert.equal(calls, 1);
  gesture.cancel(touch(2600)); gesture.reset();
  gesture.down(touch(3000)); gesture.cancel(touch(3050));
  gesture.down(touch(3100)); gesture.up(touch(3150));
  assert.equal(calls, 1);
});
