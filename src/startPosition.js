import { TUNNEL_START, TUNNEL_EXIT_Z } from './TunnelWorld.js';

const LIMBO_START = Object.freeze({ x: 0, y: 0, z: TUNNEL_EXIT_Z + 30 });
const HEAVEN_START = Object.freeze({ x: 0, y: 0, z: TUNNEL_EXIT_Z - 75 });

// Public entry points work in both development and production. Unknown values
// safely fall back to the usual start; an explicit start overrides previews.
export function resolveStartPosition(search, { development = false } = {}) {
  const params = new URLSearchParams(search);
  const start = params.get('start');
  switch (start) {
    case 'underworld': return TUNNEL_START;
    case 'limbo': return LIMBO_START;
    case 'heaven': return HEAVEN_START;
  }
  if (start === null && development) {
    if (params.get('preview') === 'paradise') return HEAVEN_START;
    if (params.get('preview') === 'mist') return { x: 0, y: 0, z: TUNNEL_EXIT_Z - 2 };
  }
  return TUNNEL_START;
}
