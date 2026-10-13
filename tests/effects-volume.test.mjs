import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createResonanceEffects } from '../src/ResonanceEffects.js';

function fixture(t, { deferredResume = false } = {}) {
  const contexts = [];
  const parameter = () => ({ value: 1, events: [],
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); },
    exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); },
    linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); },
    cancelScheduledValues(time) { this.events.push(['cancel', time]); },
  });
  const node = () => ({ connections: [], disconnected: false,
    connect(destination) { this.connections.push(destination); return destination; },
    disconnect() { this.disconnected = true; },
  });
  class AudioContext {
    constructor() {
      this.state = 'running'; this.currentTime = 10;
      this.destination = {}; this.gains = []; this.oscillators = [];
      contexts.push(this);
    }
    createGain() { const gain = { ...node(), gain: parameter() }; this.gains.push(gain); return gain; }
    createOscillator() {
      const oscillator = { ...node(), frequency: parameter(), start() {}, stop() {} };
      this.oscillators.push(oscillator); return oscillator;
    }
    resume() { return deferredResume ? new Promise(resolve => { this.finishResume = resolve; }) : Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { AudioContext }, configurable: true });
  const player = { group: new THREE.Group() };
  const flock = { agents: [], connectedCount: 0, glow: () => 0 };
  const effects = createResonanceEffects(player, flock);
  t.after(() => {
    effects.dispose();
    const resources = new Set();
    effects.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  const position = new THREE.Vector3();
  return { effects, contexts,
    call(answered = false, charge = 0) {
      effects.call(position, 0, [], 12, charge,
        answered ? { position, color: new THREE.Color('#ffffff') } : null);
    },
  };
}

test('saved effects volume is applied lazily to a shared call/answer bus, preserving voice envelopes', async t => {
  const f = fixture(t);
  f.effects.setVolume(.35);
  assert.equal(f.contexts.length, 0, 'settings must not start audio without a chirp');
  f.call(true, 1); await Promise.resolve();
  const context = f.contexts[0], [master, ...voices] = context.gains;
  assert.equal(context.oscillators.length, 2);
  assert.deepEqual(master.gain.events[0], ['set', .35, 10]);
  assert.deepEqual(master.connections, [context.destination]);
  assert.equal(voices.length, 2);
  for (const voice of voices) {
    assert.deepEqual(voice.connections, [master]);
    assert.equal(voice.gain.events.find(event => event[0] === 'exponential')[1], .036);
  }
  f.effects.setVolume(.6);
  assert.equal(context.gains.length, 3, 'changing volume must reuse the bus');
  assert.deepEqual(master.gain.events.at(-1), ['linear', .6, 10.02]);
});

test('zero effects volume is silent but leaves the chirp flash and visual pulse active', t => {
  const f = fixture(t);
  f.effects.setVolume(0); f.call(true, 1);
  assert.equal(f.contexts.length, 0);
  f.effects.update(.15, new THREE.Quaternion());
  assert.ok(f.effects.group.children.some(object => object.isMesh && object.visible));
  assert.ok(f.effects.group.children.find(object => object.isPointLight).intensity > 0);
});

test('muting affects already playing voices, reaches exact zero and unmuting restores calls', async t => {
  const f = fixture(t);
  f.call(); await Promise.resolve();
  const context = f.contexts[0], master = context.gains[0];
  assert.equal(master.gain.events[0][1], 1, '100% preserves the original chirp loudness');
  f.effects.setVolume(0);
  assert.deepEqual(master.gain.events.at(-1), ['linear', 0, 10.02]);
  f.call(); await Promise.resolve();
  assert.equal(context.oscillators.length, 1, 'mute creates no new voices');
  f.effects.setVolume(1); f.call(); await Promise.resolve();
  assert.equal(context.oscillators.length, 2);
  assert.equal(f.contexts.length, 1);
});

test('effects volume clamps out-of-range values and defaults invalid values to the original loudness', async t => {
  const f = fixture(t);
  f.effects.setVolume(-1); f.call();
  assert.equal(f.contexts.length, 0);
  f.effects.setVolume(2); f.call(); await Promise.resolve();
  const master = f.contexts[0].gains[0];
  assert.equal(master.gain.events[0][1], 1);
  for (const invalid of [undefined, NaN, Infinity, 'invalid']) {
    f.effects.setVolume(invalid);
    assert.equal(master.gain.events.at(-1)[1], 1);
  }
});

test('muting or disposing while audio resumes cannot emit a delayed chirp', async t => {
  const f = fixture(t, { deferredResume: true });
  f.call(); f.effects.setVolume(0);
  f.contexts[0].finishResume(); await Promise.resolve();
  assert.equal(f.contexts[0].oscillators.length, 0);
  f.effects.setVolume(1); f.call(); f.effects.dispose();
  f.contexts[0].finishResume(); await Promise.resolve();
  assert.equal(f.contexts[0].oscillators.length, 0);
  assert.equal(f.contexts[0].gains[0].disconnected, true);
  assert.equal(f.contexts[0].state, 'closed');
});
