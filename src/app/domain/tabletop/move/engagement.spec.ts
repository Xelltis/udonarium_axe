import { GameCharacter } from '@axe/domain/character/game-character';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  asBreakOutMode,
  breakOutToll,
  engagementOf,
  engagementsOn,
  fightsByCell,
  leavesFight,
  NO_FIGHT,
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

describe('the fight on each cell, and what leaving it costs', () => {
  function fightsFor(mover: GameCharacter, others: GameCharacter[], countsSize = true) {
    const fights = fightsByCell(grid, mover, others, countsSize);
    const at = (col: number, row: number) => cellIndexOf(grid, col, row);
    return {
      priceAt: (col: number, row: number) => fights.prices[at(col, row)],
      leaves: (from: [number, number], to: [number, number]) => leavesFight(fights, at(...from), at(...to)),
    };
  }

  it('holds no fight on ground nobody is near', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(5, 5, true)]);

    expect(fights.priceAt(9, 9)).toBe(NO_FIGHT);
    expect(fights.priceAt(5, 4)).not.toBe(NO_FIGHT);
  });

  it('prices a step out of a fight against one enemy at one', () => {
    expect(fightsFor(pieceAt(0, 0, false), [pieceAt(5, 5, true)]).priceAt(4, 5)).toBe(1);
  });

  it('prices nothing where standing there would put the leaver in the heavier side', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(5, 5, true), pieceAt(6, 5, false)]);

    expect(fights.priceAt(4, 5)).toBe(0);
  });

  it('runs two fights together for a piece that would stand between them', () => {
    expect(fightsFor(pieceAt(0, 0, false), [pieceAt(3, 5, true), pieceAt(5, 5, true)]).priceAt(4, 5)).toBe(2);
  });

  it('weighs an enemy by the ground it covers, unless the table says one apiece', () => {
    const golem = pieceAt(5, 5, true, 3);

    expect(fightsFor(pieceAt(0, 0, false), [golem]).priceAt(4, 5)).toBe(3);
    expect(fightsFor(pieceAt(0, 0, false), [golem], false).priceAt(4, 5)).toBe(1);
  });

  it('weighs the piece leaving as it weighs the rest', () => {
    const hero = pieceAt(0, 0, false, 3);

    expect(fightsFor(hero, [pieceAt(5, 5, true)]).priceAt(4, 5)).toBe(0);
    expect(fightsFor(hero, [pieceAt(5, 5, true)], false).priceAt(4, 5)).toBe(1);
  });

  it('leaves the piece being moved out of the reckoning, wherever it is standing', () => {
    const hero = pieceAt(4, 5, false);

    expect(fightsFor(hero, [hero, pieceAt(5, 5, true)]).priceAt(4, 5)).toBe(1);
  });

  it('has a wide piece touch with all of itself, not with its middle cell alone', () => {
    const golem = pieceAt(0, 0, false, 3);
    const fights = fightsFor(golem, [pieceAt(5, 3, true)]);

    // Standing at (3,3) a golem three across covers (2,2) to (4,4), so it is beside (5,3).
    expect(fights.priceAt(3, 3)).not.toBe(NO_FIGHT);
  });

  it('leaves a piece one cell across reaching one cell, as it always did', () => {
    const hero = pieceAt(0, 0, false);
    const fights = fightsFor(hero, [pieceAt(5, 3, true)]);

    expect(fights.priceAt(3, 3)).toBe(NO_FIGHT);
    expect(fights.priceAt(4, 3)).not.toBe(NO_FIGHT);
  });

  it('calls a step out of the fight one, and a step within it none', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(5, 5, true)]);

    expect(fights.leaves([4, 5], [3, 5])).toBe(true);
    expect(fights.leaves([4, 5], [4, 4])).toBe(false);
    expect(fights.leaves([3, 5], [2, 5])).toBe(false);
  });

  it('calls a step from one fight straight into another a leaving all the same', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(3, 5, true), pieceAt(6, 5, true)]);

    // Two enemies three cells apart: neither cell between them touches both.
    expect(fights.priceAt(4, 5)).toBe(1);
    expect(fights.priceAt(5, 5)).toBe(1);
    expect(fights.leaves([4, 5], [5, 5])).toBe(true);
  });

  it('holds a piece still in the fight where it steps away from only part of one', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(3, 5, true), pieceAt(5, 5, true)]);

    expect(fights.leaves([4, 5], [4, 4])).toBe(false);
    expect(fights.priceAt(4, 4)).toBe(2);
  });

  it('walks out of a fight it stood in alongside an enemy it no longer touches', () => {
    const fights = fightsFor(pieceAt(0, 0, false), [pieceAt(3, 5, true)]);

    expect(fights.leaves([4, 4], [5, 4])).toBe(true);
  });
});

describe('what a table does to a piece walking out of a fight', () => {
  it('takes the weighing where it is the weighing that decides', () => {
    expect(breakOutToll('weighed', 3, 9)).toBe(3);
    expect(breakOutToll('weighed', 0, 9)).toBe(0);
  });

  it('charges the same for every leaving where the table says a number', () => {
    expect(breakOutToll('cost', 3, 2)).toBe(2);
    expect(breakOutToll('cost', 0, 2)).toBe(2);
  });

  it('prices a leaving beyond any reach where the table allows none', () => {
    expect(breakOutToll('block', 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('charges nothing where a fight holds nobody', () => {
    expect(breakOutToll('free', 3, 2)).toBe(0);
  });

  it('reads a mode it does not know as the weighing', () => {
    expect(asBreakOutMode('sideways')).toBe('weighed');
    expect(asBreakOutMode('block')).toBe('block');
  });
});
