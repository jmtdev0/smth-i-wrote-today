import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMeadowLife, MEADOW_PULSE_COUNT } from '../src/MeadowLife.js';
import { arrangeChoreography, heavenFlightPosition } from '../src/HeavenChoreography.js';

test('meadow rings snapshot acquired color and world origin, remain bounded and reset cleanly', () => {
  const life = createMeadowLife();
  try {
    const position = new THREE.Vector3(25, 100, -300), color = new THREE.Color('#ffbbdc');
    life.update(0, true); life.update(4, true);
    assert.equal(life.uniforms.uMeadowLife.value, 1);
    const version = life.material.version;
    life.pulse(4, position, color, 1);
    position.set(2000, 0, 2000); color.set('#ffffff');
    assert.deepEqual(life.uniforms.uMeadowPulses.value[0].toArray(), [25, -300, 4, 1]);
    assert.equal(life.uniforms.uMeadowColors.value[0].getHexString(), 'ffbbdc');
    const pool = [...life.uniforms.uMeadowPulses.value];
    for (let i = 0; i < 100; i++) life.pulse(5 + i * .12, position, color, i % 2 ? -1 : 2);
    assert.equal(life.uniforms.uMeadowPulses.value.length, MEADOW_PULSE_COUNT);
    assert.ok(pool.every((entry, i) => life.uniforms.uMeadowPulses.value[i] === entry));
    assert.ok(pool.every(entry => entry.w >= .35 && entry.w <= 1));
    assert.equal(life.material.version, version, 'chirps do not rebuild the ground shader');
    life.update(30, false);
    assert.equal(life.uniforms.uMeadowLife.value, 0);
    assert.ok(pool.every(entry => entry.w === 0));
  } finally { life.material.dispose(); }
});

test('choreographies affect only a subset, share nearby anchors, stay slow and cross cycles continuously', () => {
  const profiles = Array.from({ length: 48 }, (_, i) => ({
    x: i * 25, y: 0, z: -250 - i * 20, orbit: 3 + i % 9, speed: .13 + i % 4 * .05, phase: i * .79,
  }));
  arrangeChoreography(profiles);
  const dancers = profiles.filter(p => p.dance);
  assert.equal(dancers.length, 10);
  assert.equal(profiles[0].x, profiles[1].x);
  assert.equal(profiles[12].z, profiles[14].z);
  const previous = new THREE.Vector3(), current = new THREE.Vector3();
  for (const p of dancers) {
    heavenFlightPosition(p, 0, previous);
    for (let step = 1; step <= 2400; step++) {
      heavenFlightPosition(p, step / 20, current);
      assert.ok(current.distanceTo(previous) * 20 < 5, 'no racing or snapping between formations');
      previous.copy(current);
    }
  }
  const a = heavenFlightPosition(profiles[0], 12, new THREE.Vector3());
  const b = heavenFlightPosition(profiles[1], 12, new THREE.Vector3());
  assert.ok(a.distanceTo(b) > 2 && a.distanceTo(b) < 5, 'paired butterflies keep distinct trajectories');
});
