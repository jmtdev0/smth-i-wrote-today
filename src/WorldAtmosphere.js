import * as THREE from 'three';

export const HEAVEN_SKY = Object.freeze({ horizon: '#98cef0', zenith: '#247bd0' });

export function createWorldAtmosphere(scene, camera) {
  const limboColor = new THREE.Color('#e7f0e9');
  const horizonColor = new THREE.Color(HEAVEN_SKY.horizon);
  const fog = new THREE.Fog(limboColor, 130, 430);
  scene.background = horizonColor.clone();
  scene.fog = fog;

  return {
    update(tunnelVisibility) {
      const visibility = THREE.MathUtils.clamp(tunnelVisibility, 0, 1);
      // Keep the fog shader variant compiled. In Heaven its entire range is
      // beyond the far plane, so no visible fragment receives any fog at all.
      // Use the tunnel's eased fade to clear the view without a hard switch.
      fog.near = THREE.MathUtils.lerp(camera.far + 1, 130, visibility);
      fog.far = THREE.MathUtils.lerp(camera.far + 301, 430, visibility);
      fog.color.lerpColors(horizonColor, limboColor, visibility);
    },
  };
}
