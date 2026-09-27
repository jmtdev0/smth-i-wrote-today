import * as THREE from 'three';
import { noiseGLSL } from './noise.js';
import { flowPhase, lateralPhase } from './flight.js';

export const HYPERBOLOID_BASE_RADIUS = 30;
export const HYPERBOLOID_VERTICAL_SCALE = 120;
export const HYPERBOLOID_HEIGHT = 220;
export const HYPERBOLOID_FULL_ANGLE = Math.PI * 2;
export const HYPERBOLOID_POSITION = Object.freeze({ x: 0, y: -1.3, z: 10 });
export const WATER_WINDOW_HEIGHT = HYPERBOLOID_HEIGHT;
export const WATER_VERTICAL_FADE_START = 96;
export const WATER_VERTICAL_FADE_END = 110;
export const WATER_FADE_DISTANCE = 165;
// Keep the player inside the visible lower base instead of on the faded edge.
export const PLAYER_START_Y = HYPERBOLOID_POSITION.y - WATER_VERTICAL_FADE_START + 5;

// The waterfall uses a finite geometry window. It stays fixed at the starting
// altitude when the player rises, and streams downward with the player when
// they descend; shader coordinates retain the accumulated vertical offset.
export function hyperboloidRadius(y) {
  return HYPERBOLOID_BASE_RADIUS * Math.sqrt(1 + (y / HYPERBOLOID_VERTICAL_SCALE) ** 2);
}

export function createHyperboloid() {
  const group = new THREE.Group();
  group.position.set(HYPERBOLOID_POSITION.x, HYPERBOLOID_POSITION.y, HYPERBOLOID_POSITION.z);
  const flow = { value: 0 };
  const lateral = { value: 0 };
  const vertical = { value: 0 };
  const ripple = { value: new THREE.Vector2(1, 0) };
  const geometry = new THREE.PlaneGeometry(2, HYPERBOLOID_HEIGHT, 256, 168);

  for (let layer = 0; layer < 5; layer++) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFlow: flow, uLateral: lateral, uVerticalOffset: vertical,
        uRipple: ripple, uLayer: { value: layer },
      },
      vertexShader: `
        uniform float uLayer, uFlow, uLateral, uVerticalOffset;
        uniform vec2 uRipple;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vLocalY;
        varying float vTheta;
        ${noiseGLSL}
        vec2 angularCoords(float theta, float offset) {
          float angle = theta + offset / 20.;
          return vec2(cos(angle), sin(angle)) * 20.;
        }
        void main() {
          vUv = uv;
          float y = position.y;
          float absoluteY = y + uVerticalOffset;
          float theta = mix(-3.14159265359, 3.14159265359, uv.x);
          // Continue the original lower rim downward as a vertical water wall.
          float profileY = max(absoluteY, ${-HYPERBOLOID_HEIGHT * .5}.);
          float surfaceRadius = 30. * sqrt(1. + (profileY / 120.) * (profileY / 120.));
          vec2 angular = angularCoords(theta, uLayer * 1.71 + uLateral);
          float swell = fbm3(vec3(angular.x * .18 + uRipple.x * .55,
            angular.y * .18 + uRipple.y * .4, (absoluteY + uFlow) * .025));
          surfaceRadius += (swell - .5) * 1.9 + uLayer * .28;
          theta += (swell - .5) * .032;
          vec3 p = vec3(sin(theta) * surfaceRadius, y, -cos(theta) * surfaceRadius);
          vec4 world = modelMatrix * vec4(p, 1.);
          vWorld = world.xyz;
          vLocalY = y;
          vTheta = theta;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uFlow, uLayer, uLateral, uVerticalOffset;
        uniform vec2 uRipple;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vLocalY;
        varying float vTheta;
        ${noiseGLSL}
        vec2 angularCoords(float theta, float offset) {
          float angle = theta + offset / 20.;
          return vec2(cos(angle), sin(angle)) * 20.;
        }
        void main() {
          float y = vLocalY + uVerticalOffset + uFlow;
          vec2 angular = angularCoords(vTheta, uLayer * 1.71 + uLateral);
          float warp = fbm3(vec3(angular.x * .19 + uRipple.x * .45,
            angular.y * .19 + uRipple.y * .3, y * .025)) * 1.8;
          float strands = fbm3(vec3(angular.x * 3.4 + warp, angular.y * 3.4, y * .16));
          float silk = pow(fbm3(vec3(angular.x * 16. + warp * 3., angular.y * 16., y * .32)), 3.);
          float folds = fbm3(vec3(angular.x * .8 + warp, angular.y * .8, y * .035));
          float vertical = 1. - smoothstep(96., 110., abs(vLocalY));
          float distanceFade = 1. - smoothstep(55., 165., distance(cameraPosition, vWorld));
          float alpha = vertical * distanceFade * (.15 + strands * .47);
          float rapids = fbm3(vec3(angular.x * .6 + warp + uRipple.y * .25,
            angular.y * .6, y * .12 + uRipple.x * .4));
          float foam = smoothstep(.53, .76, rapids) * .2;
          float shade = .94 - folds * .25 - silk * .32 + strands * .08 + foam;
          gl_FragColor = vec4(vec3(shade), alpha);
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(geometry, material);
    sheet.renderOrder = layer;
    group.add(sheet);
  }

  return {
    group,
    update(time, lateralDistance = 0, center = null) {
      let verticalOffset = 0;
      if (center) {
        group.position.x = center.x;
        group.position.z = center.z;
        if (Number.isFinite(center.y)) {
          verticalOffset = Math.min(0, center.y - PLAYER_START_Y);
        }
      }
      group.position.y = HYPERBOLOID_POSITION.y + verticalOffset + Math.sin(time * .45) * .10;
      flow.value = flowPhase(time);
      lateral.value = lateralPhase(lateralDistance);
      vertical.value = verticalOffset;
      const phase = time * .65;
      ripple.value.set(Math.cos(phase), Math.sin(phase));
    },
  };
}
