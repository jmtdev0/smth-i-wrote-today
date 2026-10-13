import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeavenClouds, cloudRenderSize, cloudDensityGLSL, cloudVolumeFragment,
  cloudShadowFragment, heavenCloudsGLSL, HEAVEN_SUN_DIRECTION, CLOUD_SHADOW_SIZE, CLOUD_SAMPLING,
  CLOUD_PATCH_SPACING, CLOUD_PATCH_RADIUS, CLOUD_PATCH_JITTER } from '../src/HeavenClouds.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';

function warm(clouds) {
  for (let i = 0; i <= 240; i++) clouds.update(i / 60, true);
}

test('sparse weather patches leave blue sky between clouds and never clip at cell seams', () => {
  const maximumCoverage = Math.PI * CLOUD_PATCH_RADIUS ** 2 / CLOUD_PATCH_SPACING ** 2;
  assert.ok(maximumCoverage < .12, 'even before empty cells, cloud patches occupy less than 12% of the layer');
  assert.ok(CLOUD_PATCH_RADIUS + CLOUD_PATCH_JITTER / 2 < CLOUD_PATCH_SPACING / 2,
    'every possible patch fits inside its world cell, with a clear gap to its neighbours');
  assert.ok(cloudDensityGLSL.includes('cloudPatchCoverage(p.xz)'));
  assert.ok(cloudVolumeFragment.includes(cloudDensityGLSL));
  assert.ok(cloudShadowFragment.includes(cloudDensityGLSL), 'sparse visible clouds and shadows use the same mask');
});

test('cloud volume and projected sunlight share one deterministic 3D density field', () => {
  const first = createHeavenClouds(), second = createHeavenClouds();
  try {
    assert.ok(first.uniforms.uCloudNoise.value.isData3DTexture);
    assert.deepEqual(first.uniforms.uCloudNoise.value.image.data, second.uniforms.uCloudNoise.value.image.data);
    assert.equal(first.uniforms.uCloudNoise.value.image.data.byteLength, 32 ** 3);
    assert.ok(cloudVolumeFragment.includes(cloudDensityGLSL));
    assert.ok(cloudShadowFragment.includes(cloudDensityGLSL));
    assert.ok(cloudVolumeFragment.includes('exp(-density * stepSize'));
    assert.ok(Math.abs(HEAVEN_SUN_DIRECTION.length() - 1) < 1e-12);
    assert.equal(first.shadow.width, CLOUD_SHADOW_SIZE);
    assert.equal(first.shadow.depthBuffer, false);
  } finally { first.dispose(); second.dispose(); }
});

test('clouds fade in only in Heaven and obey simulation pause and reset', () => {
  const clouds = createHeavenClouds(), { uCloudOpacity, uCloudTime, uCloudReady } = clouds.uniforms;
  try {
    clouds.update(0, false); clouds.update(1 / 60, true);
    assert.ok(uCloudOpacity.value > 0 && uCloudOpacity.value < .03);
    for (let i = 2; i <= 180; i++) clouds.update(i / 60, true);
    assert.ok(uCloudOpacity.value > .98 && uCloudOpacity.value < 1);
    const paused = uCloudOpacity.value;
    clouds.update(3, true);
    assert.equal(uCloudOpacity.value, paused); assert.equal(uCloudTime.value, 3);
    clouds.update(4, false);
    assert.equal(uCloudOpacity.value, 0); assert.equal(uCloudReady.value, 0);
    clouds.update(5, true); clouds.reset();
    assert.equal(uCloudOpacity.value, 0); assert.equal(uCloudTime.value, 0);
  } finally { clouds.dispose(); }
});

test('volume uniforms retain identity and follow the camera in world space', () => {
  const clouds = createHeavenClouds(), uniforms = clouds.uniforms;
  const camera = new THREE.PerspectiveCamera(48, 1.5);
  const noise = uniforms.uCloudNoise.value, data = noise.image.data;
  const position = uniforms.uCloudCamera.value, sun = uniforms.uSunDirection.value;
  try {
    camera.position.set(3500, 40, -5000); camera.rotation.set(-.3, 1.7, 0);
    for (let i = 0; i < 600; i++) clouds.update(i / 60, true, camera);
    assert.equal(clouds.uniforms, uniforms);
    assert.equal(uniforms.uCloudCamera.value, position);
    assert.deepEqual(position, camera.position);
    assert.equal(uniforms.uCloudNoise.value.image.data, data);
    assert.equal(uniforms.uSunDirection.value, sun);
    assert.deepEqual(sun, HEAVEN_SUN_DIRECTION);
    assert.ok(uniforms.uCloudForward.value.distanceTo(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)) < 1e-12);
  } finally { clouds.dispose(); }
});

