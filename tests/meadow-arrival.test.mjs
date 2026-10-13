import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { meadowReadiness, MEADOW_PREPARE_START_Z, MEADOW_PREPARE_READY_Z,
  MEADOW_EXTERIOR_EDGE_Z } from '../src/MeadowArrival.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createTunnelWorld, TUNNEL_FADE_EXIT_Z, TUNNEL_FADE_SECONDS } from '../src/TunnelWorld.js';
import { createMeadowLife } from '../src/MeadowLife.js';
import { createMeadowGrass, createMiddleMeadowGrass, createFarMeadowGrass } from '../src/MeadowGrass.js';
import { createMeadowCanopy } from '../src/MeadowCanopy.js';

const shaderFor = material => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
};

function fixture(t) {
  const paradise = createButterflyParadise(0), tunnel = createTunnelWorld();
  const player = new THREE.Vector3(0, 0, 800), camera = new THREE.PerspectiveCamera();
  const grass = paradise.group.children.filter(o => /meadow grass/i.test(o.name));
  const tick = (time, z) => {
    player.z = z; camera.position.copy(player);
    tunnel.update(time, player);
    paradise.update(time, camera.quaternion, player, camera, !tunnel.solid);
  };
  t.after(() => {
    paradise.dispose();
    const resources = new Set();
    for (const group of [paradise.group, tunnel.group]) group.traverse(o => {
      if (o.isInstancedMesh) resources.add(o);
      if (o.geometry) resources.add(o.geometry);
      if (o.material) resources.add(o.material);
    });
    for (const resource of resources) resource.dispose();
  });
  return { paradise, tunnel, grass, player, camera, tick };
}

test('grass readiness is smooth, complete before the first mist layer and independent of elapsed time', () => {
  assert.equal(meadowReadiness(800, false), 0);
  assert.equal(meadowReadiness(undefined, false), 0);
  assert.equal(meadowReadiness(MEADOW_PREPARE_START_Z, false), 0);
  let previous = 0;
  for (let step = 0; step <= 100; step++) {
    const z = THREE.MathUtils.lerp(MEADOW_PREPARE_START_Z, MEADOW_PREPARE_READY_Z, step / 100);
    const readiness = meadowReadiness(z, false);
    assert.ok(readiness >= previous && readiness <= 1);
    assert.ok(readiness - previous < .02);
    previous = readiness;
  }
  assert.equal(previous, 1);
  assert.equal(meadowReadiness(800, true), 1, 'old tunnel space stays grassy in Heaven');
});

test('all grass tiers are already complete in limbo and never restart at tunnel removal', t => {
  const f = fixture(t);
  f.tick(0, 800);
  assert.equal(f.grass.length, 4);
  assert.ok(f.grass.every(mesh => !mesh.visible));
  const buffers = f.grass.map(mesh => mesh.instanceMatrix.array);
  const versions = f.grass.map(mesh => mesh.material.version);
  f.tick(1, (MEADOW_PREPARE_START_Z + MEADOW_PREPARE_READY_Z) / 2);
  assert.equal(f.tunnel.solid, true);
  assert.equal(f.paradise.grassReadiness, .5);
  assert.ok(f.grass.every(mesh => mesh.visible));
  f.tick(1.1, MEADOW_PREPARE_READY_Z);
  assert.equal(f.tunnel.visibility, 1, 'ready before tunnel fade starts, even on fast entry');
  assert.equal(f.paradise.grassReadiness, 1);
  const ground = f.paradise.group.getObjectByName('Endless Heaven meadow');
  assert.ok(ground.geometry.boundingBox.max.z <= MEADOW_EXTERIOR_EDGE_Z);
  f.tick(2, TUNNEL_FADE_EXIT_Z - 1);
  for (const time of [2, 2.5, 3.5, 2 + TUNNEL_FADE_SECONDS - .001, 2 + TUNNEL_FADE_SECONDS, 10]) {
    f.tick(time, TUNNEL_FADE_EXIT_Z - 1);
    assert.equal(f.paradise.grassReadiness, 1, 'no second grass entrance after clearing the fog');
    assert.ok(f.grass.every(mesh => mesh.visible));
    f.grass.forEach((mesh, i) => {
      assert.equal(mesh.instanceMatrix.array, buffers[i]);
      assert.equal(mesh.material.version, versions[i], 'uniforms only, no new material variant');
    });
  }
  assert.equal(f.tunnel.solid, false);
});

