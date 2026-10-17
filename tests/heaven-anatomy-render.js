import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createHeavenLighting } from '../src/HeavenLighting.js';
import { meadowSurfaceHeight } from '../src/MeadowSurface.js';

const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
scene.background = new THREE.Color('#637f40');
const lighting = createHeavenLighting(scene, renderer);
const anchor = new THREE.Vector3(0, meadowSurfaceHeight(0, -255) + 5, -255);
const player = createButterfly({ alwaysWhite: true }), paradise = createButterflyParadise(1);
player.group.scale.setScalar(.55); player.group.position.copy(anchor); player.group.position.x = -1.5;
const profile = paradise.profiles[0];
Object.assign(profile, { x: 1.5, y: anchor.y, z: anchor.z, scale: .55, orbit: 0, phase: 0 });
const ground = paradise.group.children.filter(object => /meadow/i.test(object.name));
const outlines = paradise.group.getObjectByName('Heaven body outlines and antennae');
paradise.group.getObjectByName('Clear Heaven sky').visible = false;
let meadow = true;
scene.add(player.group, paradise.group);
let white = false, running = false, time = 0, last = performance.now(), reportAt = 0;
const errors = [], orientation = new THREE.Quaternion(), color = new THREE.Color();
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  errors.push(gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
};
window.addEventListener('error', event => errors.push(event.message));
function tint() {
  color.set(white ? '#ffffff' : '#b8a0f0'); player.resetTint(); player.setTint(color);
  for (const object of paradise.group.children.slice(0, 10)) {
    if (object.instanceColor) object.setColorAt(0, color);
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
  }
}
tint();
document.querySelector('#tint').onclick = event => {
  white = !white; tint(); event.target.textContent = white ? 'Purple tint' : 'White tint';
};
document.querySelector('#animate').onclick = event => {
  running = !running; event.target.textContent = running ? 'Pause' : 'Animate';
};
document.querySelector('#background').onclick = event => {
  meadow = !meadow; event.target.textContent = meadow ? 'Background: meadow' : 'Background: plain';
};
document.querySelector('#depth').onclick = event => {
  const enabled = !outlines.material.depthTest;
  outlines.traverse(object => { if (object.material) object.material.depthTest = enabled; });
  event.target.textContent = `Depth test: ${outlines.material.depthTest ? 'on' : 'off'}`;
};
function resize() {
  const bounds = canvas.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(bounds.width, bounds.height, false);
  camera.aspect = bounds.width / bounds.height; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function frame(now) {
  requestAnimationFrame(frame);
  if (running) time += Math.min((now - last) / 1000, .05);
  last = now;
  const distance = document.querySelector('#distance').valueAsNumber;
  camera.position.copy(anchor).add(new THREE.Vector3(0, distance * .8, distance * .6)); camera.lookAt(anchor);
  orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), document.querySelector('#angle').valueAsNumber * Math.PI / 180);
  orientation.premultiply(camera.quaternion);
  player.group.quaternion.copy(orientation); player.update(time, false);
  profile.phase = document.querySelector('#phase').valueAsNumber * Math.PI / 180;
  paradise.update(time, orientation, anchor, camera, true);
  for (const object of ground) object.visible = meadow;
  lighting.update(anchor, true);
  renderer.render(scene, camera);
  if (now > reportAt) {
    reportAt = now + 250;
    document.querySelector('#status').textContent = JSON.stringify({ running, time: +time.toFixed(2),
      distance, angle: document.querySelector('#angle').valueAsNumber,
      phase: document.querySelector('#phase').valueAsNumber, meadow, depthTest: outlines.material.depthTest,
      calls: renderer.info.render.calls, lines: renderer.info.render.lines, triangles: renderer.info.render.triangles, errors }, null, 2);
  }
}
// Complete the meadow's entrance fade before the first frozen comparison.
paradise.update(-4, orientation, anchor, camera, true);
requestAnimationFrame(frame);
