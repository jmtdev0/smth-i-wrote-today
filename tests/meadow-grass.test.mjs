import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMeadowGrass, createMiddleMeadowGrass, grassRootPosition, GRASS_COUNT, GRASS_SPAN, GRASS_HEIGHT_MIN, GRASS_HEIGHT_MAX, MIDDLE_GRASS_COUNT, MIDDLE_GRASS_SPAN, MIDDLE_GRASS_FADE } from '../src/MeadowGrass.js';
import { createMeadowLife } from '../src/MeadowLife.js';
import { meadowHeight, meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createFarMeadowGrass, FAR_GRASS_COUNT, FAR_GRASS_SPAN, FAR_GRASS_FADE } from '../src/MeadowGrass.js';

test('grass roots match the rendered terrain triangles, including negative and distant coordinates', () => {
  for (const [x0,z0] of [[0,0],[-40,-280],[2400,-3300]]) {
    const geometry = new THREE.PlaneGeometry(20,20,1,1);
    geometry.rotateX(-Math.PI/2);
    const vertices = geometry.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i)+x0+10,z=vertices.getZ(i)+z0+10;
      vertices.setXYZ(i,x,meadowHeight(x,z),z);
    }
    const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    const ray = new THREE.Raycaster();
    for(const [u,v] of [[.1,.2],[.8,.9],[.65,.15],[.3,.85]]) {
      const x=x0+u*20,z=z0+v*20;
      ray.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(mesh)[0];
      assert.ok(hit);
      assert.ok(Math.abs(hit.point.y-meadowSurfaceHeight(x,z))<.0001);
    }
    geometry.dispose(); mesh.material.dispose();
  }
});

test('moving the local grass field keeps nearby roots anchored and recycles only beyond the faded edge', () => {
  const first=grassRootPosition(5,-30,0,0);
  const moved=grassRootPosition(5,-30,17.3,-4.7);
  assert.ok(Math.abs(first.x-moved.x)<1e-10 && Math.abs(first.z-moved.z)<1e-10);
  for(const center of [-1000,-80,-.1,0,17,1000]) {
    const root=grassRootPosition(5,-30,center,center);
    assert.ok(Math.abs(root.x-center)<=GRASS_SPAN/2 && Math.abs(root.z-center)<=GRASS_SPAN/2);
  }
});

test('grass uses one fixed instance buffer and shares meadow lighting and chirp uniforms', () => {
  const life=createMeadowLife(), grass=createMeadowGrass(life);
  try {
    assert.equal(grass.mesh.count,GRASS_COUNT);
    const buffer=grass.mesh.instanceMatrix.array, snapshot=buffer.slice();
    grass.update(new THREE.Vector3(0,0,-250),true);
    grass.update(new THREE.Vector3(2500,0,800),true);
    assert.deepEqual(buffer,snapshot);
    assert.equal(grass.uniforms.uGrassEnabled.value,1);
    grass.update(new THREE.Vector3(),false);
    assert.equal(grass.uniforms.uGrassEnabled.value,0);
    assert.equal(grass.mesh.visible,false);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    grass.mesh.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uMeadowPulses,life.uniforms.uMeadowPulses);
    assert.equal(shader.uniforms.uMeadowTime,life.uniforms.uMeadowTime);
    assert.ok(shader.vertexShader.includes('height * height * vGrassFade'));
  } finally { grass.mesh.dispose();grass.mesh.geometry.dispose();grass.mesh.material.dispose();life.material.dispose(); }
});

test('Flower-inspired grass is tall, dense, pointed and has a bounded geometry budget', () => {
  const life=createMeadowLife(), grass=createMeadowGrass(life);
  try {
    assert.ok(GRASS_COUNT/(GRASS_SPAN*GRASS_SPAN)>3.5);
    assert.ok(GRASS_COUNT/(GRASS_SPAN*GRASS_SPAN)>=18);
    assert.ok(grass.mesh.geometry.index.count/3*GRASS_COUNT<=2200000);
    const matrix=new THREE.Matrix4(), position=new THREE.Vector3(), rotation=new THREE.Quaternion(), scale=new THREE.Vector3();
    let min=Infinity,max=-Infinity;
    for(let i=0;i<GRASS_COUNT;i++) {
      grass.mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);
      assert.ok(scale.y>=GRASS_HEIGHT_MIN-1e-6 && scale.y<=GRASS_HEIGHT_MAX+1e-6);
      min=Math.min(min,scale.y);max=Math.max(max,scale.y);
    }
    assert.ok(max-min>.9);
    const vertices=grass.mesh.geometry.attributes.position;
    for(let blade=0;blade<3;blade++) {
      const tip=blade*8+6;
      assert.deepEqual(new THREE.Vector3().fromBufferAttribute(vertices,tip),new THREE.Vector3().fromBufferAttribute(vertices,tip+1));
    }
  } finally { grass.mesh.dispose();grass.mesh.geometry.dispose();grass.mesh.material.dispose();life.material.dispose(); }
});

