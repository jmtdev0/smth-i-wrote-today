const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function arrangeChoreography(profiles) {
  // Roughly a fifth of the swarm; neighboring slots share a spatial anchor,
  // not a global attraction that could send distant butterflies racing over.
  for (let base = 0; base < profiles.length; base += 12) {
    const group = Math.floor(base / 12);
    const size = group % 2 ? 3 : 2;
    if (base + size > profiles.length) continue;
    const anchor = profiles[base];
    for (let member = 0; member < size; member++) {
      const p = profiles[base + member];
      p.x = anchor.x; p.y = anchor.y; p.z = anchor.z;
      p.orbit = Math.min(p.orbit, 5);
      p.speed = Math.min(p.speed, .22);
      p.dance = { member, size, period: 48 + group % 5 * 3, offset: group * 7.13 };
    }
  }
}

export function heavenFlightPosition(profile, time, target) {
  const phase = time * profile.speed + profile.phase;
  target.set(profile.x + Math.sin(phase) * profile.orbit,
    profile.y + Math.sin(phase * .73) * profile.orbit * .45,
    profile.z + Math.cos(phase) * profile.orbit);
  const dance = profile.dance;
  if (!dance || profile.orbit === 0) return target;
  const cycle = ((time + dance.offset) % dance.period + dance.period) % dance.period;
  const blend = smooth(0, 8, cycle) * (1 - smooth(18, 26, cycle));
  if (blend === 0) return target;
  const angle = time * .42 + dance.offset
    + dance.member * (dance.size === 2 ? 1.1 : Math.PI * 2 / 3);
  const radius = dance.size === 2 ? 3.2 : 4.2;
  target.x += (profile.x + Math.sin(angle) * radius - target.x) * blend;
  target.z += (profile.z + Math.cos(angle) * radius - target.z) * blend;
  target.y += (profile.y + Math.sin(angle * .85) * 1.5 + dance.member * .55 - target.y) * blend;
  return target;
}
