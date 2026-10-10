import {
  decodeStatusAilment,
  encodeStatusAilment,
  findStatusAilment,
  formatStatusAilments,
  impliedBuffTiming,
  newStatusAilment,
  parseStatusAilments,
  StatusAilment,
  withRounds,
} from '@axe/domain/character/status-ailment';

function ailment(overrides: Partial<StatusAilment> = {}): StatusAilment {
  return { ...newStatusAilment('毒'), ...overrides };
}

describe('encodeStatusAilment()', () => {
  it('writes a plain state as its name alone', () => {
    expect(encodeStatusAilment(ailment())).toBe('毒');
  });

  it('writes down only what was asked for', () => {
    expect(encodeStatusAilment(ailment({ color: 'green', icon: '☠' }))).toBe('毒 color:green icon:☠');
  });

  it('says nothing about a moment that follows from the rounds', () => {
    expect(encodeStatusAilment(ailment({ rounds: 3, timing: 'roundEnd' }))).toBe('毒 rounds:3');
    expect(encodeStatusAilment(ailment({ rounds: 0, timing: 'none' }))).toBe('毒');
  });

  it('says so about one that does not', () => {
    expect(encodeStatusAilment(ailment({ rounds: 3, timing: 'turnStart' }))).toBe('毒 rounds:3 timing:turnStart');
  });

  it('leaves the effect last, since it is the one that may hold spaces', () => {
    expect(encodeStatusAilment(ailment({ effect: '毎ラウンド HP-1', icon: '☠' }))).toBe(
      '毒 icon:☠ effect:毎ラウンド HP-1'
    );
  });

  it('writes nothing for a state with no name', () => {
    expect(encodeStatusAilment(ailment({ name: '  ' }))).toBe('');
  });
});

describe('decodeStatusAilment()', () => {
  it('reads back what was written', () => {
    const written = ailment({ color: 'red', icon: '☠', rounds: 3, timing: 'turnEnd', effect: '攻-1 命中-1' });

    expect(decodeStatusAilment(encodeStatusAilment(written))).toEqual(written);
  });

  it('takes a name alone as a state held until it is cleared', () => {
    expect(decodeStatusAilment('麻痺')).toEqual(newStatusAilment('麻痺'));
  });

  it('takes rounds alone as a state that runs out with them', () => {
    expect(decodeStatusAilment('加護 rounds:2')).toMatchObject({ rounds: 2, timing: 'roundEnd' });
  });

  it('reads the tokens in whatever order they were put', () => {
    expect(decodeStatusAilment('毒 rounds:2 color:green')).toMatchObject({ rounds: 2, color: 'green' });
  });

  it('passes over a token it has never heard of', () => {
    const read = decodeStatusAilment('毒 sparkle:on color:green');

    expect(read).toMatchObject({ name: '毒', color: 'green' });
  });

  it('passes over a moment and a count it cannot make sense of', () => {
    expect(decodeStatusAilment('毒 timing:いつか rounds:-3')).toMatchObject({ rounds: 0, timing: 'none' });
  });

  it('says nothing for a line with no name', () => {
    expect(decodeStatusAilment('')).toBeNull();
    expect(decodeStatusAilment('   ')).toBeNull();
    expect(decodeStatusAilment('color:red')).toBeNull();
  });
});

describe('parseStatusAilments()', () => {
  it('reads one to a line and skips the blank ones', () => {
    const list = parseStatusAilments('毒 rounds:3\n\n麻痺\n');

    expect(list.map((entry) => entry.name)).toEqual(['毒', '麻痺']);
  });

  it('keeps the first of a name, since two would be two of a column', () => {
    const list = parseStatusAilments('毒 color:green\n毒 color:red');

    expect(list).toHaveLength(1);
    expect(list[0].color).toBe('green');
  });

  it('comes back from what it wrote', () => {
    const list = [ailment({ rounds: 3 }), ailment({ name: '麻痺', icon: '⚡' })];

    expect(parseStatusAilments(formatStatusAilments(list))).toEqual(list);
  });

  it('reads nothing out of nothing', () => {
    expect(parseStatusAilments('')).toEqual([]);
  });
});

describe('impliedBuffTiming()', () => {
  it('holds a state with no rounds until it is cleared', () => {
    expect(impliedBuffTiming(0)).toBe('none');
    expect(impliedBuffTiming(3)).toBe('roundEnd');
  });
});

describe('withRounds()', () => {
  it('starts counting a held state down once it is given rounds', () => {
    expect(withRounds(ailment(), 3)).toMatchObject({ rounds: 3, timing: 'roundEnd' });
  });

  it('holds one whose rounds are taken away', () => {
    expect(withRounds(ailment({ rounds: 3, timing: 'roundEnd' }), 0)).toMatchObject({ rounds: 0, timing: 'none' });
  });

  it('leaves a moment somebody picked where they put it', () => {
    expect(withRounds(ailment({ rounds: 3, timing: 'turnStart' }), 5)).toMatchObject({
      rounds: 5,
      timing: 'turnStart',
    });
  });

  it('takes nothing below none', () => {
    expect(withRounds(ailment(), -2).rounds).toBe(0);
    expect(withRounds(ailment(), Number.NaN).rounds).toBe(0);
  });
});

describe('findStatusAilment()', () => {
  it('finds one by the name a column would ask for', () => {
    const list = parseStatusAilments('毒\n麻痺');

    expect(findStatusAilment(list, '麻痺')?.name).toBe('麻痺');
    expect(findStatusAilment(list, 'HP')).toBeNull();
  });
});

describe('a state that moves what the sheet says', () => {
  it('writes the status it moves, how and how far', () => {
    const line = encodeStatusAilment({ ...newStatusAilment('拘束'), stat: '移動', op: '=', amount: '0' });

    expect(line).toContain('stat:移動');
    expect(line).toContain('op:=');
    expect(line).toContain('amount:0');
  });

  it('writes nothing of it for a state that moves nothing', () => {
    expect(encodeStatusAilment(newStatusAilment('毒'))).toBe('毒');
  });

  it('reads back exactly what it wrote', () => {
    const held = { ...newStatusAilment('拘束'), stat: '移動', op: '=', amount: '0' };

    expect(decodeStatusAilment(encodeStatusAilment(held))).toMatchObject({ stat: '移動', op: '=', amount: '0' });
  });

  it('keeps the effect readable beside it, spaces and all', () => {
    const held = { ...newStatusAilment('拘束'), stat: '移動', op: '=', amount: '0', effect: '動けない うえ 不利' };

    const read = decodeStatusAilment(encodeStatusAilment(held))!;

    expect(read.effect).toBe('動けない うえ 不利');
    expect(read.stat).toBe('移動');
  });

  it('takes only the first word of a status, since the fields are told apart by spaces', () => {
    const held = { ...newStatusAilment('拘束'), stat: '移動 力', op: '=', amount: '0' };

    expect(decodeStatusAilment(encodeStatusAilment(held))!.stat).toBe('移動');
  });

  it('reads a state written before any of this as moving nothing', () => {
    expect(decodeStatusAilment('毒 color:green rounds:3')).toMatchObject({ stat: '', op: '', amount: '' });
  });
});
