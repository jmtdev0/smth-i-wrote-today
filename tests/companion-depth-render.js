import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { createTunnelWorld, createButterflyLantern, TUNNEL_VIEW_DISTANCE } from '../src/TunnelWorld.js';

const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setSize(1000,600,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#080b0e');
scene.add(new THREE.HemisphereLight('#f2fff6','#90a99b',1.8),new THREE.DirectionalLight('#fff0cf',2.2));
const camera=new THREE.PerspectiveCamera(48,1000/600,.1,TUNNEL_VIEW_DISTANCE);
const butterfly=createButterfly({whiteness:1,alwaysWhite:true});
butterfly.group.scale.setScalar(.48);
const flock=createAutonomousButterflies(2,{tunnel:true});
const tunnel=createTunnelWorld(), lantern=createButterflyLantern();
scene.add(butterfly.group,flock.group,tunnel.group,lantern.group);
const player=flock.agents[0].butterfly.group.position.clone();
flock.update(0,player,camera.quaternion);flock.chirp(0,player);
for(let i=1;i<=300;i++)flock.update(i/60,player,camera.quaternion);
const shift=new THREE.Vector3(33,0,200).sub(player);
player.add(shift);
for(const agent of flock.agents)agent.butterfly.group.position.add(shift);
let yaw=0,pitch=0,time=5,legacy=false;
const fills=[];
flock.group.traverse(object=>{
  if(object.userData.visualRole==='fill')fills.push({material:object.material,depthWrite:object.material.depthWrite});
});
function render(){
  camera.position.copy(player).add(new THREE.Vector3(Math.sin(yaw)*10*Math.cos(pitch),Math.sin(pitch)*10,Math.cos(yaw)*10*Math.cos(pitch)));
  camera.lookAt(player);
  butterfly.group.position.copy(player);butterfly.group.quaternion.copy(camera.quaternion);butterfly.update(time,false);
  flock.update(time,player,camera.quaternion,false);
  // Deliberately reproduce only the old depth-write setting for A/B comparison.
  for(const fill of fills)fill.material.depthWrite=legacy?false:fill.depthWrite;
  lantern.update(player,camera.quaternion,1);
  tunnel.update(time,player,flock.agents);
  renderer.render(scene,camera);
  document.querySelector('#status').textContent=JSON.stringify({yaw,pitch,time,legacy,connected:flock.connectedCount,
    opacity:flock.agents[0].butterfly.group.getObjectByName('left wings').children[0].material.opacity,
    programs:renderer.info.programs.length});
}
document.querySelector('#front').onclick=()=>{yaw=0;pitch=0;render();};
document.querySelector('#side').onclick=()=>{yaw=Math.PI/2;pitch=0;render();};
document.querySelector('#back').onclick=()=>{yaw=Math.PI;pitch=0;render();};
document.querySelector('#above').onclick=()=>{pitch=1.2;render();};
document.querySelector('#below').onclick=()=>{pitch=-1.2;render();};
document.querySelector('#legacy').onclick=()=>{legacy=!legacy;render();};
document.querySelector('#flap').onclick=()=>{time+=.15;render();};
await renderer.compileAsync(scene,camera);render();
