import { eraseConnectedColor } from '@axe/domain/media/erase-connected-color';

const WHITE = [255, 255, 255];
const RED = [200, 0, 0];

/** A picture from rows of colours, every pixel solid. */
function picture(rows: number[][][]): { pixels: Uint8ClampedArray; width: number; height: number } {
  const height = rows.length;
  const width = rows[0].length;
  const pixels = new Uint8ClampedArray(width * height * 4);
  rows.flat().forEach(([red, green, blue], index) => pixels.set([red, green, blue, 255], index * 4));
  return { pixels, width, height };
}

function alphas(pixels: Uint8ClampedArray, width: number): number[][] {
  const rows: number[][] = [];
  for (let at = 3; at < pixels.length; at += 4) {
    const index = (at - 3) / 4;
    if (index % width === 0) rows.push([]);
    rows[rows.length - 1].push(pixels[at]);
  }
  return rows;
}

describe('clearing a run of one colour', () => {
  it('clears the background joined to the point and keeps the figure and what it shuts in', () => {
    const W = WHITE;
    const R = RED;
    const { pixels, width, height } = picture([
      [W, W, W, W, W],
      [W, R, R, R, W],
      [W, R, W, R, W],
      [W, R, R, R, W],
      [W, W, W, W, W],
    ]);

    const cleared = eraseConnectedColor(pixels, width, height, 0, 0, 0);

    expect(cleared).toBe(16);
    expect(alphas(pixels, width)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 255, 255, 255, 0],
      [0, 255, 255, 255, 0],
      [0, 255, 255, 255, 0],
      [0, 0, 0, 0, 0],
    ]);
  });

  it('takes in colours within the tolerance, and no further', () => {
    const { pixels, width, height } = picture([[WHITE, [240, 240, 240], [200, 200, 200]]]);

    eraseConnectedColor(pixels, width, height, 0, 0, 20);

    expect(alphas(pixels, width)).toEqual([[0, 0, 255]]);
  });

  it('leaves a pixel just past the tolerance partly see-through, so no fringe is left', () => {
    const { pixels, width, height } = picture([[WHITE, [225, 225, 225], RED]]);

    eraseConnectedColor(pixels, width, height, 0, 0, 20);

    expect(alphas(pixels, width)).toEqual([[0, 128, 255]]);
  });

  it('does not spread through what is already clear', () => {
    const { pixels, width, height } = picture([[WHITE, WHITE, WHITE]]);
    pixels[7] = 0;

    expect(eraseConnectedColor(pixels, width, height, 0, 0, 0)).toBe(1);
    expect(alphas(pixels, width)).toEqual([[0, 0, 255]]);
  });

  it('clears nothing from outside the picture, or from a pixel already clear', () => {
    const { pixels, width, height } = picture([[WHITE, WHITE]]);

    expect(eraseConnectedColor(pixels, width, height, 2, 0, 0)).toBe(0);
    expect(eraseConnectedColor(pixels, width, height, -1, 0, 0)).toBe(0);
    pixels[3] = 0;
    expect(eraseConnectedColor(pixels, width, height, 0, 0, 0)).toBe(0);
    expect(alphas(pixels, width)).toEqual([[0, 255]]);
  });
});
