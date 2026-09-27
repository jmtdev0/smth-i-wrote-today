import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';

test('original and cloned companions retain depth-writing, double-sided fills through rescue, tint and reset', () => {
  const flock=createAutonomousButterflies(2,{tunnel:true});
  const q=new THREE.Quaternion();
  const player=flock.agents[0].butterfly.group.position.clone();
  const fills=flock.agents.map(agent=>{
    const meshes=[];
    agent.butterfly.group.traverse(object=>{if(object.userData.visualRole==='fill')meshes.push(object);});
    return meshes;
  });
  const materials=fills.map(meshes=>meshes[0].material);
  const versions=materials.map(material=>material.version);
  const check=()=>fills.forEach((meshes,index)=>{
    assert.equal(meshes.length,4);
    for(const mesh of meshes) {
      assert.equal(mesh.material,materials[index],'rescuing must not replace materials');
      assert.equal(mesh.material.version,versions[index],'no shader recompilation on rescue');
      assert.equal(mesh.material.transparent,true);
      assert.equal(mesh.material.depthWrite,true,'water behind the wing must fail its depth test');
      assert.equal(mesh.material.depthTest,true,'do not draw through objects in front');
      assert.equal(mesh.material.side,THREE.DoubleSide);
    }
  });
  try {
    assert.notEqual(materials[0],materials[1]);
    check();
    for(const material of materials)assert.equal(material.opacity,.78);
    flock.update(0,player,q);
    flock.agents[1].butterfly.group.position.copy(player).add(new THREE.Vector3(1,0,0));
    flock.chirp(0,player);
    assert.equal(flock.connectedCount,2);
    for(let frame=1;frame<=180;frame++) {
      q.setFromEuler(new THREE.Euler(Math.sin(frame*.06)*1.2,frame*.08,0));
      flock.update(frame/60,player,q);check();
    }
    for(const material of materials) {
      assert.equal(material.opacity,.9);
      assert.equal(material.color.getHexString(),'ffffff');
    }
    flock.adoptColor(new THREE.Color('#87dcdb'));
    for(let frame=181;frame<=480;frame++)flock.update(frame/60,player,q);
    check();
    for(const material of materials)assert.equal(material.color.getHexString(),'87dcdb');
    flock.reset(8,player);check();
    for(const material of materials)assert.equal(material.opacity,.78);
  } finally {
    const resources=new Set();
    flock.group.traverse(object=>{
      if(object.geometry)resources.add(object.geometry);
      if(object.material)resources.add(object.material);
    });
    for(const resource of resources)resource.dispose();
  }
});
