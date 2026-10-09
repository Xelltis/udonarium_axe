/**
 * How far one colour lies from another, as the largest difference in any one of red, green and
 * blue, from 0 for the same colour to 255.
 */
function colorDistance(pixels: Uint8ClampedArray, at: number, red: number, green: number, blue: number): number {
  return Math.max(Math.abs(pixels[at] - red), Math.abs(pixels[at + 1] - green), Math.abs(pixels[at + 2] - blue));
}

/**
 * Makes clear the run of pixels joined to the one at (x, y) whose colour lies within `tolerance`
 * of that pixel's, as a plain background is taken out from around a figure, and returns how many
 * pixels it cleared.
 *
 * `pixels` is RGBA, four bytes a pixel row by row, as a canvas hands it over, and is changed where
 * it lies. The run spreads to the neighbours above, below and either side, so the same colour shut
 * inside the figure is left alone. It stops at a pixel already clear, and at one further from the
 * colour; one not much further, within twice the tolerance, is left partly see-through, so the edge
 * of the figure does not keep a fringe of the old background. A point outside the picture, or on a
 * pixel already clear, clears nothing.
 */
export function eraseConnectedColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance: number
): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) return 0;
  const start = (y * width + x) * 4;
  if (pixels[start + 3] === 0) return 0;

  const [red, green, blue] = [pixels[start], pixels[start + 1], pixels[start + 2]];
  const limit = Math.max(0, tolerance);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  let cleared = 0;
  queue[tail++] = y * width + x;
  visited[y * width + x] = 1;

  while (head < tail) {
    const index = queue[head++];
    const at = index * 4;
    pixels[at + 3] = 0;
    cleared++;

    const column = index % width;
    const neighbours = [
      column > 0 ? index - 1 : -1,
      column < width - 1 ? index + 1 : -1,
      index >= width ? index - width : -1,
      index < width * (height - 1) ? index + width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || visited[next]) continue;
      visited[next] = 1;
      const nextAt = next * 4;
      if (pixels[nextAt + 3] === 0) continue;
      const distance = colorDistance(pixels, nextAt, red, green, blue);
      if (distance <= limit) {
        queue[tail++] = next;
      } else if (limit > 0 && distance < limit * 2) {
        pixels[nextAt + 3] = Math.round(pixels[nextAt + 3] * ((distance - limit) / limit));
      }
    }
  }
  return cleared;
}
