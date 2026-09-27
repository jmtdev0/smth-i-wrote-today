import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createButterfly } from '../src/Butterfly.js';
import { createButterflyLantern } from '../src/TunnelWorld.js';

test('the luminous envelope stays behind every wing through flapping and camera rotation', () => {
  const butterfly = createButterfly({ whiteness: 1, alwaysWhite: true });
  const lantern = createButterflyLantern();
  const halo = lantern.group.children.find(object => object.isMesh);
  const position = new THREE.Vector3(3, 12, -255);
  const vertex = new THREE.Vector3(), haloPosition = new THREE.Vector3();
  const fillMeshes = [];
  butterfly.group.traverse(object => { if (object.userData.visualRole === 'fill') fillMeshes.push(object); });
  butterfly.group.scale.setScalar(.48);
  butterfly.group.position.copy(position);
  try {
    for (const [pitch, yaw] of [[0, 0], [-1.3, 2], [1.3, -2], [.5, Math.PI]]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
      const towardCamera = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      butterfly.group.quaternion.copy(q);
      lantern.update(position, q, 1);
      lantern.group.updateMatrixWorld(true);
      halo.getWorldPosition(haloPosition);
      for (let frame = 0; frame <= 60; frame++) {
        butterfly.update(frame / 30, true);
        butterfly.group.updateMatrixWorld(true);
        for (const mesh of fillMeshes) {
          assert.equal(mesh.material.opacity, .9);
          const vertices = mesh.geometry.attributes.position;
          for (let i = 0; i < vertices.count; i++) {
            vertex.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
            assert.ok(vertex.sub(haloPosition).dot(towardCamera) > .1,
              'the additive halo must never intersect the translucent wing');
          }
        }
      }
    }
  } finally {
    const resources = new Set();
    for (const group of [butterfly.group, lantern.group]) group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});
