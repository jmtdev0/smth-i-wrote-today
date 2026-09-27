import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createButterfly } from '../src/Butterfly.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.setSize(1000, 650);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1000 / 650, .1, 1580);
createWorldAtmosphere(scene, camera).update(0);
scene.add(new THREE.HemisphereLight('#f2fff6', '#90a99b', 1.8), new THREE.DirectionalLight('#fff0cf', 2.2));
const paradise = createButterflyParadise(0), butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48);
butterfly.adoptColor(new THREE.Color('#f68f9d'));
scene.add(paradise.group, butterfly.group);
const grassMaterial = paradise.group.getObjectByName('Wind-swept meadow grass').material;
const compileGrass = grassMaterial.onBeforeCompile;
let windUniform;
grassMaterial.onBeforeCompile = shader => { compileGrass(shader); windUniform = shader.uniforms.uWingWind; };
const player = new THREE.Vector3(0, 0, -255);
let time = 0, last = performance.now(), height = 2, moving = false, enabled = true, overhead = false;
let paused = false, freezeAtPeak = false, benchmarkStart = null, frameSamples = [], stats = null;
let reportAt = 0, minPressure = 1, maxPressure = 0;
document.querySelectorAll('[data-height]').forEach(button => button.onclick = () => { height = Number(button.dataset.height); paused = false; });
document.querySelector('#move').onclick = () => { moving = !moving; };
document.querySelector('#wind').onclick = event => {
  enabled = !enabled; paused = false;
  event.target.textContent = enabled ? 'Desactivar ráfaga' : 'Activar ráfaga';
};
document.querySelector('#view').onclick = () => { overhead = !overhead; };
document.querySelector('#pause').onclick = () => { paused = !paused; };
document.querySelector('#peak').onclick = () => { freezeAtPeak = true; paused = false; };
document.querySelector('#travel').onclick = () => { player.x += 2403; player.z -= 3127; paused = false; };
document.querySelector('#benchmark').onclick = () => {
  benchmarkStart = performance.now(); frameSamples = []; stats = null; paused = false;
};
function animate(now) {
  requestAnimationFrame(animate);
  const frameMs = now - last, dt = paused ? 0 : Math.min(.05, frameMs / 1000); last = now;
  time += dt;
  if (moving) { player.x += dt * 3; player.z -= dt * 4; }
  player.y = meadowSurfaceHeight(player.x, player.z) + height;
  camera.position.set(player.x, player.y + (overhead ? 13 : 3), player.z + (overhead ? .01 : 10));
  camera.lookAt(player.x, player.y - (overhead ? 0 : 1.7), player.z);
  butterfly.group.position.copy(player); butterfly.group.quaternion.copy(camera.quaternion); butterfly.update(time, moving);
  paradise.update(time, camera.quaternion, player, camera, true, enabled ? butterfly.wingbeatStrength : 0);
  renderer.render(scene, camera);
  const pressure = windUniform?.value.w ?? 0;
  minPressure = Math.min(minPressure, pressure); maxPressure = Math.max(maxPressure, pressure);
  if (freezeAtPeak && pressure > (moving ? .4 : .18)
    && butterfly.wingbeatStrength > (moving ? .4 : .2)) { freezeAtPeak = false; paused = true; }
  if (benchmarkStart !== null) {
    if (now - benchmarkStart > 1000) frameSamples.push(frameMs);
    if (now - benchmarkStart >= 5000) {
      const sorted = frameSamples.slice().sort((a, b) => a - b);
      stats = { frames: sorted.length, p95Ms: sorted[Math.floor(sorted.length * .95)],
        fps: 1000 / (frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length) };
      benchmarkStart = null;
    }
  }
  if (now > reportAt) {
    reportAt = now + 200;
    document.querySelector('#status').textContent = JSON.stringify({
      enabled, moving, paused, height, time: +time.toFixed(2),
      wingbeat: +butterfly.wingbeatStrength.toFixed(3), pressure: +pressure.toFixed(3),
      minPressure, maxPressure, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      programs: renderer.info.programs.length, stats,
    });
  }
}
await renderer.compileAsync(scene, camera);
last = performance.now(); requestAnimationFrame(animate);
