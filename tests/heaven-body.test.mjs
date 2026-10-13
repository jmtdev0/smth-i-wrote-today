import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly, BUTTERFLY_WHITE_LINE } from '../src/Butterfly.js';
import { createInstancedButterflyBodies } from '../src/InstancedButterflyBodies.js';
import { NPC_ANTENNA_WIDTH_SCALE } from '../src/InstancedButterflyAntennae.js';
import { butterflyStrokeWidthGLSL, NPC_STROKE_WIDTH } from '../src/ButterflyStroke.js';
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
    assert.ok(bodies.isInstancedMesh && outlines.isLineSegments);
    assert.ok(outlines.geometry.isInstancedBufferGeometry);
    assert.equal(outlines.geometry.instanceCount, 280);
    assert.equal(outlines.geometry.getAttribute('aButterflyMatrix'), bodies.instanceMatrix);
    assert.equal(bodies.count, 280);
    const strokes = outlines.geometry.attributes.position;
    const z = Array.from({ length: strokes.count }, (_, i) => strokes.getZ(i));
    assert.ok(z.some(value => value < .16) && z.some(value => value > .16));
    const antennae = outlines.getObjectByName('Heaven readable antennae');
    const antennaVertices = antennae.geometry.attributes.position;
    assert.ok(Array.from({ length: antennaVertices.count }, (_, i) => antennaVertices.getY(i)).some(value => value > 1.2));
    const expectedStrokes = [], expectedAntennae = [], point = new THREE.Vector3();
    for (const name of ['butterfly body', 'butterfly head pivot']) {
      player.group.getObjectByName(name).traverse(object => {
        if (!object.isLine) return;
        const positions = object.geometry.attributes.position;
        if (!object.isLineLoop) {
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
            expectedAntennae.push(...point.toArray(), ...point.toArray());
          }
          return;
        }
        const segments = object.isLineLoop ? positions.count : positions.count - 1;
        for (let i = 0; i < segments; i++) for (const endpoint of [i, (i + 1) % positions.count]) {
          point.fromBufferAttribute(positions, endpoint).applyMatrix4(object.matrixWorld);
          expectedStrokes.push(point.x, point.y, point.z);
        }
      });
    }
    assert.deepEqual(strokes.array, new Float32Array(expectedStrokes), 'all four contour paths match the player exactly');
    assert.deepEqual(antennaVertices.array, new Float32Array(expectedAntennae), 'both antenna paths match the player exactly');
    player.group.traverse(object => {
      if (!object.isLine) return;
      assert.equal(object.material.opacity, 1, 'the player line strength is unchanged');
      assert.equal(object.material.linewidth, 1, 'the player line width is unchanged');
    });
  } finally { dispose(player.group, bodies, outlines); }
});

test('NPC contours keep occlusion and stable paths but reduce subpixel coverage with perspective', () => {
  const { bodies, outlines } = createInstancedButterflyBodies(1400);
  try {
    assert.equal(outlines.material.isLineBasicMaterial, true);
    assert.equal(outlines.material.linewidth, 1);
    assert.ok(outlines.material.color.equals(new THREE.Color(BUTTERFLY_WHITE_LINE)));
    assert.equal(outlines.material.toneMapped, false);
    assert.equal(outlines.material.transparent, true);
    assert.equal(outlines.material.opacity, .8);
    assert.equal(outlines.material.depthWrite, false);
    assert.equal(outlines.material.depthTest, true, 'nearby butterflies still occlude more distant ones');
    assert.equal(outlines.renderOrder, 1);
    assert.equal(outlines.castShadow, false);
    assert.equal(outlines.geometry.instanceCount, 1400);
    assert.equal(outlines.geometry.attributes.position.count, 520, 'all body/head contours remain one draw');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    outlines.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /attribute mat4 aButterflyMatrix/);
    assert.match(shader.vertexShader, /vec3 transformed = \(aButterflyMatrix \* vec4\(position, 1.0\)\).xyz/);
    assert.match(shader.vertexShader, /#include <project_vertex>/);
    assert.doesNotMatch(shader.vertexShader, /#include <begin_vertex>/);
    assert.ok(shader.vertexShader.includes(butterflyStrokeWidthGLSL));
    assert.match(shader.vertexShader, /vStrokeCoverage = min\(1\., projectedWidth \/ uLineWidth\)/);
    assert.match(shader.fragmentShader, /diffuseColor.a \*= vStrokeCoverage/);
    assert.equal(NPC_STROKE_WIDTH, .018, 'the width used by wing contours and veins');
    const gl = { ALIASED_LINE_WIDTH_RANGE: 33902, getParameter: () => [1, 1] };
    outlines.onBeforeRender({ getCurrentViewport: v => v.set(0, 0, 1600, 900),
      getPixelRatio: () => 1.25, getContext: () => gl });
    assert.deepEqual(shader.uniforms.uViewport.value.toArray(), [1600, 900]);
    assert.equal(shader.uniforms.uLineWidth.value, 1);
    const positions = outlines.geometry.attributes.position, tangents = outlines.geometry.attributes.aTangent;
    assert.equal(tangents.count, positions.count);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), tangent = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 2) {
      a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1).sub(a).normalize();
      tangent.fromBufferAttribute(tangents, i);
      assert.ok(b.distanceTo(tangent) < 1e-5);
      assert.ok(tangent.equals(a.fromBufferAttribute(tangents, i + 1)));
    }
  } finally { dispose(bodies, outlines); }
});

