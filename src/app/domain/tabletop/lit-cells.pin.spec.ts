import { GridType } from '@axe/domain/tabletop/game-table';
import { computeLitCells, LitCellShape } from '@axe/domain/tabletop/lit-cells';
import { fingerprint, seededRandom } from '@axe/testing/fingerprint';
import { describe, expect, it } from 'vitest';

const BOUNDS = { widthPx: 500, heightPx: 500 };
const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat', type: GridType.HEX_VERTICAL },
  { name: 'pointy', type: GridType.HEX_HORIZONTAL },
];

function scatteredShapes(seed: number): LitCellShape[] {
  const next = seededRandom(seed);
  const shapes: LitCellShape[] = [];
  for (let i = 0; i < 4; i++) {
    const x = next() * 700 - 100;
    const y = next() * 700 - 100;
    const shape: LitCellShape = {
      x,
      y,
      dimPx: 40 + next() * 200,
      angle: next() < 0.5 ? 360 : 30 + next() * 180,
      direction: next() * 360,
    };
    if (next() < 0.3) {
      shape.clipPolygon = [
        { x: x - 120, y: y - 40 },
        { x: x + 150, y: y - 60 },
        { x: x + 20, y: y + 160 },
      ];
    }
    shapes.push(shape);
  }
  return shapes;
}

describe('computeLitCells on scattered lights', () => {
  it('lights the same cells in the same order as before', () => {
    const found: Record<string, string> = {};
    for (const { name, type } of GRID_TYPES) {
      for (const gridSize of [50, 37]) {
        for (let seed = 1; seed <= 5; seed++) {
          const cells = computeLitCells(scatteredShapes(seed * 104729), gridSize, type, BOUNDS);
          found[`${name} @${gridSize} #${seed}`] = fingerprint(JSON.stringify(cells));
        }
      }
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "flat @37 #1": "33916:1c9b9959",
        "flat @37 #2": "6887:d964e2cc",
        "flat @37 #3": "3915:726cc56b",
        "flat @37 #4": "9157:e7248b27",
        "flat @37 #5": "13298:aab79ea8",
        "flat @50 #1": "17618:06677fe5",
        "flat @50 #2": "3752:72bc9231",
        "flat @50 #3": "2177:55ccf156",
        "flat @50 #4": "5319:00f407c6",
        "flat @50 #5": "7304:0489945c",
        "pointy @37 #1": "34182:6ad4fe04",
        "pointy @37 #2": "5892:e88db8a0",
        "pointy @37 #3": "3638:69723dff",
        "pointy @37 #4": "8944:e8b20243",
        "pointy @37 #5": "12244:bc9d1ea6",
        "pointy @50 #1": "17404:b33e5e10",
        "pointy @50 #2": "2751:43a1d097",
        "pointy @50 #3": "2147:dc5067ec",
        "pointy @50 #4": "4535:86c35dbe",
        "pointy @50 #5": "6543:ef317d42",
        "square @37 #1": "10913:ec262209",
        "square @37 #2": "2501:b9707d89",
        "square @37 #3": "869:b66e2d05",
        "square @37 #4": "3089:419629a3",
        "square @37 #5": "3993:ad2971bf",
        "square @50 #1": "5833:8d771133",
        "square @50 #2": "1179:760010d9",
        "square @50 #3": "401:edaefb39",
        "square @50 #4": "1545:e4c9e0af",
        "square @50 #5": "2035:151774f1",
      }
    `);
  });
});
