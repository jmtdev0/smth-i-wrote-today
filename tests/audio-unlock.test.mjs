import test from 'node:test';
import assert from 'node:assert/strict';
import { bindAudioUnlock } from '../src/audio.js';

class InteractionTarget extends EventTarget {
  listeners = new Map();

  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    this.listeners.set(type, options);
  }

  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.delete(type);
  }

  emit(type, pointerType) {
    this.dispatchEvent(Object.assign(new Event(type), { pointerType }));
  }
}

function createPlayer(results) {
  return {
    attempts: 0,
    start() {
      return Promise.resolve(results[this.attempts++] ?? true);
    },
  };
}

const finishPlayback = () => new Promise(resolve => setImmediate(resolve));

test('a blocked autoplay attempt waits for touch release instead of consuming initial contact', async () => {
  const player = createPlayer([false, true]);
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock(player, target);
  assert.equal(await unlock.start(), false);
  assert.equal(target.listeners.size, 5);

  target.emit('pointerdown', 'touch');
  target.emit('pointerdown', 'pen');
  assert.equal(player.attempts, 1);

  target.emit('pointerup', 'touch');
  assert.equal(player.attempts, 2, 'play is requested synchronously within the completed gesture');
  await finishPlayback();
  assert.equal(target.listeners.size, 0);

  target.emit('click');
  target.emit('keydown');
  assert.equal(player.attempts, 2, 'successful playback removes all automatic retries');
});

test('a failed completed tap keeps the next gesture available for another attempt', async () => {
  const player = createPlayer([false, false, true]);
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock(player, target);
  await unlock.start();

  target.emit('pointerup', 'touch');
  await finishPlayback();
  assert.equal(target.listeners.size, 5);

  target.emit('pointerup', 'touch');
  await finishPlayback();
  assert.equal(player.attempts, 3);
  assert.equal(target.listeners.size, 0);
});

for (const [type, pointerType] of [
  ['pointerdown', 'mouse'],
  ['pointerup', 'pen'],
  ['touchend'],
  ['click'],
  ['keydown'],
]) {
  test(`${[type, pointerType].filter(Boolean).join(' ')} can retry blocked music playback`, async () => {
    const player = createPlayer([false, true]);
    const target = new InteractionTarget();
    const unlock = bindAudioUnlock(player, target);
    await unlock.start();

    target.emit(type, pointerType);
    assert.equal(player.attempts, 2);
    await finishPlayback();
    assert.equal(target.listeners.size, 0);
  });
}

test('an explicit welcome-button request retries playback without needing another input event', async () => {
  const player = createPlayer([false, true]);
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock(player, target);
  await unlock.start();
  assert.equal(await unlock.start(), true);
  assert.equal(player.attempts, 2);
  assert.equal(target.listeners.size, 0);
});

test('unlock listeners run in capture so scene controls cannot hide completed gestures', () => {
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock(createPlayer([]), target);
  for (const options of target.listeners.values()) {
    assert.equal(options.capture, true);
    assert.equal(options.passive, true);
  }
  unlock.dispose();
});

test('listeners remain registered until the play request actually succeeds', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock({ start: () => pending }, target);
  const started = unlock.start();
  assert.equal(target.listeners.size, 5);
  finish(true);
  assert.equal(await started, true);
  assert.equal(target.listeners.size, 0);
});

test('disposing removes listeners and prevents later playback requests', async () => {
  const player = createPlayer([]);
  const target = new InteractionTarget();
  const unlock = bindAudioUnlock(player, target);
  unlock.dispose();
  target.emit('pointerup', 'touch');
  assert.equal(await unlock.start(), false);
  assert.equal(target.listeners.size, 0);
  assert.equal(player.attempts, 0);
});
