import test from 'node:test';
import assert from 'node:assert/strict';
import { angularDistance, portraitWeight } from '../src/angles.js';
test('portrait appears and disappears as the camera rotates', () => {
  assert.equal(portraitWeight(0), 0);
  assert.ok(portraitWeight(.38, .08) > .99);
  assert.equal(portraitWeight(.8), 0);
});
test('angle windows remain continuous across full revolutions', () => {
  for (const angle of [-.92, .38, 0, Math.PI]) {
    assert.ok(Math.abs(portraitWeight(angle) - portraitWeight(angle + 200 * Math.PI)) < 1e-10);
  }
  assert.ok(Math.abs(angularDistance(-Math.PI + .01, Math.PI - .01) - .02) < 1e-10);
});
test('looking vertically suppresses the image', () => {
  assert.equal(portraitWeight(.38, 1.35), 0);
});
