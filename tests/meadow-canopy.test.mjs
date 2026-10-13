import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMeadowCanopy, CANOPY_LAYERS, CANOPY_HEIGHT } from '../src/MeadowCanopy.js';
import { createMeadowLife } from '../src/MeadowLife.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { MEADOW_PREPARE_START_Z } from '../src/MeadowArrival.js';

test('the grass volume covers the same complete terrain after long journeys, including behind the player', () => {
  const paradise=createButterflyParadise(0), camera=new THREE.PerspectiveCamera();
  const terrain=paradise.group.getObjectByName('Endless Heaven meadow');
  const canopy=paradise.group.getObjectByName('Continuous meadow grass canopy');
  try {
    assert.equal(canopy.geometry,terrain.geometry);
    assert.equal(canopy.count,CANOPY_LAYERS);
    const snapshot=canopy.instanceMatrix.array.slice();
    for(const player of [new THREE.Vector3(0,0,-255),new THREE.Vector3(2400,0,1800)]) {
      camera.position.copy(player);
      paradise.update(0,camera.quaternion,player,camera,false);
      assert.equal(canopy.visible,player.z < MEADOW_PREPARE_START_Z,'exterior grass is already ready from limbo onwards');
      paradise.update(5,camera.quaternion,player,camera,true);
      paradise.update(9,camera.quaternion,player,camera,true);
      assert.equal(canopy.visible,true);
      const bounds=canopy.geometry.boundingBox;
      for(const axis of ['x','z']) {
        assert.ok(player[axis]-bounds.min[axis]>1000);
        assert.ok(bounds.max[axis]-player[axis]>1000);
      }
      assert.deepEqual(canopy.instanceMatrix.array,snapshot);
    }
  } finally {
    const resources=new Set();
    paradise.group.traverse(o=>{if(o.isInstancedMesh)resources.add(o);if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
    for(const resource of resources)resource.dispose();
  }
});

test('canopy has ordered volume slices and shares the meadow wind clock and chirp colors', () => {
  const geometry=new THREE.PlaneGeometry(20,20), life=createMeadowLife();
  const canopy=createMeadowCanopy(geometry,life), matrix=new THREE.Matrix4();
  try {
    for(let i=0;i<CANOPY_LAYERS;i++) {
      canopy.mesh.getMatrixAt(i,matrix);
      assert.ok(Math.abs(matrix.elements[13]-(i+1)/CANOPY_LAYERS*CANOPY_HEIGHT)<1e-6);
    }
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    canopy.mesh.material.onBeforeCompile(shader);
    for(const name of ['uMeadowTime','uMeadowPulses','uMeadowColors','uMeadowLife'])assert.equal(shader.uniforms[name],life.uniforms[name]);
    assert.equal(canopy.mesh.material.transparent,true);
    assert.equal(canopy.mesh.material.forceSinglePass,true);
    assert.equal(canopy.mesh.material.depthWrite,true);
  } finally {canopy.mesh.dispose();geometry.dispose();canopy.mesh.material.dispose();life.material.dispose();}
});

test('canopy resolves roots across cell edges, warps both scales and keeps derivative filtering', () => {
  const geometry=new THREE.PlaneGeometry(20,20), life=createMeadowLife();
  const canopy=createMeadowCanopy(geometry,life);
  try {
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    canopy.mesh.material.onBeforeCompile(shader);
    const fragment=shader.fragmentShader;
    assert.ok(fragment.includes('canopyWarp(vMeadowWorld.xz)'),'distribution anchored in world space');
    assert.ok(fragment.includes('canopyRoot(fibers)'));
    assert.ok(fragment.includes('for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)'));
    assert.ok(fragment.includes('vec2 tuftRoot = warpedRoot - bend * .5;'),'coarse strokes must not retain straight rows');
    assert.ok(fragment.includes('dFdx(fibers)') && fragment.includes('dFdy(fibers)'));
    assert.ok(fragment.includes('mix(coverage, averageCoverage, filtered)'));
    assert.ok(!fragment.includes('fract(fibers) - center'),'no clipped regular-cell masks');
    assert.equal(canopy.mesh.count,16,'do not add volume layers to conceal the grid');
  } finally {canopy.mesh.dispose();geometry.dispose();canopy.mesh.material.dispose();life.material.dispose();}
});
