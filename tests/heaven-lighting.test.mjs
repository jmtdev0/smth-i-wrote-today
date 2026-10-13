import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeavenLighting, enableButterflyShadows, LOCAL_SHADOW_SIZE,
  LOCAL_SHADOW_RADIUS, LOCAL_SHADOW_FADE_START, LOCAL_SHADOW_FADE_END } from '../src/HeavenLighting.js';
import { createHeavenClouds, HEAVEN_SUN_DIRECTION } from '../src/HeavenClouds.js';
import { createButterfly } from '../src/Butterfly.js';
import { createMeadowLife } from '../src/MeadowLife.js';
import { createMeadowGrass } from '../src/MeadowGrass.js';

test('sun direction remains coherent during travel, with a bounded local shadow map', () => {
  const scene = new THREE.Scene(), renderer = { shadowMap: {} };
  const lighting = createHeavenLighting(scene, renderer);
  try {
    for (const position of [new THREE.Vector3(0, 0, -255), new THREE.Vector3(3021, 42, -4100)]) {
      lighting.update(position, true);
      const direction = lighting.sun.position.clone().sub(lighting.sun.target.position).normalize();
      assert.ok(direction.distanceTo(HEAVEN_SUN_DIRECTION) < 1e-12);
      assert.equal(lighting.sun.shadow.mapSize.x, LOCAL_SHADOW_SIZE);
      assert.equal(lighting.sun.shadow.autoUpdate, true);
    }
    lighting.update(new THREE.Vector3(0, 0, 873), false);
    assert.equal(lighting.sun.shadow.autoUpdate, false);
    assert.equal(lighting.sun.castShadow, true, 'fixed light layout prevents shader churn');
    assert.equal(renderer.shadowMap.type, THREE.PCFSoftShadowMap);
  } finally { lighting.dispose(); }
});

test('shadow casting preserves white translucent wings and excludes emitted light/line work', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  enableButterflyShadows(butterfly.group);
  let wings = 0;
  const resources = new Set();
  butterfly.group.traverse(object => {
    if (object.userData.visualRole === 'fill') {
      wings++; assert.equal(object.castShadow, true);
      assert.equal(object.material.isMeshBasicMaterial, true);
      assert.equal(object.material.opacity, .9);
      assert.equal(object.material.toneMapped, false);
    }
    if (object.name === 'butterfly chirp core') assert.equal(object.castShadow, false);
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
  });
  assert.equal(wings, 4);
  for (const resource of resources) resource.dispose();
});

test('expanded shadow receivers and the sun camera agree on a feathered 56-unit range', () => {
  const lighting = createHeavenLighting(new THREE.Scene(), { shadowMap: {} });
  const life = createMeadowLife();
  try {
    assert.equal(LOCAL_SHADOW_FADE_START, 44);
    assert.equal(LOCAL_SHADOW_FADE_END, 56);
    assert.ok(LOCAL_SHADOW_RADIUS > LOCAL_SHADOW_FADE_END);
    const camera = lighting.sun.shadow.camera;
    assert.equal(camera.left, -LOCAL_SHADOW_RADIUS);
    assert.equal(camera.right, LOCAL_SHADOW_RADIUS);
    assert.equal(camera.top, LOCAL_SHADOW_RADIUS);
    assert.equal(camera.bottom, -LOCAL_SHADOW_RADIUS);
    assert.equal(lighting.sun.shadow.mapSize.x, 2048, 'coverage expands without increasing GPU texture memory');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    life.material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes(`smoothstep(${LOCAL_SHADOW_FADE_START.toFixed(1)}, ${LOCAL_SHADOW_FADE_END.toFixed(1)}, distance(vMeadowWorld.xz, uMeadowShadowCenter))`));
    assert.ok(!shader.fragmentShader.includes('smoothstep(22., 28.,'));
  } finally { lighting.dispose(); life.material.dispose(); }
});

test('grass depth pass shares wind, terrain, view-camera LOD and rebasing with visible blades', () => {
  const clouds = createHeavenClouds(), life = createMeadowLife(clouds.uniforms);
  const grass = createMeadowGrass(life, 8);
  try {
    const visible = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    const depth = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
    grass.mesh.material.onBeforeCompile(visible); grass.mesh.customDepthMaterial.onBeforeCompile(depth);
    for (const uniform of ['uWingWind', 'uGrassCenter', 'uGrassViewPosition', 'uMeadowTime']) {
      assert.equal(visible.uniforms[uniform], depth.uniforms[uniform]);
    }
    for (const text of ['meadowSurfaceAt(root)', 'meadowWingWind(root)', 'distance(uGrassViewPosition', 'vMeadowWorld = (modelMatrix * mvPosition).xyz']) {
      assert.ok(visible.vertexShader.includes(text)); assert.ok(depth.vertexShader.includes(text));
    }
    assert.ok(visible.vertexShader.includes('worldPosition = vec4(vMeadowWorld, 1.)'));
    assert.ok(visible.fragmentShader.includes('reflectedLight.directDiffuse *= heavenSunVisibility'));
    assert.ok(!visible.fragmentShader.includes('outgoingLight *= 1. + clouds'));
    assert.ok(depth.vertexShader.includes('> 12.'));
    assert.equal(grass.mesh.receiveShadow, true); assert.equal(grass.mesh.castShadow, true);
  } finally {
    grass.mesh.dispose(); grass.mesh.geometry.dispose(); grass.mesh.material.dispose();
    grass.mesh.customDepthMaterial.dispose(); life.material.dispose(); clouds.dispose();
  }
});
