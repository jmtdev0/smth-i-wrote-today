import * as THREE from 'three';
import { butterflyStrokeWidthGLSL, updateButterflyStrokeViewport } from './ButterflyStroke.js';

// Retain the delicate close-up width, but let distant antennae become subpixel
// at the same rate as wing strokes instead of keeping a fixed screen width.
// No outer contrast rim: it would make NPC antennae look thicker again.
export const NPC_ANTENNA_WIDTH_SCALE = .8;

export function createInstancedButterflyAntennae(paths, instanceMatrix, count) {
  const positions = [], tangents = [], sides = [], indices = [];
  for (const points of paths) {
    const base = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const tangent = points[Math.min(i + 1, points.length - 1)].clone()
        .sub(points[Math.max(0, i - 1)]).normalize();
      for (const side of [-1, 1]) {
        positions.push(...points[i].toArray()); tangents.push(...tangent.toArray()); sides.push(side);
      }
      if (i < points.length - 1) {
        const a = base + i * 2;
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aButterflyMatrix', instanceMatrix);
  geometry.setIndex(indices); geometry.instanceCount = count;
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uViewport: { value: new THREE.Vector2(1, 1) },
    uLineWidth: { value: NPC_ANTENNA_WIDTH_SCALE },
    uCoreColor: { value: new THREE.Color('#f5f5f5') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      attribute mat4 aButterflyMatrix;
      attribute vec3 aTangent;
      attribute float aSide;
      uniform vec2 uViewport;
      uniform float uLineWidth;
      ${butterflyStrokeWidthGLSL}
      void main() {
        vec4 mvPosition = modelViewMatrix * aButterflyMatrix * vec4(position, 1.);
        mat4 transform = projectionMatrix * modelViewMatrix * aButterflyMatrix;
        vec4 center = transform * vec4(position, 1.);
        vec4 along = transform * vec4(position + aTangent * .05, 1.);
        vec2 direction = (along.xy / max(abs(along.w), .0001)
          - center.xy / max(abs(center.w), .0001)) * uViewport;
        vec2 normal = vec2(-direction.y, direction.x) / max(length(direction), .0001);
        // No minimum pixel width: MSAA covers the shrinking ribbon naturally.
        float width = min(uLineWidth, butterflyStrokePixels(transform, position, aTangent, uViewport));
        float across = aSide * width * .5;
        gl_Position = center;
        gl_Position.xy += normal * across * 2. / uViewport * center.w;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 uCoreColor;
      void main() {
        gl_FragColor = vec4(uCoreColor, 1.);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const antennae = new THREE.Mesh(geometry, material);
  antennae.name = 'Heaven readable antennae';
  antennae.frustumCulled = false; antennae.renderOrder = 1;
  const viewport = new THREE.Vector4();
  antennae.onBeforeRender = renderer => {
    updateButterflyStrokeViewport(renderer, uniforms, viewport, NPC_ANTENNA_WIDTH_SCALE);
  };
  return antennae;
}
