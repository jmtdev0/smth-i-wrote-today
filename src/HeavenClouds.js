import * as THREE from 'three';
import { seededRandom } from './noise.js';

// One sun for the sky, the volume's scattering and the real scene light.
export const HEAVEN_SUN_DIRECTION = new THREE.Vector3(-.4, .6, -1).normalize();
export const CLOUD_BOTTOM = 240;
export const CLOUD_TOP = 450;
export const CLOUD_SHADOW_SPAN = 2048;
export const CLOUD_SHADOW_SIZE = 256;
// Keep only a few isolated peaks of the cloud field. Raise core density to
// retain their fluffy volume instead of making the whole sky translucent.
export const CLOUD_COVERAGE_THRESHOLD = .62;
export const CLOUD_DENSITY_GAIN = 9.5;
export const CLOUD_PATCH_SPACING = 1800;
export const CLOUD_PATCH_RADIUS = 340;
export const CLOUD_PATCH_JITTER = 700;
export const CLOUD_SAMPLING = Object.freeze({
  high: Object.freeze({ minSteps: 36, maxSteps: 128, stepLength: 12 }),
  low: Object.freeze({ minSteps: 24, maxSteps: 96, stepLength: 18 }),
});

export const cloudDensityGLSL = `
precision highp sampler3D;
uniform sampler3D uCloudNoise;
uniform float uCloudTime, uCloudOpacity;
uniform vec3 uSunDirection;
float cloudPatchHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float cloudPatchCoverage(vec2 position) {
  // Sparse, world-anchored weather cells keep distant clouds from filling
  // every bit of horizon. The entire patch fits inside its cell, so there
  // are no clipped seams, and the same mask also shapes the ground shadows.
  vec2 grid = (position + vec2(1100., 250.)) / ${CLOUD_PATCH_SPACING.toFixed(1)};
  vec2 cell = floor(grid);
  if (cloudPatchHash(cell + 71.3) < .5) return 0.;
  vec2 jitter = vec2(cloudPatchHash(cell), cloudPatchHash(cell + 19.3));
  vec2 local = (fract(grid) - .5) * ${CLOUD_PATCH_SPACING.toFixed(1)}
    - (jitter - .5) * ${CLOUD_PATCH_JITTER.toFixed(1)};
  return 1. - smoothstep(140., ${CLOUD_PATCH_RADIUS.toFixed(1)}, length(local));
}
float cloudNoise(vec3 uv) {
  // Cubic reconstruction rounds the random lattice into soft lobes.
  vec3 cell = uv * 32. - .5;
  vec3 f = fract(cell);
  f = f * f * (3. - 2. * f);
  return texture(uCloudNoise, (floor(cell) + f + .5) / 32.).r;
}
float cloudDensityFiltered(vec3 p, float footprint) {
  float h = (p.y - ${CLOUD_BOTTOM.toFixed(1)}) / ${(CLOUD_TOP - CLOUD_BOTTOM).toFixed(1)};
  if (h <= 0. || h >= 1.) return 0.;
  p.xz -= vec2(2.3, .85) * uCloudTime;
  float coverage = cloudPatchCoverage(p.xz);
  if (coverage <= 0.) return 0.;
  vec3 q = p * vec3(.00015, .00021, .00015);
  float broad = cloudNoise(q);
  // Match density detail to the space covered by a pixel / marching segment.
  // Unresolvable erosion becomes its mean, not tiny isolated bright flecks.
  float detailWeight = 1. - smoothstep(30., 90., footprint);
  float fineWeight = 1. - smoothstep(6., 22., footprint);
  float detail = mix(.5, cloudNoise(q * 3.17 + vec3(.37, .19, .63)), detailWeight);
  float fine = mix(.5, cloudNoise(q * 12.71 + vec3(.13, .43, .29)), fineWeight);
  float shape = broad * .73 + detail * .27;
  float envelope = smoothstep(0., .16, h) * (1. - smoothstep(.42, 1., h));
  return max(0., (shape - ${CLOUD_COVERAGE_THRESHOLD.toFixed(2)} - h * .09)
    * ${CLOUD_DENSITY_GAIN.toFixed(1)} - (1. - fine) * .25) * envelope * coverage;
}
float cloudDensity(vec3 p) { return cloudDensityFiltered(p, 0.); }
`;

const quadVertex = `varying vec2 vUv; void main() {
  vUv = uv; gl_Position = vec4(position.xy, 0., 1.);
}`;

