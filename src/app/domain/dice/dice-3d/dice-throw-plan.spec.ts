import {
  labelOf,
  MAX_DICE_PER_TRAY,
  MAX_THROWN_DICE,
  throwPlanOf,
  traysOf,
  wantsUnderline,
} from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { DiceRollDetail, DiceRollFace } from '@axe/domain/dice/dice-roll-detail';

function rolled(...faces: [number, number, string?][]): DiceRollDetail {
  return {
    system: 'DiceBot',
    outcome: '',
    faces: faces.map(([sides, value, kind]): DiceRollFace => ({ sides, value, kind: kind ?? 'normal' })),
  };
}

const shown = (detail: DiceRollDetail) =>
  throwPlanOf(detail).dice.map((die) => `${die.shape}:${die.labels}:${die.shows}`);

describe('throwPlanOf', () => {
  it('throws each common die as itself, landing on the number rolled', () => {
    expect(shown(rolled([4, 3], [6, 5], [8, 8], [12, 11], [20, 20]))).toEqual([
      'd4:standard:3',
      'd6:standard:5',
      'd8:standard:8',
      'd12:standard:11',
      'd20:standard:20',
    ]);
  });

  it('lands each die on a face that really says the number', () => {
    for (const die of throwPlanOf(rolled([4, 2], [6, 1], [8, 7], [10, 6], [12, 9], [20, 13])).dice) {
      expect(labelOf(die.shape, die.labels, die.target)).toBe(die.shows);
    }
  });

  it('reads a d10 that rolled 10 as its 0', () => {
    expect(shown(rolled([10, 10], [10, 4]))).toEqual(['d10:standard:0', 'd10:standard:4']);
  });

  it('throws a d100 as a tens die and a units die', () => {
    expect(shown(rolled([100, 47]))).toEqual(['d10:tens:40', 'd10:standard:7']);
    expect(shown(rolled([100, 5]))).toEqual(['d10:tens:00', 'd10:standard:5']);
    expect(shown(rolled([100, 30]))).toEqual(['d10:tens:30', 'd10:standard:0']);
  });

  it('shows 100 on a d100 as 00 and 0, as the dice read on a table', () => {
    expect(shown(rolled([100, 100]))).toEqual(['d10:tens:00', 'd10:standard:0']);
  });

  it('throws a system’s own tens and units as the two dice of a percentile', () => {
    expect(shown(rolled([10, 80, 'tens_d10'], [10, 3, 'd9']))).toEqual(['d10:tens:80', 'd10:standard:3']);
    expect(shown(rolled([10, 0, 'tens_d10'], [10, 0, 'd9']))).toEqual(['d10:tens:00', 'd10:standard:0']);
  });

  it('throws a d3 as a d6 numbered 1 to 3 twice', () => {
    const plan = throwPlanOf(rolled([3, 2]));
    expect(shown(rolled([3, 2]))).toEqual(['d6:d3:2']);
    expect(labelOf('d6', 'd3', plan.dice[0].target)).toBe('2');
  });

  it('leaves out a die no solid is made for, and throws nothing when none is left', () => {
    expect(shown(rolled([2, 1], [6, 4], [7, 5]))).toEqual(['d6:standard:4']);
    expect(throwPlanOf(rolled([2, 1])).dice).toEqual([]);
  });

  it('throws nothing for a line with no dice in it', () => {
    expect(throwPlanOf(null).dice).toEqual([]);
    expect(throwPlanOf({ system: 'DiceBot', outcome: 'success', faces: [] }).dice).toEqual([]);
  });

  it('throws no more than two hundred dice and counts the rest', () => {
    const plan = throwPlanOf(rolled(...Array.from({ length: 205 }, () => [6, 3] as [number, number])));
    expect(MAX_THROWN_DICE).toBe(200);
    expect(plan.dice).toHaveLength(200);
    expect(plan.overflow).toBe(5);
  });

  it('counts a d100 as the two dice it is thrown as', () => {
    const plan = throwPlanOf(rolled(...Array.from({ length: 101 }, () => [100, 55] as [number, number])));
    expect(plan.dice).toHaveLength(200);
    expect(plan.overflow).toBe(2);
  });

  describe('shared out over trays', () => {
    const dice = (count: number) =>
      throwPlanOf(rolled(...Array.from({ length: count }, (_, i) => [6, (i % 6) + 1] as [number, number]))).dice;

    it('throws a roll of no more than fifty dice on one tray', () => {
      expect(MAX_DICE_PER_TRAY).toBe(50);
      expect(traysOf(dice(1)).map((tray) => tray.length)).toEqual([1]);
      expect(traysOf(dice(50)).map((tray) => tray.length)).toEqual([50]);
    });

    it('shares a larger roll out as evenly as it goes, never more than fifty to a tray', () => {
      expect(traysOf(dice(51)).map((tray) => tray.length)).toEqual([26, 25]);
      expect(traysOf(dice(120)).map((tray) => tray.length)).toEqual([40, 40, 40]);
      expect(traysOf(dice(200)).map((tray) => tray.length)).toEqual([50, 50, 50, 50]);
    });

    it('keeps the dice in the order they were rolled', () => {
      const all = dice(120);
      expect(traysOf(all).flat()).toEqual(all);
    });

    it('throws nothing on no tray for a roll with no dice', () => {
      expect(traysOf([])).toEqual([]);
    });
  });
});

describe('labelOf', () => {
  it('writes the tens of a percentile as two digits', () => {
    const labels = Array.from({ length: 10 }, (_, face) => labelOf('d10', 'tens', face)).sort();
    expect(labels).toEqual(['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']);
  });

  it('writes a d3 on a d6 with each of 1 to 3 twice', () => {
    const labels = Array.from({ length: 6 }, (_, face) => labelOf('d6', 'd3', face)).sort();
    expect(labels).toEqual(['1', '1', '2', '2', '3', '3']);
  });
});

describe('wantsUnderline', () => {
  it('marks a 6 and a 9, which read the same upside down, and nothing else', () => {
    expect(wantsUnderline('6')).toBe(true);
    expect(wantsUnderline('9')).toBe(true);
    expect(wantsUnderline('16')).toBe(false);
    expect(wantsUnderline('60')).toBe(false);
    expect(wantsUnderline('1')).toBe(false);
  });
});
