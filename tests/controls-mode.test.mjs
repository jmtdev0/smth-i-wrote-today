import test from 'node:test';
import assert from 'node:assert/strict';
import { detectControlsMode, controlsModeForPointer } from '../src/controlsMode.js';

test('initial controls match desktop and touch layouts unless a controller is connected', () => {
  assert.equal(detectControlsMode(), 'keyboard-mouse');
  assert.equal(detectControlsMode({ touchLayout: true }), 'touch');
  assert.equal(detectControlsMode({ touchLayout: true, gamepads: [null, { connected: true }] }), 'gamepad');
  assert.equal(detectControlsMode({ gamepads: [{ connected: false }] }), 'keyboard-mouse');
});

test('pointer input selects the matching control instructions', () => {
  assert.equal(controlsModeForPointer('touch'), 'touch');
  assert.equal(controlsModeForPointer('mouse', true), 'keyboard-mouse');
  assert.equal(controlsModeForPointer('pen', true), 'touch');
  assert.equal(controlsModeForPointer('pen', false), 'keyboard-mouse');
  assert.equal(controlsModeForPointer('', false), null);
});
