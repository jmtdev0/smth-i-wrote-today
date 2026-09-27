import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setSize(1000,650,false);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#e7f0e9',130,430);
scene.add(new THREE.HemisphereLight('#f2fff6','#90a99b',1.8),new THREE.DirectionalLight('#fff0cf',2.2));
const paradise = createButterflyParadise(); scene.add(paradise.group);
const camera = new THREE.PerspectiveCamera(48,1000/650,.1,1580);
const player = new THREE.Vector3(0,0,-270);
camera.position.set(0,55,-210); camera.lookAt(0,-25,-290);
paradise.update(0,camera.quaternion,player,camera,true);
let time=0, animated=false, previous=performance.now();
function render(t) {
  paradise.update(t,camera.quaternion,player,camera,true);
  renderer.render(scene,camera);
  document.querySelector('#status').textContent=JSON.stringify({time:t,programs:renderer.info.programs.length,calls:renderer.info.render.calls});
}
for(const button of document.querySelectorAll('[data-time]')) button.onclick=()=> {
  animated=false; time=Number(button.dataset.time);
  paradise.reset(); paradise.update(0,camera.quaternion,player,camera,true);
  paradise.pulse(10,player,new THREE.Color('#f68f9d'),1);
  render(time);
};
document.querySelector('#animate').onclick=()=>{animated=!animated;previous=performance.now();};
function tick(now){
  if(animated){time+=Math.min(.05,(now-previous)/1000);render(time);}
  previous=now;requestAnimationFrame(tick);
}
await renderer.compileAsync(scene,camera);
render(0);requestAnimationFrame(tick);
