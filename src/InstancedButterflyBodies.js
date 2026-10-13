import * as THREE from 'three';
import { createButterflyAnatomy, BUTTERFLY_WHITE_LINE } from './Butterfly.js';
import { createInstancedButterflyAntennae } from './InstancedButterflyAntennae.js';
import { butterflyStrokeWidthGLSL, updateButterflyStrokeViewport } from './ButterflyStroke.js';

// Bake the player's resting anatomy into shared draws: solids, fine contours,
// and readable antennae. No per-butterfly materials or scene objects.
export function createInstancedButterflyBodies(count) {
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const line = new THREE.LineBasicMaterial({ color: BUTTERFLY_WHITE_LINE });
  const { body, headPivot } = createButterflyAnatomy(bodyMaterial, line);
  const template = new THREE.Group();
  template.add(body, headPivot);
  template.updateMatrixWorld(true);
  const solids = [], strokes = [], tangents = [], antennaPaths = [], originals = new Set();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), tangent = new THREE.Vector3();
  template.traverse(object => {
    if (!object.geometry) return;
    originals.add(object.geometry);
    if (object.isMesh) {
      solids.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    } else if (object.isLine) {
      const positions = object.geometry.attributes.position;
      if (!object.isLineLoop) {
        antennaPaths.push(Array.from({ length: positions.count }, (_, i) =>
          new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld)));
        return;
      }
      const segments = object.isLineLoop ? positions.count : positions.count - 1;
      for (let i = 0; i < segments; i++) {
        a.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(positions, (i + 1) % positions.count).applyMatrix4(object.matrixWorld);
        strokes.push(a.x, a.y, a.z, b.x, b.y, b.z);
        tangent.subVectors(b, a).normalize();
        tangents.push(...tangent.toArray(), ...tangent.toArray());
      }
    }
  });
  const solidGeometry = new THREE.BufferGeometry();
  // These two primitives share indexed position/normal/uv attributes.
  for (const name of ['position', 'normal', 'uv']) {
    const attributes = solids.map(geometry => geometry.getAttribute(name));
    const values = new Float32Array(attributes.reduce((sum, attribute) => sum + attribute.array.length, 0));
    let offset = 0;
    for (const attribute of attributes) { values.set(attribute.array, offset); offset += attribute.array.length; }
    solidGeometry.setAttribute(name, new THREE.BufferAttribute(values, attributes[0].itemSize));
  }
  const indices = [];
  let vertexOffset = 0;
  for (const geometry of solids) {
    for (const index of geometry.index.array) indices.push(index + vertexOffset);
    vertexOffset += geometry.attributes.position.count;
  }
  solidGeometry.setIndex(indices);
  for (const geometry of [...solids, ...originals]) geometry.dispose();
  line.dispose();
  const strokeGeometry = new THREE.InstancedBufferGeometry();
  strokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(strokes, 3));
  strokeGeometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 3));
  const bodies = new THREE.InstancedMesh(solidGeometry, bodyMaterial, count);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Keep the existing paths/depth to avoid burying contours in the rounded
  // anatomy. Native lines cannot shrink below a pixel, so represent smaller
  // projected wing-stroke widths through coverage instead of a fixed bright rim.
  strokeGeometry.instanceCount = count;
  strokeGeometry.setAttribute('aButterflyMatrix', bodies.instanceMatrix);
  const strokeMaterial = new THREE.LineBasicMaterial({
    color: BUTTERFLY_WHITE_LINE, linewidth: 1, transparent: true,
    // Native lines cannot be narrower than one physical pixel on most GPUs.
    // Reduce their coverage for a lighter hairline without changing the body.
    opacity: .8,
    depthWrite: false, toneMapped: false,
  });
  const uniforms = { uViewport: { value: new THREE.Vector2(1, 1) }, uLineWidth: { value: 1 } };
  strokeMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute mat4 aButterflyMatrix;
        attribute vec3 aTangent;
        uniform vec2 uViewport;
        uniform float uLineWidth;
        varying float vStrokeCoverage;
        ${butterflyStrokeWidthGLSL}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = (aButterflyMatrix * vec4(position, 1.0)).xyz;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        float projectedWidth = butterflyStrokePixels(projectionMatrix * modelViewMatrix * aButterflyMatrix,
          position, aTangent, uViewport);
        vStrokeCoverage = min(1., projectedWidth / uLineWidth);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vStrokeCoverage;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vStrokeCoverage;');
  };
  strokeMaterial.customProgramCacheKey = () => 'heaven-instanced-anatomy-perspective-lines-v2';
  const outlines = new THREE.LineSegments(strokeGeometry, strokeMaterial);
  const viewport = new THREE.Vector4();
  outlines.onBeforeRender = renderer => updateButterflyStrokeViewport(renderer, uniforms, viewport);
  outlines.add(createInstancedButterflyAntennae(antennaPaths, bodies.instanceMatrix, count));
  outlines.renderOrder = 1;
  bodies.name = 'Heaven bodies and heads';
  outlines.name = 'Heaven body outlines and antennae';
  for (const mesh of [bodies, outlines]) {
    mesh.frustumCulled = false;
  }
  return { bodies, outlines };
}
