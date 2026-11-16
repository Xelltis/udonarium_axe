/**
 * Turns a pointer movement on screen into the same movement along the axes of an element that
 * is turned by `rotationDegrees` clockwise, so dragging a turned panel's edge grows it the way
 * it points, and a turned menu is pulled on screen along its own axes.
 */
export function screenDeltaToElementDelta(x: number, y: number, rotationDegrees: number): { x: number; y: number } {
  const radians = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}
