import * as THREE from 'three';
import { createTunnelWorld, createButterflyLantern, constrainTunnelPosition,
  TUNNEL_RADIUS, TUNNEL_EXIT_Z, TUNNEL_VIEW_DISTANCE, RESCUE_COUNT } from './TunnelWorld.js';
import { createButterflyParadise, meadowHeight } from './ButterflyParadise.js';
import { createWorldAtmosphere, HEAVEN_SKY } from './WorldAtmosphere.js';
import { createButterfly } from './Butterfly.js';
import { createAutonomousButterflies } from './AutonomousButterflies.js';
import { createResonanceEffects } from './ResonanceEffects.js';
import { createChirpGesture } from './chirpInput.js';
import { advanceAltitude, cameraRelativeMovement, BUTTERFLY_VERTICAL_SPEED } from './flight.js';
import { CAMERA_PITCH_LIMIT } from './angles.js';
import { createMeadowCameraCollision, cameraNearRadius } from './MeadowCameraCollision.js';
import { createLoopingAudio } from './audio.js';
import { MAX_CHIRP_CHARGE_SECONDS } from './resonance.js';
import { resolveStartPosition } from './startPosition.js';
import { createSkyVideo, DEFAULT_SKY_VIDEO_OPACITY, MAX_SKY_VIDEO_OPACITY, skyVideoOpacity } from './SkyVideo.js';
import './style.css';

const canvas = document.querySelector('#scene');
const settingsToggle = document.querySelector('#settings-toggle');
const settingsPanel = document.querySelector('#settings-panel');
const cameraSensitivityInput = document.querySelector('#camera-sensitivity');
const cameraSensitivityValue = document.querySelector('#camera-sensitivity-value');
const musicVolumeInput = document.querySelector('#music-volume');
const musicVolumeValue = document.querySelector('#music-volume-value');
const skyVideoOpacityInput = document.querySelector('#sky-video-opacity');
const skyVideoOpacityValue = document.querySelector('#sky-video-opacity-value');
const SETTINGS_STORAGE_KEY = 'smth-i-wrote-today-settings-v1';
const DEFAULT_SETTINGS = Object.freeze({ cameraSensitivity: 1, musicVolume: 1, skyVideoOpacity: DEFAULT_SKY_VIDEO_OPACITY });
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
const meadowCameraCollision = createMeadowCameraCollision();
const MAX_CAMERA_DISTANCE = TUNNEL_RADIUS - 4;
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
scene.add(new THREE.HemisphereLight('#f2fff6', '#90a99b', 1.8));
const light = new THREE.DirectionalLight('#fff0cf', 2.2);
light.position.set(-80, 120, -260);
light.target.position.set(0, -20, -310);
scene.add(light, light.target);
const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
butterfly.group.scale.setScalar(.48);
butterfly.group.traverse(object => { if (object.material) object.material.fog = false; });
scene.add(butterfly.group);
const playerLantern = createButterflyLantern();
scene.add(playerLantern.group);
const autonomousButterflies = createAutonomousButterflies(RESCUE_COUNT, { tunnel: true });
scene.add(autonomousButterflies.group);
const resonanceEffects = createResonanceEffects(butterfly, autonomousButterflies);
scene.add(resonanceEffects.group);

