import test from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutHeavenChirpMenu,
  createMobileChirpMenu,
  HEAVEN_CHIRP_MENU_HOLD_MS,
  HEAVEN_RELEASE_HOLD_MS,
} from '../src/mobileChirpMenu.js';

test('every option sits on the same circle centered on the butterfly without overlapping', () => {
  const layout = layoutHeavenChirpMenu(400, 280, 960, 720);
  assert.equal(layout.x, 400);
  assert.equal(layout.y, 280);
  assert.equal(layout.scale, 1);
  const options = Object.values(layout.options);
  for (const option of options) {
    assert.ok(Math.abs(Math.hypot(option.x, option.y) - layout.radius) < 1e-8);
    for (const other of options) {
      if (option === other) continue;
      assert.ok(Math.hypot(option.x - other.x, option.y - other.y) > layout.buttonSize * 1.1);
    }
  }
});

test('compact landscape layouts keep their center and fit every option using one common scale', () => {
  for (const [width, height, x, y] of [[736, 414, 368, 300], [475, 373, 237.5, 270]]) {
    const layout = layoutHeavenChirpMenu(x, y, width, height);
    assert.equal(layout.x, x);
    assert.equal(layout.y, y);
    assert.equal(layout.placement, 'above');
    assert.ok(layout.buttonSize >= 76, 'use the free upper arc instead of shrinking the touch targets');
    const extent = layout.buttonSize * .55 + 6 * layout.scale;
    for (const option of Object.values(layout.options)) {
      assert.ok(Math.abs(Math.hypot(option.x, option.y) - layout.radius) < 1e-8);
      assert.ok(x + option.x - extent >= 8 - 1e-8);
      assert.ok(x + option.x + extent <= width - 8 + 1e-8);
      assert.ok(y + option.y - extent >= 8 - 1e-8);
      assert.ok(y + option.y + extent <= height - 8 + 1e-8);
    }
  }
});

test('a short Heaven tap uses the selected mode without opening the radial menu', () => {
  const menu = createMobileChirpMenu();
  menu.pointerDown(100);

  assert.equal(menu.update(100 + HEAVEN_CHIRP_MENU_HOLD_MS - 1), false);
  assert.deepEqual(menu.pointerUp(200), { type: 'chirp', mode: 'gather' });
  assert.equal(menu.open, false);
});

test('holding opens the menu and dragging to a chirp selects and executes that mode', () => {
  const menu = createMobileChirpMenu();
  menu.pointerDown(0);

  assert.equal(menu.update(HEAVEN_CHIRP_MENU_HOLD_MS), true);
  menu.hover('greet', HEAVEN_CHIRP_MENU_HOLD_MS + 10);
  assert.deepEqual(menu.pointerUp(HEAVEN_CHIRP_MENU_HOLD_MS + 20), { type: 'chirp', mode: 'greet' });

  menu.pointerDown(1000);
  assert.deepEqual(menu.pointerUp(1001), { type: 'chirp', mode: 'greet' });
});

test('the release action requires dwelling over its bubble before lifting', () => {
  const menu = createMobileChirpMenu();
  menu.pointerDown(0);
  menu.update(HEAVEN_CHIRP_MENU_HOLD_MS);
  menu.hover('release', 500);

  assert.equal(menu.releaseArmed(500 + HEAVEN_RELEASE_HOLD_MS - 1), false);
  assert.equal(menu.pointerUp(500 + HEAVEN_RELEASE_HOLD_MS - 1), null);

  menu.pointerDown(1000);
  menu.update(1000 + HEAVEN_CHIRP_MENU_HOLD_MS);
  menu.hover('release', 1500);
  assert.equal(menu.releaseArmed(1500 + HEAVEN_RELEASE_HOLD_MS), true);
  assert.deepEqual(menu.pointerUp(1500 + HEAVEN_RELEASE_HOLD_MS), { type: 'release' });
});

test('moving away from Release resets its confirmation dwell', () => {
  const menu = createMobileChirpMenu();
  menu.pointerDown(0);
  menu.update(HEAVEN_CHIRP_MENU_HOLD_MS);
  menu.hover('release', 500);
  menu.hover(null, 900);
  menu.hover('release', 950);

  assert.equal(menu.releaseArmed(950 + HEAVEN_RELEASE_HOLD_MS - 1), false);
});

test('cancelling a gesture does not chirp or release the flock', () => {
  const menu = createMobileChirpMenu();
  menu.pointerDown(0);
  menu.update(HEAVEN_CHIRP_MENU_HOLD_MS);
  menu.hover('gather', 500);
  menu.cancel();

  assert.equal(menu.pointerUp(1000), null);
  assert.equal(menu.open, false);
});