test('middle grass overlaps the near field, extends it threefold and stays within its extra geometry budget', () => {
  const life=createMeadowLife(), near=createMeadowGrass(life), middle=createMiddleMeadowGrass(life);
  try {
    assert.equal(middle.mesh.count,MIDDLE_GRASS_COUNT);
    assert.ok(MIDDLE_GRASS_FADE.innerStart<24 && MIDDLE_GRASS_FADE.innerEnd<38);
    assert.ok(MIDDLE_GRASS_FADE.outerEnd>=38*3);
    assert.ok(MIDDLE_GRASS_FADE.outerEnd<MIDDLE_GRASS_SPAN/2);
    assert.ok(middle.mesh.count*middle.mesh.geometry.index.count/3<=900000);
    assert.equal(near.mesh.count,120000,'the existing near field is unchanged');
    assert.equal(near.mesh.geometry.attributes.position.count,24);
    assert.notEqual(near.mesh.material.customProgramCacheKey(),middle.mesh.material.customProgramCacheKey());
    const snapshot=middle.mesh.instanceMatrix.array.slice();
    for(const center of [new THREE.Vector3(),new THREE.Vector3(2400,0,-3300)]) {
      middle.update(center,true);
      assert.equal(middle.mesh.visible,true);
      assert.deepEqual(middle.mesh.instanceMatrix.array,snapshot);
    }
    middle.update(new THREE.Vector3(),false);
    assert.equal(middle.mesh.visible,false);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    middle.mesh.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uMeadowTime,life.uniforms.uMeadowTime);
    assert.equal(shader.uniforms.uMeadowPulses,life.uniforms.uMeadowPulses);
    assert.equal(shader.uniforms.uGrassCenter,middle.uniforms.uGrassCenter);
  } finally {
    for(const field of [near,middle]) {field.mesh.dispose();field.mesh.geometry.dispose();field.mesh.material.dispose();}
    life.material.dispose();
  }
});

test('middle-field roots remain anchored during flight and only recycle beyond its outer fade', () => {
  const before=grassRootPosition(20,-70,0,0,MIDDLE_GRASS_SPAN);
  const after=grassRootPosition(20,-70,17.3,-4.7,MIDDLE_GRASS_SPAN);
  assert.ok(Math.abs(before.x-after.x)<1e-10 && Math.abs(before.z-after.z)<1e-10);
  for(const center of [-3000,-120,-.1,0,120,3000]) {
    const root=grassRootPosition(20,-70,center,center,MIDDLE_GRASS_SPAN);
    assert.ok(Math.abs(root.x-center)<=MIDDLE_GRASS_SPAN/2 && Math.abs(root.z-center)<=MIDDLE_GRASS_SPAN/2);
  }
});

test('far blades almost double the visible radius, overlap the middle tier and use only five triangles per tuft', () => {
  const life=createMeadowLife(), far=createFarMeadowGrass(life);
  try {
    assert.equal(far.mesh.count,FAR_GRASS_COUNT);
    assert.ok(FAR_GRASS_FADE.outerEnd>=MIDDLE_GRASS_FADE.outerEnd*1.9);
    assert.ok(FAR_GRASS_FADE.outerEnd<FAR_GRASS_SPAN/2,'recycle only outside the invisible edge');
    assert.ok(FAR_GRASS_FADE.innerStart<MIDDLE_GRASS_FADE.outerStart);
    assert.ok(FAR_GRASS_FADE.innerEnd<MIDDLE_GRASS_FADE.outerEnd);
    const geometry=far.mesh.geometry, indices=geometry.index, vertices=geometry.attributes.position;
    assert.equal(indices.count/3,5);
    assert.ok(indices.count/3*far.mesh.count<=450000);
    for(let i=0;i<indices.count;i+=3) {
      const a=new THREE.Vector3().fromBufferAttribute(vertices,indices.getX(i));
      const b=new THREE.Vector3().fromBufferAttribute(vertices,indices.getX(i+1));
      const c=new THREE.Vector3().fromBufferAttribute(vertices,indices.getX(i+2));
      assert.ok(new THREE.Triangle(a,b,c).getArea()>.001,'no degenerate far triangles');
    }
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    far.mesh.material.onBeforeCompile(shader);
    for(const name of ['uMeadowTime','uMeadowPulses','uMeadowColors','uMeadowLife'])
      assert.equal(shader.uniforms[name],life.uniforms[name]);
    assert.ok(shader.vertexShader.includes('170.0, 234.0'));
    assert.ok(shader.vertexShader.includes('210., 330.'));
  } finally {far.mesh.dispose();far.mesh.geometry.dispose();far.mesh.material.dispose();life.material.dispose();}
});

test('far field uses stable random roots and a fixed buffer on long trips and limbo resets', () => {
  const life=createMeadowLife(), far=createFarMeadowGrass(life);
  try {
    const buffer=far.mesh.instanceMatrix.array, snapshot=buffer.slice();
    for(const center of [new THREE.Vector3(),new THREE.Vector3(2400,100,-3300),new THREE.Vector3(-8000,10,9400)]) {
      far.update(center,true);
      assert.equal(far.mesh.visible,true);
      assert.equal(far.mesh.instanceMatrix.array,buffer);
      assert.deepEqual(buffer,snapshot);
      const root=grassRootPosition(57,-85,center.x,center.z,FAR_GRASS_SPAN);
      const next=grassRootPosition(57,-85,center.x+.1,center.z-.1,FAR_GRASS_SPAN);
      if(Math.abs(root.x-center.x)<FAR_GRASS_FADE.outerEnd && Math.abs(root.z-center.z)<FAR_GRASS_FADE.outerEnd) {
        assert.ok(Math.abs(root.x-next.x)<1e-9 && Math.abs(root.z-next.z)<1e-9);
      }
    }
    far.update(new THREE.Vector3(),false);
    assert.equal(far.mesh.visible,false);
    assert.equal(far.uniforms.uGrassEnabled.value,0);
    const xs=new Set();
    for(let i=0;i<500;i++)xs.add(Math.round(buffer[i*16+12]*1000));
    assert.ok(xs.size>490,'roots are not planted in aligned rows');
  } finally {far.mesh.dispose();far.mesh.geometry.dispose();far.mesh.material.dispose();life.material.dispose();}
});