export const cloudVolumeFragment = `
varying vec2 vUv;
${cloudDensityGLSL}
uniform vec3 uCloudCamera, uCloudRight, uCloudUp, uCloudForward;
uniform float uCloudAspect, uCloudTanFov;
uniform vec2 uCloudRenderSize;
uniform float uCloudStepLength;
uniform int uCloudSteps, uCloudMaxSteps;
void main() {
  vec2 ndc = vUv * 2. - 1.;
  vec3 ray = normalize(uCloudForward + uCloudTanFov *
    (uCloudRight * ndc.x * uCloudAspect + uCloudUp * ndc.y));
  if (abs(ray.y) < .008) { gl_FragColor = vec4(0.); return; }
  float a = (${CLOUD_BOTTOM.toFixed(1)} - uCloudCamera.y) / ray.y;
  float b = (${CLOUD_TOP.toFixed(1)} - uCloudCamera.y) / ray.y;
  float start = max(0., min(a, b)), end = min(6500., max(a, b));
  if (end <= start) { gl_FragColor = vec4(0.); return; }
  // Shallow rays cross kilometres of cloud layer. A fixed 24/36 samples and
  // independent per-pixel jitter undersampled them into watercolor speckles.
  int stepCount = int(clamp(ceil((end - start) / uCloudStepLength),
    float(uCloudSteps), float(uCloudMaxSteps)));
  float stepSize = (end - start) / float(stepCount);
  float pixelCone = 2. * uCloudTanFov / uCloudRenderSize.y;
  float transmittance = 1.;
  vec3 radiance = vec3(0.);
  float towardSun = pow(max(0., dot(ray, uSunDirection)), 12.);
  for (int i = 0; i < ${CLOUD_SAMPLING.high.maxSteps}; i++) {
    if (i >= stepCount || transmittance < .015) break;
    float distanceAlongRay = start + (float(i) + .5) * stepSize;
    vec3 p = uCloudCamera + ray * distanceAlongRay;
    float footprint = max(distanceAlongRay * pixelCone, stepSize * .5);
    float density = cloudDensityFiltered(p, footprint);
    if (density < .005) continue;
    float lightDepth = cloudDensityFiltered(p + uSunDirection * 18., footprint) * 18.
      + cloudDensityFiltered(p + uSunDirection * 55., footprint) * 37.
      + cloudDensityFiltered(p + uSunDirection * 115., footprint) * 60.;
    float sunlight = exp(-lightDepth * .045);
    float height = clamp((p.y - ${CLOUD_BOTTOM.toFixed(1)}) / ${(CLOUD_TOP - CLOUD_BOTTOM).toFixed(1)}, 0., 1.);
    vec3 ambient = mix(vec3(.48, .57, .71), vec3(.64, .72, .83), height);
    vec3 lighting = ambient + vec3(1., .94, .82) * sunlight * (.50 + towardSun * .22);
    lighting += vec3(1., .96, .87) * towardSun * exp(-lightDepth * .015) * .13;
    float alpha = 1. - exp(-density * stepSize * .035);
    radiance += transmittance * alpha * lighting;
    transmittance *= 1. - alpha;
  }
  float horizon = smoothstep(.008, .07, abs(ray.y));
  gl_FragColor = vec4(radiance, 1. - transmittance) * horizon * uCloudOpacity;
}`;

export const cloudShadowFragment = `
varying vec2 vUv;
${cloudDensityGLSL}
uniform vec2 uCloudShadowCenter;
void main() {
  vec2 ground = uCloudShadowCenter + (vUv - .5) * ${CLOUD_SHADOW_SPAN.toFixed(1)};
  vec3 origin = vec3(ground.x, -30., ground.y);
  float stepSize = ${(CLOUD_TOP - CLOUD_BOTTOM).toFixed(1)} / (uSunDirection.y * 16.);
  float start = ${(CLOUD_BOTTOM + 30).toFixed(1)} / uSunDirection.y;
  float opticalDepth = 0.;
  for (int i = 0; i < 16; i++) {
    opticalDepth += cloudDensity(origin + uSunDirection *
      (start + (float(i) + .5) * stepSize)) * stepSize;
  }
  gl_FragColor = vec4(vec3(exp(-opticalDepth * .028)), 1.);
}`;

