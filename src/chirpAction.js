import { TUNNEL_EXIT_Z } from './TunnelWorld.js';

// White calls reset the player's tint, never the camera or journey.
// Cooldown still gates the entire action, including tunnel rescues.
export function emitButterflyChirp({ time, player, butterfly, flock, paradise,
  tunnel, effects, landscapeColor, charge = 0, restoreWhite = false, recruit = true }) {
  // Every call rescues inside the tube, regardless of its Heaven intent.
  // Do not extend this override outside the mouth while the tunnel fades,
  // or into the former tunnel space once Heaven has replaced it.
  const insideTunnel = tunnel.solid && player.z >= TUNNEL_EXIT_Z;
  const result = flock.chirp(time, player, charge, {
    recruit: recruit || insideTunnel, slotOffset: paradise.connectedCount ?? 0,
  });
  if (!result.emitted) return result;

  const heavenAnswer = player.z < TUNNEL_EXIT_Z || !tunnel.solid
    ? paradise.chirp(time, player, result.radius, { recruit: recruit && !tunnel.solid, slotOffset: flock.connectedCount }) : null;
  if (heavenAnswer) flock.respond(time);
  if (restoreWhite) {
    butterfly.resetTint();
    landscapeColor.set('#ffffff');
  } else if (heavenAnswer) {
    // Recruiting changes membership, not NPC tint. Greeting is still the
    // intentional color-sharing call for companions from either population.
    if (!recruit) {
      flock.adoptColor(heavenAnswer.color);
      paradise.adoptColor?.(heavenAnswer.color);
    }
    butterfly.adoptColor(heavenAnswer.color);
    landscapeColor.copy(heavenAnswer.color);
  }
  if (!tunnel.solid) paradise.pulse(time, player, landscapeColor, result.charge);
  butterfly.releaseChirp(time, result.charge);
  effects.call(player, time, result.receivers, result.radius, result.charge, heavenAnswer);
  return result;
}

export function releaseButterflyGroup({ time, tunnel, flock, paradise }) {
  if (tunnel.solid) return 0;
  return flock.releaseAll(time) + paradise.releaseAll(time);
}
