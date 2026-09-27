import * as THREE from 'three';
import { createButterflyAnatomy, BUTTERFLY_WHITE_LINE } from './Butterfly.js';

// Bake the player's resting anatomy into two instanced draws: solid parts and
// fine outline/antenna strokes. No per-butterfly materials or scene objects.
export function createInstancedButterflyBodies(count) {
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const line = new THREE.LineBasicMaterial({ color: BUTTERFLY_WHITE_LINE });
  const { body, headPivot } = createButterflyAnatomy(bodyMaterial, line);
  const template = new THREE.Group();
  template.add(body, headPivot);
  template.updateMatrixWorld(true);
  const solids = [], strokes = [], originals = new Set();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  template.traverse(object => {
    if (!object.geometry) return;
    originals.add(object.geometry);
    if (object.isMesh) {
      solids.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    } else if (object.isLine) {
      const positions = object.geometry.attributes.position;
      const segments = object.isLineLoop ? positions.count : positions.count - 1;
      for (let i = 0; i < segments; i++) {
        a.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(positions, (i + 1) % positions.count).applyMatrix4(object.matrixWorld);
        n.set(-(b.y - a.y), b.x - a.x, 0).normalize().multiplyScalar(.004);
        for (const [p, side] of [[a, 1], [a, -1], [b, 1], [b, 1], [a, -1], [b, -1]]) {
          strokes.push(p.x + n.x * side, p.y + n.y * side, p.z);
        }
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
  const strokeGeometry = new THREE.BufferGeometry();
  strokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(strokes, 3));
  const bodies = new THREE.InstancedMesh(solidGeometry, bodyMaterial, count);
  const outlines = new THREE.InstancedMesh(strokeGeometry, new THREE.MeshBasicMaterial({
    color: BUTTERFLY_WHITE_LINE, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  }), count);
  bodies.name = 'Heaven bodies and heads';
  outlines.name = 'Heaven body outlines and antennae';
  for (const mesh of [bodies, outlines]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
  }
  return { bodies, outlines };
}
