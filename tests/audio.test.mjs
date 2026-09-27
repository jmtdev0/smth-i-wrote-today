import test from 'node:test';
import assert from 'node:assert/strict';
import { fadeVolume } from '../src/audio.js';

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
