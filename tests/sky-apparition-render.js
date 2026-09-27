import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';

const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#f2fff6','#90a99b',1.8));
scene.fog = new THREE.Fog('#e7f0e9',130,430);
const paradise = createButterflyParadise(0);
scene.add(paradise.group);
const camera = new THREE.PerspectiveCamera(48,16/9,.1,1580);
const player = new THREE.Vector3(0,0,-255);
camera.position.copy(player);
const texture = await new THREE.TextureLoader().loadAsync('/1dad95b9-3fb0-4e1a-9c5a-662cc640537c_1758672000.jpeg');
texture.colorSpace = THREE.SRGBColorSpace;
paradise.setSkyImage(texture,texture.image.width/texture.image.height);
const sky = paradise.group.children.find(object=>object.material?.uniforms?.uImageOpacity);
function render(mode) {
  const portrait = mode === 'portrait';
  renderer.setSize(portrait ? 420 : 960, portrait ? 700 : 540, false);
  camera.aspect = portrait ? 420/700 : 960/540;
  camera.updateProjectionMatrix();
  camera.lookAt(player.x,player.y+(mode==='down' ? -20 : 40),player.z-25);
  paradise.update(0,camera.quaternion,player,camera,false);
  const seconds = mode === 'before' ? 3 : mode === 'after' ? 18 : 11;
  for(let step=1;step<=seconds*20;step++) paradise.update(step/20,camera.quaternion,player,camera,mode!=='limbo');
  renderer.render(scene,camera);
  document.querySelector('#status').textContent = JSON.stringify({mode,opacity:sky.material.uniforms.uImageOpacity.value});
}
for(const button of document.querySelectorAll('button')) {
  button.disabled=false;
  button.onclick=()=>render(button.dataset.mode);
}
render('before');
