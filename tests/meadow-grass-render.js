import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setSize(1000,650,false);
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight('#f2fff6','#90a99b',1.8),new THREE.DirectionalLight('#fff0cf',2.2));
const paradise=createButterflyParadise(0);scene.add(paradise.group);
const camera=new THREE.PerspectiveCamera(48,1000/650,.1,1580);
createWorldAtmosphere(scene,camera).update(0);
const player=new THREE.Vector3(0,0,-255);
let time=10,animated=false,previous=performance.now(),high=false,samples=[];
let flight=false,heading=1,overhead=0,canopyOnly=false;
let benchmarkStart=null,frameSamples=[],frameStats=null;
paradise.update(0,camera.quaternion,player,camera,true);
function render(){
  player.y=meadowSurfaceHeight(player.x,player.z)+2;
  camera.position.set(player.x,player.y+(flight?22:high?30:1),player.z+7*heading);
  camera.lookAt(player.x,player.y-(flight?10:high?10:1),player.z-(flight?65:12)*heading);
  if(overhead){camera.position.set(player.x,player.y+overhead,player.z+.01);camera.lookAt(player);}
  const start=performance.now();
  paradise.update(time,camera.quaternion,player,camera,true);
  if(canopyOnly) for(const name of ['Wind-swept meadow grass','Middle-distance meadow grass','Far meadow grass']) {
    const mesh=paradise.group.getObjectByName(name);if(mesh)mesh.visible=false;
  }
  renderer.render(scene,camera);
  if(samples.length<300)samples.push(performance.now()-start);
  const sorted=[...samples].sort((a,b)=>a-b);
  document.querySelector('#status').textContent=JSON.stringify({time,high,flight,heading,overhead,canopyOnly,player:player.toArray(),calls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,cpuP95Ms:sorted[Math.floor(sorted.length*.95)],frameStats});
}
document.querySelector('#near').onclick=()=>{overhead=0;high=false;flight=false;render();};
document.querySelector('#far').onclick=()=>{overhead=0;high=true;flight=false;render();};
document.querySelector('#flight').onclick=()=>{overhead=0;flight=true;render();};
document.querySelector('#overhead').onclick=()=>{overhead=35;render();};
document.querySelector('#higher').onclick=()=>{overhead=90;render();};
document.querySelector('#canopy').onclick=()=>{canopyOnly=!canopyOnly;render();};
document.querySelector('#reverse').onclick=()=>{heading*=-1;render();};
document.querySelector('#travel').onclick=()=>{player.x+=1617.3;player.z-=1624.7;render();};
document.querySelector('#wind').onclick=()=>{time+=3;render();};
document.querySelector('#pulse').onclick=()=>{paradise.pulse(time,player,new THREE.Color('#f68f9d'),1);animated=true;previous=performance.now();};
document.querySelector('#pause').onclick=()=>{animated=!animated;previous=performance.now();};
document.querySelector('#benchmark').onclick=()=>{benchmarkStart=performance.now();frameSamples=[];frameStats=null;samples=[];animated=true;previous=performance.now();};
function animate(now){
  if(benchmarkStart!==null){
    // Skip the first warm-up second; measure actual frame delivery, not just CPU submission.
    if(now-benchmarkStart>1000)frameSamples.push(now-previous);
    if(now-benchmarkStart>=5000){
      const sorted=frameSamples.slice().sort((a,b)=>a-b);
      frameStats={frames:sorted.length,frameP95Ms:sorted[Math.floor(sorted.length*.95)],fps:1000/(frameSamples.reduce((a,b)=>a+b,0)/frameSamples.length)};
      benchmarkStart=null;
    }
  }
  if(animated){time+=Math.min(.05,(now-previous)/1000);render();}previous=now;requestAnimationFrame(animate);
}
await renderer.compileAsync(scene,camera);render();requestAnimationFrame(animate);
