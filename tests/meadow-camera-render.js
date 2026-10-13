import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createButterfly } from '../src/Butterfly.js';
import { createWorldAtmosphere } from '../src/WorldAtmosphere.js';
import { meadowHeight, meadowSurfaceHeight } from '../src/MeadowSurface.js';
import { createMeadowCameraCollision } from '../src/MeadowCameraCollision.js';
import { createCameraView, FIRST_PERSON_DISTANCE } from '../src/CameraView.js';
import { resetGamepadMotion, readGamepadMotion, advanceGamepadZoom, createR3ViewGesture } from '../src/gamepadInput.js';
import { cameraRelativeMovement, BUTTERFLY_VERTICAL_SPEED } from '../src/flight.js';

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
const cameraView = createCameraView({ collision });
const r3ViewGesture = createR3ViewGesture();
const player = new THREE.Vector3();
const projected = new THREE.Vector3();
let pitch, yaw, enabled = true, sweep = false, last = performance.now(), time = 0, reportAt = 0;
let tapEvents = [];
let pendingCut = false, lastCut = null, cutCount = 0, zoomBlendFrames = 0;
function cutView() {
  cameraView.toggle();
  pendingCut = true;
  cutCount++;
}
const input = resetGamepadMotion();
const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
let inputEnabled = true;
function zoom(axis) {
  tapEvents = [];
  pad.connected = true; pad.axes[1] = axis;
  pad.buttons[11] = { pressed: true, value: 1 };
}
document.querySelector('#zoom-in').onclick = () => zoom(-1);
document.querySelector('#zoom-out').onclick = () => zoom(1);
document.querySelector('#release-r3').onclick = () => { pad.buttons[11] = { pressed: false, value: 0 }; };
document.querySelector('#neutral').onclick = () => { pad.axes[1] = 0; };
document.querySelector('#disconnect').onclick = () => { pad.connected = false; };
document.querySelector('#input-enabled').onclick = event => {
  inputEnabled = !inputEnabled;
  event.target.textContent = inputEnabled ? 'Suspend input' : 'Resume input';
};
document.querySelector('#wheel-in').onclick = () => { zoomBlendFrames = 0; cameraView.zoom(-100); };
document.querySelector('#wheel-out').onclick = () => { zoomBlendFrames = 0; cameraView.zoom(12.2); };
function simulateDoubleTap(delays, drift = 0) {
  pad.connected = true; pad.axes[1] = 0; pad.buttons[11] = { pressed: false, value: 0 };
  const now = performance.now();
  tapEvents = delays.map((delay, i) => ({ at: now + delay, pressed: i % 2 === 0,
    axis: i % 2 === 0 ? drift : 0 }));
}
document.querySelector('#double-r3').onclick = () => simulateDoubleTap([40, 100, 180, 240]);
document.querySelector('#slow-double-r3').onclick = () => simulateDoubleTap([40, 320, 720, 800], -.3);

function setView(view) {
  const poses = {
    low: [0, -255, -.5, .4, 15], deep: [0, -255, -1.35, .4, 15],
    clear: [0, -255, .3, .4, 15], far: [0, -255, -.6, .4, 42],
    slope: [67, -400, -.25, 0, 15],
  };
  const [x, z, nextPitch, nextYaw, nextDistance] = poses[view];
  player.set(x, meadowHeight(x, z) + 2, z);
  pitch = nextPitch; yaw = nextYaw; cameraView.setDistance(nextDistance); sweep = false;
  collision.reset(); r3ViewGesture.reset(); tapEvents = [];
  pendingCut = false; lastCut = null; cutCount = 0; zoomBlendFrames = 0;
  pad.axes[1] = 0; pad.buttons[11] = { pressed: false, value: 0 };
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
  while (tapEvents.length && now >= tapEvents[0].at) {
    const event = tapEvents.shift();
    pad.axes[1] = event.axis;
    pad.buttons[11] = { pressed: event.pressed, value: Number(event.pressed) };
    if (r3ViewGesture.update(pad, event.at, inputEnabled)) cutView();
  }
  readGamepadMotion(pad, input, inputEnabled);
  if (r3ViewGesture.update(pad, now, inputEnabled)) cutView();
  if (r3ViewGesture.suppressZoom) input.zoom = 0;
  cameraView.setDistance(advanceGamepadZoom(cameraView.targetDistance, input.zoom, dt, FIRST_PERSON_DISTANCE, 42));
  const movement = cameraRelativeMovement(yaw, pitch, -input.moveY, input.moveX, input.ascend - input.descend);
  player.x += movement.x * dt * BUTTERFLY_VERTICAL_SPEED;
  player.y += movement.y * dt * BUTTERFLY_VERTICAL_SPEED;
  player.z += movement.z * dt * BUTTERFLY_VERTICAL_SPEED;
  player.y = Math.max(player.y, meadowHeight(player.x, player.z) + 2);
  butterfly.group.visible = cameraView.update(camera, player, yaw, pitch, dt, { meadowEnabled: enabled });
  if (cameraView.blend > 0 && cameraView.blend < 1) zoomBlendFrames++;
  if (pendingCut) {
    lastCut = { firstFrameBlend: cameraView.blend, firstFrameDistance: cameraView.distance,
      target: cameraView.targetDistance, visible: butterfly.group.visible };
    pendingCut = false;
  }
  butterfly.group.position.copy(player);
  butterfly.group.quaternion.copy(camera.quaternion);
  butterfly.update(time, false);
  paradise.update(time, camera.quaternion, player, camera, true);
  renderer.render(scene, camera);
  if (now > reportAt) {
    reportAt = now + 200;
    projected.copy(player).project(camera);
    document.querySelector('#status').textContent = JSON.stringify({
      enabled, sweep, requestedDistance: cameraView.distance, resolvedDistance: +camera.position.distanceTo(player).toFixed(3),
      targetDistance: cameraView.targetDistance, firstPerson: cameraView.firstPerson,
      blend: +cameraView.blend.toFixed(3), avatarVisible: butterfly.group.visible,
      cutCount, lastCut, zoomBlendFrames,
      simulatedInput: input, connected: pad.connected, inputEnabled,
      player: player.toArray().map(value => +value.toFixed(3)),
      groundClearance: +(camera.position.y - meadowSurfaceHeight(camera.position.x, camera.position.z)).toFixed(3),
      playerOnScreen: Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1,
      programs: renderer.info.programs.length,
    });
  }
}
await renderer.compileAsync(scene, camera);
last = performance.now();
requestAnimationFrame(animate);