test('adaptive volume has bounded render size and hysteresis, without affecting simulation', () => {
  for (const [w, h] of [[1, 1], [390, 844], [1920, 1080], [7680, 4320]]) {
    const [x, y] = cloudRenderSize(w, h);
    assert.ok(x >= 1 && y >= 1 && Math.max(x, y) <= 640);
    assert.ok(Math.max(...cloudRenderSize(w, h, 0)) <= 440);
  }
  const clouds = createHeavenClouds();
  try {
    warm(clouds);
    for (let i = 0; i < 100; i++) clouds.observeFrame(34);
    assert.equal(clouds.quality, 0);
    assert.equal(clouds.uniforms.uCloudSteps.value, 24);
    assert.equal(clouds.uniforms.uCloudMaxSteps.value, CLOUD_SAMPLING.low.maxSteps);
    assert.equal(clouds.uniforms.uCloudStepLength.value, CLOUD_SAMPLING.low.stepLength);
    for (let i = 0; i < 500; i++) clouds.observeFrame(16);
    assert.equal(clouds.quality, 0, 'no rapid quality oscillation');
    for (let i = 0; i < 110; i++) clouds.observeFrame(16);
    assert.equal(clouds.quality, 1);
    assert.equal(clouds.uniforms.uCloudSteps.value, CLOUD_SAMPLING.high.minSteps);
    assert.equal(clouds.uniforms.uCloudMaxSteps.value, CLOUD_SAMPLING.high.maxSteps);
    assert.equal(clouds.uniforms.uCloudStepLength.value, CLOUD_SAMPLING.high.stepLength);
    assert.equal(clouds.uniforms.uCloudTime.value, 4);
  } finally { clouds.dispose(); }
});

test('distant rays get a larger bounded sampling budget without per-pixel random offsets', () => {
  for (const sampling of Object.values(CLOUD_SAMPLING)) {
    assert.ok(sampling.minSteps > 0 && sampling.stepLength > 0);
    assert.ok(sampling.maxSteps > sampling.minSteps && sampling.maxSteps <= 128);
    assert.ok(210 / sampling.stepLength < sampling.minSteps, 'vertical rays retain the cheap minimum');
    assert.ok(3000 / sampling.maxSteps < 3000 / sampling.minSteps / 3,
      'shallow rays have more than triple the sampling density of the old fixed budget');
  }
  assert.match(cloudVolumeFragment, /ceil\(\(end - start\) \/ uCloudStepLength\)/);
  assert.match(cloudVolumeFragment, /float\(uCloudSteps\), float\(uCloudMaxSteps\)/);
  assert.match(cloudVolumeFragment, /i >= stepCount/);
  assert.ok(cloudVolumeFragment.includes(`i < ${CLOUD_SAMPLING.high.maxSteps}`));
  assert.match(cloudVolumeFragment, /start \+ \(float\(i\) \+ \.5\) \* stepSize/);
  assert.doesNotMatch(cloudVolumeFragment, /gl_FragCoord|float jitter/);
});

