import * as THREE from 'three';
import { noiseGLSL } from './noise.js';

export const TUNNEL_RADIUS = 46;
export const TUNNEL_EXIT_Z = -180;
export const TUNNEL_LENGTH = 1080;
export const TUNNEL_BACK_Z = TUNNEL_EXIT_Z + TUNNEL_LENGTH;
export const TUNNEL_START = Object.freeze({ x: 0, y: 0, z: TUNNEL_BACK_Z - 27 });
export const TUNNEL_VIEW_DISTANCE = TUNNEL_LENGTH + 500;
export const PARADISE_CENTER_Z = -295;
export const RESCUE_COUNT = 12;
export const TUNNEL_FADE_SECONDS = 3;
// Safely beyond the last fog layer, not just the mouth of the tube.
export const TUNNEL_FADE_EXIT_Z = TUNNEL_EXIT_Z - 22;

// A solid, stationary tube: the camera and the player slide along its interior.
export function constrainTunnelPosition(position, margin = 2, previous = null) {
  const radius = TUNNEL_RADIUS - margin;
  if (previous && previous.z < TUNNEL_EXIT_Z && position.z >= TUNNEL_EXIT_Z
      && Math.hypot(position.x, position.y) > radius) {
    position.z = TUNNEL_EXIT_Z - margin;
  }
  if (position.z >= TUNNEL_EXIT_Z) {
    position.z = Math.min(position.z, TUNNEL_BACK_Z - margin);
    const radial = Math.hypot(position.x, position.y);
    if (radial > radius) {
      position.x *= radius / radial;
      position.y *= radius / radial;
    }
  }
  return position;
}

export function tunnelDaylight(z) {
  return Math.exp(-Math.max(0, z - TUNNEL_EXIT_Z) / 48);
}

