import test from 'node:test';
import assert from 'node:assert/strict';
import { createR3ViewGesture, readGamepadMotion, advanceGamepadZoom,
  R3_TAP_MAX_MS, R3_DOUBLE_TAP_MS, R3_ZOOM_CANCEL_MS } from '../src/gamepadInput.js';

function fixture() {
  const gesture = createR3ViewGesture();
  const pad = { index: 0, connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const sample = (now, pressed, enabled = true) => {
    pad.buttons[11] = { pressed, value: +pressed };
    return gesture.update(pad, now, enabled);
  };
  sample(0, false);
  return { gesture, pad, sample };
}

test('the second R3 press toggles immediately once; a third tap starts a new pair', () => {
  const { sample, gesture } = fixture();
  assert.equal(sample(10, true), false);
  assert.equal(sample(60, false), false);
  assert.equal(sample(160, true), true);
  assert.equal(gesture.suppressZoom, true);
  assert.equal(sample(220, false), false);
  assert.equal(gesture.suppressZoom, false);
  assert.equal(sample(225, false), false);
  assert.equal(sample(260, true), false);
  assert.equal(sample(310, false), false);
});

test('single clicks, slow pairs and held buttons never switch views', () => {
  const { sample } = fixture();
  sample(10, true); assert.equal(sample(60, false), false);
  sample(60 + R3_DOUBLE_TAP_MS + 10, true);
  assert.equal(sample(60 + R3_DOUBLE_TAP_MS + 70, false), false);
  assert.equal(sample(1500, true), false);
  assert.equal(sample(1500 + R3_TAP_MAX_MS + 10, false), false);
  assert.equal(sample(1900, true), false);
  assert.equal(sample(1960, false), false);
});

test('more relaxed taps work without waiting for the second release', () => {
  const { sample } = fixture();
  sample(10, true);
  sample(10 + R3_TAP_MAX_MS, false);
  assert.equal(sample(10 + R3_TAP_MAX_MS + R3_DOUBLE_TAP_MS, true), true);
});

test('horizontal motion, small vertical drift and right-stick deflection do not discard taps', () => {
  for (const axes of [[1, 0, 0, 0], [0, .4, 0, 0], [0, -.3, 1, -1]]) {
    const { sample, pad } = fixture();
    pad.axes = axes;
    sample(10, true); sample(120, true); sample(160, false);
    assert.equal(sample(280, true), true);
    assert.equal(sample(360, false), false);
  }
});

test('intentional sustained vertical zoom cancels a tap, including at the release sample', () => {
  for (const releaseOnly of [false, true]) {
    const { sample, pad } = fixture();
    pad.axes[1] = -.8;
    sample(10, true);
    if (!releaseOnly) sample(10 + R3_ZOOM_CANCEL_MS, true);
    sample(20 + R3_ZOOM_CANCEL_MS, false);
    pad.axes[1] = 0;
    assert.equal(sample(180, true), false);
    assert.equal(sample(230, false), false);
  }
});

test('a brief vertical spike is tolerated as an accidental nudge', () => {
  const { sample, pad } = fixture();
  sample(10, true); pad.axes[1] = -.8;
  sample(20, true); pad.axes[1] = 0;
  sample(60, true); sample(100, false);
  assert.equal(sample(180, true), true);
});

test('holding the second press does not repeat the cut or become a third tap', () => {
  const { sample } = fixture();
  sample(10, true); sample(60, false); assert.equal(sample(100, true), true);
  for (const now of [150, 250, 400, 1000]) assert.equal(sample(now, true), false);
  assert.equal(sample(1100, false), false);
  assert.equal(sample(1150, true), false); assert.equal(sample(1200, false), false);
});

test('consuming the second press prevents stick drift from immediately undoing first person', () => {
  const { sample, pad, gesture } = fixture();
  sample(10, true); sample(60, false); assert.equal(sample(100, true), true);
  pad.axes[1] = .35;
  const input = {};
  let distance = 2.8;
  for (let now = 116; now <= 800; now += 16) {
    readGamepadMotion(pad, input);
    assert.equal(sample(now, true), false);
    assert.ok(input.zoom > 0, 'this drift would otherwise zoom back out');
    if (gesture.suppressZoom) input.zoom = 0;
    distance = advanceGamepadZoom(distance, input.zoom, .016, 2.8, 42);
  }
  assert.equal(distance, 2.8);
  sample(820, false);
  assert.equal(gesture.suppressZoom, false);
  sample(850, true);
  readGamepadMotion(pad, input);
  assert.ok(input.zoom > 0, 'a fresh hold can zoom normally');
  gesture.reset();
  assert.equal(gesture.suppressZoom, false);
});

test('menus, focus reset, disconnection and controller switches cannot complete a stale pair', () => {
  for (const interrupt of [
    f => f.gesture.reset(),
    f => f.sample(80, false, false),
    f => f.gesture.update(null, 80),
    f => { f.pad.connected = false; f.sample(80, false); f.pad.connected = true; },
    f => { f.pad.index = 1; f.sample(80, false); },
  ]) {
    const f = fixture(); f.sample(10, true); f.sample(60, false); interrupt(f);
    f.sample(90, false); assert.equal(f.sample(100, true), false);
    assert.equal(f.sample(160, false), false);
  }
});

test('R3 already held when focus returns is ignored until released', () => {
  const { gesture, sample } = fixture();
  gesture.reset();
  sample(100, true); assert.equal(sample(150, false), false);
  sample(200, true); assert.equal(sample(250, false), false);
  assert.equal(sample(300, true), true); assert.equal(sample(350, false), false);
});
