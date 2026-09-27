import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createButterfly } from '../src/Butterfly.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
import { meadowHeight, meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createMeadowCameraCollision, cameraNearRadius } from '../src/MeadowCameraCollision.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.setSize(1000, 600);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1000 / 600, .1, 1580);
createWorldAtmosphere(scene, camera).update(0);
scene.add(new THREE.HemisphereLight('#f2fff6', '#90a99b', 1.8));
const light = new THREE.DirectionalLight('#fff0cf', 2.2);
light.position.set(-80, 120, -260);
scene.add(light);
const paradise = createButterflyParadise(80);
const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48);
scene.add(paradise.group, butterfly.group);
const collision = createMeadowCameraCollision();
const player = new THREE.Vector3();
const projected = new THREE.Vector3();
let pitch, yaw, distance, enabled = true, sweep = false, last = performance.now(), time = 0, reportAt = 0;

function setView(view) {
  const poses = {
    low: [0, -255, -.5, .4, 15], deep: [0, -255, -1.35, .4, 15],
    clear: [0, -255, .3, .4, 15], far: [0, -255, -.6, .4, 42],
    slope: [67, -400, -.25, 0, 15],
  };
  const [x, z, nextPitch, nextYaw, nextDistance] = poses[view];
  player.set(x, meadowHeight(x, z) + 2, z);
  pitch = nextPitch; yaw = nextYaw; distance = nextDistance; sweep = false;
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#legacy').addEventListener('click', event => {
  enabled = !enabled;
  event.target.textContent = enabled ? 'Disable collision' : 'Enable collision';
});
document.querySelector('#sweep').addEventListener('click', () => { sweep = !sweep; });
setView('low');
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.05, (now - last) / 1000); last = now; time += dt;
  if (sweep) yaw += dt * .6;
  const lift = Math.min(3, distance * .2);
  camera.position.set(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    player.y + Math.sin(pitch) * distance + lift, player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
  const fraction = collision.update(player, camera.position, dt, { enabled, nearRadius: cameraNearRadius(camera) });
  camera.lookAt(player.x, player.y + lift * fraction, player.z);
  butterfly.group.position.copy(player);
  butterfly.group.quaternion.copy(camera.quaternion);
  butterfly.update(time, false);
  paradise.update(time, camera.quaternion, player, camera, true);
  renderer.render(scene, camera);
  if (now > reportAt) {
    reportAt = now + 200;
    projected.copy(player).project(camera);
    document.querySelector('#status').textContent = JSON.stringify({
      enabled, sweep, requestedDistance: distance, resolvedDistance: +(distance * fraction).toFixed(3),
      groundClearance: +(camera.position.y - meadowSurfaceHeight(camera.position.x, camera.position.z)).toFixed(3),
      playerOnScreen: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1,
      programs: renderer.info.programs.length,
    });
  }
}
await renderer.compileAsync(scene, camera);
last = performance.now();
requestAnimationFrame(animate);
