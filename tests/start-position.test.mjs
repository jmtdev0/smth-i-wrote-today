import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStartPosition } from '../src/startPosition.js';
import { TUNNEL_START, TUNNEL_EXIT_Z, TUNNEL_RADIUS, createTunnelWorld } from '../src/TunnelWorld.js';

test('the three public starting points work in both production and development', () => {
  for (const development of [false, true]) {
    const options = { development };
    assert.deepEqual(resolveStartPosition('?start=underworld', options), TUNNEL_START);
    const limbo = resolveStartPosition('?start=limbo', options);
    assert.equal(limbo.z, TUNNEL_EXIT_Z + 30);
    assert.ok(Math.hypot(limbo.x, limbo.y) < TUNNEL_RADIUS);
    assert.deepEqual(resolveStartPosition('?start=heaven', options), { x: 0, y: 0, z: TUNNEL_EXIT_Z - 75 });
  }
});

test('limbo is inside the tube before the fog and heaven is beyond every fog layer', () => {
  const tunnel = createTunnelWorld();
  try {
    const fog = tunnel.group.children.filter(child => child.material?.uniforms?.uSeed);
    assert.ok(fog.length > 0);
    assert.ok(fog.every(layer => resolveStartPosition('?start=limbo').z > layer.position.z));
    assert.ok(fog.every(layer => resolveStartPosition('?start=heaven').z < layer.position.z));
  } finally {
    const resources = new Set();
    tunnel.group.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) resources.add(object.material);
    });
    for (const resource of resources) resource.dispose();
  }
});

test('missing or unknown starts fall back safely and explicit starts take precedence', () => {
  for (const search of ['', '?start=', '?start=hell', '?start=constructor', '?start=unknown&preview=paradise']) {
    assert.deepEqual(resolveStartPosition(search, { development: true }), TUNNEL_START);
  }
  assert.deepEqual(resolveStartPosition('?preview=paradise'), TUNNEL_START);
  assert.deepEqual(resolveStartPosition('?start=underworld&preview=paradise', { development: true }), TUNNEL_START);
  assert.equal(resolveStartPosition('?preview=paradise', { development: true }).z, TUNNEL_EXIT_Z - 75);
  assert.equal(resolveStartPosition('?preview=mist', { development: true }).z, TUNNEL_EXIT_Z - 2);
});
