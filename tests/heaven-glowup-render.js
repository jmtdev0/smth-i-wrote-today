import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createButterfly } from '../src/Butterfly.js';
import { createHeavenLighting, enableButterflyShadows } from '../src/HeavenLighting.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createButterflyLantern } from '../src/TunnelWorld.js';

const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.info.autoReset = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, .1, 1580);
createWorldAtmosphere(scene, camera).update(0);
const lighting = createHeavenLighting(scene, renderer);
const paradise = createButterflyParadise(), butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48); enableButterflyShadows(butterfly.group);
scene.add(paradise.group, butterfly.group);
const playerLantern = createButterflyLantern();
scene.add(playerLantern.group);
let lanternVisibility = 0;
const sky = paradise.group.getObjectByName('Clear Heaven sky');
const player = new THREE.Vector3(0, 0, -255);
const npcProfiles = paradise.profiles.slice(4, 7);
const npcOriginals = npcProfiles.map(profile => ({ ...profile }));
const npcShadowGroup = paradise.group.getObjectByName('Nearby Heaven butterfly shadows');
let time = 0, last = performance.now(), reportAt = 0, paused = false, clouds = true, shadows = true, view = 'landscape';
let benchmarkStart = null, samples = [], stats = null;
const errors = [];
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  errors.push(gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
};
window.addEventListener('error', event => errors.push(event.message));
function resize() {
  const bounds = canvas.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(bounds.width, bounds.height, false);
  camera.aspect = bounds.width / bounds.height; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  if (view.startsWith('npc-')) npcProfiles.forEach((profile, i) => Object.assign(profile, npcOriginals[i]));
  view = button.dataset.view;
  if (view.startsWith('npc-')) document.querySelector('#npc-height').value = view === 'npc-range' ? 24 : 3;
  if (view === 'horizon' || view.startsWith('npc-')) {
    time = 20; paused = true; sky.material.uniforms.uCloudOpacity.value = 1;
    document.querySelector('#pause').textContent = 'Continuar';
  }
});
document.querySelector('#clouds').onclick = event => { clouds = !clouds; event.target.textContent = `Nubes: ${clouds ? 'sí' : 'no'}`; };
document.querySelector('#shadows').onclick = event => { shadows = !shadows; event.target.textContent = `Sombras cercanas: ${shadows ? 'sí' : 'no'}`; lighting.sun.shadow.intensity = shadows ? 1 : 0; };
document.querySelector('#grass-shadow').onclick = event => {
  const grass = paradise.group.getObjectByName('Wind-swept meadow grass');
  grass.castShadow = !grass.castShadow;
  event.target.textContent = `Sombras de hierba: ${grass.castShadow ? 'sí' : 'no'}`;
};
document.querySelector('#npc-shadow').onclick = event => {
  npcShadowGroup.visible = !npcShadowGroup.visible;
  event.target.textContent = `Sombras NPC: ${npcShadowGroup.visible ? 'sí' : 'no'}`;
};
document.querySelector('#pause').onclick = event => { paused = !paused; event.target.textContent = paused ? 'Continuar' : 'Pausar'; };
document.querySelector('#lantern').onclick = event => {
  // Compare the same frozen meadow at full, half and zero tunnel visibility.
  lanternVisibility = lanternVisibility === 0 ? 1 : lanternVisibility === 1 ? .5 : 0;
  event.target.textContent = `Luz personal: ${lanternVisibility === 0 ? 'apagada' : lanternVisibility === 1 ? 'encendida' : '50 %'}`;
  paused = true; document.querySelector('#pause').textContent = 'Continuar';
};
document.querySelector('#advance').onclick = () => { time += 60; };
document.querySelector('#travel').onclick = () => { player.x += 3021; player.z -= 2914; };
document.querySelector('#benchmark').onclick = () => { benchmarkStart = performance.now(); samples = []; stats = null; };
function animate(now) {
  requestAnimationFrame(animate);
  const frameMs = now - last; last = now;
  if (!paused) time += THREE.MathUtils.clamp(frameMs / 1000, 0, .05);
  player.y = meadowSurfaceHeight(player.x, player.z) + (view === 'above' ? 22 : 2.2);
  camera.position.copy(player).add(new THREE.Vector3(0, view === 'above' ? 28 : view === 'near' ? .4 : 5, view === 'above' ? 1 : 13));
  camera.lookAt(player.x, player.y + (view === 'sky' ? 16 : view === 'near' ? .6 : 1.8), player.z);
  if (view === 'shadow') {
    player.y += 2;
    camera.position.set(player.x + 5, player.y + 10, player.z + 18);
    camera.lookAt(player.x + 1, player.y - 2, player.z + 4);
  }
  if (view === 'lantern') {
    camera.position.set(player.x, player.y + 3, player.z + 6);
    camera.lookAt(player.x, player.y - .6, player.z);
  }
  if (view === 'horizon') {
    camera.position.set(0, 0, -240); camera.lookAt(0, 300, -4200);
  }
  if (view.startsWith('npc-')) {
    camera.position.set(player.x + 6, player.y + 11, player.z + 18);
    camera.lookAt(player.x + 2, player.y - 1, player.z + 3);
    if (view === 'npc-range') {
      // Inspect shadows landing about 40 units from the player, cast by NPCs
      // above the former 18-unit cutoff; keep the light/player anchor fixed.
      camera.position.set(player.x + 44, player.y + 14, player.z + 28);
      camera.lookAt(player.x + 42, player.y - 2, player.z + 8);
    }
    npcProfiles.forEach((profile, i) => {
      profile.x = player.x + (i - 1) * 4.5 + (view === 'npc-range' ? 26 : 0);
      profile.z = player.z - (view === 'npc-range' ? 32 : 2);
      profile.y = meadowSurfaceHeight(profile.x, profile.z) + document.querySelector('#npc-height').valueAsNumber;
      profile.orbit = 0; profile.scale = .72;
    });
    if (view === 'npc-outline') {
      camera.position.set(player.x, player.y + 4, player.z + 11);
      camera.lookAt(player.x, player.y + 1.8, player.z);
      npcProfiles.forEach((profile, i) => {
        profile.x = player.x + (i - 1) * 3.4;
        profile.y = player.y + 3;
        profile.z = player.z - 2;
      });
    }
  }
  butterfly.group.visible = view === 'npc-outline' || (view !== 'horizon' && !view.startsWith('npc-'));
  npcShadowGroup.visible = view !== 'horizon' && document.querySelector('#npc-shadow').textContent.endsWith('sí');
  for (const object of paradise.group.children) {
    if ((object.isInstancedMesh && object.material.isMeshBasicMaterial) || object.isLineSegments) object.visible = view !== 'horizon';
  }
  butterfly.group.position.copy(player); butterfly.group.quaternion.copy(camera.quaternion); butterfly.update(time, false);
  playerLantern.update(player, camera.quaternion, 1, lanternVisibility);
  paradise.update(time, camera.quaternion, player, camera, true, butterfly.wingbeatStrength);
  lighting.update(player, true);
  renderer.info.reset();
  if (clouds) paradise.renderAtmosphere(renderer, frameMs);
  else { sky.material.uniforms.uCloudOpacity.value = 0; sky.material.uniforms.uCloudReady.value = 0; }
  renderer.render(scene, camera);
  if (benchmarkStart !== null) {
    if (now - benchmarkStart > 1000) samples.push(frameMs);
    if (now - benchmarkStart > 6000) {
      const sorted = samples.slice().sort((a, b) => a - b);
      stats = { frames: sorted.length, fps: +(1000 * samples.length / samples.reduce((a, b) => a + b, 0)).toFixed(1),
        p95Ms: +sorted[Math.floor(sorted.length * .95)].toFixed(1) };
      benchmarkStart = null;
    }
  }
  if (now > reportAt) {
    reportAt = now + 250;
    document.querySelector('#status').textContent = JSON.stringify({ view, clouds, shadows, paused,
      time: +time.toFixed(2), cloudQuality: paradise.cloudQuality, viewport: [canvas.width, canvas.height],
      npcShadowCasters: paradise.npcShadowCount, npcShadows: npcShadowGroup.visible,
      npcHeight: document.querySelector('#npc-height').valueAsNumber,
      lanternVisibility, lanternIntensity: playerLantern.group.children.find(object => object.isPointLight).intensity,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      programs: renderer.info.programs.length, textures: renderer.info.memory.textures,
      benchmark: benchmarkStart === null ? stats : 'Midiendo…', errors }, null, 2);
  }
}
await Promise.all([renderer.compileAsync(scene, camera), paradise.prepareAtmosphere(renderer)]);
last = performance.now(); requestAnimationFrame(animate);
