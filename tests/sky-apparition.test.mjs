import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkyApparition, SKY_APPARITION_OPACITY } from '../src/SkyApparition.js';

function run(controller, from, to, heaven = true, y = .8, ready = true) {
  let opacity = 0;
  for (let i = Math.round(from * 20); i <= Math.round(to * 20); i++) {
    opacity = controller.update(i / 20, heaven, y, ready);
    assert.ok(opacity >= 0 && opacity <= SKY_APPARITION_OPACITY);
  }
  return opacity;
}

test('apparition waits for Heaven, a loaded image and sustained upward gaze', () => {
  const c = createSkyApparition(() => .5);
  assert.equal(run(c, 0, 30, false), 0);
  assert.equal(run(c, 30, 60, true, .8, false), 0);
  assert.equal(run(c, 60, 90, true, 0), 0);
  assert.equal(run(c, 90, 95), 0);
  assert.ok(run(c, 95, 99) > 0);
});

test('appearance fades in and out, waits between episodes, and does not advance while paused', () => {
  const c = createSkyApparition(() => 0);
  const early = run(c, 0, 7);
  const peak = run(c, 7, 11);
  assert.ok(early > 0 && early < peak);
  assert.ok(peak > .119);
  assert.equal(c.update(11, true, .8), peak);
  const fading = run(c, 11, 14);
  assert.ok(fading > 0 && fading < peak);
  assert.equal(run(c, 14, 17), 0);
  assert.equal(run(c, 17, 36), 0);
  assert.ok(run(c, 36, 42) > 0);
  assert.equal(c.update(42.05, false, .8), 0);
  assert.equal(run(c, 42.1, 47), 0);
});

test('looking away fades smoothly and a large time jump cannot flash the image', () => {
  const c = createSkyApparition();
  const peak = run(c, 0, 11);
  const turned = c.update(11.05, true, 0);
  assert.ok(turned > 0 && turned < peak);
  assert.ok(run(c, 11.1, 13, true, 0) < .002);
  const fresh = createSkyApparition();
  fresh.update(0, true, .8);
  assert.equal(fresh.update(9999, true, .8), 0);
});
