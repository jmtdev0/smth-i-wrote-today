import * as THREE from 'three';
import { HEAVEN_SUN_DIRECTION } from './HeavenClouds.js';
import { meadowHeight } from './MeadowSurface.js';

export const LOCAL_SHADOW_SIZE = 2048;
export const LOCAL_SHADOW_RADIUS = 64;
export const LOCAL_SHADOW_FADE_START = 44;
export const LOCAL_SHADOW_FADE_END = 56;

export function createHeavenLighting(scene, renderer) {
  const ambient = new THREE.HemisphereLight('#c9e6ff', '#667e49', 1.15);
  const sun = new THREE.DirectionalLight('#fff2d9', 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LOCAL_SHADOW_SIZE);
  Object.assign(sun.shadow.camera, { left: -LOCAL_SHADOW_RADIUS, right: LOCAL_SHADOW_RADIUS,
    top: LOCAL_SHADOW_RADIUS, bottom: -LOCAL_SHADOW_RADIUS, near: 1, far: 360 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00006;
  sun.shadow.normalBias = .035;
  sun.shadow.radius = 2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(ambient, sun, sun.target);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), HEAVEN_SUN_DIRECTION).normalize();
  const up = new THREE.Vector3().crossVectors(HEAVEN_SUN_DIRECTION, right);
  const anchor = new THREE.Vector3();
  const texel = LOCAL_SHADOW_RADIUS * 2 / LOCAL_SHADOW_SIZE;
  return {
    sun, ambient,
    update(player, heaven) {
      // Keep the light layout fixed during limbo/rescues (no shader recompiles).
      // Only the shadow pass is suspended while inside the tunnel.
      sun.shadow.autoUpdate = heaven;
      anchor.set(player.x, meadowHeight(player.x, player.z), player.z);
      const x = anchor.dot(right), y = anchor.dot(up);
      anchor.addScaledVector(right, Math.round(x / texel) * texel - x);
      anchor.addScaledVector(up, Math.round(y / texel) * texel - y);
      sun.target.position.copy(anchor);
      sun.position.copy(anchor).addScaledVector(HEAVEN_SUN_DIRECTION, 180);
      sun.target.updateMatrixWorld();
    },
    dispose() { sun.shadow.dispose(); },
  };
}

export function enableButterflyShadows(group) {
  group.traverse(object => {
    if (!object.isMesh) return;
    // Halos, chirp cores and line work are light, not occluders.
    object.castShadow = object.userData.visualRole === 'fill'
      || object.name === 'butterfly body' || object.name === 'butterfly head';
  });
}
