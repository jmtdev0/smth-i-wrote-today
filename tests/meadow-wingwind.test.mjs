import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createMeadowWingWind, WING_WIND_RADIUS, WING_WIND_MAX_HEIGHT } from '../src/MeadowWingWind.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createMeadowLife } from '../src/MeadowLife.js';
import { createMeadowGrass } from '../src/MeadowGrass.js';
import { createMeadowCanopy } from '../src/MeadowCanopy.js';

function disposeButterfly(butterfly) {
  const resources = new Set();
  butterfly.group.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  for (const resource of resources) resource.dispose();
}

test('wing pressure follows the actual downstroke in both hovering and flight', () => {
  const butterfly = createButterfly();
  try {
    const wing = butterfly.group.getObjectByName('right wings');
    for (const moving of [false, true]) {
      const frequency = moving ? 10 : 5, amplitude = moving ? .52 : .24;
      for (const phase of [0, .6, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) {
        butterfly.update(phase / frequency, moving);
        assert.ok(Math.abs(wing.rotation.y - (.16 + Math.sin(phase) * amplitude)) < 1e-12);
        assert.ok(Math.abs(butterfly.wingbeatStrength
          - Math.max(0, Math.cos(phase)) ** 2 * (moving ? 1 : .25)) < 1e-12);
      }
    }
  } finally { disposeButterfly(butterfly); }
});

test('pressure fades with height above the real terrain, not absolute world altitude', () => {
  for (const [x, z] of [[0, -255], [67, -400], [2400, -3300]]) {
    const samples = [];
    for (const height of [2, 5, WING_WIND_MAX_HEIGHT, 40]) {
      const wind = createMeadowWingWind();
      const player = new THREE.Vector3(x, meadowSurfaceHeight(x, z) + height, z);
      for (let i = 0; i <= 120; i++) wind.update(i / 60, player, 1);
      samples.push(wind.uniform.value.w);
      assert.equal(wind.uniform.value.x, x);
      assert.equal(wind.uniform.value.y, z);
      assert.equal(wind.uniform.value.z, WING_WIND_RADIUS);
    }
    assert.ok(samples[0] > .99);
    assert.ok(samples[1] > .3 && samples[1] < .9);
    assert.equal(samples[2], 0);
    assert.equal(samples[3], 0);
  }
});

test('grass relaxes between beats, freezes with the scene, and resets without a residual gust', () => {
  const wind = createMeadowWingWind(), uniform = wind.uniform, value = uniform.value;
  const player = new THREE.Vector3(0, meadowSurfaceHeight(0, -255) + 2, -255);
  wind.update(0, player, 1);
  wind.update(1 / 60, player, 1);
  assert.ok(value.w > .15 && value.w < .2, 'a downstroke must ease in rather than snap');
  for (let i = 2; i <= 30; i++) wind.update(i / 60, player, 1);
  const peak = value.w;
  assert.ok(peak > .99);
  wind.update(.5, player, 0);
  assert.equal(value.w, peak, 'pausing the clock cannot change the bend');
  wind.update(.5 + 1 / 60, player, 0);
  assert.ok(value.w > peak * .9 && value.w < peak * .93, 'recovery is gentle, not instantaneous');
  for (let i = 32; i <= 180; i++) wind.update(i / 60, player, 0);
  assert.ok(value.w < .0001);
  wind.update(3, player, NaN);
  assert.ok(Number.isFinite(value.w));
  wind.reset();
  assert.equal(value.w, 0);
  assert.equal(wind.uniform, uniform);
  assert.equal(wind.uniform.value, value, 'no per-frame uniform allocations');
});

test('real hovering wingbeats produce repeated smooth pressure pulses', () => {
  const butterfly = createButterfly(), wind = createMeadowWingWind();
  const player = new THREE.Vector3(0, meadowSurfaceHeight(0, -255) + 2, -255);
  const pressures = [];
  try {
    for (let i = 0; i < 600; i++) {
      butterfly.update(i / 60, false);
      wind.update(i / 60, player, butterfly.wingbeatStrength);
      pressures.push(wind.uniform.value.w);
    }
    assert.ok(Math.max(...pressures) > .2 && Math.max(...pressures) < .24);
    assert.ok(Math.min(...pressures.slice(60)) < .03);
    for (let i = 1; i < pressures.length; i++) assert.ok(Math.abs(pressures[i] - pressures[i - 1]) < .05);
  } finally { disposeButterfly(butterfly); }
});

test('stopping flight eases into the lighter hovering breeze without an abrupt drop', () => {
  const butterfly = createButterfly(), wind = createMeadowWingWind();
  const player = new THREE.Vector3(0, meadowSurfaceHeight(0, -255) + 2, -255);
  try {
    for (let i = 0; i <= 75; i++) {
      butterfly.update(i / 60, true);
      wind.update(i / 60, player, butterfly.wingbeatStrength);
    }
    const movingPressure = wind.uniform.value.w;
    assert.ok(movingPressure > .5, 'moving flight keeps its stronger breeze');
    butterfly.update(76 / 60, false);
    wind.update(76 / 60, player, butterfly.wingbeatStrength);
    assert.ok(wind.uniform.value.w < movingPressure);
    assert.ok(wind.uniform.value.w > movingPressure * .9, 'pressure cannot snap to the hover level');
    for (let i = 77; i <= 240; i++) {
      butterfly.update(i / 60, false);
      wind.update(i / 60, player, butterfly.wingbeatStrength);
      if (i >= 180) assert.ok(wind.uniform.value.w < .24);
    }
  } finally { disposeButterfly(butterfly); }
});

test('all grass tiers share local wing wind without moving roots, rebuilding materials or adding geometry', () => {
  const life = createMeadowLife(), geometry = new THREE.PlaneGeometry(20, 20);
  const tiers = [createMeadowGrass(life, 8), createMeadowGrass(life, 8, { middle: true }),
    createMeadowGrass(life, 8, { far: true }), createMeadowCanopy(geometry, life)];
  try {
    const buffers = tiers.map(t => t.mesh.instanceMatrix.array.slice());
    const versions = tiers.map(t => t.mesh.material.version);
    for (const [index, tier] of tiers.entries()) {
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
      tier.mesh.material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.uWingWind, life.uniforms.uWingWind);
      const source = index < 3 ? shader.vertexShader : shader.fragmentShader;
      assert.ok(source.includes('falloff * falloff'));
      assert.ok(source.includes('distanceSquared >= radiusSquared'));
      assert.ok(source.includes(index < 3 ? 'bend += meadowWingWind(root)' : 'bend += meadowWingWind(vMeadowWorld.xz)'));
      if (index < 3) assert.ok(source.includes('bend * height * height'), 'a root at zero height must remain fixed');
    }
    const player = new THREE.Vector3(0, meadowSurfaceHeight(0, -255) + 2, -255);
    for (let i = 0; i < 60; i++) life.update(i / 60, true, player, .55);
    assert.ok(life.uniforms.uWingWind.value.w > .5);
    tiers.forEach((tier, i) => {
      assert.deepEqual(tier.mesh.instanceMatrix.array, buffers[i]);
      assert.equal(tier.mesh.material.version, versions[i]);
    });
    life.update(2, false, player, 1);
    assert.equal(life.uniforms.uWingWind.value.w, 0, 'no downwash in the tunnel or after reset');
    life.update(3, true);
    life.update(4, true);
    assert.equal(life.uniforms.uWingWind.value.w, 0, 'no player source means no artificial flapping');
  } finally {
    for (const tier of tiers) { tier.mesh.dispose(); tier.mesh.geometry.dispose(); tier.mesh.material.dispose(); }
    life.material.dispose();
  }
});
