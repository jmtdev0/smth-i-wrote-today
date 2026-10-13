import * as THREE from 'three';
import { createTunnelWorld, createButterflyLantern, constrainTunnelPosition,
  TUNNEL_RADIUS, TUNNEL_EXIT_Z, TUNNEL_VIEW_DISTANCE, RESCUE_COUNT } from './TunnelWorld.js';
import { createButterflyParadise, meadowHeight } from './ButterflyParadise.js';
import { createWorldAtmosphere, HEAVEN_SKY } from './WorldAtmosphere.js';
import { createButterfly } from './Butterfly.js';
import { createAutonomousButterflies } from './AutonomousButterflies.js';
import { createResonanceEffects } from './ResonanceEffects.js';
import { createChirpGesture, createChirpButtons } from './chirpInput.js';
import { gamepadButton, resetGamepadMotion, readGamepadMotion, advanceGamepadZoom, createR3ViewGesture,
  GAMEPAD_ACTION_BUTTONS, dispatchGamepadAction } from './gamepadInput.js';
import { emitButterflyChirp, releaseButterflyGroup } from './chirpAction.js';
import { advanceAltitude, cameraRelativeMovement, BUTTERFLY_VERTICAL_SPEED } from './flight.js';
import { CAMERA_PITCH_LIMIT } from './angles.js';
import { createCameraView, FIRST_PERSON_DISTANCE } from './CameraView.js';
import { createLoopingAudio } from './audio.js';
import { resolveStartPosition } from './startPosition.js';
import { createSkyVideo, DEFAULT_SKY_VIDEO_OPACITY, MAX_SKY_VIDEO_OPACITY, skyVideoOpacity } from './SkyVideo.js';
import './style.css';
import { createHeavenLighting, enableButterflyShadows } from './HeavenLighting.js';

const canvas = document.querySelector('#scene');
const settingsClose = document.querySelector('#settings-close');
const settingsPanel = document.querySelector('#settings-panel');
const cameraSensitivityInput = document.querySelector('#camera-sensitivity');
const cameraSensitivityValue = document.querySelector('#camera-sensitivity-value');
const musicVolumeInput = document.querySelector('#music-volume');
const musicVolumeValue = document.querySelector('#music-volume-value');
const effectsVolumeInput = document.querySelector('#effects-volume');
const effectsVolumeValue = document.querySelector('#effects-volume-value');
const skyVideoOpacityInput = document.querySelector('#sky-video-opacity');
const skyVideoOpacityValue = document.querySelector('#sky-video-opacity-value');
const SETTINGS_STORAGE_KEY = 'smth-i-wrote-today-settings-v1';
const DEFAULT_SETTINGS = Object.freeze({ cameraSensitivity: 1, musicVolume: 1, effectsVolume: 1, skyVideoOpacity: DEFAULT_SKY_VIDEO_OPACITY });
const settings = loadSettings();
const ambientAudio = createLoopingAudio('/emelie%20trahan%20-%20you%20chose%20this.mp3', { maxVolume: settings.musicVolume, fadeInSeconds: 2.5 });
const skyVideo = createSkyVideo(ambientAudio.audio, { rate: .88, offset: 2.25 });
const skyVideoTextures = skyVideo.videos.map(video => {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
});
const unlockAudio = () => { ambientAudio.start(); };
window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
ambientAudio.start();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(HEAVEN_SKY.horizon);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, .1, TUNNEL_VIEW_DISTANCE);
const atmosphere = createWorldAtmosphere(scene, camera);
const MAX_CAMERA_DISTANCE = TUNNEL_RADIUS - 4;
const cameraView = createCameraView({ maxDistance: MAX_CAMERA_DISTANCE });
const tunnel = createTunnelWorld();
const paradise = createButterflyParadise();
scene.add(tunnel.group, paradise.group);
const skyApparitionTexture = new THREE.TextureLoader().load(
  '/1dad95b9-3fb0-4e1a-9c5a-662cc640537c_1758672000.jpeg',
  texture => {
    if (disposed) { texture.dispose(); return; }
    renderer.initTexture(texture);
    paradise.setSkyImage(texture, texture.image.width / texture.image.height);
  }, undefined, () => console.warn('No se pudo cargar la imagen ocasional del cielo.'));
