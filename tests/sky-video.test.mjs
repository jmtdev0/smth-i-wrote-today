import test from 'node:test';
import assert from 'node:assert/strict';
import { videoTimeForMusic, syncVideoToAudio, skyVideoOpacity, createSkyVideoMixer, SKY_VIDEO_FADE_SECONDS } from '../src/SkyVideo.js';

test('sky opacity preserves zero, clamps saved values and defaults old or invalid settings to 12%', () => {
  for (const value of [undefined, null, NaN, Infinity, 'invalid', {}, '']) {
    assert.equal(skyVideoOpacity(value), .12);
  }
  assert.equal(skyVideoOpacity(0), 0);
  assert.equal(skyVideoOpacity(.12), .12);
  assert.equal(skyVideoOpacity(.24), .24);
  assert.equal(skyVideoOpacity(-1), 0);
  assert.equal(skyVideoOpacity(1), .30);
});

const calibration = { rate: .88, offset: 2.25 };
test('the slowed excerpt maps to the original video without stretching its full duration', () => {
  assert.equal(videoTimeForMusic(0, 162.3, calibration), 2.25);
  assert.equal(videoTimeForMusic(25, 162.3, calibration), 24.25);
  assert.equal(videoTimeForMusic(45, 162.3, calibration), 41.85);
  assert.ok(Math.abs(videoTimeForMusic(72.39, 162.3, calibration) - 65.9532) < 1e-6);
  assert.ok(Math.abs(videoTimeForMusic(999, 162.3, calibration) - 162.26) < 1e-9);
});

test('sync follows play/pause, drift, seek and music loop without repeated seeks', async () => {
  const video = { readyState: 4, duration: 162.3, currentTime: 0, paused: true, seeking: false,
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
  const audio = { readyState: 4, currentTime: 25, playbackRate: 1, paused: false, ended: false, seeking: false };
  const state = { lastSongTime: 0, lastSeek: -Infinity, pending: false, retryAt: 0 };
  syncVideoToAudio(video, audio, calibration, 1000, state);
  await Promise.resolve();
  assert.equal(video.currentTime, 24.25);
  assert.equal(video.paused, false);
  syncVideoToAudio(video, audio, calibration, 1100, state);
  assert.equal(video.playbackRate, .88);
  audio.paused = true;
  syncVideoToAudio(video, audio, calibration, 1200, state);
  assert.equal(video.paused, true);
  audio.paused = false; audio.currentTime = 0;
  syncVideoToAudio(video, audio, calibration, 1500, state);
  assert.equal(video.currentTime, 2.25);
  video.seeking = true; video.currentTime = 0;
  syncVideoToAudio(video, audio, calibration, 2000, state);
  assert.equal(video.currentTime, 0, 'do not interrupt an in-flight seek');
});

function playback() {
  const audio = { readyState: 4, duration: 72.39, currentTime: 0, playbackRate: 1,
    paused: false, ended: false, seeking: false, loop: true };
  const videos = [0, 1].map(() => ({ readyState: 4, duration: 162.3, currentTime: 0,
    playbackRate: 1, paused: true, seeking: false, error: null,
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } }));
  const mixer = createSkyVideoMixer(audio, videos, calibration);
  let now = 0;
  function step(seconds = 1 / 60) {
    now += seconds * 1000;
    if (!audio.paused && !audio.seeking && audio.readyState >= 3) {
      audio.currentTime = (audio.currentTime + seconds * audio.playbackRate) % audio.duration;
    }
    for (const video of videos) if (!video.paused) video.currentTime += seconds * video.playbackRate;
    mixer.update(now);
  }
  mixer.update(now);
  return { audio, videos, mixer, step };
}

test('two reusable decoders crossfade at every music wrap without changing the song clock', async () => {
  const { audio, videos, mixer, step } = playback();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(videos[1].paused, true);
  assert.equal(videos[1].currentTime, calibration.offset, 'the next beginning is preloaded');
  step(.3); // Let the initial seek throttle expire before the test seeks near the end.
  for (let loop = 0; loop < 3; loop++) {
    audio.currentTime = audio.duration - .08;
    step(.01);
    const outgoing = mixer.activeIndex;
    step(.1);
    assert.equal(mixer.activeIndex, 1 - outgoing);
    assert.equal(mixer.blend, 0, 'first frame after the wrap still shows the outgoing video');
    const songStart = audio.currentTime;
    assert.ok(songStart > 0 && songStart < .1);
    assert.ok(videos[outgoing].currentTime > 65, 'the old video must not seek to the start while visible');
    let previousBlend = 0;
    for (let frame = 0; frame < 120; frame++) {
      step();
      await Promise.resolve();
      assert.ok(mixer.blend >= previousBlend && mixer.blend <= 1);
      assert.ok(mixer.blend - previousBlend < .025, 'no abrupt switch between textures');
      previousBlend = mixer.blend;
      assert.ok(Math.abs(mixer.video.currentTime - videoTimeForMusic(audio.currentTime, 162.3, calibration)) < .18);
      if (frame === 53) assert.ok(Math.abs(mixer.blend - .5) < .001, 'halfway through the 1.8 second fade');
    }
    assert.equal(mixer.blend, 1);
    assert.equal(videos[outgoing].paused, true);
    assert.equal(videos[outgoing].currentTime, calibration.offset);
    assert.ok(Math.abs(audio.currentTime - songStart - 2) < 1e-8, 'never shorten or retime the music');
    assert.equal(mixer.videos, videos, 'reuse both decoder/texture identities');
  }
  assert.equal(SKY_VIDEO_FADE_SECONDS, 1.8);
});

test('a late incoming decoder holds the old image, and pause or buffering also pauses the fade', async () => {
  const { audio, videos, mixer, step } = playback();
  await Promise.resolve(); await Promise.resolve();
  audio.currentTime = audio.duration - .08; step(.01);
  videos[1].seeking = true; videos[1].readyState = 1;
  step(.1);
  for (let frame = 0; frame < 30; frame++) step();
  assert.equal(mixer.blend, 0);
  assert.equal(mixer.ready, true, 'the old image remains available instead of an empty sky');
  videos[1].seeking = false; videos[1].readyState = 4;
  for (let frame = 0; frame < 30; frame++) step();
  const blend = mixer.blend;
  assert.ok(blend > 0 && blend < 1);
  audio.paused = true;
  for (let frame = 0; frame < 30; frame++) step();
  assert.equal(mixer.blend, blend);
  assert.ok(videos.every(video => video.paused));
  audio.paused = false; audio.readyState = 2;
  for (let frame = 0; frame < 30; frame++) step();
  assert.equal(mixer.blend, blend);
  audio.readyState = 4;
  for (let frame = 0; frame < 120; frame++) { step(); await Promise.resolve(); }
  assert.equal(mixer.blend, 1);
});

test('ordinary seeks are not mistaken for loops and source video end does not restart the outgoing clip', () => {
  const { audio, mixer, step } = playback();
  audio.currentTime = 30; step();
  audio.currentTime = 0; step();
  assert.equal(mixer.activeIndex, 0);
  assert.equal(mixer.blend, 1);
  const video = { readyState: 4, duration: 10, currentTime: 10, paused: true, seeking: false,
    play() { assert.fail('a source end should hold its last image, not start over'); }, pause() { this.paused = true; } };
  audio.currentTime = 20;
  syncVideoToAudio(video, audio, calibration, 1000, { lastSongTime: 20, lastSeek: -Infinity, retryAt: 0 });
  assert.equal(video.paused, true);
});
