import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { noiseGLSL } from './noise.js';
import { portraitWeight } from './angles.js';

export function createPortraitPass(texture) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uPortrait: { value: texture },
      uAmount: { value: 0 }, uTime: { value: 0 },
      uAspect: { value: 1 }, uImageAspect: { value: 1329 / 747 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse, uPortrait;
      uniform float uAmount, uTime, uAspect, uImageAspect;
      varying vec2 vUv;
      ${noiseGLSL}
      void main() {
        vec2 imageUv = vUv;
        if (uAspect < uImageAspect) imageUv.x = (vUv.x - .5) * uAspect / uImageAspect + .43;
        else imageUv.y = (vUv.y - .5) * uImageAspect / uAspect + .5;
        float cloud = fbm(vUv * vec2(5., 3.) + vec2(0., uTime * .018));
        float curtain = noise(vUv * vec2(38., 2.) + vec2(0., uTime * .05));
        float threshold = cloud * .72 + curtain * .28;
        float reveal = smoothstep(threshold - .2, threshold + .2, uAmount * 1.04);
        reveal *= smoothstep(0., .14, uAmount);
        float edge = smoothstep(0., .14, vUv.x) * (1. - smoothstep(.88, 1., vUv.x));
        vec3 water = texture2D(tDiffuse, vUv).rgb;
        vec3 portrait = texture2D(uPortrait, imageUv).rgb;
        portrait = mix(vec3(1.), portrait, .68);
        vec3 color = mix(water, portrait, reveal * edge * .91);
        float grain = hash(gl_FragCoord.xy + mod(floor(uTime * 24.), 1024.)) - .5;
        color += grain * .024 * (1. - smoothstep(.96, 1., color.r));
        gl_FragColor = vec4(clamp(color, 0., 1.), 1.);
      }
    `,
  });
  pass.update = (yaw, pitch, time, delta, ready) => {
    const target = ready ? portraitWeight(yaw, pitch) : 0;
    pass.uniforms.uAmount.value = THREE.MathUtils.damp(pass.uniforms.uAmount.value, target, 8, delta);
    pass.uniforms.uTime.value = time;
  };
  return pass;
}
