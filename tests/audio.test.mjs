import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoopingAudio, fadeVolume } from '../src/audio.js';

function mockAudio(t, playback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  class MockAudio {
    paused = true;
    currentTime = 0;
    playCalls = 0;

    play() {
      this.playCalls += 1;
      return playback().then(() => { this.paused = false; });
    }
  }
  Object.defineProperty(globalThis, 'Audio', { value: MockAudio, writable: true, configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Audio', previous);
    else delete globalThis.Audio;
  });
}

test('ambient music fades in from silence to its selected maximum', () => {
  assert.equal(fadeVolume(0, 1, 2.5), 0);
  assert.equal(fadeVolume(1.25, 1, 2.5), .5);
  assert.equal(fadeVolume(2.5, 1, 2.5), 1);
  assert.equal(fadeVolume(8, 1, 2.5), 1);
});
test('fade duration can be disabled without exceeding the selected maximum', () => {
  assert.equal(fadeVolume(0, 1, 0), 1);
  assert.equal(fadeVolume(-2, 1, 0), 1);
});

test('a rejected play request can be retried on a later gesture', async t => {
  let attempts = 0;
  mockAudio(t, () => ++attempts === 1
    ? Promise.reject(new DOMException('User activation required', 'NotAllowedError'))
    : Promise.resolve());
  const player = createLoopingAudio('/test.mp3');
  assert.equal(await player.start(), false);
  assert.equal(player.audio.paused, true);
  assert.equal(await player.start(), true);
  assert.equal(player.audio.paused, false);
  assert.equal(player.audio.playCalls, 2);
});

test('overlapping gesture requests share playback and do not reset an active track or its fade', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  mockAudio(t, () => pending);
  const player = createLoopingAudio('/test.mp3', { maxVolume: 1 });
  const first = player.start();
  assert.equal(player.start(), first);
  assert.equal(player.audio.playCalls, 1);
  finish();
  assert.equal(await first, true);
  player.audio.currentTime = 12.5;
  player.update(performance.now() + 1250);
  const volume = player.audio.volume;
  assert.ok(volume > 0 && volume < 1);

  assert.equal(await player.start(), true);
  assert.equal(player.audio.playCalls, 1);
  assert.equal(player.audio.currentTime, 12.5);
  assert.equal(player.audio.volume, volume);
});
