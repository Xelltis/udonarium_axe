import { GameCharacter } from '@axe/domain/character/game-character';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { fightsByCell } from '@axe/domain/tabletop/move/engagement';
import { fingerprint, seededRandom } from '@axe/testing/fingerprint';
import { afterEach, describe, expect, it } from 'vitest';

const GRID_SIZE = 50;
const GRID_TYPES = [
  { name: 'square', type: GridType.SQUARE },
  { name: 'flat', type: GridType.HEX_VERTICAL },
  { name: 'pointy', type: GridType.HEX_HORIZONTAL },
];
const SIZES = [1, 1, 1, 2, 3, 0.5];

const made: GameCharacter[] = [];

afterEach(() => {
  for (const piece of made.splice(0)) piece.destroy();
});

function scatteredPieces(seed: number, count: number): GameCharacter[] {
  const next = seededRandom(seed);
  const pieces: GameCharacter[] = [];
  for (let i = 0; i < count; i++) {
    const size = SIZES[Math.floor(next() * SIZES.length)];
    const piece = GameCharacter.create(`piece${i}`, size, '');
    piece.location = { name: 'table', x: Math.floor(next() * 400), y: Math.floor(next() * 400) };
    piece.isNpc = i > 0 && next() < 0.5;
    made.push(piece);
    pieces.push(piece);
  }
  return pieces;
}

function fightsFingerprint(grid: CellGrid, pieces: GameCharacter[], countsSize: boolean, cutsCorners: boolean): string {
  const fights = fightsByCell(grid, pieces[0], pieces, countsSize, cutsCorners);
  return fingerprint(JSON.stringify({ prices: Array.from(fights.prices), knots: fights.knots }));
}

describe('fightsByCell on scattered boards', () => {
  it('prices every cell the same as before', () => {
    const found: Record<string, string> = {};
    for (const { name, type } of GRID_TYPES) {
      const grid = cellGridOf(9, 9, GRID_SIZE, type);
      for (let seed = 1; seed <= 4; seed++) {
        const pieces = scatteredPieces(seed * 7919, 7);
        for (const countsSize of [false, true]) {
          for (const cutsCorners of [true, false]) {
            found[`${name} #${seed} size:${countsSize} corners:${cutsCorners}`] = fightsFingerprint(
              grid,
              pieces,
              countsSize,
              cutsCorners
            );
          }
        }
        for (const piece of made.splice(0)) piece.destroy();
      }
    }
    expect(found).toMatchInlineSnapshot(`
      {
        "flat #1 size:false corners:false": "568:4bf8b988",
        "flat #1 size:false corners:true": "568:4bf8b988",
        "flat #1 size:true corners:false": "568:4bf8b988",
        "flat #1 size:true corners:true": "568:4bf8b988",
        "flat #2 size:false corners:false": "572:9cc2cf09",
        "flat #2 size:false corners:true": "572:9cc2cf09",
        "flat #2 size:true corners:false": "572:f7bddbde",
        "flat #2 size:true corners:true": "572:f7bddbde",
        "flat #3 size:false corners:false": "592:963e8c60",
        "flat #3 size:false corners:true": "592:963e8c60",
        "flat #3 size:true corners:false": "592:963e8c60",
        "flat #3 size:true corners:true": "592:963e8c60",
        "flat #4 size:false corners:false": "596:e89fc038",
        "flat #4 size:false corners:true": "596:e89fc038",
        "flat #4 size:true corners:false": "596:b6a9b38f",
        "flat #4 size:true corners:true": "596:b6a9b38f",
        "pointy #1 size:false corners:false": "586:520e373f",
        "pointy #1 size:false corners:true": "586:520e373f",
        "pointy #1 size:true corners:false": "586:520e373f",
        "pointy #1 size:true corners:true": "586:520e373f",
        "pointy #2 size:false corners:false": "578:f15fa75f",
        "pointy #2 size:false corners:true": "578:f15fa75f",
        "pointy #2 size:true corners:false": "578:6c908361",
        "pointy #2 size:true corners:true": "578:6c908361",
        "pointy #3 size:false corners:false": "582:91840843",
        "pointy #3 size:false corners:true": "582:91840843",
        "pointy #3 size:true corners:false": "582:dc2bbb4b",
        "pointy #3 size:true corners:true": "582:dc2bbb4b",
        "pointy #4 size:false corners:false": "590:fae86e88",
        "pointy #4 size:false corners:true": "590:fae86e88",
        "pointy #4 size:true corners:false": "590:331cd4ad",
        "pointy #4 size:true corners:true": "590:331cd4ad",
        "square #1 size:false corners:false": "586:fccd82fb",
        "square #1 size:false corners:true": "584:f324bc1c",
        "square #1 size:true corners:false": "586:fccd82fb",
        "square #1 size:true corners:true": "584:f324bc1c",
        "square #2 size:false corners:false": "580:0ea236b3",
        "square #2 size:false corners:true": "564:a3dd1f7a",
        "square #2 size:true corners:false": "580:e24914a3",
        "square #2 size:true corners:true": "564:bea2ee1a",
        "square #3 size:false corners:false": "584:edf6f617",
        "square #3 size:false corners:true": "578:4e3f9701",
        "square #3 size:true corners:false": "584:427296f1",
        "square #3 size:true corners:true": "578:3b5fa093",
        "square #4 size:false corners:false": "592:7c0c1966",
        "square #4 size:false corners:true": "596:643a1e1a",
        "square #4 size:true corners:false": "592:d5cc3c80",
        "square #4 size:true corners:true": "596:0145d647",
      }
    `);
  });
});
