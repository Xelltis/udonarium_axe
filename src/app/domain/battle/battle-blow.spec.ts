import { defaultBlowEffectIdentifier } from '@axe/domain/battle/battle-blow';
import { BattleFighter, BattleGauge } from '@axe/domain/battle/battle-scene';
import { autoEffectIdentifier } from '@axe/domain/effect/resource-effect-map';

function struck(...gauges: BattleGauge[]): BattleFighter {
  return { identifier: 'goblin', name: 'goblin', image: '', gauges, defeated: false };
}

describe('defaultBlowEffectIdentifier()', () => {
  it('strikes as hard as the blow landed', () => {
    const light = struck({ name: 'HP', before: 20, after: 19, max: 20, inverted: false });
    const heavy = struck({ name: 'HP', before: 20, after: 5, max: 20, inverted: false });

    expect(defaultBlowEffectIdentifier([light])).toBe(autoEffectIdentifier('damage', 'small'));
    expect(defaultBlowEffectIdentifier([heavy])).toBe(autoEffectIdentifier('damage', 'large'));
  });

  it('heals where everything moved the good way', () => {
    const mended = struck({ name: 'HP', before: 5, after: 9, max: 20, inverted: false });

    expect(defaultBlowEffectIdentifier([mended])).toBe(autoEffectIdentifier('heal', 'medium'));
  });

  it('strikes where anything got worse, a worsening resource rising among them', () => {
    const maddened = struck(
      { name: 'HP', before: 5, after: 9, max: 20, inverted: false },
      { name: '狂気', before: 1, after: 2, max: 10, inverted: true }
    );

    expect(defaultBlowEffectIdentifier([maddened])).toBe(autoEffectIdentifier('damage', 'medium'));
  });

  it('draws a blow that moved nothing as a middling strike', () => {
    expect(defaultBlowEffectIdentifier([struck()])).toBe(autoEffectIdentifier('damage', 'medium'));
  });
});