let yaw = 0, pitch = 0, desiredYaw = 0, desiredPitch = 0;
let distance = 15, desiredDistance = 15;
let time = 0, last = performance.now(), frame;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLAYER_START = resolveStartPosition(location.search, { development: import.meta.env.DEV });
const player = new THREE.Vector3(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);
const previousPlayer = player.clone();
const landscapeChirpColor = new THREE.Color('#ffffff');
autonomousButterflies.update(0, player, camera.quaternion);
function chirp(charge = 0) {
  if (paused || document.hidden) return;
  const result = autonomousButterflies.chirp(time, player, charge);
  if (result.emitted) {
    const heavenAnswer = player.z < TUNNEL_EXIT_Z || !tunnel.solid
      ? paradise.chirp(time, player, result.radius) : null;
    if (heavenAnswer) {
      autonomousButterflies.adoptColor(heavenAnswer.color);
      butterfly.adoptColor(heavenAnswer.color);
      landscapeChirpColor.copy(heavenAnswer.color);
    }
    if (!tunnel.solid) paradise.pulse(time, player, landscapeChirpColor, result.charge);
    butterfly.releaseChirp(time, result.charge);
    resonanceEffects.call(player, time, result.receivers, result.radius, result.charge, heavenAnswer);
  }
}
function chargeFrom(startedAt) {
  return THREE.MathUtils.clamp((performance.now() - startedAt) / (MAX_CHIRP_CHARGE_SECONDS * 1000), 0, 1);
}
const chirpGesture = createChirpGesture(chirp);
const keys = new Set();
const gamepadInput = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, ascend: 0, descend: 0 };
let activeGamepadIndex = null;
let circleWasPressed = false;
let keyboardChirpStartedAt = null;
let gamepadChirpStartedAt = null;
const pointers = new Map();
const abort = new AbortController();
const listen = (target, name, fn, options = {}) => target.addEventListener(name, fn, { ...options, signal: abort.signal });
syncSettingsControls();
listen(settingsToggle, 'click', () => setSettingsOpen(settingsPanel.hidden));
listen(settingsPanel, 'input', e => {
  if (e.target === cameraSensitivityInput) {
    settings.cameraSensitivity = Number(cameraSensitivityInput.value);
    cameraSensitivityValue.value = `${settings.cameraSensitivity.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  } else if (e.target === musicVolumeInput) {
    settings.musicVolume = Number(musicVolumeInput.value) / 100;
    musicVolumeValue.value = `${Math.round(settings.musicVolume * 100)} %`;
    ambientAudio.setVolume(settings.musicVolume);
  } else if (e.target === skyVideoOpacityInput) {
    settings.skyVideoOpacity = skyVideoOpacity(skyVideoOpacityInput.valueAsNumber / 100);
    skyVideoOpacityValue.value = `${Math.round(settings.skyVideoOpacity * 100)} %`;
  } else return;
  saveSettings();
});
listen(window, 'keydown', e => {
  if (e.code === 'Escape' && !settingsPanel.hidden) { setSettingsOpen(false); settingsToggle.focus(); }
  if (settingsPanel.contains(e.target)) return;
  if (!e.repeat && e.code === 'KeyP') { paused = !paused; keys.clear(); }
  if (e.code === 'KeyE') {
    e.preventDefault();
    if (!e.repeat && keyboardChirpStartedAt === null) keyboardChirpStartedAt = performance.now();
  }
  if (!e.repeat && e.code === 'KeyR') {
    desiredYaw = 0; desiredPitch = 0; desiredDistance = 15;
    meadowCameraCollision.reset();
    player.set(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);
    butterfly.resetTint();
    landscapeChirpColor.set('#ffffff');
    paradise.reset();
    tunnel.reset();
    autonomousButterflies.reset(time, player);
    resonanceEffects.reset();
    chirpGesture.reset();
  }
  if (['Space', 'AltLeft', 'AltRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault(); keys.add(e.code);
  }
});
listen(window, 'keyup', e => {
  keys.delete(e.code);
  if (e.code !== 'KeyE' || keyboardChirpStartedAt === null) return;
  const charge = chargeFrom(keyboardChirpStartedAt);
  keyboardChirpStartedAt = null;
  chirp(charge);
});
listen(window, 'gamepadconnected', e => {
  if (activeGamepadIndex === null || e.gamepad.mapping === 'standard') activeGamepadIndex = e.gamepad.index;
});
listen(window, 'gamepaddisconnected', e => {
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null; circleWasPressed = false; gamepadChirpStartedAt = null;
  }
  resetGamepadInput();
});
const clearInput = () => {
  keys.clear(); pointers.clear(); chirpGesture.reset(); resetGamepadInput();
  circleWasPressed = false; keyboardChirpStartedAt = null; gamepadChirpStartedAt = null;
  butterfly.setChirpCharge(0);
};
listen(window, 'blur', clearInput);
listen(document, 'visibilitychange', () => { clearInput(); last = performance.now(); });
listen(canvas, 'pointerdown', e => {
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
    desiredDistance = THREE.MathUtils.clamp(desiredDistance + (before - after) * .04, 4, MAX_CAMERA_DISTANCE);
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
listen(canvas, 'pointerup', e => { chirpGesture.up(e); pointers.delete(e.pointerId); });
for (const event of ['pointercancel', 'lostpointercapture']) {
  listen(canvas, event, e => { chirpGesture.cancel(e); pointers.delete(e.pointerId); });
}
listen(canvas, 'wheel', e => {
  e.preventDefault();
  desiredDistance = THREE.MathUtils.clamp(desiredDistance + e.deltaY * .012, 4, MAX_CAMERA_DISTANCE);
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
  gamepadInput.moveX = 0;
  gamepadInput.moveY = 0;
  gamepadInput.lookX = 0;
  gamepadInput.lookY = 0;
  gamepadInput.ascend = 0;
  gamepadInput.descend = 0;
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
    return {
      cameraSensitivity: settingNumber(stored.cameraSensitivity, DEFAULT_SETTINGS.cameraSensitivity, .1, 2.5),
      musicVolume: settingNumber(stored.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
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
  cameraSensitivityValue.value = `${settings.cameraSensitivity.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  musicVolumeInput.value = String(Math.round(settings.musicVolume * 100));
  musicVolumeValue.value = `${Math.round(settings.musicVolume * 100)} %`;
  skyVideoOpacityInput.max = String(MAX_SKY_VIDEO_OPACITY * 100);
  skyVideoOpacityInput.value = String(Math.round(settings.skyVideoOpacity * 100));
  skyVideoOpacityValue.value = `${Math.round(settings.skyVideoOpacity * 100)} %`;
}

function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute('aria-expanded', String(open));
  settingsToggle.setAttribute('aria-label', open ? 'Cerrar ajustes' : 'Abrir ajustes');
}

function gamepadAxis(gamepad, index) {
  const value = Number(gamepad.axes?.[index] ?? 0);
  const magnitude = Math.abs(value);
  const deadzone = .16;
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
}

function gamepadButton(gamepad, index) {
  const button = gamepad.buttons?.[index];
  return button ? Math.max(Number(button.value ?? 0), button.pressed ? 1 : 0) : 0;
}

function readGamepadInput() {
  resetGamepadInput();
  if (typeof navigator.getGamepads !== 'function' || document.hidden || !document.hasFocus()) return;

  let gamepads;
  try {
    gamepads = Array.from(navigator.getGamepads()).filter(gamepad => gamepad?.connected);
  } catch {
    return;
  }
  const active = gamepads.find(gamepad => gamepad.index === activeGamepadIndex)
    ?? gamepads.find(gamepad => gamepad.mapping === 'standard')
    ?? gamepads[0];
  if (!active) {
    activeGamepadIndex = null;
    circleWasPressed = false;
    gamepadChirpStartedAt = null;
    return;
  }
  activeGamepadIndex = active.index;

  const dpadX = gamepadButton(active, 15) - gamepadButton(active, 14);
  const dpadY = gamepadButton(active, 13) - gamepadButton(active, 12);
  gamepadInput.moveX = THREE.MathUtils.clamp(gamepadAxis(active, 0) + dpadX, -1, 1);
  gamepadInput.moveY = THREE.MathUtils.clamp(gamepadAxis(active, 1) + dpadY, -1, 1);
  gamepadInput.lookX = gamepadAxis(active, 2);
  gamepadInput.lookY = gamepadAxis(active, 3);
  const circlePressed = gamepadButton(active, 1) > .5;
  if (circlePressed && !circleWasPressed) gamepadChirpStartedAt = performance.now();
  if (!circlePressed && circleWasPressed && gamepadChirpStartedAt !== null) {
    const charge = chargeFrom(gamepadChirpStartedAt);
    gamepadChirpStartedAt = null;
    chirp(charge);
  }
  circleWasPressed = circlePressed;
  // Standard mapping: L2/R2 are buttons 6/7 on a DualShock 4.
  gamepadInput.descend = gamepadButton(active, 6);
  gamepadInput.ascend = gamepadButton(active, 7);
}

function animate(now) {
  frame = requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (document.hidden) return;
  readGamepadInput();
  const chargeStarts = [keyboardChirpStartedAt, gamepadChirpStartedAt].filter(startedAt => startedAt !== null);
  butterfly.setChirpCharge(!paused && chargeStarts.length ? chargeFrom(Math.min(...chargeStarts)) : 0);
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
  distance = THREE.MathUtils.damp(distance, desiredDistance, 12, dt);
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
  const cameraLift = Math.min(3, distance * .2);
  camera.position.set(player.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    player.y + Math.sin(pitch) * distance + cameraLift, player.z + Math.cos(yaw) * Math.cos(pitch) * distance);
  if (tunnel.solid) constrainTunnelPosition(camera.position, .8, player);
  const cameraFraction = meadowCameraCollision.update(player, camera.position, dt, {
    enabled: player.z < TUNNEL_EXIT_Z || !tunnel.solid,
    openWorld: !tunnel.solid, nearRadius: cameraNearRadius(camera),
  });
  camera.lookAt(player.x, player.y + cameraLift * cameraFraction, player.z);
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
  paradise.update(time, camera.quaternion, player, camera, !tunnel.solid, butterfly.wingbeatStrength);
  playerLantern.update(butterfly.group.position, camera.quaternion, 1 + autonomousButterflies.glow(time) * .25);
  ambientAudio.update(now);
  renderer.render(scene, camera);
}
// Compile hidden chirp/halo materials too, before the first interaction.
// The light layout stays fixed throughout rescues and resets.
let disposed = false;
void renderer.compileAsync(scene, camera).catch(error => {
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
  skyVideo.dispose();
  for (const texture of skyVideoTextures) texture.dispose();
  skyApparitionTexture.dispose();
  ambientAudio.audio.pause();
  renderer.dispose();
});
