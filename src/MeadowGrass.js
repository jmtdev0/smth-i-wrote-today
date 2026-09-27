import * as THREE from 'three';
import { seededRandom } from './noise.js';
import { meadowSurfaceGLSL } from './MeadowSurface.js';
import { meadowWingWindGLSL } from './MeadowWingWind.js';

// A fixed pool gives a dense foreground without growing with travelled distance.
export const GRASS_COUNT = 120000;
export const GRASS_SPAN = 80;
export const GRASS_HEIGHT_MIN = 1.05;
export const GRASS_HEIGHT_MAX = 2.05;
export const MIDDLE_GRASS_COUNT = 60000;
export const MIDDLE_GRASS_SPAN = 240;
export const MIDDLE_GRASS_FADE = Object.freeze({ innerStart: 18, innerEnd: 34, outerStart: 84, outerEnd: 118 });
// A third, very simple tier nearly doubles the reach without diluting the
// existing foreground/middle pools or multiplying their detailed geometry.
export const FAR_GRASS_COUNT = 90000;
export const FAR_GRASS_SPAN = 480;
export const FAR_GRASS_FADE = Object.freeze({ innerStart: 70, innerEnd: 108, outerStart: 170, outerEnd: 234 });

export function grassRootPosition(x, z, centerX, centerZ, span = GRASS_SPAN) {
  const wrap = (v, c) => c + THREE.MathUtils.euclideanModulo(v - c + span / 2, span) - span / 2;
  return { x: wrap(x, centerX), z: wrap(z, centerZ) };
}