skyApparitionTexture.colorSpace = THREE.SRGBColorSpace;
const lighting = createHeavenLighting(scene, renderer);
const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48);
butterfly.group.traverse(object => { if (object.material) object.material.fog = false; });
scene.add(butterfly.group);
const playerLantern = createButterflyLantern();
scene.add(playerLantern.group);
const autonomousButterflies = createAutonomousButterflies(RESCUE_COUNT, { tunnel: true });
scene.add(autonomousButterflies.group);
enableButterflyShadows(butterfly.group);
enableButterflyShadows(autonomousButterflies.group);
const resonanceEffects = createResonanceEffects(butterfly, autonomousButterflies, paradise);
resonanceEffects.setVolume(settings.effectsVolume);
scene.add(resonanceEffects.group);

let yaw = 0, pitch = 0, desiredYaw = 0, desiredPitch = 0;
let time = 0, last = performance.now(), frame;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLAYER_START = resolveStartPosition(location.search, { development: import.meta.env.DEV });
const player = new THREE.Vector3(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);
const previousPlayer = player.clone();
const landscapeChirpColor = new THREE.Color('#ffffff');
autonomousButterflies.update(0, player, camera.quaternion);
function chirp(charge = 0, { restoreWhite = false, recruit = true } = {}) {
  if (paused || document.hidden || !settingsPanel.hidden) return;
  const result = emitButterflyChirp({ time, player, butterfly, flock: autonomousButterflies,
    paradise, tunnel, effects: resonanceEffects, landscapeColor: landscapeChirpColor,
    charge, restoreWhite, recruit });
  return result;
}
function releaseGroup() {
  if (paused || document.hidden || !settingsPanel.hidden) return;
  const released = releaseButterflyGroup({ time, tunnel, flock: autonomousButterflies, paradise });
  if (released) { chirpButtons.cancel(); chirpGesture.reset(); butterfly.setChirpCharge(0); }
  canvas.focus({ preventScroll: true });
}
const chirpGesture = createChirpGesture(chirp);
const chirpButtons = createChirpButtons(chirp);
const keys = new Set();
const gamepadInput = resetGamepadMotion();
const r3ViewGesture = createR3ViewGesture();
let activeGamepadIndex = null;
const gamepadButtons = new Map();
const pointers = new Map();
const abort = new AbortController();
const listen = (target, name, fn, options = {}) => target.addEventListener(name, fn, { ...options, signal: abort.signal });
syncSettingsControls();
listen(settingsClose, 'click', () => setSettingsOpen(false));
listen(settingsPanel, 'input', e => {
  if (e.target === cameraSensitivityInput) {
    settings.cameraSensitivity = Number(cameraSensitivityInput.value);
    cameraSensitivityValue.value = `${settings.cameraSensitivity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  } else if (e.target === musicVolumeInput) {
    settings.musicVolume = Number(musicVolumeInput.value) / 100;
    musicVolumeValue.value = `${Math.round(settings.musicVolume * 100)}%`;
    ambientAudio.setVolume(settings.musicVolume);
  } else if (e.target === effectsVolumeInput) {
    settings.effectsVolume = Number(effectsVolumeInput.value) / 100;
    effectsVolumeValue.value = `${Math.round(settings.effectsVolume * 100)}%`;
    resonanceEffects.setVolume(settings.effectsVolume);
  } else if (e.target === skyVideoOpacityInput) {
    settings.skyVideoOpacity = skyVideoOpacity(skyVideoOpacityInput.valueAsNumber / 100);
    skyVideoOpacityValue.value = `${Math.round(settings.skyVideoOpacity * 100)}%`;
  } else return;
  saveSettings();
});
listen(window, 'keydown', e => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (!e.repeat) setSettingsOpen(settingsPanel.hidden);
    return;
  }
  if (!settingsPanel.hidden) {
    if (e.code === 'Tab') {
      const controls = [...settingsPanel.querySelectorAll('button, input')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    return;
  }
  if (!e.repeat && e.code === 'KeyP') { paused = !paused; keys.clear(); chirpButtons.cancel(); r3ViewGesture.reset(); }
  if (e.code === 'KeyE' || e.code === 'KeyQ') {
    e.preventDefault();
    if (!e.repeat && !paused) chirpButtons.down(e.code, performance.now(), e.code === 'KeyE');
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    if (!e.repeat) releaseGroup();
  }
  if (e.code === 'KeyR') {
    e.preventDefault();
    if (!e.repeat) chirp(0, { restoreWhite: true, recruit: false });
  }
  if (['Space', 'AltLeft', 'AltRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault(); keys.add(e.code);
  }
});
listen(window, 'keyup', e => {
  keys.delete(e.code);
  if (e.code === 'KeyE' || e.code === 'KeyQ') chirpButtons.up(e.code, performance.now());
});
listen(window, 'gamepadconnected', e => {
  if (activeGamepadIndex === null || e.gamepad.mapping === 'standard') activeGamepadIndex = e.gamepad.index;
});
listen(window, 'gamepaddisconnected', e => {
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null; gamepadButtons.clear(); chirpButtons.cancel('gamepad');
    r3ViewGesture.reset();
  }
  resetGamepadInput();
});
const clearInput = () => {
  keys.clear(); pointers.clear(); chirpGesture.reset(); resetGamepadInput();
  gamepadButtons.clear(); chirpButtons.cancel();
  r3ViewGesture.reset();
  butterfly.setChirpCharge(0);
};
listen(window, 'blur', clearInput);
listen(document, 'visibilitychange', () => { clearInput(); last = performance.now(); });
listen(canvas, 'pointerdown', e => {
  if (!settingsPanel.hidden) return;
  chirpGesture.down(e);
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
listen(canvas, 'pointermove', e => {
  chirpGesture.move(e);
  const previous = pointers.get(e.pointerId);
  if (!previous) return;
  if (pointers.size === 1) {
    desiredYaw -= (e.clientX - previous.x) * .005 * settings.cameraSensitivity;
    desiredPitch = THREE.MathUtils.clamp(desiredPitch + (e.clientY - previous.y) * .004 * settings.cameraSensitivity, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  } else {
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
    const before = Math.hypot(previous.x - other.x, previous.y - other.y);
    const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    cameraView.zoom((before - after) * .04);
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
listen(canvas, 'pointerup', e => { chirpGesture.up(e); pointers.delete(e.pointerId); });
for (const event of ['pointercancel', 'lostpointercapture']) {
  listen(canvas, event, e => { chirpGesture.cancel(e); pointers.delete(e.pointerId); });
}
listen(canvas, 'wheel', e => {
  e.preventDefault();
  if (!settingsPanel.hidden) return;
  cameraView.zoom(e.deltaY * .012);
}, { passive: false });
function resize() {
  const ratio = Math.min(devicePixelRatio, 1.75);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
listen(window, 'resize', resize);
resize();

function resetGamepadInput() {
  resetGamepadMotion(gamepadInput);
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
    return {
      cameraSensitivity: settingNumber(stored.cameraSensitivity, DEFAULT_SETTINGS.cameraSensitivity, .1, 2.5),
      musicVolume: settingNumber(stored.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
      effectsVolume: settingNumber(stored.effectsVolume, DEFAULT_SETTINGS.effectsVolume, 0, 1),
      skyVideoOpacity: skyVideoOpacity(stored.skyVideoOpacity),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function settingNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? THREE.MathUtils.clamp(number, min, max) : fallback;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage may be disabled. */ }
}

function syncSettingsControls() {
  cameraSensitivityInput.value = String(settings.cameraSensitivity);
  cameraSensitivityValue.value = `${settings.cameraSensitivity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  musicVolumeInput.value = String(Math.round(settings.musicVolume * 100));
  musicVolumeValue.value = `${Math.round(settings.musicVolume * 100)}%`;
  effectsVolumeInput.value = String(Math.round(settings.effectsVolume * 100));
  effectsVolumeValue.value = `${Math.round(settings.effectsVolume * 100)}%`;
  skyVideoOpacityInput.max = String(MAX_SKY_VIDEO_OPACITY * 100);
  skyVideoOpacityInput.value = String(Math.round(settings.skyVideoOpacity * 100));
  skyVideoOpacityValue.value = `${Math.round(settings.skyVideoOpacity * 100)}%`;
}

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  keys.clear(); pointers.clear(); chirpButtons.cancel(); chirpGesture.reset(); resetGamepadInput();
  butterfly.setChirpCharge(0);
  r3ViewGesture.reset();
  (open ? settingsClose : canvas).focus({ preventScroll: true });
}

function readGamepadInput(now) {
  resetGamepadInput();
  if (typeof navigator.getGamepads !== 'function' || document.hidden || !document.hasFocus()) {
    r3ViewGesture.reset(); return;
  }

  let gamepads;
  try {
    gamepads = Array.from(navigator.getGamepads()).filter(gamepad => gamepad?.connected);
  } catch {
    r3ViewGesture.reset(); return;
  }
  const active = gamepads.find(gamepad => gamepad.index === activeGamepadIndex)
    ?? gamepads.find(gamepad => gamepad.mapping === 'standard')
    ?? gamepads[0];
  if (!active) {
    activeGamepadIndex = null;
    gamepadButtons.clear(); chirpButtons.cancel('gamepad');
    r3ViewGesture.reset();
    return;
  }
  if (activeGamepadIndex !== active.index) {
    gamepadButtons.clear(); chirpButtons.cancel('gamepad'); r3ViewGesture.reset();
  }
  activeGamepadIndex = active.index;

  // Options, triangle, Cross, circle and square. Edges avoid repeated calls.
  for (const index of GAMEPAD_ACTION_BUTTONS) {
    const pressed = gamepadButton(active, index) > .5, wasPressed = gamepadButtons.get(index) ?? false;
    gamepadButtons.set(index, pressed);
    if (pressed !== wasPressed) dispatchGamepadAction(index, pressed, now, {
      enabled: !paused && settingsPanel.hidden,
      toggleSettings: () => setSettingsOpen(settingsPanel.hidden),
      releaseGroup, chirp, chirpButtons,
    });
  }
  readGamepadMotion(active, gamepadInput, settingsPanel.hidden && !paused);
  if (r3ViewGesture.update(active, now, settingsPanel.hidden && !paused)) cameraView.toggle();
  if (r3ViewGesture.suppressZoom) gamepadInput.zoom = 0;
}

function animate(now) {
  frame = requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (document.hidden) return;
  readGamepadInput(now);
  butterfly.setChirpCharge(!paused && settingsPanel.hidden ? chirpButtons.charge(now) : 0);
  const motionDt = paused ? 0 : dt;
  time += motionDt;
  const keyboardRise = Number(keys.has('Space')) - Number(keys.has('AltLeft') || keys.has('AltRight'));
  const rise = THREE.MathUtils.clamp(keyboardRise + gamepadInput.ascend - gamepadInput.descend, -1, 1);
  desiredYaw += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * dt * .6 * settings.cameraSensitivity;
  desiredYaw -= gamepadInput.lookX * dt * 2.4 * settings.cameraSensitivity;
  desiredPitch = THREE.MathUtils.clamp(desiredPitch + gamepadInput.lookY * dt * 1.9 * settings.cameraSensitivity,
    -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  yaw = THREE.MathUtils.damp(yaw, desiredYaw, 12, dt);
  pitch = THREE.MathUtils.damp(pitch, desiredPitch, 12, dt);
  cameraView.setDistance(advanceGamepadZoom(cameraView.targetDistance, gamepadInput.zoom, dt,
    FIRST_PERSON_DISTANCE, MAX_CAMERA_DISTANCE));
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - gamepadInput.moveY;
  const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + gamepadInput.moveX;
  const movement = cameraRelativeMovement(yaw, pitch, forward, sideways, rise);
  const boostedDt = motionDt * autonomousButterflies.boost(time);
  const lateralStep = movement.x * boostedDt * BUTTERFLY_VERTICAL_SPEED;
  previousPlayer.copy(player);
  player.x += lateralStep;
  player.y = advanceAltitude(player.y, movement.y, boostedDt);
  player.z += movement.z * boostedDt * BUTTERFLY_VERTICAL_SPEED;
  if (tunnel.solid) constrainTunnelPosition(player, 2, previousPlayer);
  if (player.z < TUNNEL_EXIT_Z || !tunnel.solid) {
    player.y = Math.max(player.y, meadowHeight(player.x, player.z) + 2);
  }
  butterfly.group.visible = cameraView.update(camera, player, yaw, pitch, dt, {
    tunnelSolid: tunnel.solid, meadowEnabled: player.z < TUNNEL_EXIT_Z || !tunnel.solid,
    openWorld: !tunnel.solid,
  });
  butterfly.group.position.copy(player);
  butterfly.group.position.y += Math.sin(time * 1.3) * .10;
  butterfly.group.quaternion.copy(camera.quaternion);
  butterfly.update(time, !!(rise || forward || sideways));
  tunnel.update(time, player, autonomousButterflies.agents);
  atmosphere.update(tunnel.visibility);
  autonomousButterflies.update(time, player, camera.quaternion, !paused, lateralStep, tunnel.solid);
  resonanceEffects.update(time, camera.quaternion);
  skyVideo.update(now);
  paradise.setSkyVideo(skyVideoTextures[skyVideo.activeIndex], skyVideo.ready ? settings.skyVideoOpacity : 0,
    skyVideo.video.videoWidth / skyVideo.video.videoHeight || 16 / 9,
    skyVideoTextures[skyVideo.previousIndex], skyVideo.blend);
  paradise.update(time, camera.quaternion, player, camera, !tunnel.solid, butterfly.wingbeatStrength,
    autonomousButterflies.boost(time));
  playerLantern.update(butterfly.group.position, camera.quaternion,
    1 + autonomousButterflies.glow(time) * .25, tunnel.visibility, cameraView.blend);
  ambientAudio.update(now);
  lighting.update(player, !tunnel.solid);
  paradise.renderAtmosphere(renderer, dt * 1000);
  renderer.render(scene, camera);
}
// Compile hidden chirp/halo materials too, before the first interaction.
// The light layout stays fixed throughout rescues and resets.
let disposed = false;
void Promise.all([renderer.compileAsync(scene, camera), paradise.prepareAtmosphere(renderer)]).catch(error => {
  console.warn('Scene precompilation failed; falling back to normal rendering.', error);
}).then(() => {
  if (disposed) return;
  last = performance.now();
  frame = requestAnimationFrame(animate);
});
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  cancelAnimationFrame(frame); abort.abort();
  const resources = new Set();
  // The completed tunnel is detached, but still owns resources for reset.
  const collectResources = object => {
    if (object.isInstancedMesh) resources.add(object);
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat()) if (material) resources.add(material);
  };
  scene.traverse(collectResources);
  tunnel.group.traverse(collectResources);
  for (const resource of resources) resource.dispose();
  resonanceEffects.dispose();
  paradise.dispose();
  lighting.dispose();
  skyVideo.dispose();
  for (const texture of skyVideoTextures) texture.dispose();
  skyApparitionTexture.dispose();
  ambientAudio.audio.pause();
  renderer.dispose();
});
