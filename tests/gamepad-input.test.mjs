import test from 'node:test';
import assert from 'node:assert/strict';
import { gamepadAxis, gamepadButton, resetGamepadMotion, readGamepadMotion,
  advanceGamepadZoom, GAMEPAD_ZOOM_SPEED } from '../src/gamepadInput.js';

function pad({ axes = [0, 0, 0, 0], pressed = [] } = {}) {
  return { connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) };
}

test('R3 consumes both left-stick axes and routes up/down only to zoom', () => {
  const input = resetGamepadMotion();
  for (const axis of [-1, -.58, 0, .58, 1]) {
    readGamepadMotion(pad({ axes: [1, axis, 0, 0], pressed: [11] }), input);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveY, 0);
    assert.equal(input.zoom, gamepadAxis({ axes: [axis] }, 0));
    const distance = advanceGamepadZoom(15, input.zoom, .05, 4, 42);
    assert.equal(Math.sign(distance - 15), Math.sign(axis));
  }
});

test('releasing R3 immediately restores normal flight and cannot latch zoom', () => {
  const input = resetGamepadMotion(), gamepad = pad({ axes: [-1, -1, 0, 0], pressed: [11] });
  assert.equal(readGamepadMotion(gamepad, input), input, 'reuse the same object every frame');
  assert.equal(input.zoom, -1);
  gamepad.buttons[11] = { pressed: false, value: 0 };
  readGamepadMotion(gamepad, input);
  assert.equal(input.zoom, 0);
  assert.equal(input.moveX, -1);
  assert.equal(input.moveY, -1);
  assert.equal(advanceGamepadZoom(10, input.zoom, .05, 4, 42), 10);
});

test('stick deadzone prevents zoom drift and partial tilt controls speed', () => {
  const input = resetGamepadMotion();
  for (const axis of [-.16, -.1, 0, .1, .16]) {
    readGamepadMotion(pad({ axes: [0, axis, 0, 0], pressed: [11] }), input);
    assert.equal(input.zoom, 0);
  }
  readGamepadMotion(pad({ axes: [0, .58, 0, 0], pressed: [11] }), input);
  assert.ok(Math.abs(input.zoom - .5) < 1e-12);
  assert.equal(advanceGamepadZoom(15, input.zoom, 1, 4, 42), 15 + GAMEPAD_ZOOM_SPEED * .5);
});

test('R3 leaves right-stick orbit, D-pad flight and analog triggers intact', () => {
  const input = resetGamepadMotion(), gamepad = pad({ axes: [.8, -1, .58, -1], pressed: [11, 15, 12] });
  gamepad.buttons[6].value = .25;
  gamepad.buttons[7].value = .75;
  readGamepadMotion(gamepad, input);
  assert.equal(input.moveX, 1);
  assert.equal(input.moveY, -1);
  assert.ok(Math.abs(input.lookX - .5) < 1e-12);
  assert.equal(input.lookY, -1);
  assert.equal(input.descend, .25);
  assert.equal(input.ascend, .75);
  assert.equal(input.zoom, -1, 'D-pad does not change the zoom value');
});

test('without R3, flight keeps D-pad blending/clamping and other actions never engage zoom', () => {
  const input = resetGamepadMotion();
  for (const action of [0, 1, 2, 3, 9, 10]) {
    readGamepadMotion(pad({ axes: [1, 1, 0, 0], pressed: [action, 15, 13] }), input);
    assert.equal(input.moveX, 1);
    assert.equal(input.moveY, 1);
    assert.equal(input.zoom, 0);
  }
});

test('pause/settings, disconnection and focus-reset clear the zoom as well as movement', () => {
  const input = resetGamepadMotion(), gamepad = pad({ axes: [1, -1, 1, -1], pressed: [11, 7] });
  for (const clear of [
    () => readGamepadMotion(gamepad, input, false),
    () => readGamepadMotion(null, input),
    () => readGamepadMotion({ ...gamepad, connected: false }, input),
    () => resetGamepadMotion(input),
  ]) {
    readGamepadMotion(gamepad, input);
    assert.equal(input.zoom, -1);
    clear();
    assert.deepEqual(input, resetGamepadMotion());
  }
});

test('zoom has identical speed at different frame rates and clamps to wheel/pinch bounds', () => {
  for (const fps of [30, 60, 144]) {
    let distance = 15;
    for (let i = 0; i < fps; i++) distance = advanceGamepadZoom(distance, .5, 1 / fps, 4, 42);
    assert.ok(Math.abs(distance - (15 + GAMEPAD_ZOOM_SPEED * .5)) < 1e-10);
  }
  assert.equal(advanceGamepadZoom(4.1, -1, .05, 4, 42), 4);
  assert.equal(advanceGamepadZoom(41.9, 1, .05, 4, 42), 42);
  assert.ok(advanceGamepadZoom(4, 1, .05, 4, 42) > 4, 'can zoom back out at the near limit');
  assert.ok(advanceGamepadZoom(42, -1, .05, 4, 42) < 42, 'can zoom back in at the far limit');
});

test('missing or malformed axes/buttons stay neutral and digital-only R3 still works', () => {
  const input = resetGamepadMotion();
  readGamepadMotion({}, input);
  assert.deepEqual(input, resetGamepadMotion());
  assert.equal(gamepadAxis({ axes: [NaN] }, 0), 0);
  assert.equal(gamepadButton({ buttons: [{ value: NaN }] }, 0), 0);
  const gamepad = pad({ axes: [0, -1, 0, 0] });
  gamepad.buttons[11] = { pressed: true };
  readGamepadMotion(gamepad, input);
  assert.equal(input.zoom, -1);
  assert.equal(input.moveY, 0);
});
