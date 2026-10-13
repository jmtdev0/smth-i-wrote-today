import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPAD_ACTION_BUTTONS, dispatchGamepadAction, gamepadButton } from '../src/gamepadInput.js';
import { createChirpButtons } from '../src/chirpInput.js';

function fixture() {
  const calls = [], previous = new Map();
  const pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const state = { enabled: true, menu: false, released: 0, chirp: (...args) => calls.push(args) };
  state.chirpButtons = createChirpButtons(state.chirp);
  state.toggleSettings = () => {
    state.menu = !state.menu; state.enabled = !state.menu; state.chirpButtons.cancel();
  };
  state.releaseGroup = () => { state.released++; };
  const sample = (now, pressed) => {
    pad.buttons.forEach((button, index) => { button.pressed = pressed.includes(index); });
    for (const index of GAMEPAD_ACTION_BUTTONS) {
      const down = gamepadButton(pad, index) > .5, wasDown = previous.get(index) ?? false;
      previous.set(index, down);
      if (down !== wasDown) dispatchGamepadAction(index, down, now, state);
    }
  };
  return { calls, sample, state };
}

test('DualShock Cross emits a single immediate white non-recruiting call, not a charged hold', () => {
  const { calls, sample, state } = fixture();
  sample(0, []); sample(10, [0]);
  assert.deepEqual(calls, [[0, { restoreWhite: true, recruit: false }]]);
  for (const now of [50, 100, 500, 1500]) sample(now, [0]);
  assert.equal(state.chirpButtons.charge(1500), 0);
  sample(1600, []);
  assert.equal(calls.length, 1, 'neither holding nor releasing repeats the chirp');
  sample(1700, [0]);
  assert.equal(calls.length, 2);
});

test('Cross is blocked by pause/settings and held buttons cannot fire on menu close', () => {
  const { calls, sample, state } = fixture();
  state.enabled = false;
  sample(10, [0]); sample(20, []);
  assert.equal(calls.length, 0);
  state.enabled = true;
  sample(30, [9, 0]);
  assert.equal(state.menu, true);
  assert.equal(calls.length, 0, 'Options takes effect before simultaneous Cross');
  sample(40, [0]); sample(50, [9, 0]);
  assert.equal(state.menu, false);
  assert.equal(calls.length, 0, 'closing settings while holding Cross does not fire');
  sample(60, []); sample(70, [0]);
  assert.equal(calls.length, 1);
});

test('Circle/Square retain independent charged intents and Triangle still releases', () => {
  const { calls, sample, state } = fixture();
  sample(0, [1]); sample(600, []);
  assert.deepEqual(calls.pop(), [.5, { recruit: true }]);
  sample(1000, [2]); sample(2200, []);
  assert.deepEqual(calls.pop(), [1, { recruit: false }]);
  sample(2300, [3]); sample(2400, [3]); sample(2500, []);
  assert.equal(state.released, 1);
  sample(3000, [1]); sample(3200, [1, 9]); sample(3600, []);
  assert.equal(calls.length, 0, 'opening settings cancels a held chirp');
});
