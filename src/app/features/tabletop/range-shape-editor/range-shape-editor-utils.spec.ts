import {
  buildEditorBoardGeometry,
  buildRangeShapeThumbnail,
  EditorGridType,
} from '@axe/features/tabletop/range-shape-editor/range-shape-editor-utils';
import { fingerprint } from '@axe/testing/fingerprint';
import { describe, expect, it } from 'vitest';

const GRID_TYPES: readonly EditorGridType[] = ['square', 'hex-vertical', 'hex-horizontal'];

/** An L with a cell off its own corner, so a shape that is neither square nor symmetric is laid out. */
const PATTERN = '0,0;1,0;0,1;-1,1';

describe('the board the range shape editor lays its cells on', () => {
  it('lays out the same board as before', () => {
    const found: Record<string, string> = {};
    for (const gridType of GRID_TYPES) {
      for (const radius of [1, 2]) {
        for (const gridSize of [50, 37]) {
          found[`${gridType} r${radius} @${gridSize}`] = fingerprint(
            JSON.stringify(buildEditorBoardGeometry(gridType, radius, gridSize))
          );
        }
      }
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "hex-horizontal r1 @37": "1570:3a9145e7",
        "hex-horizontal r1 @50": "1598:18d408cc",
        "hex-horizontal r2 @37": "4316:4d13f42e",
        "hex-horizontal r2 @50": "4369:5a0950e5",
        "hex-vertical r1 @37": "1570:2f8fde0d",
        "hex-vertical r1 @50": "1598:8aa805e0",
        "hex-vertical r2 @37": "4316:8f4fb67c",
        "hex-vertical r2 @50": "4369:88e48d79",
        "square r1 @37": "458:57ec0ffa",
        "square r1 @50": "464:45cfe78c",
        "square r2 @37": "1214:8fa35082",
        "square r2 @50": "1224:a3209792",
      }
    `);
  });

  it('draws the same thumbnail as before', () => {
    const found: Record<string, string> = {};
    for (const gridType of GRID_TYPES) {
      found[gridType] = fingerprint(JSON.stringify(buildRangeShapeThumbnail(PATTERN, gridType)));
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "hex-horizontal": "473:d14de4d9",
        "hex-vertical": "479:a2d6a1e6",
        "square": "203:8d8e2fa6",
      }
    `);
  });
});
