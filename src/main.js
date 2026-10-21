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
import { mediaUrl } from './mediaUrl.js';
import { resolveStartPosition } from './startPosition.js';
import { normalizeJoystick } from './mobileJoystickInput.js';
import { createMobileControlVisibility } from './mobileControlVisibility.js';
import { layoutHeavenChirpMenu, createMobileChirpMenu } from './mobileChirpMenu.js';
import { detectControlsMode, controlsModeForPointer } from './controlsMode.js';
import { createSkyVideo, DEFAULT_SKY_VIDEO_OPACITY, MAX_SKY_VIDEO_OPACITY, skyVideoOpacity } from './SkyVideo.js';
import './style.css';
import { createHeavenLighting, enableButterflyShadows } from './HeavenLighting.js';

const canvas = document.querySelector('#scene');
const mobileExperienceNotice = document.querySelector('#mobile-experience-notice');
const mobileExperienceOk = document.querySelector('#mobile-experience-ok');
const mobileControls = document.querySelector('#mobile-controls');
const mobileSettingsHotspot = document.querySelector('#mobile-settings-hotspot');
const mobileSettingsButton = document.querySelector('#mobile-settings-button');
const mobileMoveStick = document.querySelector('#mobile-move-stick');
const mobileLookStick = document.querySelector('#mobile-look-stick');
const mobileChirpTarget = document.querySelector('#mobile-chirp-target');
const mobileChirpMenu = document.querySelector('#mobile-chirp-menu');
const mobileChirpOptions = [...mobileChirpMenu.querySelectorAll('[data-mobile-chirp-option]')];
const mobileChirpReleaseOption = mobileChirpMenu.querySelector('[data-mobile-chirp-option="release"]');
const mobileLayout = matchMedia('(any-pointer: coarse), (max-width: 760px)');
const settingsClose = document.querySelector('#settings-close');
const settingsPanel = document.querySelector('#settings-panel');
let mobileSettingsGearTimer = null;
const controlsHelpGroups = [...document.querySelectorAll('[data-control-group]')];
const controlsHelpZones = [...document.querySelectorAll('[data-control-zone]')];
const controlsReleaseHints = [...document.querySelectorAll('[data-control-release]')];
let activeControlsZone = null;
let controlsReleaseVisible = null;
function getConnectedGamepads() {
  if (typeof navigator.getGamepads !== 'function') return [];
  try { return Array.from(navigator.getGamepads()).filter(gamepad => gamepad?.connected); }
  catch { return []; }
}
function setControlsMode(mode) {
  if (!controlsHelpGroups.some(group => group.dataset.controlGroup === mode)) return;
  for (const group of controlsHelpGroups) group.hidden = group.dataset.controlGroup !== mode;
}
function syncControlsHelp() {
  const zone = tunnel.solid ? 'tunnel' : 'heaven';
  if (zone !== activeControlsZone) {
    activeControlsZone = zone;
    for (const group of controlsHelpZones) group.hidden = group.dataset.controlZone !== zone;
    if (zone === 'tunnel') {
      chirpButtons.cancel('KeyQ');
      chirpButtons.cancel('gamepad2');
    }
  }
  skyVideoOpacityRow.hidden = zone !== 'heaven';
  const hasCompanions = autonomousButterflies.connectedCount + paradise.connectedCount > 0;
  if (hasCompanions !== controlsReleaseVisible) {
    controlsReleaseVisible = hasCompanions;
    for (const hint of controlsReleaseHints) hint.hidden = !hasCompanions;
  }
}
setControlsMode(detectControlsMode({ touchLayout: mobileLayout.matches, gamepads: getConnectedGamepads() }));
const cameraSensitivityInput = document.querySelector('#camera-sensitivity');
const cameraSensitivityValue = document.querySelector('#camera-sensitivity-value');
const musicVolumeInput = document.querySelector('#music-volume');
const musicVolumeValue = document.querySelector('#music-volume-value');
const effectsVolumeInput = document.querySelector('#effects-volume');
const effectsVolumeValue = document.querySelector('#effects-volume-value');
const skyVideoOpacityInput = document.querySelector('#sky-video-opacity');
const skyVideoOpacityValue = document.querySelector('#sky-video-opacity-value');
const skyVideoOpacityRow = document.querySelector('#sky-video-opacity-row');
const SETTINGS_STORAGE_KEY = 'smth-i-wrote-today-settings-v1';
const DEFAULT_SETTINGS = Object.freeze({ cameraSensitivity: 1, musicVolume: 1, effectsVolume: 1, skyVideoOpacity: DEFAULT_SKY_VIDEO_OPACITY });
const settings = loadSettings();
if (!import.meta.env?.VITE_MEDIA_BASE_URL) {
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.sizes = '64x64';
  favicon.href = '/favicon.png';
  document.head.append(favicon);
}
const ambientAudio = createLoopingAudio(mediaUrl('/music/you-chose-this.mp3', {
  localPath: '/emelie%20trahan%20-%20you%20chose%20this.mp3',
}), { maxVolume: settings.musicVolume, fadeInSeconds: 2.5 });
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
const skyApparitionTexture = import.meta.env?.VITE_MEDIA_BASE_URL ? null : new THREE.TextureLoader().load(
  '/1dad95b9-3fb0-4e1a-9c5a-662cc640537c_1758672000.jpeg',
  texture => {
    if (disposed) { texture.dispose(); return; }
    renderer.initTexture(texture);
    paradise.setSkyImage(texture, texture.image.width / texture.image.height);
  }, undefined, () => console.warn('No se pudo cargar la imagen ocasional del cielo.'));
