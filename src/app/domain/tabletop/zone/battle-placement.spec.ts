import {
  modifierFor,
  parseDistanceModifiers,
  parsePlacementDistances,
  parseSituationModifiers,
  pointAtBearing,
} from '@axe/domain/tabletop/zone/battle-placement';

describe('battle placement', () => {
  it('reads the distances a room writes, leaving out rows it cannot read', () => {
    expect(parsePlacementDistances('近い:10, 普通：20、遠い:x,:5,霧:0')).toEqual([
      { name: '近い', metres: 10 },
      { name: '普通', metres: 20 },
      { name: '霧', metres: 0 },
    ]);
  });

  it('reads the rows that name a situation rather than a distance, in the order written', () => {
    expect(parseSituationModifiers('10:近い, 足場が悪い:判定-2、走って:動く側-4,:空, 静か: ,20:遠い')).toEqual([
      { name: '足場が悪い', note: '判定-2' },
      { name: '走って', note: '動く側-4' },
    ]);
    expect(parseDistanceModifiers('10:近い, 足場が悪い:判定-2')).toEqual([{ upToM: 10, note: '近い' }]);
  });

  it('reads what distances do, nearest first, a note keeping colons of its own', () => {
    expect(parseDistanceModifiers('20:命中-2, 10:修正なし, 30:命中-4: 射撃のみ, x:bad, 5:')).toEqual([
      { upToM: 10, note: '修正なし' },
      { upToM: 20, note: '命中-2' },
      { upToM: 30, note: '命中-4: 射撃のみ' },
    ]);
  });

  it('takes the first row that reaches a distance, its edge included, and none past the last', () => {
    const rows = parseDistanceModifiers('10:近,20:中');

    expect(modifierFor(rows, 10)?.note).toBe('近');
    expect(modifierFor(rows, 10.5)?.note).toBe('中');
    expect(modifierFor(rows, 25)).toBeNull();
  });

  it('finds the point a distance off in a direction, turning clockwise from the right', () => {
    const east = pointAtBearing({ x: 100, y: 100 }, 0, 50);
    const south = pointAtBearing({ x: 100, y: 100 }, 90, 50);

    expect(east.x).toBeCloseTo(150);
    expect(east.y).toBeCloseTo(100);
    expect(south.x).toBeCloseTo(100);
    expect(south.y).toBeCloseTo(150);
  });
});
