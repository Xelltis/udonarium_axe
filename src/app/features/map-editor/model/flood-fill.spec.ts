import { GridType } from '@axe/domain/tabletop/game-table';
import { CellLayer, createLayer, createScene } from '@axe/features/map-editor/model/scene';
import { floodFill, setCell } from '@axe/features/map-editor/model/scene-ops';
import { fingerprint, seededRandom } from '@axe/testing/fingerprint';
import { describe, expect, it } from 'vitest';

const RED = { type: 'solid' as const, color: '#ff0000' };
const BLUE = { type: 'solid' as const, color: '#0000ff' };
const GREEN = { type: 'solid' as const, color: '#00ff00' };

const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat', type: GridType.HEX_VERTICAL },
  { name: 'pointy', type: GridType.HEX_HORIZONTAL },
];
const SCENE_SIZES: readonly (readonly [number, number])[] = [
  [6, 5],
  [1, 7],
  [7, 1],
];

describe('floodFill on scattered paint', () => {
  it('paints the same cells in the same order as before', () => {
    const found: Record<string, string> = {};
    for (const { name, type } of GRID_TYPES) {
      for (const [cols, rows] of SCENE_SIZES) {
        for (let seed = 1; seed <= 5; seed++) {
          const next = seededRandom(seed * 7919);
          const scene = createScene(cols, rows, 64, type);
          const layer = createLayer('cell', 'cells') as CellLayer;
          for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
              const roll = next();
              if (roll < 0.25) setCell(layer, col, row, RED);
              else if (roll < 0.4) setCell(layer, col, row, BLUE);
            }
          }
          floodFill(scene, layer, Math.floor(next() * cols), Math.floor(next() * rows), GREEN);
          found[`${name} ${cols}x${rows} #${seed}`] = fingerprint(JSON.stringify(Object.entries(layer.cells)));
        }
      }
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "flat 1x7 #1": "130:8475120c",
        "flat 1x7 #2": "259:3e90e5e1",
        "flat 1x7 #3": "130:c277726a",
        "flat 1x7 #4": "130:061a51c8",
        "flat 1x7 #5": "302:e0db540d",
        "flat 6x5 #1": "1248:3d5d642a",
        "flat 6x5 #2": "474:d9d8ce18",
        "flat 6x5 #3": "560:8a20344a",
        "flat 6x5 #4": "1291:590f9c86",
        "flat 6x5 #5": "990:5c7cd913",
        "flat 7x1 #1": "130:a7fb1874",
        "flat 7x1 #2": "259:fc53940b",
        "flat 7x1 #3": "216:0292a86f",
        "flat 7x1 #4": "130:7f97bf30",
        "flat 7x1 #5": "173:65871769",
        "pointy 1x7 #1": "130:8475120c",
        "pointy 1x7 #2": "259:3e90e5e1",
        "pointy 1x7 #3": "130:c277726a",
        "pointy 1x7 #4": "130:061a51c8",
        "pointy 1x7 #5": "302:e0db540d",
        "pointy 6x5 #1": "1291:445d5dec",
        "pointy 6x5 #2": "474:d9d8ce18",
        "pointy 6x5 #3": "560:8a20344a",
        "pointy 6x5 #4": "1291:da736f36",
        "pointy 6x5 #5": "1291:b4581a90",
        "pointy 7x1 #1": "130:a7fb1874",
        "pointy 7x1 #2": "259:fc53940b",
        "pointy 7x1 #3": "216:0292a86f",
        "pointy 7x1 #4": "130:7f97bf30",
        "pointy 7x1 #5": "173:65871769",
        "square 1x7 #1": "130:8475120c",
        "square 1x7 #2": "259:3e90e5e1",
        "square 1x7 #3": "130:c277726a",
        "square 1x7 #4": "130:061a51c8",
        "square 1x7 #5": "302:e0db540d",
        "square 6x5 #1": "1033:6de2007a",
        "square 6x5 #2": "474:dbfb3c98",
        "square 6x5 #3": "560:8a20344a",
        "square 6x5 #4": "1248:c17958f0",
        "square 6x5 #5": "947:fc4fede1",
        "square 7x1 #1": "130:a7fb1874",
        "square 7x1 #2": "259:fc53940b",
        "square 7x1 #3": "216:0292a86f",
        "square 7x1 #4": "130:7f97bf30",
        "square 7x1 #5": "173:65871769",
      }
    `);
  });
});

describe('floodFill over a fill that was written out more than once', () => {
  it('spreads over the cells whose fill matches without being the very same one', () => {
    const scene = createScene(3, 1, 64, GridType.SQUARE);
    const layer = createLayer('cell', 'cells') as CellLayer;
    // Painted one cell at a time, as a room that has been played in has them: the same red,
    // written out three times over.
    setCell(layer, 0, 0, { type: 'solid', color: '#ff0000' });
    setCell(layer, 1, 0, { type: 'solid', color: '#ff0000' });
    setCell(layer, 2, 0, { type: 'solid', color: '#ff0000' });

    floodFill(scene, layer, 0, 0, GREEN);

    expect(Object.values(layer.cells)).toEqual([GREEN, GREEN, GREEN]);
  });
});
