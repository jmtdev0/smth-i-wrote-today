import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createHeavenButterflyShadows, heavenButterflyShadowStrength,
  NPC_SHADOW_FADE_HEIGHT, NPC_SHADOW_MAX_HEIGHT, NPC_SHADOW_CULL_RADIUS } from '../src/HeavenButterflyShadows.js';

function atHeight(x, z, height) {
  return new THREE.Vector3(x, meadowSurfaceHeight(x, z) + height, z);
}
function cleanup(t, paradise) {
  t.after(() => {
    paradise.dispose();
    const resources = new Set();
    for (const object of paradise.group.children) {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    }
    for (const resource of resources) resource.dispose();
  });
}

test('NPC shadows fade continuously with height above the actual meadow, on hills and after long travel', () => {
  for (const [x, z] of [[0, -255], [71, -191], [3021, -3169]]) {
    const center = atHeight(x, z, 3);
    assert.equal(heavenButterflyShadowStrength(atHeight(x, z, 2), center), 1);
    assert.equal(heavenButterflyShadowStrength(atHeight(x, z, NPC_SHADOW_FADE_HEIGHT), center), 1);
    const faded = heavenButterflyShadowStrength(atHeight(x, z, (NPC_SHADOW_FADE_HEIGHT + NPC_SHADOW_MAX_HEIGHT) / 2), center);
    assert.ok(faded > 0 && faded < 1);
    assert.equal(heavenButterflyShadowStrength(atHeight(x, z, NPC_SHADOW_MAX_HEIGHT), center), 0);
    assert.equal(heavenButterflyShadowStrength(atHeight(x, z, -1), center), 0);
    assert.equal(heavenButterflyShadowStrength(atHeight(x + 200, z, 3), center), 0);
    assert.equal(heavenButterflyShadowStrength(center, null), 0);
  }
});

test('local selection uses the landing point of the sun shadow, not just the caster centre', () => {
  const center = atHeight(0, -255, 3);
  assert.ok(heavenButterflyShadowStrength(atHeight(0, -295, 10), center) > 0,
    'an off-centre butterfly can cast into the local patch');
  assert.equal(heavenButterflyShadowStrength(atHeight(0, -193, 10), center), 0,
    'a nearby caster whose shadow falls beyond the patch is excluded');
});

test('expanded NPC shadows include distant low casters and high casters beyond the old broad cutoff', () => {
  const center = atHeight(0, -255, 3);
  assert.equal(NPC_SHADOW_MAX_HEIGHT, 36);
  assert.equal(NPC_SHADOW_FADE_HEIGHT, 12);
  assert.ok(NPC_SHADOW_CULL_RADIUS > 150 && NPC_SHADOW_CULL_RADIUS < 170);
  assert.equal(heavenButterflyShadowStrength(atHeight(42, -255, 3), center), 1,
    'a shadow beyond the former 28-unit visibility radius is retained');
  assert.ok(heavenButterflyShadowStrength(atHeight(0, -285, 24), center) > 0,
    'a butterfly higher than the former 18-unit ceiling can cast');
  const distant = atHeight(-28, -347, 34);
  assert.ok(Math.hypot(distant.x - center.x, distant.z - center.z) > 96);
  assert.ok(heavenButterflyShadowStrength(distant, center) > 0,
    'high off-centre casters must not be clipped by the old 96-unit broad phase');
});

