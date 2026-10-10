/**
 * Clears runs of joined colour from pictures of one size, keeping the room it works in from one run
 * to the next, so a picture cleared again and again, as a slider moves, does not ask for it anew.
 */
export class ConnectedColorEraser {
  private readonly marks: Uint32Array;
  private readonly queue: Int32Array;
  private round = 0;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.marks = new Uint32Array(width * height);
    this.queue = new Int32Array(width * height);
  }

  /**
   * Makes clear the run of pixels joined to the one at (x, y) whose colour lies within `tolerance`
   * of that pixel's, as a plain background is taken out from around a figure, and returns how many
   * pixels it cleared.
   *
   * `pixels` is RGBA, four bytes a pixel row by row, as a canvas hands it over, and is changed where
   * it lies. The run spreads to the neighbours above, below and either side, so the same colour shut
   * inside the figure is left alone. It stops at a pixel already clear, and at one further from the
   * colour; one not much further, within twice the tolerance, is left partly see-through, so the
   * edge of the figure does not keep a fringe of the old background. A point outside the picture, or
   * on a pixel already clear, clears nothing.
   */
  erase(pixels: Uint8ClampedArray, x: number, y: number, tolerance: number): number {
    const { width, height, marks, queue } = this;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) return 0;
    const start = (y * width + x) * 4;
    if (pixels[start + 3] === 0) return 0;

    if (this.round === 0xffffffff) {
      marks.fill(0);
      this.round = 0;
    }
    const round = ++this.round;
    const red = pixels[start];
    const green = pixels[start + 1];
    const blue = pixels[start + 2];
    const limit = Math.max(0, tolerance);
    let head = 0;
    let tail = 0;
    let cleared = 0;

    const reach = (next: number): void => {
      if (marks[next] === round) return;
      marks[next] = round;
      const at = next * 4;
      if (pixels[at + 3] === 0) return;
      const distance = Math.max(
        Math.abs(pixels[at] - red),
        Math.abs(pixels[at + 1] - green),
        Math.abs(pixels[at + 2] - blue)
      );
      if (distance <= limit) {
        queue[tail++] = next;
      } else if (limit > 0 && distance < limit * 2) {
        pixels[at + 3] = Math.round(pixels[at + 3] * ((distance - limit) / limit));
      }
    };

    const first = y * width + x;
    marks[first] = round;
    queue[tail++] = first;
    const lastRow = width * (height - 1);
    while (head < tail) {
      const index = queue[head++];
      pixels[index * 4 + 3] = 0;
      cleared++;
      const column = index % width;
      if (column > 0) reach(index - 1);
      if (column < width - 1) reach(index + 1);
      if (index >= width) reach(index - width);
      if (index < lastRow) reach(index + width);
    }
    return cleared;
  }
}

/**
 * Makes clear the run of pixels joined to the one at (x, y) whose colour lies within `tolerance` of
 * that pixel's, and returns how many pixels it cleared.
 *
 * @see ConnectedColorEraser.erase
 */
export function eraseConnectedColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  tolerance: number
): number {
  return new ConnectedColorEraser(width, height).erase(pixels, x, y, tolerance);
}
