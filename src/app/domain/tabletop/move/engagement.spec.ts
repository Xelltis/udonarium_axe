import { GameCharacter } from '@axe/domain/character/game-character';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  breakOutCost,
  engagementOf,
  engagementsOn,
  engagementWeight,
  sidesOf,
} from '@axe/domain/tabletop/move/engagement';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;
const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);
const made: GameCharacter[] = [];

afterEach(() => {
  for (const piece of made.splice(0)) piece.destroy();
});

function pieceAt(col: number, row: number, npc: boolean, size = 1): GameCharacter {
  const piece = GameCharacter.create(npc ? '敵' : 'コマ', size, '');
  piece.location = { name: 'table', x: col * GRID, y: row * GRID };
  piece.isNpc = npc;
  made.push(piece);
  return piece;
}

describe('the engagements on a table', () => {
  it('holds two pieces of opposite sides standing side by side', () => {
    const hero = pieceAt(4, 4, false);
    const foe = pieceAt(5, 4, true);

    const engagements = engagementsOn(grid, [hero, foe]);

    expect(engagements.length).toBe(1);
    expect(engagements[0].members.map((piece) => piece.identifier).sort()).toEqual(
      [hero.identifier, foe.identifier].sort()
    );
  });

  it('holds two that touch only at a corner where corners are steps', () => {
    const pieces = [pieceAt(4, 4, false), pieceAt(5, 5, true)];

    expect(engagementsOn(grid, pieces).length).toBe(1);
    expect(engagementsOn(grid, pieces, false).length).toBe(0);
  });

  it('leaves pieces standing a cell apart out of one', () => {
    expect(engagementsOn(grid, [pieceAt(4, 4, false), pieceAt(6, 4, true)]).length).toBe(0);
  });

  it('is nobody a side alone, however close they stand', () => {
    expect(engagementsOn(grid, [pieceAt(4, 4, false), pieceAt(5, 4, false)]).length).toBe(0);
  });

  it('takes in an ally who touches a piece already in it, enemy or no enemy beside them', () => {
    const hero = pieceAt(4, 4, false);
    const foe = pieceAt(5, 4, true);
    const second = pieceAt(3, 4, false);

    const engagements = engagementsOn(grid, [hero, foe, second]);

    expect(engagements.length).toBe(1);
    expect(engagements[0].members.length).toBe(3);
  });

  it('runs two knots into one when a piece comes to stand between them', () => {
    const near = [pieceAt(3, 4, false), pieceAt(4, 4, true)];
    const far = [pieceAt(6, 4, true), pieceAt(7, 4, false)];

    expect(engagementsOn(grid, [...near, ...far]).length).toBe(2);

    const between = pieceAt(5, 4, false);
    const joined = engagementsOn(grid, [...near, ...far, between]);

    expect(joined.length).toBe(1);
    expect(joined[0].members.length).toBe(5);
  });

  it('reaches as far as a piece is wide', () => {
    const golem = pieceAt(4, 4, true, 3);
    const hero = pieceAt(7, 6, false);

    expect(engagementsOn(grid, [golem, hero]).length).toBe(1);
  });

  it('gives the ground its members stand on', () => {
    const engagements = engagementsOn(grid, [pieceAt(4, 4, false), pieceAt(5, 4, true)]);

    expect(engagements[0].cells.get(cellIndexOf(grid, 4, 4))).toBe(true);
    expect(engagements[0].cells.get(cellIndexOf(grid, 5, 4))).toBe(true);
    expect(engagements[0].cells.get(cellIndexOf(grid, 6, 4))).toBe(false);
  });

  it('leaves a piece that is not on the floor standing clear of every one', () => {
    const hero = pieceAt(4, 4, false);
    const foe = pieceAt(5, 4, true);
    foe.location = { name: 'graveyard', x: foe.location.x, y: foe.location.y };

    expect(engagementsOn(grid, [hero, foe]).length).toBe(0);
  });
});

describe('the engagement a piece is caught in', () => {
  it('is the one holding it', () => {
    const hero = pieceAt(4, 4, false);
    const engagements = engagementsOn(grid, [hero, pieceAt(5, 4, true)]);

    expect(engagementOf(engagements, hero)).toBe(engagements[0]);
  });

  it('is nothing for a piece standing clear', () => {
    const away = pieceAt(9, 9, false);
    const engagements = engagementsOn(grid, [pieceAt(4, 4, false), pieceAt(5, 4, true), away]);

    expect(engagementOf(engagements, away)).toBeNull();
  });
});

describe('what a body of pieces weighs', () => {
  it('counts the ground they take up', () => {
    expect(engagementWeight([pieceAt(4, 4, true, 3), pieceAt(8, 8, true)], true)).toBe(4);
  });

  it('counts a body apiece where the table says size is not to decide it', () => {
    expect(engagementWeight([pieceAt(4, 4, true, 3), pieceAt(8, 8, true)], false)).toBe(2);
  });

  it('weighs nothing at all for nobody', () => {
    expect(engagementWeight([], true)).toBe(0);
  });
});

describe('what it costs to walk out of an engagement', () => {
  function knotOf(...pieces: GameCharacter[]) {
    return engagementsOn(grid, pieces)[0];
  }

  it('tells the two sides apart as the piece leaving sees them', () => {
    const hero = pieceAt(4, 4, false);
    const ally = pieceAt(3, 4, false);
    const foe = pieceAt(5, 4, true);

    const sides = sidesOf(knotOf(hero, ally, foe), hero);

    expect(sides.own.length).toBe(2);
    expect(sides.against.map((piece) => piece.identifier)).toEqual([foe.identifier]);
  });

  it('costs a step to break away from an enemy standing one to one', () => {
    const hero = pieceAt(4, 4, false);

    expect(breakOutCost(knotOf(hero, pieceAt(5, 4, true)), hero, true)).toBe(1);
  });

  it('costs nothing where the side walking out outweighs the other', () => {
    const hero = pieceAt(4, 4, false);
    const knot = knotOf(hero, pieceAt(3, 4, false), pieceAt(5, 4, true));

    expect(breakOutCost(knot, hero, true)).toBe(0);
  });

  it('costs what that side is short by, counted from standing level', () => {
    const hero = pieceAt(4, 4, false);
    const knot = knotOf(hero, pieceAt(5, 4, true), pieceAt(3, 4, true), pieceAt(4, 5, true));

    expect(breakOutCost(knot, hero, true)).toBe(3);
  });

  it('weighs a piece by the ground it covers, unless the table says one apiece', () => {
    const hero = pieceAt(4, 7, false);
    const knot = knotOf(hero, pieceAt(4, 4, true, 3));

    expect(breakOutCost(knot, hero, true)).toBe(3);
    expect(breakOutCost(knot, hero, false)).toBe(1);
  });

  it('is the same reckoning taken from the other side of the knot', () => {
    const hero = pieceAt(4, 4, false);
    const foe = pieceAt(5, 4, true);
    const ally = pieceAt(3, 4, false);
    const knot = knotOf(hero, ally, foe);

    expect(breakOutCost(knot, hero, true)).toBe(0);
    expect(breakOutCost(knot, foe, true)).toBe(2);
  });
});
