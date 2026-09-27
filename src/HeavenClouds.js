import * as THREE from 'three';
import { noiseGLSL } from './noise.js';

// Azimuth, elevation and angular size: fixed in the sky, not on the screen.
const CLOUDS = [
  [-.32, .33, .14], [.46, .22, .18], [1.45, .40, .17],
  [2.5, .27, .20], [-2.65, .50, .15], [-1.5, .24, .18], [3.1, .68, .13],
];

export function createHeavenClouds() {
  const uniforms = {
    uCloudTime: { value: 0 },
    uCloudOpacity: { value: 0 },
    uCloudShapes: { value: CLOUDS.map(([azimuth, elevation, size]) => new THREE.Vector4(
      Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation),
      -Math.cos(azimuth) * Math.cos(elevation), size,
    )) },
  };
  let previousTime = null;
  return {
    uniforms,
    reset() {
      previousTime = null;
      uniforms.uCloudTime.value = 0;
      uniforms.uCloudOpacity.value = 0;
    },
    update(time, heaven) {
      const dt = previousTime === null ? 0 : THREE.MathUtils.clamp(time - previousTime, 0, .05);
      previousTime = time;
      uniforms.uCloudTime.value = time;
      uniforms.uCloudOpacity.value = heaven
        ? THREE.MathUtils.damp(uniforms.uCloudOpacity.value, 1, 1.4, dt) : 0;
    },
  };
}

// A handful of feathered cumulus silhouettes, evaluated in the existing sky
// pass. No alpha-sorted planes, texture downloads, extra draw calls or UV seam.
export const heavenCloudsGLSL = `
${noiseGLSL}
uniform float uCloudTime, uCloudOpacity;
uniform vec4 uCloudShapes[${CLOUDS.length}];
vec3 heavenClouds(vec3 skyColor, vec3 direction) {
  if (uCloudOpacity < .0001 || direction.y <= .015) return skyColor;
  float drift = uCloudTime * .002;
  float cs = cos(drift), sn = sin(drift);
  vec3 d = vec3(cs * direction.x - sn * direction.z, direction.y,
    sn * direction.x + cs * direction.z);
  for (int i = 0; i < ${CLOUDS.length}; i++) {
    vec4 cloud = uCloudShapes[i];
    if (dot(d, cloud.xyz) < .9) continue;
    vec3 right = normalize(cross(cloud.xyz, vec3(0., 1., 0.)));
    vec3 up = cross(right, cloud.xyz);
    vec2 q = vec2(dot(d, right), dot(d, up)) / (cloud.w * vec2(1., .42));
    if (abs(q.x) > 1.55 || abs(q.y) > 1.4) continue;
    // Slightly different silhouettes, with stable fine variation at the edges.
    q.x *= mod(float(i), 2.) < .5 ? 1. : -1.;
    float seed = float(i) * 17.3;
    float detail = noise(q * 4. + seed) * .12 + noise(q * 10. - seed) * .06;
    float shape = length((q - vec2(0., -.28)) / vec2(1.05, .46));
    shape = min(shape, length((q - vec2(-.65, -.07)) / vec2(.45, .58)));
    shape = min(shape, length((q - vec2(-.23, .23)) / vec2(.55, .83)));
    shape = min(shape, length((q - vec2(.47, .12)) / vec2(.5, .65)));
    shape = min(shape, length((q - vec2(.9, -.15)) / vec2(.35, .42)));
    float alpha = (1. - smoothstep(.70, 1.10, shape + detail - .09))
      * smoothstep(.015, .13, direction.y) * uCloudOpacity * .84;
    vec3 white = mix(vec3(.83, .91, .98), vec3(1.), smoothstep(-.5, .6, q.y));
    skyColor = mix(skyColor, white, alpha);
  }
  return skyColor;
}
`;
