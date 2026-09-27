import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTunnelWorld, TUNNEL_FADE_SECONDS, TUNNEL_FADE_EXIT_Z, TUNNEL_EXIT_Z } from '../src/TunnelWorld.js';

function world(t) {
  const tunnel = createTunnelWorld();
  t.after(() => {
    const resources = new Set();
    tunnel.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  });
  return tunnel;
}

test('the tunnel fades only after leaving the fog, smoothly over three simulation seconds', t => {
  const tunnel = world(t), player = new THREE.Vector3(0, 0, TUNNEL_EXIT_Z + 30);
  tunnel.update(0, player);
  player.z = TUNNEL_EXIT_Z - 10;
  tunnel.update(10, player);
  assert.equal(tunnel.visibility, 1);
  player.z = TUNNEL_FADE_EXIT_Z - .1;
  tunnel.update(11, player);
  assert.equal(tunnel.visibility, 1);
  tunnel.update(11 + TUNNEL_FADE_SECONDS / 2, player);
  assert.equal(tunnel.visibility, .5);
  assert.equal(tunnel.solid, true);
  for (const mesh of tunnel.group.children) assert.equal(mesh.material.uniforms.uVisibility.value, .5);
  assert.equal(tunnel.group.children[0].material.depthWrite, false);
  tunnel.update(11 + TUNNEL_FADE_SECONDS / 2, player);
  assert.equal(tunnel.visibility, .5, 'paused simulation must not advance the fade');
  tunnel.update(11 + TUNNEL_FADE_SECONDS, player);
  assert.equal(tunnel.visibility, 0);
  assert.equal(tunnel.group.visible, false);
  assert.equal(tunnel.solid, false);
  player.z = 0;
  tunnel.update(20, player);
  assert.equal(tunnel.visibility, 0, 'returning does not make the tunnel pop back in');
  tunnel.reset();
  tunnel.update(21, player);
  assert.equal(tunnel.visibility, 1);
  assert.equal(tunnel.solid, true);
  assert.equal(tunnel.group.children[0].material.depthWrite, true);
});

test('starting directly in Heaven omits the tunnel; resetting in limbo restores it', t => {
  const tunnel = world(t), player = new THREE.Vector3(0, 0, TUNNEL_EXIT_Z - 75);
  tunnel.update(.01, player);
  assert.equal(tunnel.visibility, 0);
  assert.equal(tunnel.solid, false);
  tunnel.reset();
  player.z = TUNNEL_EXIT_Z + 30;
  tunnel.update(15, player);
  assert.equal(tunnel.visibility, 1);
});

test('the enclosure renders before the mist, exposing its layered rim from inside', t => {
  const tunnel = world(t);
  const layers = tunnel.group.children.filter(mesh => mesh.material.uniforms.uSeed);
  const enclosure = tunnel.group.children.filter(mesh => !mesh.material.uniforms.uSeed);
  assert.equal(layers.length, 12, 'reuse the existing fog layers');
  assert.equal(enclosure.length, 2, 'tube and back cap');
  const materials = new Set(tunnel.group.children.map(mesh => mesh.material));
  const versions = [...materials].map(material => material.version);

  function checkOrdering() {
    for (const wall of enclosure) {
      for (const mist of layers) {
        assert.ok(wall.renderOrder < mist.renderOrder,
          'a centre-sorted transparent wall must not paint over foreground fog');
        assert.equal(mist.material.depthTest, true, 'nearer walls must still occlude fog');
        assert.equal(mist.material.depthWrite, false, 'fog layers must blend together');
        assert.equal(mist.material.side, THREE.DoubleSide);
      }
    }
  }

  const player = new THREE.Vector3(0, 0, TUNNEL_EXIT_Z + 110);
  tunnel.update(0, player);
  checkOrdering();
  player.z = TUNNEL_EXIT_Z + 30;
  tunnel.update(1, player);
  checkOrdering();
  assert.equal(tunnel.visibility, 1, 'revealing the rim must not start the Heaven fade');
  player.z = TUNNEL_FADE_EXIT_Z - 1;
  tunnel.update(2, player);
  tunnel.update(2 + TUNNEL_FADE_SECONDS / 2, player);
  checkOrdering();
  tunnel.reset();
  checkOrdering();
  assert.deepEqual([...materials].map(material => material.version), versions,
    'approach and reset must not trigger shader recompilation');
});
