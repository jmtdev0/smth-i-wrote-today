import * as THREE from 'three';
import { createButterflyParadise } from '../src/ButterflyParadise.js';
import { createSkyVideo } from '../src/SkyVideo.js';

const audio = new Audio('/emelie%20trahan%20-%20you%20chose%20this.mp3');
audio.loop = true;
audio.muted = true; // Keep local visual checks from playing over the user's scene.
const skyVideo = createSkyVideo(audio, { rate: .88, offset: 2.25 });
const textures = skyVideo.videos.map(video => {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
});
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
renderer.setSize(960, 540, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7f0e9');
scene.fog = new THREE.Fog('#e7f0e9', 130, 430);
scene.add(new THREE.HemisphereLight('#f2fff6', '#90a99b', 1.8));
const paradise = createButterflyParadise();
scene.add(paradise.group);
const camera = new THREE.PerspectiveCamera(48, 960 / 540, .1, 1580);
const player = new THREE.Vector3(0, 0, -255);
const output = document.querySelector('#results');
let loopArmed = false, loopObserved = false, settledLoop = false;
let lastSong = 0, previous = performance.now(), samples = [], frame = 0, intervalSamples = [];
let crossfadeSamples = [], loopCount = 0, previousBlend = 1, maxBlendStep = 0;
let previousTextureCount = null, stableTextures = true;
let pauseAtHalf = false;
document.querySelector('#play').onclick = () => audio.play();
document.querySelector('#loop').onclick = () => {
  if (!Number.isFinite(audio.duration)) throw new Error('Audio metadata not ready');
  audio.currentTime = audio.duration - 1;
  loopArmed = true;
  crossfadeSamples = []; maxBlendStep = 0;
  audio.play();
};
document.querySelector('#far').onclick = () => player.set(2400, 0, -3300);
document.querySelector('#sky').onclick = () => { skyView = !skyView; };
document.querySelector('#pause').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
document.querySelector('#loop-pause').onclick = () => {
  pauseAtHalf = true;
  document.querySelector('#loop').click();
};
let skyView = false;
function animate(now) {
  const begin = performance.now();
  camera.position.copy(player).add(new THREE.Vector3(0, 3, 15));
  camera.lookAt(player.x, player.y + (skyView ? 24 : -4), player.z - 20);
  skyVideo.update(now);
  if (pauseAtHalf && skyVideo.blend >= .5 && skyVideo.blend < 1) {
    pauseAtHalf = false;
    audio.pause();
  }
  paradise.setSkyVideo(textures[skyVideo.activeIndex], skyVideo.ready ? .12 : 0,
    16 / 9, textures[skyVideo.previousIndex], skyVideo.blend);
  paradise.update(now / 1000, camera.quaternion, player, camera, true);
  renderer.render(scene, camera);
  if (frame > 60 && samples.length < 300) {
    samples.push(performance.now() - begin);
    intervalSamples.push(now - previous);
  }
  previous = now; frame++;
  if (loopArmed && audio.currentTime < lastSong - 1) { loopObserved = true; loopCount++; }
  if (skyVideo.blend < 1 && !audio.paused && frame % 5 === 0 && crossfadeSamples.length < 120) {
    crossfadeSamples.push(+skyVideo.blend.toFixed(3));
  }
  if (skyVideo.blend >= previousBlend) maxBlendStep = Math.max(maxBlendStep, skyVideo.blend - previousBlend);
  previousBlend = skyVideo.blend;
  if (loopObserved && previousTextureCount !== null && renderer.info.memory.textures !== previousTextureCount) stableTextures = false;
  previousTextureCount = renderer.info.memory.textures;
  lastSong = audio.currentTime;
  const drift = Number(skyVideo.video.dataset.drift);
  if (loopObserved && audio.currentTime > .3 && audio.currentTime < 5 && Math.abs(drift) < .18) settledLoop = true;
  if (frame % 15 === 0) {
    const sorted = [...samples].sort((a, b) => a - b);
    output.textContent = JSON.stringify({
      player: player.toArray(), butterflies: paradise.profiles.length,
      songTime: audio.currentTime, videoTime: skyVideo.video.currentTime, drift,
      loopObserved, settledLoop, videoPlaying: !skyVideo.video.paused,
      loopCount, blend: skyVideo.blend, crossfadeSamples, maxBlendStep,
      stableTextures, textures: renderer.info.memory.textures, programs: renderer.info.programs.length,
      frameSamples: samples.length,
      cpuP95Ms: sorted[Math.floor(sorted.length * .95)],
      meanFrameIntervalMs: intervalSamples.reduce((sum, n) => sum + n, 0) / Math.max(1, intervalSamples.length),
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }, null, 2);
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
