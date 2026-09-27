import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createInstancedButterflyBodies } from '../src/InstancedButterflyBodies.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';

function dispose(...groups) {
  const resources = new Set();
  for (const group of groups) group.traverse(object => {
    if (object.isInstancedMesh) resources.add(object);
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  for (const resource of resources) resource.dispose();
}

test('Heaven uses the exact player body/head vertices and retains front/back contours and antennae', () => {
  const player = createButterfly({ whiteness: 1, alwaysWhite: true });
  const { bodies, outlines } = createInstancedButterflyBodies(280);
  try {
    player.group.updateMatrixWorld(true);
    const expected = [];
    for (const name of ['butterfly body', 'butterfly head']) {
      const part = player.group.getObjectByName(name);
      const vertices = part.geometry.clone().applyMatrix4(part.matrixWorld);
      expected.push(...vertices.attributes.position.array);
      vertices.dispose();
    }
    assert.deepEqual(Array.from(bodies.geometry.attributes.position.array), expected);
    const positions = bodies.geometry.attributes.position;
    assert.equal(bodies.geometry.attributes.normal.count, positions.count);
    assert.equal(bodies.geometry.attributes.uv.count, positions.count);
    assert.ok(Array.from(bodies.geometry.index.array).every(index => index < positions.count));
    assert.ok(bodies.isInstancedMesh && outlines.isInstancedMesh);
    assert.equal(bodies.count, 280);
    const strokes = outlines.geometry.attributes.position;
    const z = Array.from({ length: strokes.count }, (_, i) => strokes.getZ(i));
    assert.ok(z.some(value => value < .16) && z.some(value => value > .16));
    assert.ok(Array.from({ length: strokes.count }, (_, i) => strokes.getY(i)).some(value => value > 1.2));
  } finally { dispose(player.group, bodies, outlines); }
});

test('Heaven anatomy follows the same scale and rotation as its wings', () => {
  const paradise = createButterflyParadise(2);
  try {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.2, .7, 0));
    paradise.update(8, q);
    const bodies = paradise.group.getObjectByName('Heaven bodies and heads');
    const bodyColor = new THREE.Color(), wingColor = new THREE.Color();
    for (let i = 0; i < paradise.profiles.length; i++) {
      bodies.getColorAt(i, bodyColor);
      paradise.group.children[0].getColorAt(i, wingColor);
      assert.ok(bodyColor.equals(wingColor), 'head and body must match their own wings');
    }
    const outlines = paradise.group.getObjectByName('Heaven body outlines and antennae');
    const a = new THREE.Matrix4(), b = new THREE.Matrix4();
    bodies.getMatrixAt(0, a); outlines.getMatrixAt(0, b);
    assert.ok(a.equals(b));
    const scale = new THREE.Vector3().setFromMatrixScale(a);
    assert.ok(Math.abs(scale.x - paradise.profiles[0].scale) < 1e-6);
    assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6);
  } finally { dispose(paradise.group); }
});