// A cheap lookup on grass fragments, integrated through the SAME cloud field.
export const cloudShadowGLSL = `
uniform sampler2D uCloudShadowMap;
uniform vec2 uCloudShadowCenter;
uniform vec3 uSunDirection;
uniform float uCloudOpacity, uCloudReady;
float heavenSunVisibility(vec3 world) {
  vec2 ground = world.xz - uSunDirection.xz * ((world.y + 30.) / uSunDirection.y);
  vec2 uv = (ground - uCloudShadowCenter) / ${CLOUD_SHADOW_SPAN.toFixed(1)} + .5;
  float edge = 1. - smoothstep(.42, .5, max(abs(uv.x - .5), abs(uv.y - .5)));
  return mix(1., texture2D(uCloudShadowMap, clamp(uv, 0., 1.)).r,
    edge * uCloudOpacity * uCloudReady * .72);
}`;

// Low-resolution premultiplied volume is composited BEFORE video and portrait.
export const heavenCloudsGLSL = `
uniform sampler2D uCloudVolume;
uniform vec2 uCloudViewport, uCloudRenderSize;
uniform vec3 uSunDirection;
uniform float uCloudReady;
vec3 heavenClouds(vec3 skyColor, vec3 direction) {
  if (uCloudReady < .5) return skyColor;
  vec2 uv = gl_FragCoord.xy / uCloudViewport;
  vec2 texel = .65 / uCloudRenderSize;
  // Filter the premultiplied cloud layer only. Video, text and butterflies
  // are composed afterwards and remain sharp; RGB/alpha share the filter.
  vec4 cloud = texture2D(uCloudVolume, uv) * .4;
  cloud += texture2D(uCloudVolume, uv + vec2(texel.x, 0.)) * .15;
  cloud += texture2D(uCloudVolume, uv - vec2(texel.x, 0.)) * .15;
  cloud += texture2D(uCloudVolume, uv + vec2(0., texel.y)) * .15;
  cloud += texture2D(uCloudVolume, uv - vec2(0., texel.y)) * .15;
  return skyColor * (1. - cloud.a) + cloud.rgb;
}`;

