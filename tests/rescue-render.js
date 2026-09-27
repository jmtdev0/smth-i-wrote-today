// Open with Vite at /tests/rescue-render.html. Uses real scene objects and WebGL,
// not a mocked renderer. The report counts shader variants across rescue/reset.
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createAutonomousButterflies } from '../src/AutonomousButterflies.js';
import { createResonanceEffects } from '../src/ResonanceEffects.js';
import { createTunnelWorld, createButterflyLantern, RESCUE_COUNT, TUNNEL_START, TUNNEL_VIEW_DISTANCE } from '../src/TunnelWorld.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';

const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setSize(800,450,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background=new THREE.Color('#e7f0e9');
scene.fog=new THREE.Fog('#e7f0e9',130,430);
scene.add(new THREE.HemisphereLight('#f2fff6','#90a99b',1.8),new THREE.DirectionalLight('#fff0cf',2.2));
const camera=new THREE.PerspectiveCamera(48,800/450,.1,TUNNEL_VIEW_DISTANCE);
const player=new THREE.Vector3(TUNNEL_START.x,TUNNEL_START.y,TUNNEL_START.z);
const butterfly=createButterfly({whiteness:1,alwaysWhite:true});
butterfly.group.scale.setScalar(.48);
const flock=createAutonomousButterflies(RESCUE_COUNT,{tunnel:true});
const effects=createResonanceEffects(butterfly,flock);
const tunnel=createTunnelWorld(), paradise=createButterflyParadise(), lantern=createButterflyLantern();
scene.add(butterfly.group,flock.group,effects.group,tunnel.group,paradise.group,lantern.group);
flock.update(0,player,camera.quaternion);
const report=[];
let frame=0,last=performance.now(),stage='idle',samples=[],intervals=[];
function record(){
  const sorted=[...samples].sort((a,b)=>a-b);
  report.push({stage,connected:flock.connectedCount,programs:renderer.info.programs.length,
    groupColor:flock.agents[0].tint.getHexString(),
    renderMaxMs:+Math.max(...samples).toFixed(2),renderP95Ms:+sorted[Math.floor(sorted.length*.95)].toFixed(2),
    frameMaxMs:+Math.max(...intervals).toFixed(2)});
  document.querySelector('#results').textContent=JSON.stringify(report,null,2);
  samples=[];intervals=[];
}
function animate(now){
  intervals.push(now-last);last=now;
  const time=frame/60;
  if(frame>0&&frame%90===0){
    record();
    const step=frame/90;
    // Optional screenshot checkpoint after the two real Heaven interactions.
    if(step===RESCUE_COUNT+3 && new URLSearchParams(location.search).get('hold')==='heaven') return;
    if(step<=RESCUE_COUNT){
      stage=`rescue ${step}`;
      player.copy(flock.agents[step-1].butterfly.group.position);
      const result=flock.chirp(time,player);
      effects.call(player,time,result.receivers,result.radius,result.charge);
      butterfly.releaseChirp(time,result.charge);
    }else if(step<=RESCUE_COUNT+2){
      stage=`Heaven color ${step-RESCUE_COUNT}`;
      paradise.update(time,camera.quaternion);
      const matrix=new THREE.Matrix4();
      paradise.group.children[0].getMatrixAt(step-RESCUE_COUNT-1,matrix);
      const destination=new THREE.Vector3().setFromMatrixPosition(matrix);
      const travel=destination.clone().sub(player);
      for(const agent of flock.agents) agent.butterfly.group.position.add(travel);
      player.copy(destination);
      const result=flock.chirp(time,player);
      const answer=paradise.chirp(time,player,result.radius);
      if(!answer) throw new Error('Heaven did not answer a nearby chirp.');
      flock.adoptColor(answer.color);
      butterfly.adoptColor(answer.color);
      effects.call(player,time,result.receivers,result.radius,result.charge,answer);
    }else if(step===RESCUE_COUNT+3){stage='reset';flock.reset(time,player);effects.reset();butterfly.resetTint();}
    else {
      const output=document.querySelector('#results');
      const stable=report.every(row=>row.programs===report[0].programs);
      output.dataset.complete='true';
      output.dataset.passed=String(stable && report.at(-2).connected===RESCUE_COUNT && flock.connectedCount===0);
      if(output.dataset.passed!=='true') throw new Error('Rescuing/resetting generated new shader programs or failed to connect the flock.');
      return;
    }
  }
  camera.position.copy(player).add(new THREE.Vector3(0,3,15));
  camera.lookAt(player.x,player.y+3,player.z);
  butterfly.group.position.copy(player);
  butterfly.group.quaternion.copy(camera.quaternion);butterfly.update(time,false);
  flock.update(time,player,camera.quaternion);effects.update(time,camera.quaternion);
  tunnel.update(time,player,flock.agents);paradise.update(time,camera.quaternion);
  lantern.update(player,camera.quaternion,1);
  const start=performance.now();renderer.render(scene,camera);samples.push(performance.now()-start);
  frame++;requestAnimationFrame(animate);
}
await renderer.compileAsync(scene,camera);
last=performance.now();
requestAnimationFrame(animate);
