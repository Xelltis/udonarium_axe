import {
  battleChangeLabel,
  BattleFighter,
  battleGaugeChanges,
  isBattleDefeat,
  normalizeBattleScene,
} from '@axe/domain/battle/battle-scene';

function fighter(identifier: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { identifier, name: identifier, image: '', gauges: [], defeated: false, ...extra };
}

describe('normalizeBattleScene()', () => {
  it('reads a scene as it was sent', () => {
    const scene = normalizeBattleScene({
      key: 'k1',
      attackerSide: 'right',
      attacker: fighter('hero', { gauges: [{ name: 'MP', before: 10, after: 7, max: 20, inverted: false }] }),
      defenders: [fighter('goblin', { defeated: true })],
      effect: 'EffectPreset_slash_1',
      defeatEffect: 'EffectPreset_defeat_dissolve',
      background: 'image-1',
      theme: 'cyberpunk',
      secret: true,
      seed: 42,
    });

    expect(scene).toEqual({
      key: 'k1',
      attackerSide: 'right',
      attacker: {
        identifier: 'hero',
        name: 'hero',
        image: '',
        gauges: [{ name: 'MP', before: 10, after: 7, max: 20, inverted: false }],
        defeated: false,
        facing: null,
      },
      defenders: [{ identifier: 'goblin', name: 'goblin', image: '', gauges: [], defeated: true, facing: null }],
      effect: 'EffectPreset_slash_1',
      defeatEffect: 'EffectPreset_defeat_dissolve',
      background: 'image-1',
      theme: 'cyberpunk',
      secret: true,
      seed: 42,
    });
  });

  it('plays nothing without somebody striking or somebody struck', () => {
    expect(normalizeBattleScene(null)).toBeNull();
    expect(normalizeBattleScene({ defenders: [fighter('goblin')] })).toBeNull();
    expect(normalizeBattleScene({ attacker: fighter('hero'), defenders: [] })).toBeNull();
    expect(normalizeBattleScene({ attacker: fighter(''), defenders: [fighter('goblin')] })).toBeNull();
  });

  it('stands as many struck as the stage holds and drops the rest', () => {
    const defenders = ['a', 'b', 'c', 'd', 'e'].map((identifier) => fighter(identifier));
    const scene = normalizeBattleScene({ attacker: fighter('hero'), defenders });

    expect(scene?.defenders.map((defender) => defender.identifier)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reads what an older or broken sender left out as the defaults', () => {
    const scene = normalizeBattleScene({
      attacker: fighter('hero', { gauges: [{ name: 'HP', before: 'x', after: null, max: Infinity }] }),
      defenders: [fighter('goblin'), 'nobody'],
      attackerSide: 'up',
    });

    expect(scene?.attackerSide).toBe('left');
    expect(scene?.theme).toBe('fantasy-day');
    expect(scene?.attacker.gauges).toEqual([{ name: 'HP', before: 0, after: 0, max: 0, inverted: false }]);
    expect(scene?.defenders).toHaveLength(1);
    expect(scene?.effect).toBe('');
    expect(scene?.secret).toBe(false);
    expect(scene?.seed).toBe(0);
  });
});

describe('battleGaugeChanges()', () => {
  it('names the resources that moved and which way hurts', () => {
    const struck: BattleFighter = {
      identifier: 'goblin',
      name: 'goblin',
      image: '',
      defeated: false,
      gauges: [
        { name: 'HP', before: 12, after: 4, max: 12, inverted: false },
        { name: 'MP', before: 5, after: 5, max: 5, inverted: false },
        { name: '狂気', before: 1, after: 3, max: 10, inverted: true },
        { name: '気力', before: 1, after: 3, max: 10, inverted: false },
      ],
    };

    expect(battleGaugeChanges(struck)).toEqual([
      { name: 'HP', delta: -8, hurt: true },
      { name: '狂気', delta: 2, hurt: true },
      { name: '気力', delta: 2, hurt: false },
    ]);
  });
});

describe('battleChangeLabel()', () => {
  it('writes a fall with its minus and a rise with a plus', () => {
    expect(battleChangeLabel(-8)).toBe('-8');
    expect(battleChangeLabel(3)).toBe('+3');
    expect(battleChangeLabel(1.5)).toBe('+1.5');
    expect(battleChangeLabel(-0.333333)).toBe('-0.33');
  });
});

describe('isBattleDefeat()', () => {
  it('brings down one that falls from above nothing to nothing or below', () => {
    expect(isBattleDefeat(5, 0, 20, false)).toBe(true);
    expect(isBattleDefeat(5, -3, 20, false)).toBe(true);
    expect(isBattleDefeat(5, 1, 20, false)).toBe(false);
  });

  it('leaves standing one that was at nothing already', () => {
    expect(isBattleDefeat(0, -2, 20, false)).toBe(false);
  });

  it('brings down one whose worsening resource reaches its maximum', () => {
    expect(isBattleDefeat(8, 10, 10, true)).toBe(true);
    expect(isBattleDefeat(10, 12, 10, true)).toBe(false);
    expect(isBattleDefeat(0, 3, 0, true)).toBe(false);
  });
});

describe('the way a fighter faces, carried in a scene', () => {
  const fighter = (facing?: unknown) => ({
    identifier: 'hero',
    name: '勇者',
    image: '',
    gauges: [],
    defeated: false,
    facing,
  });
  const scene = (facing?: unknown) =>
    normalizeBattleScene({ key: 'k', attackerSide: 'left', attacker: fighter(facing), defenders: [fighter()] });

  it('reads the way the picture faces', () => {
    expect(scene('left')?.attacker.facing).toBe('left');
    expect(scene('right')?.attacker.facing).toBe('right');
  });

  it('stands a fighter as drawn where an older version sends no way, or one it does not know', () => {
    expect(scene()?.attacker.facing).toBeNull();
    expect(scene('up')?.attacker.facing).toBeNull();
  });
});