test('compact NPC silhouettes reproduce every visible wing and body transform, including chirp and camera turns', t => {
  const paradise = createButterflyParadise(4);
  cleanup(t, paradise);
  const player = atHeight(0, -255, 3);
  paradise.profiles.forEach((p, i) => Object.assign(p, {
    x: i * 2, z: -255, y: meadowSurfaceHeight(i * 2, -255) + (i === 1 ? 3 : 50),
    orbit: 0, replyAt: .2,
  }));
  const proxies = paradise.group.getObjectByName('Nearby Heaven butterfly shadows').children;
  const sources = [0, 2, 4, 6, 8].map(index => paradise.group.children[index]);
  const visibleMatrix = new THREE.Matrix4(), shadowMatrix = new THREE.Matrix4();
  for (const time of [0, .4, .8, 4]) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, time * .2, -.1));
    paradise.update(time, quaternion, player, null, true);
    assert.equal(paradise.npcShadowCount, 1);
    for (let part = 0; part < sources.length; part++) {
      sources[part].getMatrixAt(1, visibleMatrix);
      proxies[part].getMatrixAt(0, shadowMatrix);
      assert.deepEqual(shadowMatrix, visibleMatrix);
      assert.equal(proxies[part].count, 1);
      assert.equal(proxies[part].geometry.getAttribute('aNpcShadowStrength').getX(0), 1);
    }
  }
});

test('NPC depth-only proxies exclude veins, preserve visible colors and clear when rising or leaving Heaven', t => {
  const paradise = createButterflyParadise(1);
  cleanup(t, paradise);
  const player = atHeight(0, -255, 3), p = paradise.profiles[0], q = new THREE.Quaternion();
  Object.assign(p, { x: 0, z: -255, y: player.y, orbit: 0 });
  const proxies = paradise.group.getObjectByName('Nearby Heaven butterfly shadows').children;
  assert.equal(proxies.length, 5, 'four wing fills plus the body/head, no outlines or halo');
  for (const proxy of proxies) {
    assert.equal(proxy.castShadow, true);
    assert.equal(proxy.material.colorWrite, false);
    assert.equal(proxy.material.depthWrite, false);
    assert.equal(proxy.customDepthMaterial.side, THREE.DoubleSide);
  }
  const wing = paradise.group.children[0], originalMaterial = wing.material;
  const before = new THREE.Color(), after = new THREE.Color();
  wing.getColorAt(0, before);
  paradise.update(0, q, player, null, true);
  assert.equal(paradise.npcShadowCount, 1);
  const buffers = proxies.map(proxy => proxy.instanceMatrix.array);
  p.y += NPC_SHADOW_MAX_HEIGHT + 1;
  paradise.update(.1, q, player, null, true);
  assert.equal(paradise.npcShadowCount, 0);
  assert.ok(proxies.every(proxy => proxy.count === 0));
  p.y = player.y;
  paradise.update(.2, q, player, null, true);
  assert.equal(paradise.npcShadowCount, 1);
  paradise.update(.3, q, player, null, false);
  assert.equal(paradise.npcShadowCount, 0);
  assert.ok(proxies.every(proxy => proxy.count === 0));
  assert.ok(proxies.every((proxy, i) => proxy.instanceMatrix.array === buffers[i]));
  wing.getColorAt(0, after);
  assert.ok(after.equals(before));
  assert.equal(wing.material, originalMaterial);
  assert.equal(wing.castShadow, false, 'the full 1400-instance swarm is not redrawn in the shadow pass');
});

test('NPC shadow depth shaders apply coverage fading and own/dispose their buffers without touching sources', () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  const shadows = createHeavenButterflyShadows([source], 2), proxy = shadows.meshes[0];
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader,
    fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  proxy.customDepthMaterial.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vNpcShadowStrength = aNpcShadowStrength/);
  assert.match(shader.fragmentShader, /if \(coverage >= vNpcShadowStrength\) discard/);
  assert.doesNotMatch(shader.fragmentShader, /uTime/);
  assert.notEqual(proxy.geometry, source.geometry);
  const disposed = new Set();
  const resources = [proxy, proxy.geometry, proxy.material, proxy.customDepthMaterial];
  for (const resource of [...resources, source.geometry, source.material]) {
    resource.addEventListener('dispose', () => disposed.add(resource));
  }
  shadows.dispose();
  assert.equal(disposed.size, resources.length);
  assert.ok(!disposed.has(source.geometry) && !disposed.has(source.material));
  source.geometry.dispose(); source.material.dispose();
});
