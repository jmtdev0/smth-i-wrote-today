import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHyperboloid,
  HYPERBOLOID_BASE_RADIUS,
  HYPERBOLOID_VERTICAL_SCALE,
  HYPERBOLOID_HEIGHT,
  HYPERBOLOID_FULL_ANGLE,
  HYPERBOLOID_POSITION,
  PLAYER_START_Y,
  WATER_FADE_DISTANCE,
  WATER_VERTICAL_FADE_START,
  WATER_VERTICAL_FADE_END,
  hyperboloidRadius,
} from '../src/Waterfall.js';
import { LATERAL_PERIOD, WATERFALL_SPEED, flowPhase, lateralPhase } from '../src/flight.js';

test('the scene uses a giant full hyperboloid around the butterfly', () => {
  assert.equal(HYPERBOLOID_FULL_ANGLE, Math.PI * 2);
  assert.equal(HYPERBOLOID_BASE_RADIUS, 30);
  assert.equal(HYPERBOLOID_VERTICAL_SCALE, 120);
  assert.ok(HYPERBOLOID_HEIGHT > 180);
  assert.ok(WATER_VERTICAL_FADE_END > 100);
  assert.ok(WATER_FADE_DISTANCE > 145);
  assert.equal(PLAYER_START_Y, HYPERBOLOID_POSITION.y - WATER_VERTICAL_FADE_START + 5);
  assert.equal(hyperboloidRadius(0), HYPERBOLOID_BASE_RADIUS);
  assert.ok(hyperboloidRadius(190) > hyperboloidRadius(0));
  assert.equal(hyperboloidRadius(-190), hyperboloidRadius(190));
});

test('the lower water window follows descents without moving the starting position or flow clock', () => {
  const hyperboloid = createHyperboloid();
  const sheets = hyperboloid.group.children.filter(child => child.isMesh);
  const resources = new Set();
  try {
    hyperboloid.update(0, 0, { x: 0, y: PLAYER_START_Y, z: 10 });
    assert.equal(hyperboloid.group.position.y, HYPERBOLOID_POSITION.y);
    assert.equal(hyperboloid.group.position.x, 0);
    assert.equal(hyperboloid.group.position.z, 10);

    const descent = 80;
    const time = 2;
    hyperboloid.update(time, 0, { x: 0, y: PLAYER_START_Y - descent, z: 10 });
    assert.ok(Math.abs(hyperboloid.group.position.y -
      (HYPERBOLOID_POSITION.y - descent + Math.sin(time * .45) * .10)) < 1e-10);
    for (const sheet of sheets) {
      assert.ok(Math.abs(sheet.material.uniforms.uVerticalOffset.value + descent) < 1e-10);
      assert.equal(sheet.material.uniforms.uFlow.value, flowPhase(time));
      assert.equal(sheet.geometry.attributes.position.count, sheets[0].geometry.attributes.position.count);
      assert.match(sheet.material.vertexShader, /float absoluteY = y \+ uVerticalOffset/);
      assert.match(sheet.material.vertexShader, /float profileY = max\(absoluteY, -110\.\)/);
      assert.match(sheet.material.vertexShader, /\(absoluteY \+ uFlow\) \* \.025/);
      assert.match(sheet.material.fragmentShader, /vLocalY \+ uVerticalOffset \+ uFlow/);
      assert.match(sheet.material.fragmentShader, /abs\(vLocalY\)/);
    }

    const deepDescent = 1e7;
    hyperboloid.update(time, 0, { x: 0, y: PLAYER_START_Y - deepDescent, z: 10 });
    assert.ok(Math.abs(sheets[0].material.uniforms.uVerticalOffset.value + deepDescent) < 1e-8);
    assert.ok(Math.abs(hyperboloid.group.position.y -
      (HYPERBOLOID_POSITION.y - deepDescent + Math.sin(time * .45) * .10)) < 1e-8);

    hyperboloid.update(time, 0, { x: 0, y: PLAYER_START_Y + 25, z: 10 });
    assert.equal(sheets[0].material.uniforms.uVerticalOffset.value, 0);
    assert.equal(sheets[0].material.uniforms.uFlow.value, WATERFALL_SPEED * time);
  } finally {
    hyperboloid.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('the hyperboloid remains bounded and follows the butterfly horizontally', () => {
  const hyperboloid = createHyperboloid();
  const resources = new Set();
  try {
    const sheets = hyperboloid.group.children.filter(child => child.isMesh);
    const vertexCount = sheets[0].geometry.attributes.position.count;
    assert.equal(sheets.length, 5);
    assert.equal(hyperboloid.group.position.x, HYPERBOLOID_POSITION.x);
    assert.equal(hyperboloid.group.position.z, HYPERBOLOID_POSITION.z);
    assert.match(sheets[0].material.vertexShader, /surfaceRadius = 30/);
    for (const distance of [-1e9, -51201, -.1, 0, 50, 51200, 1e9]) {
      hyperboloid.update(3, distance, { x: 7, z: -12 });
      for (const sheet of sheets) {
        const phase = sheet.material.uniforms.uLateral.value;
        assert.ok(phase >= 0 && phase < LATERAL_PERIOD);
        assert.equal(phase, lateralPhase(distance));
        assert.equal(sheet.geometry.attributes.position.count, vertexCount);
      }
      assert.equal(hyperboloid.group.position.x, 7);
      assert.equal(hyperboloid.group.position.z, -12);
    }
  } finally {
    hyperboloid.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('horizontal field period still closes at its seam', () => {
  for (const period of [50, 10, 320, 400]) assert.equal(LATERAL_PERIOD % period, 0);
  assert.equal(lateralPhase(LATERAL_PERIOD), 0);
});
