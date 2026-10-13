import * as THREE from 'three';
import { HEAVEN_SUN_DIRECTION } from './HeavenClouds.js';
import { LOCAL_SHADOW_RADIUS } from './HeavenLighting.js';
import { meadowSurfaceHeight } from './MeadowSurface.js';

export const NPC_SHADOW_FADE_HEIGHT = 12;
export const NPC_SHADOW_MAX_HEIGHT = 36;
const SUN_SLOPE_X = HEAVEN_SUN_DIRECTION.x / HEAVEN_SUN_DIRECTION.y;
const SUN_SLOPE_Z = HEAVEN_SUN_DIRECTION.z / HEAVEN_SUN_DIRECTION.y;
// Include the low sun's horizontal projection and 16 units of terrain relief.
// A fixed 96-unit cutoff would miss tall NPCs casting into the expanded map.
export const NPC_SHADOW_CULL_RADIUS = LOCAL_SHADOW_RADIUS + 4
  + (NPC_SHADOW_MAX_HEIGHT + 16) * Math.hypot(SUN_SLOPE_X, SUN_SLOPE_Z);

export function heavenButterflyShadowStrength(position, center) {
  if (!center) return 0;
  // Cheap broad rejection before sampling the triangular meadow surface.
  if (Math.hypot(position.x - center.x, position.z - center.z) > NPC_SHADOW_CULL_RADIUS) return 0;
  const height = position.y - meadowSurfaceHeight(position.x, position.z);
  if (height < 0 || height >= NPC_SHADOW_MAX_HEIGHT) return 0;
  // Select by where the shadow lands, not where the butterfly is: the sun
  // can bring an off-centre caster's shadow into the visible local map.
  let drop = height, x = position.x, z = position.z;
  for (let i = 0; i < 3; i++) {
    x = position.x - SUN_SLOPE_X * drop;
    z = position.z - SUN_SLOPE_Z * drop;
    drop = position.y - meadowSurfaceHeight(x, z);
  }
  // Receivers fade before the map's edge; leave space for the wing silhouette.
  if (Math.hypot(x - center.x, z - center.z) > LOCAL_SHADOW_RADIUS + 4) return 0;
  return 1 - THREE.MathUtils.smoothstep(height, NPC_SHADOW_FADE_HEIGHT, NPC_SHADOW_MAX_HEIGHT);
}

export function createHeavenButterflyShadows(sources, capacity) {
  const group = new THREE.Group();
  group.name = 'Nearby Heaven butterfly shadows';
  // These proxies contribute only to the sun's depth map, never to the main
  // image/depth. Compact instance buffers avoid redrawing the whole swarm.
  const invisible = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide });
  depth.customProgramCacheKey = () => 'heaven-npc-shadow-height-v1';
  depth.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float aNpcShadowStrength;
      varying float vNpcShadowStrength;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vNpcShadowStrength = aNpcShadowStrength;
    `);
    shader.fragmentShader = `varying float vNpcShadowStrength;\n${shader.fragmentShader}`
      .replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      // Stable shadow-map coverage, softened by the existing PCF filter.
      // No screen-frame randomness and no hard on/off altitude boundary.
      float coverage = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
      if (coverage >= vNpcShadowStrength) discard;
    `);
  };
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
    .setUsage(THREE.DynamicDrawUsage);
  const meshes = sources.map((source, index) => {
    const geometry = source.geometry.clone();
    geometry.setAttribute('aNpcShadowStrength', strength);
    const mesh = new THREE.InstancedMesh(geometry, invisible, capacity);
    mesh.name = `Heaven NPC shadow part ${index}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    group.add(mesh);
    return mesh;
  });
  let count = 0, center = null, enabled = false;
  return {
    group, meshes,
    get count() { return count; },
    begin(player, openWorld) { count = 0; center = player; enabled = openWorld; },
    select(position) {
      if (!enabled || count >= capacity) return -1;
      const opacity = heavenButterflyShadowStrength(position, center);
      if (opacity <= 0) return -1;
      strength.setX(count, opacity);
      return count++;
    },
    setMatrix(part, slot, matrix) { if (slot >= 0) meshes[part].setMatrixAt(slot, matrix); },
    end() {
      for (const mesh of meshes) {
        mesh.count = count;
        if (count) {
          mesh.instanceMatrix.clearUpdateRanges();
          mesh.instanceMatrix.addUpdateRange(0, count * 16);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      if (count) {
        strength.clearUpdateRanges(); strength.addUpdateRange(0, count);
        strength.needsUpdate = true;
      }
    },
    dispose() {
      for (const mesh of meshes) { mesh.dispose(); mesh.geometry.dispose(); }
      invisible.dispose(); depth.dispose();
    },
  };
}