function tuftGeometry(middle = false, far = false) {
  const positions = [], uvs = [], indices = [];
  const simplified = middle || far;
  const blades = simplified ? 5 : 3, segments = far ? 1 : middle ? 2 : 3;
  for (let blade = 0; blade < blades; blade++) {
    const angle = blade * (simplified ? 2.399963 : Math.PI / 3), cos = Math.cos(angle), sin = Math.sin(angle);
    const offset = positions.length / 3;
    for (let row = 0; row <= segments; row++) {
      const y = row / segments, width = (simplified ? .13 : .075) * Math.pow(1 - y, 1.25);
      for (const side of [-1, 1]) {
        const x = side * width + y * y * (.18 + blade * .045);
        positions.push(x * cos + cos * .10, y * (1 - (blade % 3) * .12), x * sin + sin * .10);
        uvs.push((side + 1) / 2, y);
      }
      if (row < segments) {
        const a = offset + row * 2;
        indices.push(a, a + 1, a + 2);
        if (!simplified || row < segments - 1) indices.push(a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createMeadowGrass(meadowLife, count = GRASS_COUNT, { middle = false, far = false } = {}) {
  const simplified = middle || far;
  const span = far ? FAR_GRASS_SPAN : middle ? MIDDLE_GRASS_SPAN : GRASS_SPAN;
  const fade = far ? FAR_GRASS_FADE : MIDDLE_GRASS_FADE;
  const uniforms = { uGrassCenter: { value: new THREE.Vector2() }, uGrassEnabled: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.defines = { HEAVEN_GRASS: 1 };
  meadowLife.applyToMaterial(material);
  const meadowCompile = material.onBeforeCompile;
  const green = new THREE.Color('#648649'), yellow = new THREE.Color('#b4ca75');
  const groundGreen = new THREE.Color('#89ab76'), groundYellow = new THREE.Color('#c6d69b');
  material.customProgramCacheKey = () => far ? 'heaven-grass-far-v2-wingwind' : middle ? 'heaven-grass-middle-v2-wingwind' : 'heaven-grass-v4-wingwind';
  material.onBeforeCompile = shader => {
    meadowCompile(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform vec2 uGrassCenter;
      uniform float uGrassEnabled, uMeadowTime, uMeadowLife;
      varying float vGrassFade, vGrassShade, vGrassTip;
      ${meadowSurfaceGLSL}
      ${meadowWingWindGLSL}
      ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('vMeadowWorld = (modelMatrix * vec4(transformed, 1.)).xyz;', '');
    const project = THREE.ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', `
      vec2 originalRoot = instanceMatrix[3].xz;
      float seed = fract(sin(dot(originalRoot, vec2(12.9898, 78.233))) * 43758.5453);
      vGrassTip = uv.y;
      vGrassShade = .82 + .18 * seed;
      vec2 root = uGrassCenter + mod(originalRoot - uGrassCenter + ${span / 2}., ${span}.) - ${span / 2}.;
      float height = mvPosition.y;
      float groundY = meadowSurfaceAt(root);
      float cameraDistance = distance(cameraPosition, vec3(root.x, groundY, root.y));
      float radialDistance = distance(root, uGrassCenter);
      float edgeFade = 1. - smoothstep(${simplified ? `${fade.outerStart.toFixed(1)}, ${fade.outerEnd.toFixed(1)}` : '24., 38.'}, radialDistance);
      float distanceFade = 1. - smoothstep(${far ? '210., 330.' : middle ? '105., 165.' : '26., 65.'}, cameraDistance);
      float innerFade = ${simplified ? `smoothstep(${fade.innerStart.toFixed(1)}, ${fade.innerEnd.toFixed(1)}, max(radialDistance, cameraDistance))` : '1.'};
      vGrassFade = edgeFade * distanceFade * innerFade * uGrassEnabled * uMeadowLife;
      ${simplified ? `// Stagger removal between tufts so they do not all sink
      // below the continuous canopy at one visible circular boundary.
      float tuftFade = smoothstep(seed * .8, seed * .8 + .2, vGrassFade);
      height *= tuftFade;
      ` : ''}
      // Shared slow gusts, plus local variation. Roots do not move.
      float gust = sin(root.x * .12 + root.y * .075 - uMeadowTime * .85
        + sin(root.y * .045 - uMeadowTime * .22) * .75);
      float crosswind = sin(root.y * .18 - root.x * .055 - uMeadowTime * .55);
      float flutter = sin(uMeadowTime * (1.5 + seed * .4) + seed * 6.2831853);
      vec2 bend = vec2(.15 + gust * .14 + flutter * .025, .06 + crosswind * .065);
      bend += meadowWingWind(root);
      mvPosition.xz += root - originalRoot + bend * height * height * ${simplified ? '1.' : 'vGrassFade'};
      // Gently lower bending tips instead of stretching the whole blade.
      mvPosition.y = groundY - .012 + (height - dot(bend, bend) * height * uv.y * .45) * ${simplified ? '1.' : 'vGrassFade'};
      vMeadowWorld = (modelMatrix * mvPosition).xyz;
      mvPosition = modelViewMatrix * mvPosition;
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', project);
    shader.fragmentShader = 'varying float vGrassFade, vGrassShade, vGrassTip;\n' + shader.fragmentShader;
    // Thin translucent-looking foliage receives soft upward light on both
    // faces; back-facing cards must not turn into dark silhouettes.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      normal = normalize(mat3(viewMatrix) * vec3(0., 1., 0.) + normal * .12);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if (vGrassFade < .015) discard;
      float fieldMix = .5 + sin(vMeadowWorld.x * .045 + vMeadowWorld.z * .025) * .5;
      float tipLight = smoothstep(0., 1., vGrassTip);
      vec3 grassColor = mix(vec3(${green.toArray().join(',')}), vec3(${yellow.toArray().join(',')}), tipLight * .72 + fieldMix * .18);
      vec3 groundColor = mix(vec3(${groundGreen.toArray().join(',')}), vec3(${groundYellow.toArray().join(',')}), fieldMix * .6);
      // Match the underlying meadow as blades shrink, hiding the circular
      // recycled patch when looking down from above.
      diffuseColor.rgb *= ${simplified ? 'grassColor * vGrassShade * mix(.72, 1.06, tipLight) * mix(.84, 1., vGrassFade)' : 'mix(groundColor, grassColor * vGrassShade * mix(.72, 1.06, tipLight), smoothstep(.15, .95, vGrassFade))'};
    `);
  };
  const mesh = new THREE.InstancedMesh(tuftGeometry(middle, far), material, count);
  mesh.name = far ? 'Far meadow grass' : middle ? 'Middle-distance meadow grass' : 'Wind-swept meadow grass';
  // Shader wraps instances around the player; CPU bounds do not track that.
  mesh.frustumCulled = false;
  const random = seededRandom(far ? 30781 : middle ? 90173 : 60729), dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set((random() - .5) * span, 0, (random() - .5) * span);
    dummy.rotation.y = random() * Math.PI * 2;
    const height = GRASS_HEIGHT_MIN + random() * (GRASS_HEIGHT_MAX - GRASS_HEIGHT_MIN);
    dummy.scale.set(.8 + random() * .45, height, .8 + random() * .45);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  return {
    mesh, uniforms,
    update(player, enabled) {
      // The modulo shifts roots only by a whole span, beyond the faded edge;
      // the distance fade itself follows the player continuously.
      uniforms.uGrassCenter.value.set(player.x, player.z);
      uniforms.uGrassEnabled.value = enabled ? 1 : 0;
      mesh.visible = enabled;
    },
  };
}

export function createMiddleMeadowGrass(meadowLife) {
  return createMeadowGrass(meadowLife, MIDDLE_GRASS_COUNT, { middle: true });
}

export function createFarMeadowGrass(meadowLife) {
  return createMeadowGrass(meadowLife, FAR_GRASS_COUNT, { far: true });
}
