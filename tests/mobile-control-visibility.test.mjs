import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileControlVisibility } from '../src/mobileControlVisibility.js';

test('joysticks fade after repeated use and a short idle period', () => {
  const controls = createMobileControlVisibility();
  for (let use = 0; use < 5; use++) controls.joystickPressed();

  assert.equal(controls.update(3.9), true);
  assert.equal(controls.update(.1), false);
  assert.equal(controls.visible, false);
});

test('several seconds of joystick use also qualify the controls to fade', () => {
  const controls = createMobileControlVisibility();
  assert.equal(controls.update(8, { joystickActive: true, interacting: true }), true);
  assert.equal(controls.update(4), false);
});

test('any new interaction restores hidden controls immediately', () => {
  const controls = createMobileControlVisibility();
  for (let use = 0; use < 5; use++) controls.joystickPressed();
  controls.update(4);
  assert.equal(controls.visible, false);

  controls.interact();
  assert.equal(controls.visible, true);
  assert.equal(controls.update(4), true);
});

test('controls return after a minute without interaction', () => {
  const controls = createMobileControlVisibility();
  for (let use = 0; use < 5; use++) controls.joystickPressed();
  controls.update(4);
  assert.equal(controls.update(55.9), false);
  assert.equal(controls.update(.1), true);
  assert.equal(controls.visible, true);
});

test('camera and chirp interactions keep the controls from fading while active', () => {
  const controls = createMobileControlVisibility();
  for (let use = 0; use < 5; use++) controls.joystickPressed();
  assert.equal(controls.update(20, { interacting: true }), true);
  assert.equal(controls.update(3.9), true);
  assert.equal(controls.update(.1), false);
});