test('backing out of limbo, pausing and resetting do not leave stale readiness', t => {
  const f = fixture(t), middle = (MEADOW_PREPARE_START_Z + MEADOW_PREPARE_READY_Z) / 2;
  f.tick(0, 800); f.tick(1, MEADOW_PREPARE_READY_Z);
  f.tick(1, middle);
  assert.equal(f.paradise.grassReadiness, .5);
  f.tick(1, middle);
  assert.equal(f.paradise.grassReadiness, .5, 'pause is stable');
  f.tick(2, 800);
  assert.equal(f.paradise.grassReadiness, 0);
  assert.ok(f.grass.every(mesh => !mesh.visible));
  f.tunnel.reset(); f.paradise.reset();
  f.tick(0, 800);
  assert.equal(f.paradise.grassReadiness, 0);
});

test('a direct Heaven start has full grass on the first frame, including behind the former tunnel', t => {
  const f = fixture(t);
  f.tick(0, -255);
  assert.equal(f.tunnel.solid, false);
  assert.equal(f.paradise.grassReadiness, 1);
  assert.ok(f.grass.every(mesh => mesh.visible));
  f.tick(1, 800);
  assert.equal(f.paradise.grassReadiness, 1);
  assert.ok(f.grass.every(mesh => mesh.visible));
});

test('near, middle and far blades share exterior clipping, including the near shadow shader', () => {
  const life = createMeadowLife();
  const fields = [createMeadowGrass(life), createMiddleMeadowGrass(life), createFarMeadowGrass(life)];
  try {
    for (const field of fields) {
      field.update(new THREE.Vector3(0, 0, -170), true, null, false);
      assert.equal(field.uniforms.uGrassExteriorOnly.value, 1);
      const shader = shaderFor(field.mesh.material);
      assert.equal(shader.uniforms.uGrassExteriorOnly, field.uniforms.uGrassExteriorOnly);
      assert.ok(shader.vertexShader.includes(`root.y > ${MEADOW_EXTERIOR_EDGE_Z.toFixed(1)}`));
      assert.ok(shader.vertexShader.includes('gl_Position = vec4(2., 2., 2., 1.)'));
      if (field.mesh.customDepthMaterial) {
        const depth = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader,
          fragmentShader: THREE.ShaderLib.depth.fragmentShader };
        field.mesh.customDepthMaterial.onBeforeCompile(depth);
        assert.ok(depth.vertexShader.includes(`root.y > ${MEADOW_EXTERIOR_EDGE_Z.toFixed(1)}`));
      }
      field.update(new THREE.Vector3(0, 0, 800), true, null, true);
      assert.equal(field.uniforms.uGrassExteriorOnly.value, 0);
    }
  } finally {
    for (const field of fields) {
      field.mesh.dispose(); field.mesh.geometry.dispose(); field.mesh.material.dispose();
      field.mesh.customDepthMaterial?.dispose();
    }
    life.material.dispose();
  }
});

test('canopy readiness fades its coverage and color as well as height', () => {
  const life = createMeadowLife(), geometry = new THREE.PlaneGeometry(20, 20);
  const canopy = createMeadowCanopy(geometry, life);
  try {
    const shader = shaderFor(canopy.mesh.material);
    assert.ok(shader.fragmentShader.includes('diffuseColor.a *= coverage * uMeadowLife'));
    assert.ok(shader.fragmentShader.includes('mix(ground, grass * mix(.77, 1.08, vCanopyLevel), uMeadowLife)'));
    life.update(0, true, null, 0, .5);
    assert.equal(shader.uniforms.uMeadowLife.value, .5);
    life.update(0, true, null, 0, 1);
    assert.equal(shader.uniforms.uMeadowLife.value, 1);
  } finally { canopy.mesh.dispose(); geometry.dispose(); canopy.mesh.material.dispose(); life.material.dispose(); }
});
