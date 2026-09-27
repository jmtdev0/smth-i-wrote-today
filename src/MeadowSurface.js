import { PARADISE_CENTER_Z } from './TunnelWorld.js';

export const MEADOW_GRID_STEP = 20;
export function meadowHeight(x, z) {
  return -30 + Math.sin(x * .026) * 4 + Math.cos((z - PARADISE_CENTER_Z) * .035) * 3;
}

// Match the actual triangles, not just the analytic height: blades must not
// float above or sink into the relatively coarse meadow mesh.
export function meadowSurfaceHeight(x, z) {
  const x0 = Math.floor(x / MEADOW_GRID_STEP) * MEADOW_GRID_STEP;
  const z0 = Math.floor(z / MEADOW_GRID_STEP) * MEADOW_GRID_STEP;
  const u = (x - x0) / MEADOW_GRID_STEP, v = (z - z0) / MEADOW_GRID_STEP;
  const a = meadowHeight(x0, z0), b = meadowHeight(x0, z0 + MEADOW_GRID_STEP);
  const c = meadowHeight(x0 + MEADOW_GRID_STEP, z0 + MEADOW_GRID_STEP), d = meadowHeight(x0 + MEADOW_GRID_STEP, z0);
  return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
}

export const meadowSurfaceGLSL = `
float meadowHeightAt(vec2 p) {
  return -30. + sin(p.x * .026) * 4. + cos((p.y - ${PARADISE_CENTER_Z.toFixed(1)}) * .035) * 3.;
}
float meadowSurfaceAt(vec2 p) {
  vec2 cell = floor(p / 20.) * 20.;
  vec2 f = (p - cell) / 20.;
  float a = meadowHeightAt(cell), b = meadowHeightAt(cell + vec2(0., 20.));
  float c = meadowHeightAt(cell + vec2(20.)), d = meadowHeightAt(cell + vec2(20., 0.));
  return f.x + f.y <= 1. ? a + (d - a) * f.x + (b - a) * f.y
    : c + (b - c) * (1. - f.x) + (d - c) * (1. - f.y);
}
`;