export function cloudRenderSize(width, height, quality = 1) {
  const scale = Math.min(.5, (quality ? 640 : 440) / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export function createHeavenClouds() {
  const random = seededRandom(92817), data = new Uint8Array(32 ** 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(random() * 256);
  const noise = new THREE.Data3DTexture(data, 32, 32, 32);
  noise.format = THREE.RedFormat;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.unpackAlignment = 1; noise.needsUpdate = true;
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const shadow = new THREE.WebGLRenderTarget(CLOUD_SHADOW_SIZE, CLOUD_SHADOW_SIZE, { depthBuffer: false });
  const uniforms = {
    uCloudNoise: { value: noise }, uCloudTime: { value: 0 }, uCloudOpacity: { value: 0 },
    uSunDirection: { value: HEAVEN_SUN_DIRECTION.clone() },
    uCloudVolume: { value: target.texture }, uCloudViewport: { value: new THREE.Vector2(1, 1) },
    uCloudReady: { value: 0 }, uCloudSteps: { value: CLOUD_SAMPLING.high.minSteps },
    uCloudMaxSteps: { value: CLOUD_SAMPLING.high.maxSteps },
    uCloudStepLength: { value: CLOUD_SAMPLING.high.stepLength },
    uCloudRenderSize: { value: new THREE.Vector2(1, 1) },
    uCloudCamera: { value: new THREE.Vector3() }, uCloudRight: { value: new THREE.Vector3(1, 0, 0) },
    uCloudUp: { value: new THREE.Vector3(0, 1, 0) }, uCloudForward: { value: new THREE.Vector3(0, 0, -1) },
    uCloudAspect: { value: 1 }, uCloudTanFov: { value: 1 },
    uCloudShadowMap: { value: shadow.texture }, uCloudShadowCenter: { value: new THREE.Vector2() },
  };
  const volumeMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: quadVertex,
    fragmentShader: cloudVolumeFragment, depthTest: false, depthWrite: false });
  const shadowMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: quadVertex,
    fragmentShader: cloudShadowFragment, depthTest: false, depthWrite: false });
  const passScene = new THREE.Scene(), passCamera = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volumeMaterial);
  quad.frustumCulled = false; passScene.add(quad);
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  let previousTime = null, shadowTime = -Infinity, quality = 1, slowFrames = 0, fastFrames = 0;
  let shadowX = NaN, shadowZ = NaN;
  return {
    uniforms, target, shadow,
    get quality() { return quality; },
    prepare(renderer) {
      // Compile the two linear offscreen variants while the main scene loads,
      // so crossing limbo does not compile a new volume shader mid-flight.
      const previousTarget = renderer.getRenderTarget();
      const pending = [];
      try {
        renderer.setRenderTarget(target);
        quad.material = volumeMaterial;
        pending.push(renderer.compileAsync(passScene, passCamera));
        quad.material = shadowMaterial;
        pending.push(renderer.compileAsync(passScene, passCamera));
      } finally {
        quad.material = volumeMaterial;
        renderer.setRenderTarget(previousTarget);
      }
      return Promise.all(pending);
    },
    reset() {
      previousTime = null; shadowTime = -Infinity;
      uniforms.uCloudTime.value = 0; uniforms.uCloudOpacity.value = 0;
      uniforms.uCloudReady.value = 0;
    },
    update(time, heaven, camera = null) {
      const dt = previousTime === null ? 0 : THREE.MathUtils.clamp(time - previousTime, 0, .05);
      previousTime = time;
      uniforms.uCloudTime.value = time;
      uniforms.uCloudOpacity.value = heaven
        ? THREE.MathUtils.damp(uniforms.uCloudOpacity.value, 1, 1.4, dt) : 0;
      if (!heaven) uniforms.uCloudReady.value = 0;
      if (camera) {
        uniforms.uCloudCamera.value.copy(camera.position);
        uniforms.uCloudRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
        uniforms.uCloudUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
        uniforms.uCloudForward.value.set(0, 0, -1).applyQuaternion(camera.quaternion);
        uniforms.uCloudAspect.value = camera.aspect;
        uniforms.uCloudTanFov.value = Math.tan(camera.fov * Math.PI / 360);
      }
    },
    // Sustained slow frames lower only cloud cost, never grass density or music.
    observeFrame(milliseconds) {
      if (uniforms.uCloudOpacity.value < .95 || milliseconds > 150) return;
      slowFrames = milliseconds > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      fastFrames = milliseconds < 19 ? fastFrames + 1 : 0;
      if (slowFrames > 90) { quality = 0; slowFrames = 0; }
      if (fastFrames > 600) { quality = 1; fastFrames = 0; }
      const sampling = quality ? CLOUD_SAMPLING.high : CLOUD_SAMPLING.low;
      uniforms.uCloudSteps.value = sampling.minSteps;
      uniforms.uCloudMaxSteps.value = sampling.maxSteps;
      uniforms.uCloudStepLength.value = sampling.stepLength;
    },
    render(renderer) {
      if (uniforms.uCloudOpacity.value < .0001) return;
      renderer.getDrawingBufferSize(uniforms.uCloudViewport.value);
      const [width, height] = cloudRenderSize(uniforms.uCloudViewport.value.x, uniforms.uCloudViewport.value.y, quality);
      if (target.width !== width || target.height !== height) target.setSize(width, height);
      uniforms.uCloudRenderSize.value.set(width, height);
      const oldTarget = renderer.getRenderTarget(), oldAutoClear = renderer.autoClear;
      const oldScissorTest = renderer.getScissorTest();
      renderer.getViewport(viewport); renderer.getScissor(scissor);
      const oldShadowUpdate = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = true; renderer.setScissorTest(false);
      try {
        const camera = uniforms.uCloudCamera.value;
        const cx = Math.round(camera.x / 64) * 64, cz = Math.round(camera.z / 64) * 64;
        const time = uniforms.uCloudTime.value;
        if (time < shadowTime || time - shadowTime >= .12 || cx !== shadowX || cz !== shadowZ) {
          uniforms.uCloudShadowCenter.value.set(cx, cz);
          quad.material = shadowMaterial;
          renderer.setRenderTarget(shadow); renderer.render(passScene, passCamera);
          shadowTime = time; shadowX = cx; shadowZ = cz;
        }
        quad.material = volumeMaterial;
        renderer.setRenderTarget(target); renderer.render(passScene, passCamera);
        uniforms.uCloudReady.value = 1;
      } finally {
        renderer.setRenderTarget(oldTarget);
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(oldScissorTest);
        renderer.autoClear = oldAutoClear; renderer.shadowMap.autoUpdate = oldShadowUpdate;
      }
    },
    dispose() {
      target.dispose(); shadow.dispose(); noise.dispose();
      quad.geometry.dispose(); volumeMaterial.dispose(); shadowMaterial.dispose();
    },
  };
}