if (skyApparitionTexture) skyApparitionTexture.colorSpace = THREE.SRGBColorSpace;
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
  if (paused || document.hidden || !settingsPanel.hidden || mobileExperienceNotice.open) return;
  const result = emitButterflyChirp({ time, player, butterfly, flock: autonomousButterflies,
    paradise, tunnel, effects: resonanceEffects, landscapeColor: landscapeChirpColor,
    charge, restoreWhite, recruit });
  return result;
}
function releaseGroup() {
  if (paused || document.hidden || !settingsPanel.hidden || mobileExperienceNotice.open) return;
  const released = releaseButterflyGroup({ time, tunnel, flock: autonomousButterflies, paradise });
  if (released) { chirpButtons.cancel(); chirpGesture.reset(); butterfly.setChirpCharge(0); }
  canvas.focus({ preventScroll: true });
}
const chirpGesture = createChirpGesture(chirp);
const chirpButtons = createChirpButtons(chirp, { canCharge: () => tunnel.solid });
const mobileControlVisibility = createMobileControlVisibility();
const mobileHeavenChirpMenu = createMobileChirpMenu();
const mobileChirpScreen = new THREE.Vector3();
let mobileChirpHold = null;
const keys = new Set();
const gamepadInput = resetGamepadMotion();
const r3ViewGesture = createR3ViewGesture();
let activeGamepadIndex = null;
const gamepadButtons = new Map();
const pointers = new Map();
const mobileInput = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
const mobileSticks = {
  move: { element: mobileMoveStick, pointerId: null },
  look: { element: mobileLookStick, pointerId: null },
};
const abort = new AbortController();
const listen = (target, name, fn, options = {}) => target.addEventListener(name, fn, { ...options, signal: abort.signal });
listen(window, 'pointerdown', event => {
  if (settingsPanel.hidden || settingsPanel.contains(event.target) || mobileSettingsButton.contains(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  setSettingsOpen(false);
}, { capture: true });
listen(window, 'pointerdown', event => {
  const mode = controlsModeForPointer(event.pointerType, mobileLayout.matches);
  if (mode) setControlsMode(mode);
  if (mobileLayout.matches && settingsPanel.hidden && !paused) mobileControlVisibility.interact();
});
bindMobileJoystick('move');
bindMobileJoystick('look');
bindMobileChirpTarget();
syncSettingsControls();
listen(mobileExperienceOk, 'click', () => mobileExperienceNotice.close());
listen(mobileExperienceNotice, 'close', syncMobileSettingsAccess);
listen(mobileSettingsHotspot, 'click', event => {
  event.preventDefault();
  revealMobileSettingsGear();
});
listen(mobileSettingsButton, 'click', () => {
  if (!mobileLayout.matches || mobileExperienceNotice.open) return;
  setSettingsOpen(settingsPanel.hidden);
  scheduleMobileSettingsGearHide(2500);
});
listen(mobileLayout, 'change', syncMobileSettingsAccess);
if (mobileLayout.matches) mobileExperienceNotice.showModal();
syncMobileSettingsAccess();
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
  setControlsMode('keyboard-mouse');
  if (mobileExperienceNotice.open) return;
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
  if (!e.repeat && e.code === 'KeyP') {
    paused = !paused; keys.clear(); resetMobileJoysticks(); cancelMobileChirpHold(); chirpButtons.cancel(); r3ViewGesture.reset();
  }
  if (e.code === 'KeyE' || e.code === 'KeyQ') {
    e.preventDefault();
    if (!e.repeat && !paused && (e.code === 'KeyE' || !tunnel.solid)) {
      chirpButtons.down(e.code, performance.now(), e.code === 'KeyE');
    }
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    if (!e.repeat) releaseGroup();
  }
  if (e.code === 'KeyR') {
    e.preventDefault();
    if (!e.repeat && !tunnel.solid) chirp(0, { restoreWhite: true, recruit: false });
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
  setControlsMode('gamepad');
});
listen(window, 'gamepaddisconnected', e => {
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null; gamepadButtons.clear(); chirpButtons.cancel('gamepad');
    r3ViewGesture.reset();
  }
  resetGamepadInput();
  setControlsMode(detectControlsMode({ touchLayout: mobileLayout.matches, gamepads: getConnectedGamepads() }));
});
const clearInput = () => {
  keys.clear(); pointers.clear(); chirpGesture.reset(); resetGamepadInput();
  cancelMobileChirpHold();
  resetMobileJoysticks();
  gamepadButtons.clear(); chirpButtons.cancel();
  r3ViewGesture.reset();
  butterfly.setChirpCharge(0);
};
listen(window, 'blur', clearInput);
listen(document, 'visibilitychange', () => { clearInput(); last = performance.now(); });
listen(canvas, 'pointerdown', e => {
  if (!settingsPanel.hidden) return;
  if (mobileChirpHold && mobileChirpHold.pointerId !== e.pointerId) {
    mobileChirpHold.cancelled = true;
    mobileHeavenChirpMenu.cancel();
    closeMobileChirpMenu();
    chirpButtons.cancel(mobileChirpHold.key);
    pointers.set(mobileChirpHold.pointerId, { x: mobileChirpHold.lastX, y: mobileChirpHold.lastY });
    chirpGesture.reset();
  } else chirpGesture.down(e);
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
listen(canvas, 'pointermove', handleCameraPointerMove);
listen(canvas, 'pointerup', e => { chirpGesture.up(e); pointers.delete(e.pointerId); });
for (const event of ['pointercancel', 'lostpointercapture']) {
  listen(canvas, event, e => { chirpGesture.cancel(e); pointers.delete(e.pointerId); });
}
listen(canvas, 'wheel', e => {
  e.preventDefault();
  setControlsMode('keyboard-mouse');
  if (!settingsPanel.hidden) return;
  cameraView.zoom(e.deltaY * .012);
}, { passive: false });
function resize() {
  cancelMobileChirpHold();
  const ratio = Math.min(devicePixelRatio, 1.75);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
listen(window, 'resize', resize);
resize();

function handleCameraPointerMove(event) {
  chirpGesture.move(event);
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  if (pointers.size === 1) {
    desiredYaw -= (event.clientX - previous.x) * .005 * settings.cameraSensitivity;
    desiredPitch = THREE.MathUtils.clamp(desiredPitch + (event.clientY - previous.y) * .004 * settings.cameraSensitivity,
      -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  } else {
    const otherEntry = [...pointers.entries()].find(([id]) => id !== event.pointerId);
    if (!otherEntry) return;
    const other = otherEntry[1];
    const before = Math.hypot(previous.x - other.x, previous.y - other.y);
    const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
    cameraView.zoom((before - after) * .04);
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
}

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

function bindMobileJoystick(name) {
  const stick = mobileSticks[name];
  const { element } = stick;
  listen(element, 'pointerdown', event => {
    if (paused || !settingsPanel.hidden || mobileExperienceNotice.open || stick.pointerId !== null) return;
    event.preventDefault();
    stick.pointerId = event.pointerId;
    mobileControlVisibility.joystickPressed();
    element.setPointerCapture(event.pointerId);
    updateMobileJoystick(name, event);
  });
  listen(element, 'pointermove', event => {
    if (stick.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateMobileJoystick(name, event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(element, type, event => {
      if (stick.pointerId !== event.pointerId) return;
      resetMobileJoystick(name);
    });
  }
}

function bindMobileChirpTarget() {
  listen(mobileChirpTarget, 'pointerdown', event => {
    if (paused || !settingsPanel.hidden || mobileExperienceNotice.open || mobileChirpHold) return;
    event.preventDefault();
    mobileChirpHold = {
      pointerId: event.pointerId,
      key: `mobile-butterfly-${event.pointerId}`,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      heaven: !tunnel.solid,
      menuOpen: false,
      cancelled: false,
    };
    mobileChirpTarget.setPointerCapture(event.pointerId);
    if (mobileChirpHold.heaven) mobileHeavenChirpMenu.pointerDown(performance.now());
    else chirpButtons.down(mobileChirpHold.key, performance.now(), true);
  });
  listen(mobileChirpTarget, 'pointermove', event => {
    const hold = mobileChirpHold;
    if (!hold || hold.pointerId !== event.pointerId) return;
    hold.lastX = event.clientX;
    hold.lastY = event.clientY;
    const now = performance.now();
    if (hold.heaven && !hold.cancelled) {
      updateMobileHeavenChirpMenu(now);
      if (hold.menuOpen) {
        mobileHeavenChirpMenu.hover(mobileChirpOptionAt(event.clientX, event.clientY), now);
        syncMobileChirpMenuOptions(now);
        return;
      }
    }
    if (!hold.cancelled && Math.hypot(event.clientX - hold.startX, event.clientY - hold.startY) > 12) {
      hold.cancelled = true;
      if (hold.heaven) {
        mobileHeavenChirpMenu.cancel();
        closeMobileChirpMenu();
      }
      chirpButtons.cancel(hold.key);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      chirpGesture.reset();
    }
    if (hold.cancelled) handleCameraPointerMove(event);
  });
  listen(mobileChirpTarget, 'pointerup', event => {
    const hold = mobileChirpHold;
    if (!hold || hold.pointerId !== event.pointerId) return;
    event.preventDefault();
    const now = performance.now();
    if (hold.heaven && !hold.cancelled) {
      updateMobileHeavenChirpMenu(now);
      if (hold.menuOpen) mobileHeavenChirpMenu.hover(mobileChirpOptionAt(event.clientX, event.clientY), now);
    }
    mobileChirpHold = null;
    if (hold.cancelled) pointers.delete(event.pointerId);
    else if (hold.heaven) {
      const choice = mobileHeavenChirpMenu.pointerUp(now);
      closeMobileChirpMenu();
      if (choice?.type === 'chirp') {
        syncMobileChirpMenuOptions(now);
        performMobileChirp(choice.mode);
      } else if (choice?.type === 'release') releaseGroup();
    } else chirpButtons.up(hold.key, performance.now());
    if (mobileChirpTarget.hasPointerCapture(event.pointerId)) mobileChirpTarget.releasePointerCapture(event.pointerId);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    listen(mobileChirpTarget, type, event => {
      if (mobileChirpHold?.pointerId === event.pointerId && mobileChirpHold.cancelled) pointers.delete(event.pointerId);
      cancelMobileChirpHold(event.pointerId);
    });
  }
  listen(mobileChirpTarget, 'click', event => {
    if (event.detail === 0 && !paused && settingsPanel.hidden && !mobileExperienceNotice.open) {
      if (tunnel.solid) chirp();
      else performMobileChirp(mobileHeavenChirpMenu.selectedMode);
    }
  });
  for (const option of mobileChirpOptions) listen(option, 'click', event => {
    if (event.detail !== 0 || mobileChirpMenu.hidden || paused || !settingsPanel.hidden || mobileExperienceNotice.open) return;
    event.preventDefault();
    activateMobileChirpOption(option.dataset.mobileChirpOption);
  });
}

function performMobileChirp(mode) {
  if (mode === 'greet') return chirp(0, { recruit: false });
  if (mode === 'white') return chirp(0, { restoreWhite: true, recruit: false });
  return chirp(0, { recruit: true });
}

function activateMobileChirpOption(option) {
  if (mobileChirpHold) mobileChirpHold.cancelled = true;
  mobileHeavenChirpMenu.cancel();
  if (option === 'release') releaseGroup();
  else if (['gather', 'greet', 'white'].includes(option)) {
    mobileHeavenChirpMenu.selectMode(option);
    syncMobileChirpMenuOptions(performance.now());
    performMobileChirp(option);
  }
  closeMobileChirpMenu();
}

function openMobileChirpMenu(hold) {
  if (mobileChirpHold !== hold || hold.cancelled || !mobileHeavenChirpMenu.open) return;
  hold.menuOpen = true;
  chirpButtons.cancel(hold.key);
  butterfly.setChirpCharge(0);
  mobileChirpReleaseOption.hidden = autonomousButterflies.connectedCount + paradise.connectedCount <= 0;
  const target = mobileChirpTarget.getBoundingClientRect();
  // Anchor once for this gesture; the butterfly's idle bob must not move the choices.
  positionMobileChirpMenu(target.left + target.width / 2, target.top + target.height / 2);
  mobileChirpMenu.hidden = false;
  mobileChirpMenu.classList.add('is-open');
  syncMobileChirpMenuOptions(performance.now());
}

function positionMobileChirpMenu(x, y) {
  const hold = mobileChirpHold;
  const layout = layoutHeavenChirpMenu(x, y, innerWidth, innerHeight, hold?.menuPlacement);
  if (hold) hold.menuPlacement = layout.placement;
  mobileChirpMenu.style.left = `${layout.x}px`;
  mobileChirpMenu.style.top = `${layout.y}px`;
  mobileChirpMenu.style.setProperty('--menu-scale', String(layout.scale));
  mobileChirpMenu.style.setProperty('--menu-button-size', `${layout.buttonSize}px`);
  for (const option of mobileChirpOptions) {
    const offset = layout.options[option.dataset.mobileChirpOption];
    option.style.left = `${offset.x}px`;
    option.style.top = `${offset.y}px`;
  }
}

function updateMobileHeavenChirpMenu(now) {
  const hold = mobileChirpHold;
  if (!hold?.heaven || hold.cancelled) return;
  if (mobileHeavenChirpMenu.update(now)) openMobileChirpMenu(hold);
  if (hold.menuOpen) syncMobileChirpMenuOptions(now);
}

function mobileChirpOptionAt(x, y) {
  for (const option of mobileChirpOptions) {
    if (option.hidden) continue;
    const rect = option.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return option.dataset.mobileChirpOption;
    }
  }
  return null;
}

function syncMobileChirpMenuOptions(now) {
  const progress = mobileHeavenChirpMenu.releaseProgress(now);
  const armed = mobileHeavenChirpMenu.releaseArmed(now);
  const playerColor = butterfly.tintColor;
  mobileChirpMenu.style.setProperty('--mobile-player-color', playerColor);
  for (const option of mobileChirpOptions) {
    const name = option.dataset.mobileChirpOption;
    const isChirpMode = ['gather', 'greet', 'white'].includes(name);
    if (name === 'white') option.hidden = playerColor === '#ffffff';
    option.classList.toggle('is-current', name === mobileHeavenChirpMenu.selectedMode);
    option.classList.toggle('is-hovered', name === mobileHeavenChirpMenu.hoveredOption);
    option.classList.toggle('is-armed', name === 'release' && armed);
    option.style.setProperty('--hold-progress', `${progress * 100}%`);
    option.setAttribute('aria-pressed', String(isChirpMode && name === mobileHeavenChirpMenu.selectedMode));
  }
}

function closeMobileChirpMenu() {
  mobileChirpMenu.hidden = true;
  mobileChirpMenu.classList.remove('is-open');
  mobileChirpReleaseOption.classList.remove('is-armed');
  mobileChirpReleaseOption.style.setProperty('--hold-progress', '0%');
}

function cancelMobileChirpHold(pointerId = null) {
  const hold = mobileChirpHold;
  if (!hold || (pointerId !== null && hold.pointerId !== pointerId)) return;
  mobileChirpHold = null;
  mobileHeavenChirpMenu.cancel();
  closeMobileChirpMenu();
  chirpButtons.cancel(hold.key);
  butterfly.setChirpCharge(0);
  if (mobileChirpTarget.hasPointerCapture(hold.pointerId)) mobileChirpTarget.releasePointerCapture(hold.pointerId);
}

function updateMobileControlVisibility(dt) {
  if (!mobileLayout.matches) {
    mobileControls.classList.remove('is-hidden');
    mobileControlVisibility.reset();
    return;
  }
  if (!settingsPanel.hidden || mobileExperienceNotice.open) return;
  const joystickActive = Object.values(mobileSticks).some(stick => stick.pointerId !== null);
  const interacting = joystickActive || pointers.size > 0 || mobileChirpHold !== null;
  mobileControls.classList.toggle('is-hidden', !mobileControlVisibility.update(dt, {
    joystickActive,
    interacting,
  }));
}

function updateMobileChirpTarget() {
  if (!mobileLayout.matches || paused || !settingsPanel.hidden || mobileExperienceNotice.open || !butterfly.group.visible) {
    if (mobileChirpHold?.menuOpen) cancelMobileChirpHold();
    mobileChirpTarget.hidden = true;
    return;
  }
  camera.updateMatrixWorld();
  mobileChirpScreen.copy(butterfly.group.position).project(camera);
  const x = (mobileChirpScreen.x + 1) * .5 * innerWidth;
  const y = (1 - mobileChirpScreen.y) * .5 * innerHeight;
  const inView = mobileChirpScreen.z >= -1 && mobileChirpScreen.z <= 1
    && x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
  if (!inView) {
    mobileChirpTarget.hidden = true;
    return;
  }
  mobileChirpTarget.style.left = `${x}px`;
  mobileChirpTarget.style.top = `${y}px`;
  mobileChirpTarget.hidden = false;
}

function updateMobileJoystick(name, event) {
  const stick = mobileSticks[name];
  const rect = stick.element.getBoundingClientRect();
  const maxDistance = rect.width * .30;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const axes = normalizeJoystick(dx, dy, maxDistance);
  stick.element.style.setProperty('--stick-x', `${axes.offsetX}px`);
  stick.element.style.setProperty('--stick-y', `${axes.offsetY}px`);
  if (name === 'move') {
    mobileInput.moveX = axes.x;
    mobileInput.moveY = axes.y;
  } else {
    mobileInput.lookX = axes.x;
    mobileInput.lookY = axes.y;
  }
}

function resetMobileJoystick(name) {
  const stick = mobileSticks[name];
  const pointerId = stick.pointerId;
  stick.pointerId = null;
  stick.element.style.setProperty('--stick-x', '0px');
  stick.element.style.setProperty('--stick-y', '0px');
  if (name === 'move') {
    mobileInput.moveX = 0;
    mobileInput.moveY = 0;
  } else {
    mobileInput.lookX = 0;
    mobileInput.lookY = 0;
  }
  if (pointerId !== null && stick.element.hasPointerCapture(pointerId)) {
    stick.element.releasePointerCapture(pointerId);
  }
}

function resetMobileJoysticks() {
  resetMobileJoystick('move');
  resetMobileJoystick('look');
}

function setSettingsOpen(open) {
  cancelMobileChirpHold();
  settingsPanel.hidden = !open;
  settingsPanel.classList.toggle('settings-panel--gear-visible',
    open && mobileLayout.matches && !mobileSettingsButton.hidden && !mobileSettingsButton.classList.contains('is-fading'));
  if (open) mobileSettingsHotspot.hidden = true;
  else syncMobileSettingsAccess();
  keys.clear(); pointers.clear(); resetMobileJoysticks(); chirpButtons.cancel(); chirpGesture.reset(); resetGamepadInput();
  butterfly.setChirpCharge(0);
  if (!open && mobileLayout.matches) mobileControlVisibility.interact();
  r3ViewGesture.reset();
  (open ? settingsClose : canvas).focus({ preventScroll: true });
}

function syncMobileSettingsAccess() {
  if (!mobileLayout.matches) {
    clearMobileSettingsGearTimer();
    mobileSettingsButton.hidden = true;
    mobileSettingsButton.classList.remove('is-fading');
    settingsPanel.classList.remove('settings-panel--gear-visible');
  }
  const canReveal = mobileLayout.matches && settingsPanel.hidden && !mobileExperienceNotice.open;
  mobileSettingsHotspot.hidden = !canReveal || !mobileSettingsButton.hidden;
}

function revealMobileSettingsGear() {
  if (!mobileLayout.matches || !settingsPanel.hidden || mobileExperienceNotice.open) return;
  clearMobileSettingsGearTimer();
  mobileSettingsButton.hidden = false;
  mobileSettingsButton.classList.remove('is-fading');
  mobileSettingsHotspot.hidden = true;
  scheduleMobileSettingsGearHide(5000);
}

function scheduleMobileSettingsGearHide(delay) {
  clearMobileSettingsGearTimer();
  mobileSettingsGearTimer = window.setTimeout(() => {
    mobileSettingsButton.classList.add('is-fading');
    settingsPanel.classList.remove('settings-panel--gear-visible');
    mobileSettingsGearTimer = window.setTimeout(hideMobileSettingsGear, 260);
  }, delay);
}

function hideMobileSettingsGear() {
  clearMobileSettingsGearTimer();
  mobileSettingsButton.hidden = true;
  mobileSettingsButton.classList.remove('is-fading');
  settingsPanel.classList.remove('settings-panel--gear-visible');
  syncMobileSettingsAccess();
}

function clearMobileSettingsGearTimer() {
  if (mobileSettingsGearTimer !== null) window.clearTimeout(mobileSettingsGearTimer);
  mobileSettingsGearTimer = null;
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
      enabled: !paused && settingsPanel.hidden && !mobileExperienceNotice.open,
      heaven: !tunnel.solid,
      toggleSettings: () => setSettingsOpen(settingsPanel.hidden),
      releaseGroup, chirp, chirpButtons,
    });
  }
  readGamepadMotion(active, gamepadInput, settingsPanel.hidden && !paused && !mobileExperienceNotice.open);
  if (r3ViewGesture.update(active, now, settingsPanel.hidden && !paused && !mobileExperienceNotice.open)) cameraView.toggle();
  if (r3ViewGesture.suppressZoom) gamepadInput.zoom = 0;
}

function animate(now) {
  frame = requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (document.hidden) return;
  readGamepadInput(now);
  updateMobileControlVisibility(dt);
  updateMobileHeavenChirpMenu(now);
  butterfly.setChirpCharge(!paused && settingsPanel.hidden && !mobileExperienceNotice.open ? chirpButtons.charge(now) : 0);
  const motionDt = paused ? 0 : dt;
  time += motionDt;
  const keyboardRise = Number(keys.has('Space')) - Number(keys.has('AltLeft') || keys.has('AltRight'));
  const rise = THREE.MathUtils.clamp(keyboardRise + gamepadInput.ascend - gamepadInput.descend, -1, 1);
  desiredYaw += (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * dt * .6 * settings.cameraSensitivity;
  desiredYaw -= (gamepadInput.lookX + mobileInput.lookX) * dt * 2.4 * settings.cameraSensitivity;
  desiredPitch = THREE.MathUtils.clamp(desiredPitch + (gamepadInput.lookY + mobileInput.lookY) * dt * 1.9 * settings.cameraSensitivity,
    -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  yaw = THREE.MathUtils.damp(yaw, desiredYaw, 12, dt);
  pitch = THREE.MathUtils.damp(pitch, desiredPitch, 12, dt);
  cameraView.setDistance(advanceGamepadZoom(cameraView.targetDistance, gamepadInput.zoom, dt,
    FIRST_PERSON_DISTANCE, MAX_CAMERA_DISTANCE));
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - gamepadInput.moveY - mobileInput.moveY;
  const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + gamepadInput.moveX + mobileInput.moveX;
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
  updateMobileChirpTarget();
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
  syncControlsHelp();
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
  skyApparitionTexture?.dispose();
  ambientAudio.audio.pause();
  renderer.dispose();
});
