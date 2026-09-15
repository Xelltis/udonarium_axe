import {
  hexSideStepsAt,
  hexStepsAt,
  ORTHOGONAL_STEPS,
  SQUARE_STEPS_WITH_CORNERS,
} from '@axe/domain/tabletop/cell-steps';
import { describe, expect, it } from 'vitest';

/** The neighbour across each edge as the hex mask's outer border has always looked it up. */
function maskBorderNeighbour(col: number, row: number, edge: number, isFlatTop: boolean): readonly [number, number] {
  if (isFlatTop) {
    const even = col % 2 === 0;
    const table = even
      ? [
          [1, 0],
          [0, 1],
          [-1, 0],
          [-1, -1],
          [0, -1],
          [1, -1],
        ]
      : [
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [0, -1],
          [1, 0],
        ];
    return table[edge] as [number, number];
  }
  const even = row % 2 === 0;
  const table = even
    ? [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
      ]
    : [
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 0],
        [0, -1],
      ];
  return table[edge] as [number, number];
}

describe('the steps out of a cell', () => {
  it('keeps the square steps in the order a move tries them', () => {
    expect(ORTHOGONAL_STEPS).toEqual([
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]);
    expect(SQUARE_STEPS_WITH_CORNERS).toEqual([
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ]);
  });

  it('keeps the flat-topped hex steps in the order a move tries them', () => {
    const even = [
      [0, -1],
      [1, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [-1, -1],
    ];
    const odd = [
      [0, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
    ];
    expect(hexStepsAt(true, 0, 5)).toEqual(even);
    expect(hexStepsAt(true, 1, 5)).toEqual(odd);
    expect(hexStepsAt(true, -1, 5)).toEqual(odd);
    expect(hexStepsAt(true, -2, 5)).toEqual(even);
  });

  it('keeps the pointy-topped hex steps in the order a move tries them', () => {
    const even = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    const odd = [
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    expect(hexStepsAt(false, 5, 0)).toEqual(even);
    expect(hexStepsAt(false, 5, 1)).toEqual(odd);
    expect(hexStepsAt(false, 5, -1)).toEqual(odd);
    expect(hexStepsAt(false, 5, -2)).toEqual(even);
  });

  it('names the cell across each side of a hex the way the mask border does', () => {
    for (const isFlatTop of [true, false]) {
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          const sides = hexSideStepsAt(isFlatTop, col, row);
          for (let edge = 0; edge < 6; edge++) {
            expect(sides[edge]).toEqual(maskBorderNeighbour(col, row, edge, isFlatTop));
          }
        }
      }
    }
  });
});
