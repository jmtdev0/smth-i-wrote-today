import test from 'node:test';
import assert from 'node:assert/strict';
import { createHyperboloid } from '../src/Waterfall.js';
import { WATERFALL_SPEED } from '../src/flight.js';

test('water deforms on its own clock, independently of butterfly altitude', () => {
  const water = createHyperboloid();
  try {
    water.update(0, 0);
    const sheets = water.group.children.filter(child => child.material.uniforms.uRipple);
    const initialFlow = sheets[0].material.uniforms.uFlow.value;
    const before = sheets[0].material.uniforms.uRipple.value.clone();
    water.update(2, 1000);
    for (const sheet of sheets) {
      assert.equal(sheet.material.uniforms.uFlow.value, initialFlow + WATERFALL_SPEED * 2);
      assert.ok(sheet.material.uniforms.uRipple.value.distanceTo(before) > .5);
    }
    const animated = sheets[0].material.uniforms.uRipple.value.clone();
    water.update(2, -1000);
    assert.equal(sheets[0].material.uniforms.uFlow.value, initialFlow + WATERFALL_SPEED * 2);
    assert.ok(sheets[0].material.uniforms.uRipple.value.equals(animated), 'butterfly position cannot control the ripple clock');
    water.update(2, -1000);
    assert.ok(sheets[0].material.uniforms.uRipple.value.equals(animated), 'paused animation stays still');
    const nearWrap = 2 * Math.PI / .65;
    water.update(nearWrap - 1e-6, 0);
    const end = sheets[0].material.uniforms.uRipple.value.clone();
    water.update(nearWrap + 1e-6, 0);
    assert.ok(sheets[0].material.uniforms.uRipple.value.distanceTo(end) < 2e-6);
  } finally {
    const resources = new Set();
    water.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});
