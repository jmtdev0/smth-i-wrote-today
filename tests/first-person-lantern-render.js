import * as THREE from 'three';
import { createTunnelWorld, createButterflyLantern, TUNNEL_VIEW_DISTANCE } from '../src/TunnelWorld.js';
import { createCameraView, FIRST_PERSON_DISTANCE } from '../src/CameraView.js';
import { createButterfly } from '../src/Butterfly.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
import { createHeavenLighting } from '../src/HeavenLighting.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.setSize(1000, 600);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1000 / 600, .1, TUNNEL_VIEW_DISTANCE);
const atmosphere = createWorldAtmosphere(scene, camera), lighting = createHeavenLighting(scene, renderer);
const tunnel = createTunnelWorld(), lantern = createButterflyLantern(), view = createCameraView();
const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48);
const player = new THREE.Vector3(0, 0, 873);
scene.add(tunnel.group, lantern.group, butterfly.group);
const light = lantern.group.children.find(o => o.isPointLight), halo = lantern.group.children.find(o => o.isMesh);
document.querySelector('#cut').onclick = () => view.toggle();
document.querySelector('#zoom-in').onclick = () => view.setDistance(FIRST_PERSON_DISTANCE);
document.querySelector('#zoom-out').onclick = () => view.setDistance(15);
let last = performance.now(), reportAt = 0;
function animate(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  butterfly.group.visible = view.update(camera, player, .25, 0, dt, { tunnelSolid: true, meadowEnabled: false });
  butterfly.group.position.copy(player);
  butterfly.group.quaternion.copy(camera.quaternion);
  butterfly.update(1, false);
  tunnel.update(1, player);
  atmosphere.update(tunnel.visibility);
  lantern.update(player, camera.quaternion, 1, tunnel.visibility,
    document.querySelector('#previous').checked ? 0 : view.blend);
  lighting.update(player, false);
  renderer.render(scene, camera);
  if (now >= reportAt) {
    reportAt = now + 100;
    document.querySelector('#status').textContent = JSON.stringify({
      firstPerson: view.firstPerson, blend: +view.blend.toFixed(3), avatarVisible: butterfly.group.visible,
      haloVisible: halo.visible, lightIntensity: +light.intensity.toFixed(4),
      previousHalo: document.querySelector('#previous').checked, programs: renderer.info.programs.length,
    });
  }
  requestAnimationFrame(animate);
}
await renderer.compileAsync(scene, camera);
last = performance.now();
requestAnimationFrame(animate);
