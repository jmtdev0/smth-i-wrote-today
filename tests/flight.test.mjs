import test from 'node:test';
import assert from 'node:assert/strict';
import { flowPhase, advanceAltitude, BUTTERFLY_VERTICAL_SPEED, WATERFALL_SPEED } from '../src/flight.js';
test('ascent has no upper bound or reset and descent has no floor', () => {
  assert.equal(advanceAltitude(1e9, 1, 1), 1e9 + 5);
  assert.equal(advanceAltitude(-1e9, -1, 1), -1e9 - 5);
  assert.equal(advanceAltitude(50, 1, 0), 50);
  assert.equal(advanceAltitude(50, 0, 1), 50);
  assert.equal(advanceAltitude(0, 2, 1), 5);
});
test('both speeds are reduced and water keeps its own falling clock', () => {
  assert.equal(BUTTERFLY_VERTICAL_SPEED, 5);
  assert.equal(WATERFALL_SPEED, 4.5);
  assert.ok(BUTTERFLY_VERTICAL_SPEED < 6);
  assert.ok(WATERFALL_SPEED < 7);
  assert.ok(BUTTERFLY_VERTICAL_SPEED > WATERFALL_SPEED);
  assert.equal(flowPhase(1), 4.5);
  assert.equal(flowPhase(2), 9);
});
test('water phase no longer resets from butterfly altitude', () => {
  assert.equal(flowPhase(10), flowPhase(10, -1e9));
  assert.ok(flowPhase(102400 / WATERFALL_SPEED) > 102399);
});
