import * as THREE from 'three';
import { createMeadowWingWind } from './MeadowWingWind.js';
import { cloudShadowGLSL } from './HeavenClouds.js';
import { LOCAL_SHADOW_FADE_START, LOCAL_SHADOW_FADE_END } from './HeavenLighting.js';

export const MEADOW_PULSE_COUNT = 8;
export const MEADOW_PULSE_SECONDS = 7;

// One material, one draw call: lighting and rings use absolute world positions,
// so the rebasing meadow cannot drag an existing wave along with the player.
export function createMeadowLife(cloudUniforms = null) {
  const wingWind = createMeadowWingWind();
  const uniforms = {
    ...(cloudUniforms ?? {}),
    uMeadowTime: { value: 0 }, uMeadowLife: { value: 0 },
    uMeadowShadowCenter: { value: new THREE.Vector2() },
    uWingWind: wingWind.uniform,
    uMeadowPulses: { value: Array.from({ length: MEADOW_PULSE_COUNT }, () => new THREE.Vector4(0, 0, -1000, 0)) },
    uMeadowColors: { value: Array.from({ length: MEADOW_PULSE_COUNT }, () => new THREE.Color()) },
  };
  let next = 0, startedAt = null;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => `heaven-meadow-light-v4-${!!cloudUniforms}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vMeadowWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vMeadowWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
    shader.fragmentShader = `varying vec3 vMeadowWorld;
      ${cloudUniforms ? cloudShadowGLSL : ''}
      float grassHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      uniform float uMeadowTime, uMeadowLife;
      uniform vec2 uMeadowShadowCenter;
      uniform vec4 uMeadowPulses[${MEADOW_PULSE_COUNT}];
      uniform vec3 uMeadowColors[${MEADOW_PULSE_COUNT}];
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      #ifndef HEAVEN_GRASS
        // Tiny, randomly oriented leaf strokes in world space. Derivative LOD
        // removes subpixel detail rather than letting it sparkle at the horizon.
        vec2 grassUV = vMeadowWorld.xz * 3.2;
        vec2 cell = floor(grassUV);
        float seed = grassHash(cell);
        float angle = seed * 6.2831853;
        vec2 local = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (fract(grassUV) - .5);
        float tip = clamp((local.y + .35) / .7, 0., 1.);
        float width = .075 * (1. - tip);
        float footprint = max(length(dFdx(grassUV)), length(dFdy(grassUV)));
        float aa = max(footprint * .7, .015);
        float leaf = (1. - smoothstep(width - aa, width + aa, abs(local.x)))
          * smoothstep(-.4, -.3, local.y) * (1. - smoothstep(.28, .4, local.y));
        float detail = 1. - smoothstep(.3, 1., footprint);
        diffuseColor.rgb *= 1. - leaf * (.07 + seed * .05) * detail;
      #endif
    `);
    if (cloudUniforms) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      // Cloud cover occludes direct sunlight, not the soft ambient sky fill.
      reflectedLight.directDiffuse *= heavenSunVisibility(vMeadowWorld);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace('directionalLightShadow.shadowIntensity,',
        `directionalLightShadow.shadowIntensity * (1. - smoothstep(${LOCAL_SHADOW_FADE_START.toFixed(1)}, ${LOCAL_SHADOW_FADE_END.toFixed(1)}, distance(vMeadowWorld.xz, uMeadowShadowCenter))),`));
    // Grass deforms after begin_vertex. Shadow lookups must use those final
    // world positions, not the undeformed instance's original location.
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      #ifdef USE_SHADOWMAP
        worldPosition = vec4(vMeadowWorld, 1.);
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 waveTint = vec3(0.);
      float waveWeight = 0.;
      for (int i = 0; i < ${MEADOW_PULSE_COUNT}; i++) {
        vec4 pulse = uMeadowPulses[i];
        float age = uMeadowTime - pulse.z;
        if (age >= 0. && age < ${MEADOW_PULSE_SECONDS.toFixed(1)} && pulse.w > 0.) {
          float radius = age * (12. + pulse.w * 5.);
          float width = 3.5 + age * .8;
          float distanceToRing = (distance(vMeadowWorld.xz, pulse.xy) - radius) / width;
          float ring = exp(-distanceToRing * distanceToRing);
          float envelope = smoothstep(0., .45, age) * (1. - smoothstep(2., 7., age));
          float weight = ring * envelope * (.12 + pulse.w * .1) * uMeadowLife;
          waveTint += uMeadowColors[i] * weight;
          waveWeight += weight;
        }
      }
      if (waveWeight > .0001) outgoingLight = mix(outgoingLight,
        waveTint / waveWeight, min(.30, waveWeight));
      #include <opaque_fragment>
    `);
  };
  return {
    material, uniforms,
    applyToMaterial(target) {
      target.onBeforeCompile = material.onBeforeCompile;
      target.customProgramCacheKey = material.customProgramCacheKey;
    },
    pulse(time, position, color, charge = 0) {
      const strength = Number.isFinite(charge) ? THREE.MathUtils.clamp(charge, 0, 1) : 0;
      uniforms.uMeadowPulses.value[next].set(position.x, position.z, time, .35 + strength * .65);
      uniforms.uMeadowColors.value[next].copy(color);
      next = (next + 1) % MEADOW_PULSE_COUNT;
    },
    reset() {
      wingWind.reset();
      for (const pulse of uniforms.uMeadowPulses.value) pulse.set(0, 0, -1000, 0);
      next = 0; startedAt = null; uniforms.uMeadowLife.value = 0;
    },
    update(time, enabled, player = null, wingbeat = 0, readiness = null) {
      uniforms.uMeadowTime.value = time;
      if (player) uniforms.uMeadowShadowCenter.value.set(player.x, player.z);
      if (!enabled) { this.reset(); return; }
      wingWind.update(time, player, wingbeat);
      if (startedAt === null) startedAt = time;
      uniforms.uMeadowLife.value = readiness === null
        ? THREE.MathUtils.smoothstep(time - startedAt, 0, 3)
        : THREE.MathUtils.clamp(readiness, 0, 1);
    },
  };
}
