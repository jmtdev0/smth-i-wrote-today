import * as THREE from 'three';
import { createTunnelWorld, TUNNEL_FADE_EXIT_Z, TUNNEL_FADE_SECONDS, TUNNEL_EXIT_Z } from '../src/TunnelWorld.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.setSize(1000, 600);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#f2fff6', '#90a99b', 1.8));
const camera = new THREE.PerspectiveCamera(48, 1000 / 600, .1, 1600);
const atmosphere = createWorldAtmosphere(scene, camera);
camera.position.set(90, 15, -280);
camera.lookAt(0, 0, -130);
const tunnel = createTunnelWorld(), paradise = createButterflyParadise();
scene.add(tunnel.group, paradise.group);
paradise.update(0, camera.quaternion);
const player = new THREE.Vector3();
function render(progress) {
  camera.position.set(90, 15, -280);
  camera.lookAt(0, 0, -130);
  tunnel.reset();
  player.set(0, 0, TUNNEL_EXIT_Z + 30);
  tunnel.update(0, player);
  player.z = TUNNEL_FADE_EXIT_Z - 1;
  tunnel.update(1, player);
  tunnel.update(1 + progress * TUNNEL_FADE_SECONDS, player);
  atmosphere.update(tunnel.visibility);
  paradise.update(0, camera.quaternion, player, camera, !tunnel.solid);
  renderer.render(scene, camera);
  document.querySelector('canvas').dataset.visibility = String(tunnel.visibility);
  document.querySelector('#status').textContent = JSON.stringify({
    visibility: tunnel.visibility, fogNear: scene.fog.near,
    fogFar: scene.fog.far, cameraFar: camera.far,
    programs: renderer.info.programs.length,
  });
}
function renderInside(view) {
  tunnel.reset();
  const views = {
    approach: { camera: [0, 0, -55], target: [0, 0, -180], player: [0, 0, -70] },
    limbo: { camera: [12, 0, -135], target: [45, 0, -180], player: [20, 0, -150] },
    crossing: { camera: [30, 0, -182], target: [47, 0, -187], player: [32, 0, -188] },
  };
  const pose = views[view];
  camera.position.fromArray(pose.camera);
  camera.lookAt(...pose.target);
  player.fromArray(pose.player);
  tunnel.update(2, player);
  atmosphere.update(tunnel.visibility);
  paradise.update(2, camera.quaternion, player, camera, false);
  renderer.render(scene, camera);
  document.querySelector('canvas').dataset.visibility = String(tunnel.visibility);
  document.querySelector('#status').textContent = JSON.stringify({
    view, visibility: tunnel.visibility, camera: pose.camera,
    programs: renderer.info.programs.length,
  });
}

document.querySelectorAll('[data-progress]').forEach(button => button.addEventListener('click', () => render(Number(button.dataset.progress))));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => renderInside(button.dataset.view)));
await renderer.compileAsync(scene, camera);
render(0);
