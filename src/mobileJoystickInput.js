export function normalizeJoystick(offsetX, offsetY, maxDistance, deadzone = .12) {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    return { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  }

  const distance = Math.hypot(offsetX, offsetY);
  const clampedDistance = Math.min(distance, maxDistance);
  const scale = distance > 0 ? clampedDistance / distance : 0;
  const clampedX = offsetX * scale;
  const clampedY = offsetY * scale;
  const magnitude = clampedDistance / maxDistance;
  const response = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);
  const axisScale = magnitude > 0 ? response / magnitude : 0;

  return {
    x: clampedX / maxDistance * axisScale,
    y: clampedY / maxDistance * axisScale,
    offsetX: clampedX,
    offsetY: clampedY,
  };
}
