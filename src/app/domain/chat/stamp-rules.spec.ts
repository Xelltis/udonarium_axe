import {
  OPEN_STAMP_RULES,
  readStampRules,
  stampAllowed,
  stampUseOn,
  withStampsAllowed,
  withStampUseOn,
  writeStampRules,
} from '@axe/domain/chat/stamp-rules';

describe('what a room lets its stamps be used for', () => {
  it('lets every stamp be used for everything in a room that set nothing, and writes that as nothing', () => {
    expect(readStampRules('')).toEqual(OPEN_STAMP_RULES);
    expect(stampAllowed(readStampRules(''), 'line', 'seal:ok')).toBe(true);
    expect(writeStampRules(OPEN_STAMP_RULES)).toBe('');
  });

  it('reads anything that is not rules as setting nothing, so the stamps stay usable', () => {
    for (const held of ['{', '[1,2]', '"text"', 'null', '{"line":"off","reaction":{"deny":"seal:ok"}}']) {
      expect(readStampRules(held), held).toEqual(OPEN_STAMP_RULES);
    }
  });

  it('turns a use off as a whole, keeping its denied stamps for when it comes back on', () => {
    const denied = withStampsAllowed(OPEN_STAMP_RULES, 'reaction', ['seal:ok'], false);
    const off = withStampUseOn(denied, 'reaction', false);

    expect(stampUseOn(off, 'reaction')).toBe(false);
    expect(stampAllowed(off, 'reaction', 'sfx:laugh')).toBe(false);
    expect(stampAllowed(off, 'line', 'sfx:laugh')).toBe(true);

    const back = readStampRules(writeStampRules(withStampUseOn(off, 'reaction', true)));
    expect(stampAllowed(back, 'reaction', 'sfx:laugh')).toBe(true);
    expect(stampAllowed(back, 'reaction', 'seal:ok')).toBe(false);
  });

  it('denies stamps to one use alone, and allows them back', () => {
    const denied = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['roll:critical', 'roll:fumble'], false);

    expect(stampAllowed(denied, 'line', 'roll:fumble')).toBe(false);
    expect(stampAllowed(denied, 'reaction', 'roll:fumble')).toBe(true);
    expect(withStampsAllowed(denied, 'line', ['roll:fumble'], true).line.denied).toEqual(['roll:critical']);
  });

  it('keeps a denied stamp this version does not know, for the version that does', () => {
    const held = '{"line":{"deny":["sfx:from-a-newer-version"]}}';

    expect(writeStampRules(withStampsAllowed(readStampRules(held), 'line', ['seal:ok'], false))).toBe(
      '{"line":{"deny":["sfx:from-a-newer-version","seal:ok"]}}'
    );
  });
});
