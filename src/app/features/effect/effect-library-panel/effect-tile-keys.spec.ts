import {
  movesAlongColumn,
  movesBetweenTiles,
  rowAfterKey,
  tileAfterKey,
  TileBox,
} from '@axe/features/effect/effect-library-panel/effect-tile-keys';

/**
 * Three tiles across: a row of three, a row of two under it, and after a heading a row of three more.
 *
 *   0 1 2
 *   3 4
 *   5 6 7
 */
const BOXES: readonly TileBox[] = [
  { left: 0, top: 0 },
  { left: 110, top: 0 },
  { left: 220, top: 0 },
  { left: 0, top: 60 },
  { left: 110, top: 60 },
  { left: 0, top: 150 },
  { left: 110, top: 150 },
  { left: 220, top: 150 },
];

describe('tileAfterKey', () => {
  it('steps to the tile before and after, through the end of a row, and stops at the ends of the list', () => {
    expect(tileAfterKey(BOXES, 1, 'ArrowRight')).toBe(2);
    expect(tileAfterKey(BOXES, 2, 'ArrowRight')).toBe(3);
    expect(tileAfterKey(BOXES, 7, 'ArrowRight')).toBe(7);
    expect(tileAfterKey(BOXES, 3, 'ArrowLeft')).toBe(2);
    expect(tileAfterKey(BOXES, 0, 'ArrowLeft')).toBe(0);
  });

  it('goes down and up to the tile standing closest in the nearest row', () => {
    expect(tileAfterKey(BOXES, 1, 'ArrowDown')).toBe(4);
    expect(tileAfterKey(BOXES, 4, 'ArrowDown')).toBe(6);
    expect(tileAfterKey(BOXES, 6, 'ArrowUp')).toBe(4);
    expect(tileAfterKey(BOXES, 4, 'ArrowUp')).toBe(1);
  });

  it('goes to the closest tile of a shorter row, and stays where there is no row to go to', () => {
    expect(tileAfterKey(BOXES, 2, 'ArrowDown')).toBe(4);
    expect(tileAfterKey(BOXES, 7, 'ArrowUp')).toBe(4);
    expect(tileAfterKey(BOXES, 0, 'ArrowUp')).toBe(0);
    expect(tileAfterKey(BOXES, 6, 'ArrowDown')).toBe(6);
  });

  it('goes to the first tile and the last', () => {
    expect(tileAfterKey(BOXES, 4, 'Home')).toBe(0);
    expect(tileAfterKey(BOXES, 4, 'End')).toBe(7);
  });

  it('stays for any other key and for an index that is no tile', () => {
    expect(tileAfterKey(BOXES, 4, 'Enter')).toBe(4);
    expect(tileAfterKey(BOXES, -1, 'ArrowRight')).toBe(-1);
    expect(tileAfterKey([], 0, 'End')).toBe(0);
  });
});

describe('the rows of the list, two across', () => {
  /**
   * The list as it opens: two rows across, a family of three and after its heading a family of four.
   *
   *   0 1
   *   2
   *   3 4
   *   5 6
   */
  const ROWS: readonly TileBox[] = [
    { left: 0, top: 0 },
    { left: 200, top: 0 },
    { left: 0, top: 44 },
    { left: 0, top: 120 },
    { left: 200, top: 120 },
    { left: 0, top: 164 },
    { left: 200, top: 164 },
  ];

  it('reads across and then down: right and left step through the rows in the order they are read', () => {
    const walked = [0];
    while (walked.length < ROWS.length) walked.push(tileAfterKey(ROWS, walked[walked.length - 1], 'ArrowRight'));

    expect(walked).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(tileAfterKey(ROWS, 3, 'ArrowLeft')).toBe(2);
  });

  it('goes down and up a column, from one family into the next, and to the only row of a short line', () => {
    expect(tileAfterKey(ROWS, 0, 'ArrowDown')).toBe(2);
    expect(tileAfterKey(ROWS, 2, 'ArrowDown')).toBe(3);
    expect(tileAfterKey(ROWS, 1, 'ArrowDown')).toBe(2);
    expect(tileAfterKey(ROWS, 4, 'ArrowDown')).toBe(6);
    expect(tileAfterKey(ROWS, 4, 'ArrowUp')).toBe(2);
    expect(tileAfterKey(ROWS, 6, 'ArrowDown')).toBe(6);
  });

  it('goes to the first row and the last with Home and End', () => {
    expect(tileAfterKey(ROWS, 4, 'Home')).toBe(0);
    expect(tileAfterKey(ROWS, 1, 'End')).toBe(6);
  });
});

describe('rowAfterKey', () => {
  it('steps up and down a column and stops at its ends', () => {
    expect(rowAfterKey(17, 0, 'ArrowDown')).toBe(1);
    expect(rowAfterKey(17, 16, 'ArrowDown')).toBe(16);
    expect(rowAfterKey(17, 5, 'ArrowUp')).toBe(4);
    expect(rowAfterKey(17, 0, 'ArrowUp')).toBe(0);
  });

  it('reaches any of seventeen families from the first in sixteen steps or with End', () => {
    let at = 0;
    for (let step = 0; step < 16; step++) at = rowAfterKey(17, at, 'ArrowDown');

    expect(at).toBe(16);
    expect(rowAfterKey(17, 0, 'End')).toBe(16);
    expect(rowAfterKey(17, 16, 'Home')).toBe(0);
  });

  it('stays for any other key and for an index outside the column', () => {
    expect(rowAfterKey(17, 3, 'ArrowRight')).toBe(3);
    expect(rowAfterKey(17, -1, 'ArrowDown')).toBe(-1);
    expect(rowAfterKey(0, 0, 'End')).toBe(0);
  });
});

describe('movesAlongColumn', () => {
  it('is so for up, down, Home and End alone', () => {
    expect(['ArrowUp', 'ArrowDown', 'Home', 'End'].every(movesAlongColumn)).toBe(true);
    expect(['ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Tab'].some(movesAlongColumn)).toBe(false);
  });
});

describe('movesBetweenTiles', () => {
  it('is so for the arrows, Home and End alone', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].every(movesBetweenTiles)).toBe(true);
    expect([' ', 'Enter', 'Tab', 'a'].some(movesBetweenTiles)).toBe(false);
  });
});