export function createTunnelWorld() {
  const group = new THREE.Group();
  group.name = 'Water tunnel and mist threshold';
  let initialized = false, fadeStartedAt = null;
  let sceneParent = null;
  const uniforms = {
    uTime: { value: 0 },
    uVisibility: { value: 1 },
    uLanterns: { value: Array.from({ length: RESCUE_COUNT + 1 }, () => new THREE.Vector3()) },
    uPower: { value: new Float32Array(RESCUE_COUNT + 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uVisibility;
      uniform vec3 uLanterns[13];
      uniform float uPower[13];
      varying vec3 vWorld;
      ${noiseGLSL}
      void main() {
        vec2 around = vWorld.xy / max(length(vWorld.xy), .001);
        float flow = vWorld.y + uTime * 2.1;
        float veins = fbm3(vec3(around * 35., vWorld.z * .09 + flow * .015));
        float silk = fbm3(vec3(around * 140., vWorld.z * .13 + flow * .035));
        float light = exp(-max(0., vWorld.z + 180.) / 46.);
        vec3 color = vec3(.002, .003, .005);
        color += vec3(.32, .42, .43) * light * (.23 + veins * .57 + silk * .2);
        for (int i = 0; i < 13; i++) {
          float d = distance(vWorld, uLanterns[i]);
          float pool = pow(max(0., 1. - d / 13.), 2.);
          color += vec3(.24, .29, .32) * pool * uPower[i] * (.4 + veins);
        }
        gl_FragColor = vec4(color, uVisibility);
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.CylinderGeometry(TUNNEL_RADIUS, TUNNEL_RADIUS,
    TUNNEL_BACK_Z - TUNNEL_EXIT_Z, 128, 1, true);
  geometry.rotateX(Math.PI / 2);
  const tube = new THREE.Mesh(geometry, material);
  // Draw the solid enclosure before its transparent fog. Sorting this long
  // tube by its centre draws it over the nearer mist from inside, hiding the
  // layered rim until the camera crosses the exit. Depth testing still keeps
  // the fog behind any wall that is genuinely closer to the camera.
  tube.renderOrder = -1;
  tube.position.z = (TUNNEL_BACK_Z + TUNNEL_EXIT_Z) / 2;
  group.add(tube);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(TUNNEL_RADIUS, 128), material);
  cap.renderOrder = tube.renderOrder;
  cap.position.z = TUNNEL_BACK_Z;
  group.add(cap);

  // Depth-tested layers let silhouettes disappear into a real spatial threshold.
  const mistGeometry = new THREE.CircleGeometry(TUNNEL_RADIUS - .12, 96);
  for (let i = 0; i < 12; i++) {
    const mistMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uVisibility: uniforms.uVisibility, uSeed: { value: i * 3.71 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime, uSeed, uVisibility;
        varying vec3 vWorld;
        varying vec2 vUv;
        ${noiseGLSL}
        void main() {
          float billow = fbm(vWorld.xy * .055 + vec2(uTime * .035 + uSeed, uSeed));
          float proximity = smoothstep(.3, 5., abs(cameraPosition.z - vWorld.z));
          float alpha = (.25 + billow * .43) * proximity;
          vec3 color = mix(vec3(.75, .86, .84), vec3(1., .98, .90), billow);
          gl_FragColor = vec4(color, alpha * uVisibility);
          #include <colorspace_fragment>
        }
      `,
    });
    const mist = new THREE.Mesh(mistGeometry, mistMaterial);
    mist.position.z = TUNNEL_EXIT_Z + 14 - i * 2.7;
    group.add(mist);
  }

  return {
    group,
    get solid() { return group.visible; },
    get visibility() { return uniforms.uVisibility.value; },
    reset() {
      if (!group.parent && sceneParent) sceneParent.add(group);
      initialized = false;
      fadeStartedAt = null;
      uniforms.uVisibility.value = 1;
      group.visible = true;
      material.depthWrite = true;
    },
    update(time, player, agents = []) {
      if (!initialized) {
        initialized = true;
        // A direct Heaven start skips the tunnel instead of fading it in view.
        if (player.z < TUNNEL_FADE_EXIT_Z) fadeStartedAt = time - TUNNEL_FADE_SECONDS;
      }
      if (fadeStartedAt === null && player.z < TUNNEL_FADE_EXIT_Z) fadeStartedAt = time;
      const progress = fadeStartedAt === null ? 0 : THREE.MathUtils.clamp((time - fadeStartedAt) / TUNNEL_FADE_SECONDS, 0, 1);
      uniforms.uVisibility.value = 1 - progress * progress * (3 - 2 * progress);
      group.visible = progress < 1;
      // Retain resources for reset, but remove the tube, cap and every mist
      // layer from the scene graph once Heaven has replaced this space.
      if (progress === 1 && group.parent) {
        sceneParent = group.parent;
        group.removeFromParent();
      }
      material.depthWrite = progress === 0;
      uniforms.uTime.value = time;
      uniforms.uLanterns.value[0].copy(player);
      uniforms.uPower.value[0] = 1;
      for (let i = 0; i < RESCUE_COUNT; i++) {
        const agent = agents[i];
        uniforms.uPower.value[i + 1] = agent?.whiteness ?? 0;
        if (agent) uniforms.uLanterns.value[i + 1].copy(agent.butterfly.group.position);
      }
    },
  };
}

// A soft luminous envelope, with no particle trail or texture downloads.
export function createButterflyLantern() {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uStrength; varying vec2 vUv;
      void main() { float r = length(vUv - .5) * 2.;
        float glow = exp(-r * r * 6.) * (1. - smoothstep(.65, 1., r));
        gl_FragColor = vec4(vec3(.82, .9, 1.), glow * .13 * uStrength); }`,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), material);
  halo.visible = false;
  const light = new THREE.PointLight('#e5f0ff', 0, 12, 2);
  group.add(halo, light);
  return {
    group,
    update(position, quaternion, strength) {
      group.position.copy(position);
      halo.quaternion.copy(quaternion);
      // Keep the additive billboard behind the full flap envelope, in view
      // space. A coplanar halo intersects the transparent wings and changes
      // their apparent brightness as their depth/sort order changes.
      halo.position.set(0, 0, -1.5).applyQuaternion(quaternion);
      material.uniforms.uStrength.value = strength;
      light.intensity = strength * 5;
      // Keep the light in Three's fixed lighting layout, even when unlit.
      // Hiding its parent changes NUM_POINT_LIGHTS and recompiles materials.
      halo.visible = strength > .001;
    },
    reset() {
      halo.visible = false;
      material.uniforms.uStrength.value = 0;
      light.intensity = 0;
    },
  };
}
