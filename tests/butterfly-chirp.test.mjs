import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';

test('exposes the player butterfly tint as it changes and resets to white', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  assert.equal(butterfly.tintColor, '#ffffff');

  butterfly.update(0, false);
  butterfly.adoptColor(new THREE.Color('#f18da8'));
  butterfly.update(.05, false);
  assert.notEqual(butterfly.tintColor, '#ffffff', 'the menu can show the in-progress player tint');

  for (let time = .1; time <= 4; time += .05) butterfly.update(time, false);
  assert.equal(butterfly.tintColor, '#f18da8');

  butterfly.resetTint();
  assert.equal(butterfly.tintColor, '#ffffff');
});

test('chirp charge gathers in the chest, folds the player butterfly, then releases and recovers', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const body = butterfly.group.getObjectByName('butterfly body');
  const head = butterfly.group.getObjectByName('butterfly head');
  const headPivot = butterfly.group.getObjectByName('butterfly head pivot');
  const leftWing = butterfly.group.getObjectByName('left wings');
  const core = butterfly.group.getObjectByName('butterfly chirp core');

  butterfly.update(0, false);
  assert.equal(body.scale.y, 1);
  assert.equal(headPivot.rotation.x, 0);
  assert.equal(Math.abs(leftWing.scale.x), 1);
  assert.equal(core.visible, false);

  butterfly.setChirpCharge(1);
  for (let time = .02; time <= .8; time += .02) butterfly.update(time, false);
  assert.ok(body.scale.y < .9, 'the body compresses as charge builds');
  assert.ok(headPivot.rotation.x > .1 && headPivot.rotation.x <= .12, 'the head inclines forward subtly');
  const chargedHeadPosition = head.getWorldPosition(new THREE.Vector3());
  assert.ok(chargedHeadPosition.z > .16, 'the head moves toward the butterfly chest');
  assert.ok(Math.abs(leftWing.scale.x) < .8, 'the wings fold toward the chest');
  assert.ok(core.visible && core.material.opacity > .2, 'the chest core glows during charge');

  butterfly.releaseChirp(.8, 1);
  butterfly.update(.82, false);
  assert.ok(core.material.opacity > .4, 'the chest flashes on release');

  for (let time = .84; time <= 2; time += 1 / 60) butterfly.update(time, false);
  assert.equal(core.visible, false);
  assert.ok(Math.abs(body.scale.y - 1) < .01, 'the body returns to its resting shape');
  assert.ok(Math.abs(head.position.y - .18) < .005, 'the head returns relative to its neck pivot');
  assert.ok(Math.abs(headPivot.rotation.x) < .005, 'the head returns to its upright position');
  const restingHeadPosition = head.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(restingHeadPosition.y - .72) < .005, 'the head returns to its original world position');
  assert.ok(Math.abs(Math.abs(leftWing.scale.x) - 1) < .01, 'the wings return to their resting span');
});

test('player wing fill stays 90% opaque and its drawing follows the wing layers', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const wings = ['left wings', 'right wings'].map(name => butterfly.group.getObjectByName(name));

  for (const wingGroup of wings) {
    const fills = wingGroup.children.filter(object => object.userData.visualRole === 'fill');
    const outlines = wingGroup.children.filter(object => object.isLineLoop);
    const veins = wingGroup.children.filter(object => object.isLine && !object.isLineLoop);

    assert.equal(fills.length, 2);
    assert.equal(outlines.length, 2);
    assert.equal(veins.length, 5);

    for (const [index, fill] of fills.entries()) {
      assert.equal(fill.geometry.parameters.curveSegments, 72);
      assert.equal(fill.material.transparent, true);
      assert.equal(fill.material.opacity, 0.9);
      assert.equal(fill.material.depthWrite, true);

      const expectedDepth = index === 0 ? 0 : 0.015;
      const outline = outlines[index];
      assert.equal(outline.renderOrder, 1);
      assert.ok(Math.abs(outline.geometry.attributes.position.getZ(0) - expectedDepth - 0.004) < 1e-6);
    }

    for (const [index, vein] of veins.entries()) {
      const expectedDepth = index < 3 ? 0 : 0.015;
      assert.equal(vein.renderOrder, 1);
      assert.ok(Math.abs(vein.geometry.attributes.position.getZ(0) - expectedDepth - 0.004) < 1e-6);
    }
  }

  assert.ok(wings.every(wingGroup => wingGroup.children
    .filter(object => object.isLine)
    .every(line => line.material.transparent)));
});