test('unresolvable density detail is filtered before integration; reconstruction preserves premultiplied alpha', () => {
  assert.match(cloudVolumeFragment, /max\(distanceAlongRay \* pixelCone, stepSize \* \.5\)/);
  assert.match(cloudVolumeFragment, /cloudDensityFiltered\(p, footprint\)/);
  assert.equal((cloudVolumeFragment.match(/uSunDirection \* \d+\., footprint/g) || []).length, 3,
    'sunlight uses the same filtered detail as the visible volume');
  assert.match(cloudDensityGLSL, /float fineWeight = 1\. - smoothstep\(6\., 22\., footprint\)/);
  assert.match(cloudDensityGLSL, /cloudDensity\(vec3 p\) \{ return cloudDensityFiltered\(p, 0\.\); \}/,
    'world-space shadows remain independent of the camera footprint');
  assert.match(heavenCloudsGLSL, /vec2 texel = \.65 \/ uCloudRenderSize/);
  const weights = [...heavenCloudsGLSL.matchAll(/texture2D\(uCloudVolume,[^;]+?\* (\.[0-9]+);/g)]
    .map(match => Number(match[1]));
  assert.deepEqual(weights, [.4, .15, .15, .15, .15]);
  assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
  assert.match(heavenCloudsGLSL, /skyColor \* \(1\. - cloud\.a\) \+ cloud\.rgb/);
});

function fakeRenderer() {
  return {
    target: null, autoClear: false, shadowMap: { autoUpdate: true }, scissors: true,
    viewport: new THREE.Vector4(3, 4, 1280, 720), scissor: new THREE.Vector4(8, 9, 600, 400),
    draws: [], fail: false,
    getDrawingBufferSize(v) { return v.set(1280, 720); },
    getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
    getViewport(v) { return v.copy(this.viewport); }, setViewport(v) { this.viewport.copy(v); },
    getScissor(v) { return v.copy(this.scissor); }, setScissor(v) { this.scissor.copy(v); },
    getScissorTest() { return this.scissors; }, setScissorTest(v) { this.scissors = v; },
    render(scene) {
      if (this.fail) throw new Error('simulated GPU failure');
      this.draws.push({ target: this.target, fragment: scene.children[0].material.fragmentShader });
    },
  };
}

test('cloud footprint and reconstruction track the real render target after resize and quality changes', () => {
  const clouds = createHeavenClouds(), renderer = fakeRenderer();
  const renderSize = clouds.uniforms.uCloudRenderSize.value;
  try {
    warm(clouds);
    for (const [width, height, milliseconds] of [[1280, 720, 16], [7680, 4320, 34], [390, 844, 16]]) {
      renderer.getDrawingBufferSize = v => v.set(width, height);
      for (let i = 0; i < 610; i++) clouds.observeFrame(milliseconds);
      clouds.render(renderer);
      const expected = cloudRenderSize(width, height, clouds.quality);
      assert.deepEqual([clouds.target.width, clouds.target.height], expected);
      assert.deepEqual(renderSize.toArray(), expected);
      assert.equal(clouds.uniforms.uCloudRenderSize.value, renderSize);
      assert.deepEqual(clouds.uniforms.uCloudViewport.value.toArray(), [width, height]);
    }
  } finally { clouds.dispose(); }
});

test('offscreen passes restore renderer state; shadows are throttled and invalidate on travel/reset', () => {
  const clouds = createHeavenClouds(), renderer = fakeRenderer();
  const original = { viewport: renderer.viewport.clone(), scissor: renderer.scissor.clone() };
  try {
    clouds.render(renderer); assert.equal(renderer.draws.length, 0, 'no cloud work inside tunnel');
    warm(clouds); clouds.render(renderer);
    assert.equal(renderer.draws.length, 2);
    assert.equal(renderer.draws[0].target, clouds.shadow);
    assert.equal(renderer.draws[1].target, clouds.target);
    assert.equal(clouds.uniforms.uCloudReady.value, 1);
    clouds.render(renderer);
    assert.equal(renderer.draws.length, 3, 'paused cloud shadow reused');
    clouds.update(4.2, true); clouds.render(renderer);
    assert.equal(renderer.draws.length, 5);
    clouds.uniforms.uCloudCamera.value.x = 3000; clouds.render(renderer);
    assert.equal(renderer.draws.length, 7, 'fresh coverage immediately after travel');
    clouds.reset(); clouds.update(0, true); clouds.update(.05, true); clouds.render(renderer);
    assert.equal(renderer.draws.length, 9);
    renderer.fail = true;
    assert.throws(() => clouds.render(renderer), /simulated GPU failure/);
    assert.equal(renderer.target, null);
    assert.equal(renderer.autoClear, false);
    assert.equal(renderer.shadowMap.autoUpdate, true);
    assert.equal(renderer.scissors, true);
    assert.deepEqual(renderer.viewport, original.viewport);
    assert.deepEqual(renderer.scissor, original.scissor);
  } finally { clouds.dispose(); }
});

test('clouds composite behind video and apparition, and the sky follows the camera', () => {
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
    camera.position.set(3500, 40, -5000); camera.rotation.y = Math.PI;
    paradise.update(.1, camera.quaternion, null, camera, true);
    assert.deepEqual(sky.position, camera.position);
    assert.deepEqual(uniforms.uCloudCamera.value, camera.position);
    assert.equal(sky.renderOrder, -10); assert.equal(sky.material.depthWrite, false);
    paradise.reset(); assert.equal(uniforms.uCloudOpacity.value, 0);
  } finally {
    paradise.dispose();
    const resources = new Set();
    paradise.group.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry) resources.add(o.geometry);
      if (o.material) resources.add(o.material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('volume prewarming compiles both offscreen variants and restores the caller target', async () => {
  const clouds = createHeavenClouds(), renderer = fakeRenderer(), compiled = [];
  const original = new THREE.WebGLRenderTarget(2, 2);
  renderer.target = original;
  renderer.compileAsync = async scene => {
    assert.equal(renderer.target, clouds.target);
    compiled.push(scene.children[0].material.fragmentShader);
  };
  try {
    await clouds.prepare(renderer);
    assert.deepEqual(compiled, [cloudVolumeFragment, cloudShadowFragment]);
    assert.equal(renderer.target, original);
    assert.equal(clouds.uniforms.uCloudReady.value, 0, 'compilation is not a rendered frame');
  } finally { clouds.dispose(); original.dispose(); }
});

test('offscreen textures and targets are disposed on scene teardown', () => {
  const clouds = createHeavenClouds(), disposed = new Set();
  for (const resource of [clouds.target, clouds.shadow, clouds.uniforms.uCloudNoise.value]) {
    resource.addEventListener('dispose', () => disposed.add(resource));
  }
  clouds.dispose();
  assert.equal(disposed.size, 3);
});