test('anatomy lines share live transforms through chirps, recruitment, turns and release', () => {
  const paradise = createButterflyParadise(3);
  try {
    const bodies = paradise.group.getObjectByName('Heaven bodies and heads');
    const outlines = paradise.group.getObjectByName('Heaven body outlines and antennae');
    const matrix = outlines.geometry.getAttribute('aButterflyMatrix');
    const antennae = outlines.getObjectByName('Heaven readable antennae');
    const vertices = outlines.geometry.attributes.position.array;
    const player = new THREE.Vector3(0, -10, -255), q = new THREE.Quaternion();
    paradise.profiles.forEach((p, i) => Object.assign(p, { x: i * 3, y: -10, z: -255, orbit: 0 }));
    paradise.update(0, q, player, null, true);
    paradise.chirp(0, player, 30, { recruit: true });
    assert.equal(paradise.connectedCount, 3);
    paradise.adoptColor(new THREE.Color('#b8a0f0'));
    for (let frame = 1; frame <= 120; frame++) {
      if (frame === 61) assert.equal(paradise.releaseAll(1), 3);
      q.setFromEuler(new THREE.Euler(frame * .01, frame * .06, -.2));
      paradise.update(frame / 60, q, player, null, true);
      assert.equal(outlines.geometry.getAttribute('aButterflyMatrix'), bodies.instanceMatrix);
      assert.equal(antennae.geometry.getAttribute('aButterflyMatrix'), bodies.instanceMatrix);
      assert.equal(outlines.geometry.getAttribute('aButterflyMatrix'), matrix);
      assert.equal(outlines.geometry.attributes.position.array, vertices);
      assert.ok(outlines.material.color.equals(new THREE.Color(BUTTERFLY_WHITE_LINE)));
    }
    assert.ok(matrix.version >= 120, 'the shared transform buffer is uploaded after updates');
    assert.equal(outlines.geometry.getAttribute('color'), undefined, 'adopted colors never tint the lines');
  } finally { paradise.dispose(); dispose(paradise.group); }
});

test('antennae shrink like wing strokes without a pixel floor, retaining their delicate near cap and depth', () => {
  const { bodies, outlines } = createInstancedButterflyBodies(1400);
  try {
    const antennae = outlines.getObjectByName('Heaven readable antennae');
    assert.equal(antennae.geometry.isInstancedBufferGeometry, true);
    assert.equal(antennae.geometry.instanceCount, 1400);
    assert.equal(antennae.geometry.attributes.position.count, 84);
    assert.equal(antennae.geometry.index.count, 240, 'only 80 triangles per butterfly');
    assert.equal(antennae.geometry.getAttribute('aButterflyMatrix'), bodies.instanceMatrix);
    assert.equal(antennae.castShadow, false);
    assert.equal(antennae.material.depthTest, true);
    assert.equal(antennae.material.depthWrite, false);
    assert.equal(antennae.material.fog, true);
    assert.equal(antennae.renderOrder, 1);
    assert.equal(NPC_ANTENNA_WIDTH_SCALE, .8);
    for (const maximum of [1, 4]) {
      let queries = 0;
      const gl = { ALIASED_LINE_WIDTH_RANGE: 33902, getParameter() { queries++; return [1, maximum]; } };
      for (const ratio of [1, 1.25, 1.75, 2]) {
        antennae.onBeforeRender({
          getCurrentViewport: target => target.set(0, 0, 1280 * ratio, 720 * ratio),
          getPixelRatio: () => ratio, getContext: () => gl,
        });
        assert.deepEqual(antennae.material.uniforms.uViewport.value.toArray(), [1280 * ratio, 720 * ratio]);
        assert.equal(antennae.material.uniforms.uLineWidth.value, Math.min(outlines.material.linewidth * ratio, maximum) * .8,
          'twenty percent finer than the player, even when native widths are clamped to one pixel');
      }
      assert.equal(queries, 1, 'do not query GPU limits every frame');
    }
    assert.ok(antennae.material.vertexShader.includes(butterflyStrokeWidthGLSL));
    assert.match(antennae.material.vertexShader, /width = min\(uLineWidth, butterflyStrokePixels\(transform, position, aTangent, uViewport\)\)/);
    assert.match(antennae.material.vertexShader, /float across = aSide \* width \* .5/);
    assert.match(antennae.material.vertexShader, /normal \* across \* 2\. \/ uViewport \* center.w/);
    assert.doesNotMatch(antennae.material.vertexShader, /smoothstep\(.75, 3\., size\)/,
      'no independent size cutoff: subpixel width alone handles distant antennae');
    assert.equal(antennae.material.uniforms.uEdgeColor, undefined, 'no extra border around the one-pixel stroke');
    assert.match(antennae.material.fragmentShader, /vec4\(uCoreColor, 1\.\)/);
    assert.match(antennae.material.fragmentShader, /#include <fog_fragment>/);
    assert.ok(antennae.material.uniforms.uCoreColor.value.equals(new THREE.Color('#f5f5f5')));
    const disposed = [];
    antennae.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    antennae.material.addEventListener('dispose', () => disposed.push('material'));
    dispose(bodies, outlines);
    assert.deepEqual(disposed, ['geometry', 'material']);
  } finally { dispose(bodies, outlines); }
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
    bodies.getMatrixAt(0, a); b.fromArray(outlines.geometry.getAttribute('aButterflyMatrix').array, 0);
    assert.ok(a.equals(b));
    const scale = new THREE.Vector3().setFromMatrixScale(a);
    assert.ok(Math.abs(scale.x - paradise.profiles[0].scale) < 1e-6);
    assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6);
  } finally { dispose(paradise.group); }
});
