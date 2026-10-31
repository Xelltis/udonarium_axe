/** How long the camera takes to glide to a point it is sent to, in milliseconds. */
export const CAMERA_GLIDE_MS = 200;

/**
 * The CSS `ease-out` curve, `cubic-bezier(0, 0, 0.58, 1)`: how far along a glide is, from 0 to 1,
 * a fraction `t` of the way through its time. The camera used to glide on a CSS transition with
 * this timing, and keeps the same feel now that the steps are written one frame at a time.
 */
export function easeOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // For a curve from (0,0) to (1,1) with handles (x1,y1) and (x2,y2), x and y are
  // 3(1-s)^2 s h1 + 3(1-s) s^2 h2 + s^3. Find the s whose x is t, then read off its y.
  const x1 = 0;
  const y1 = 0;
  const x2 = 0.58;
  const y2 = 1;
  const along = (s: number, h1: number, h2: number) => 3 * (1 - s) ** 2 * s * h1 + 3 * (1 - s) * s * s * h2 + s ** 3;
  let low = 0;
  let high = 1;
  let s = t;
  for (let i = 0; i < 32; i++) {
    const x = along(s, x1, x2);
    if (Math.abs(x - t) < 1e-7) break;
    if (x < t) low = s;
    else high = s;
    s = (low + high) / 2;
  }
  return along(s, y1, y2);
}
