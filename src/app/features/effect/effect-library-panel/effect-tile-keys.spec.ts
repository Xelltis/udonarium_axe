import { movesBetweenTiles, tileAfterKey, TileBox } from '@axe/features/effect/effect-library-panel/effect-tile-keys';

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

describe('movesBetweenTiles', () => {
  it('is so for the arrows, Home and End alone', () => {
    expect(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].every(movesBetweenTiles)).toBe(true);
    expect([' ', 'Enter', 'Tab', 'a'].some(movesBetweenTiles)).toBe(false);
  });
});
