import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeavenClouds, heavenCloudsGLSL } from '../src/HeavenClouds.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';

test('clouds are sparse, deterministic and distributed above the horizon', () => {
  const first = createHeavenClouds(), second = createHeavenClouds();
  const shapes = first.uniforms.uCloudShapes.value;
  assert.equal(shapes.length, 7);
  shapes.forEach((shape, i) => {
    assert.ok(Math.abs(Math.hypot(shape.x, shape.y, shape.z) - 1) < 1e-12);
    assert.ok(shape.y > .2 && shape.y < .7);
    assert.ok(shape.w >= .13 && shape.w <= .2);
    assert.deepEqual(shape, second.uniforms.uCloudShapes.value[i]);
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    assert.ok(shapes.some(s => Math.sign(s.x) === sx && Math.sign(s.z) === sz));
  }
});

test('clouds fade in only in Heaven and obey the simulation pause and reset', () => {
  const clouds = createHeavenClouds(), { uCloudOpacity, uCloudTime } = clouds.uniforms;
  clouds.update(0, false);
  clouds.update(1 / 60, true);
  assert.ok(uCloudOpacity.value > 0 && uCloudOpacity.value < .03);
  for (let i = 2; i <= 180; i++) clouds.update(i / 60, true);
  assert.ok(uCloudOpacity.value > .98 && uCloudOpacity.value < 1);
  const paused = uCloudOpacity.value;
  clouds.update(3, true);
  assert.equal(uCloudOpacity.value, paused);
  assert.equal(uCloudTime.value, 3);
  clouds.update(4, false);
  assert.equal(uCloudOpacity.value, 0);
  clouds.update(5, true);
  clouds.reset();
  assert.equal(uCloudOpacity.value, 0);
  assert.equal(uCloudTime.value, 0);
});

test('cloud animation reuses its uniforms and sky anchors without per-frame allocation', () => {
  const clouds = createHeavenClouds(), uniforms = clouds.uniforms;
  const shapes = uniforms.uCloudShapes.value, anchors = shapes.map(s => s.toArray());
  for (let i = 0; i < 600; i++) clouds.update(i / 60, true);
  assert.equal(clouds.uniforms, uniforms);
  assert.equal(uniforms.uCloudShapes.value, shapes);
  assert.deepEqual(shapes.map(s => s.toArray()), anchors);
  assert.ok(heavenCloudsGLSL.includes('direction.y <= .015'));
  assert.ok(heavenCloudsGLSL.includes('uCloudTime * .002'));
});

test('clouds share the existing sky pass and stay behind video and image overlays', () => {
  const paradise = createButterflyParadise(0);
  try {
    const sky = paradise.group.getObjectByName('Clear Heaven sky');
    const { fragmentShader, uniforms } = sky.material;
    const camera = new THREE.PerspectiveCamera(48, 1.5, .1, 1580);
    paradise.update(0, camera.quaternion, null, camera, true);
    paradise.update(.05, camera.quaternion, null, camera, true);
    assert.ok(uniforms.uCloudOpacity.value > 0);
    const cloudPass = fragmentShader.indexOf('color = heavenClouds(color, d)');
    assert.ok(cloudPass > 0 && cloudPass < fragmentShader.indexOf('if (uVideoOpacity > 0.'));
    assert.ok(cloudPass < fragmentShader.indexOf('if (uImageOpacity > 0.'));
    const anchors = uniforms.uCloudShapes.value.map(s => s.toArray());
    camera.position.set(3500, 40, -5000);
    camera.rotation.y = Math.PI;
    paradise.update(.1, camera.quaternion, null, camera, true);
    assert.deepEqual(sky.position, camera.position);
    assert.deepEqual(uniforms.uCloudShapes.value.map(s => s.toArray()), anchors);
    assert.equal(sky.renderOrder, -10);
    assert.equal(sky.material.depthWrite, false);
    paradise.reset();
    assert.equal(uniforms.uCloudOpacity.value, 0);
  } finally {
    const resources = new Set();
    paradise.group.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) resources.add(o.geometry);
      if (o.material) resources.add(o.material);
    });
    for (const resource of resources) resource.dispose();
  }
});
