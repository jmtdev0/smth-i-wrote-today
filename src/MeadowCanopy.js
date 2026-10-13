import * as THREE from 'three';
import { meadowWingWindGLSL } from './MeadowWingWind.js';

export const CANOPY_LAYERS = 16;
export const CANOPY_HEIGHT = 1.55;

// Cover the entire terrain in a grass volume. Close-up blades supply the fine
// silhouettes; these instanced slices fill the middle distance and every hill.
export function createMeadowCanopy(terrainGeometry, meadowLife) {
  const material = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: true, forceSinglePass: true,
  });
  material.defines = { HEAVEN_GRASS: 1 };
  meadowLife.applyToMaterial(material);
  const compileMeadow = material.onBeforeCompile;
  const rootColor = new THREE.Color('#648649'), tipColor = new THREE.Color('#b4ca75');
  material.customProgramCacheKey = () => 'heaven-continuous-grass-canopy-v5-arrival';
  material.onBeforeCompile = shader => {
    compileMeadow(shader);
    shader.vertexShader = `uniform float uMeadowTime, uMeadowLife;
      varying float vCanopyLevel, vCanopyHeight;
      ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('vMeadowWorld = (modelMatrix * vec4(transformed, 1.)).xyz;', '');
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
      THREE.ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', `
        vCanopyLevel = instanceMatrix[3].y / ${CANOPY_HEIGHT.toFixed(2)};
        float groundY = mvPosition.y - instanceMatrix[3].y;
        float detailDistance = distance(cameraPosition, vec3(mvPosition.x, groundY, mvPosition.z));
        // Keep only the dense undergrowth close up, where individual blades
        // supply the upper volume and hide the horizontal-slice structure.
        vCanopyHeight = instanceMatrix[3].y * mix(.16, 1., smoothstep(15., 65., detailDistance)) * uMeadowLife;
        mvPosition.y = groundY + vCanopyHeight;
        vMeadowWorld = (modelMatrix * mvPosition).xyz;
        mvPosition = modelViewMatrix * mvPosition;
      `));
    shader.fragmentShader = `varying float vCanopyLevel, vCanopyHeight;
      ${meadowWingWindGLSL}
      float canopyHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * .1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float canopyNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(canopyHash(i), canopyHash(i + vec2(1., 0.)), f.x),
          mix(canopyHash(i + vec2(0., 1.)), canopyHash(i + vec2(1.)), f.x), f.y);
      }
      vec2 canopyWarp(vec2 p) {
        // Anchored, non-periodic patches bend the distribution itself, not the
        // terrain. Slow deformation breaks long straight rows at every height.
        vec2 flow = vec2(canopyNoise(p * .19), canopyNoise(p * .19 + 43.7)) - .5;
        return p + flow * 1.8;
      }
      vec3 canopyRoot(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        float nearest = 10.;
        vec3 result = vec3(0.);
        // Search neighbouring cells: a root may cross a cell edge without
        // being clipped into a square. Full-cell jitter removes planted rows.
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 id = cell + offset;
          float seed = canopyHash(id);
          vec2 jitter = vec2(seed, canopyHash(id + 31.7));
          vec2 local = f - offset - (.08 + jitter * .84);
          float d = dot(local, local);
          if (d < nearest) { nearest = d; result = vec3(local, seed); }
        }
        return result;
      }
      float canopyStroke(vec2 p) {
        vec3 root = canopyRoot(p);
        float angle = (root.z - .5) * 1.5;
        vec2 local = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * root.xy;
        float tip = clamp((local.y + .45) / (.7 + root.z * .3), 0., 1.);
        float lean = (root.z - .5) * .22;
        float x = abs(local.x - lean * tip * tip);
        float width = mix(.14, .018, tip);
        // Derivatives of continuous coordinates, never of fract(): cell
        // borders must not become false high-frequency edges.
        float aa = max(fwidth(p.x) * .7, .015);
        float stroke = 1. - smoothstep(width - aa, width + aa, x);
        stroke *= smoothstep(0., .15, tip) * (1. - smoothstep(.8, 1., tip));
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        return mix(stroke, .11, smoothstep(.35, 1.1, footprint));
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if (uMeadowLife < .001) discard;
      float height = vCanopyHeight;
      float gust = sin(vMeadowWorld.x * .12 + vMeadowWorld.z * .075 - uMeadowTime * .85
        + sin(vMeadowWorld.z * .045 - uMeadowTime * .22) * .75);
      vec2 bend = vec2(.15 + gust * .14,
        .06 + sin(vMeadowWorld.z * .18 - vMeadowWorld.x * .055 - uMeadowTime * .55) * .065);
      bend += meadowWingWind(vMeadowWorld.xz);
      vec2 warpedRoot = canopyWarp(vMeadowWorld.xz);
      vec2 fibers = (warpedRoot - bend * height * height) * 6.;
      float footprint = max(length(dFdx(fibers)), length(dFdy(fibers)));
      float filtered = smoothstep(.4, 1.4, footprint);
      vec3 root = canopyRoot(fibers);
      float seed = root.z;
      vec2 local = root.xy;
      // Filter the height randomness too, not only the final mask: otherwise
      // the subpixel cells form moire stripes across distant slopes.
      float top = .58 + mix(seed, .5, filtered) * .42;
      float level = vCanopyLevel / top;
      float radius = mix(.73, .045, pow(clamp(level, 0., 1.), .72));
      float coverage = 1. - smoothstep(radius - .08, radius + .08, length(local));
      coverage *= 1. - smoothstep(.94, 1., level);
      float averageCoverage = min(1., 3.14159 * radius * radius) * (1. - smoothstep(.94, 1., level));
      coverage = mix(coverage, averageCoverage, filtered);
      // Bottom-to-top slices blend filtered coverage instead of a noisy
      // screen-space stipple, retaining the velvety distant grass surface.
      if (coverage < .01) discard;
      // Readiness must fade coverage too, not just grow the slice heights.
      // Otherwise all sixteen layers suddenly tint the ground at activation.
      diffuseColor.a *= coverage * uMeadowLife;
      float fieldMix = .5 + .5 * sin(vMeadowWorld.x * .045 + vMeadowWorld.z * .025);
      vec3 grass = mix(vec3(${rootColor.toArray().join(',')}), vec3(${tipColor.toArray().join(',')}), vCanopyLevel * .8 + fieldMix * .15);
      // Coarser leaves have independently jittered roots, orientation and
      // length too. Otherwise they expose a second woven grid from high above.
      vec2 tuftRoot = warpedRoot - bend * .5;
      float strands = canopyStroke(tuftRoot * vec2(1.8, .62)) - .11;
      grass *= 1. + strands * .58;
      vec3 ground = mix(vec3(${new THREE.Color('#89ab76').toArray().join(',')}),
        vec3(${new THREE.Color('#c6d69b').toArray().join(',')}), fieldMix * .6);
      diffuseColor.rgb *= mix(ground, grass * mix(.77, 1.08, vCanopyLevel), uMeadowLife);
    `);
  };
  // Share the actual terrain positions, so recycling carries every slice
  // without a second height map or per-frame instance buffer uploads.
  const mesh = new THREE.InstancedMesh(terrainGeometry, material, CANOPY_LAYERS);
  mesh.name = 'Continuous meadow grass canopy';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < CANOPY_LAYERS; i++) {
    mesh.setMatrixAt(i, matrix.makeTranslation(0, (i + 1) / CANOPY_LAYERS * CANOPY_HEIGHT, 0));
  }
  return { mesh, update(enabled) { mesh.visible = enabled; } };
}
