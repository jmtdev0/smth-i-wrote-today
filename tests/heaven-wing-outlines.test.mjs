import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { BUTTERFLY_WHITE_LINE } from '../src/Butterfly.js';

function setup(t) {
  const paradise = createButterflyParadise(3);
  t.after(() => {
    paradise.dispose();
    const resources = new Set();
    paradise.group.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  });
  const wings = [0, 2, 4, 6].map(index => ({
    fill: paradise.group.children[index], stroke: paradise.group.children[index + 1],
  }));
  return { paradise, wings };
}

test('Heaven wing contours close on the exact fill boundary, with front and back strokes', t => {
  const { wings } = setup(t);
  for (const [part, { fill, stroke }] of wings.entries()) {
    const { shapes, curveSegments } = fill.geometry.parameters;
    const edge = shapes.getPoints(curveSegments);
    if (edge.at(-1).equals(edge[0])) edge.pop();
    const side = part < 2 ? -1 : 1;
    const positions = stroke.geometry.attributes.position;
    const center = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    assert.ok(curveSegments >= 24, 'close NPC silhouettes stay smooth');
    assert.ok(positions.count > edge.length * 12, 'veins remain in the same draw as the two outlines');
    for (let face = 0; face < 2; face++) for (let i = 0; i < edge.length; i++) {
      const start = (face * edge.length + i) * 6;
      a.fromBufferAttribute(positions, start); b.fromBufferAttribute(positions, start + 1);
      center.addVectors(a, b).multiplyScalar(.5);
      assert.ok(Math.abs(center.x - side * edge[i].x) < 1e-6);
      assert.ok(Math.abs(center.y - edge[i].y) < 1e-6);
      assert.ok(Math.abs(center.z - (face ? -.012 : .012)) < 1e-6);
      assert.ok(a.distanceTo(b) >= .0179 && a.distanceTo(b) <= .0361, 'a fine bounded miter, not a thick rim');
      const next = (face * edge.length + (i + 1) % edge.length) * 6;
      a.fromBufferAttribute(positions, start + 2); b.fromBufferAttribute(positions, next);
      assert.ok(a.equals(b), 'ribbon joints and loop closure have no gaps');
    }
  }
});

test('NPC wing strokes use the player outline color, retain occlusion, and reuse the four vein batches', t => {
  const { paradise, wings } = setup(t);
  const expected = new THREE.Color(BUTTERFLY_WHITE_LINE);
  assert.equal(new Set(wings.map(w => w.stroke.material)).size, 1);
  for (const { fill, stroke } of wings) {
    assert.equal(fill.count, 3);
    assert.equal(stroke.count, fill.count);
    assert.ok(stroke.material.color.equals(expected));
    assert.equal(stroke.material.toneMapped, false);
    assert.equal(stroke.material.side, THREE.DoubleSide);
    assert.equal(stroke.material.depthTest, true, 'a butterfly cannot draw over another in front');
    assert.equal(stroke.material.depthWrite, false);
    assert.equal(stroke.instanceColor, null, 'adopted colors cannot tint the outline');
    assert.equal(stroke.renderOrder, 1);
    assert.equal(stroke.castShadow, false);
  }
  assert.equal(paradise.group.children[8].name, 'Heaven bodies and heads');
  assert.equal(paradise.group.children.filter(o => /wing outlines and veins$/.test(o.name)).length, 4);
  assert.equal(paradise.group.getObjectByName('Nearby Heaven butterfly shadows').children.length, 5);
});

test('wing outlines track flaps, camera turns, charged replies, recruitment and release without new buffers', t => {
  const { paradise, wings } = setup(t);
  const player = new THREE.Vector3(0, -10, -255), q = new THREE.Quaternion();
  paradise.profiles.forEach((p, i) => Object.assign(p, { x: i * 3, y: -10, z: -255, orbit: 0 }));
  const buffers = wings.map(w => w.stroke.instanceMatrix.array);
  const geometries = wings.map(w => w.stroke.geometry);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  paradise.update(0, q, player, null, true);
  paradise.chirp(0, player, 30, { recruit: true });
  assert.equal(paradise.connectedCount, 3);
  paradise.adoptColor(new THREE.Color('#c8e68e'));
  for (let frame = 1; frame <= 120; frame++) {
    if (frame === 61) assert.equal(paradise.releaseAll(1), 3);
    q.setFromEuler(new THREE.Euler(frame * .01, frame * .06, frame * -.005));
    paradise.update(frame / 60, q, player, null, true);
    for (const [part, { fill, stroke }] of wings.entries()) {
      assert.equal(stroke.instanceMatrix.array, buffers[part]);
      assert.equal(stroke.geometry, geometries[part]);
      for (let i = 0; i < 3; i++) {
        fill.getMatrixAt(i, a); stroke.getMatrixAt(i, b);
        assert.deepEqual(a, b);
      }
    }
  }
});
