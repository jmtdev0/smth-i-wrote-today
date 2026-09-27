export const CAMERA_PITCH_LIMIT = Math.PI / 2 - .01;
export function angularDistance(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
export function portraitWeight(yaw, pitch = 0) {
  const window = (center, width) => {
    const d = Math.abs(angularDistance(yaw, center)) / width;
    const t = Math.max(0, 1 - d);
    return t * t * (3 - 2 * t);
  };
  return Math.max(window(.38, .32), window(-.92, .3) * .8)
    * Math.max(0, 1 - Math.abs(pitch - .08) / 1.2);
}
