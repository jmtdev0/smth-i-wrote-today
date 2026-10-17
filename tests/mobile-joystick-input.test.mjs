import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJoystick } from '../src/mobileJoystickInput.js';

test('joystick ignores small movements inside its deadzone', () => {
  assert.deepEqual(normalizeJoystick(4, 0, 40), { x: 0, y: 0, offsetX: 4, offsetY: 0 });
});

test('joystick remaps movement smoothly outside the deadzone', () => {
  const axes = normalizeJoystick(20, 0, 40);
  assert.ok(axes.x > 0 && axes.x < .5);
  assert.equal(axes.y, 0);
});

test('joystick caps both visual travel and diagonal input at full deflection', () => {
  const horizontal = normalizeJoystick(100, 0, 40);
  assert.equal(horizontal.x, 1);
  assert.equal(horizontal.offsetX, 40);

  const diagonal = normalizeJoystick(100, 100, 40);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(diagonal.offsetX, diagonal.offsetY) - 40) < 1e-12);
});

test('invalid joystick travel radius safely produces neutral input', () => {
  assert.deepEqual(normalizeJoystick(20, -10, 0), { x: 0, y: 0, offsetX: 0, offsetY: 0 });
});
