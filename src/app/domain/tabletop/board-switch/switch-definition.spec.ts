import {
  clampSwitchDelay,
  defaultSwitchDefinition,
  encodeSwitchDefinition,
  MAX_SWITCH_ACTIONS,
  MAX_SWITCH_DELAY_MS,
  newSwitchAction,
  parseSwitchDefinition,
  switchDoesAnything,
} from '@axe/domain/tabletop/board-switch/switch-definition';

describe('switch definitions', () => {
  it('reads nothing, or anything unreadable, as a switch that speaks for its presser and does nothing', () => {
    for (const stored of [undefined, null, '', '   ', '{', '[]', '"text"', '42']) {
      expect(parseSwitchDefinition(stored as string)).toEqual(defaultSwitchDefinition());
    }
  });

  it('brings back what it wrote', () => {
    const written = {
      ...defaultSwitchDefinition(),
      label: '宝箱を開ける',
      speaker: 'host' as const,
      tab: 'tab-1',
      gameType: 'Cthulhu7th',
      guests: true,
      range: 3,
      needsSight: true,
      repeat: 'oncePerPiece' as const,
      actions: [
        { ...newSwitchAction('say'), text: '1d100<={目星}' },
        { ...newSwitchAction('secret'), text: '床板の下に鍵', to: 'master' as const },
        { kind: 'sound' as const, name: 'chest.mp3', delayMs: 500, extra: {} },
        { kind: 'effect' as const, name: 'sparkle', delayMs: 0, extra: {} },
        { kind: 'cutIn' as const, name: 'found', delayMs: 1200, extra: {} },
        { kind: 'reveal' as const, target: { identifier: 'door-1', name: '隠し扉' }, delayMs: 0, extra: {} },
        { kind: 'conceal' as const, target: { identifier: 'wall-1', name: '壁' }, delayMs: 0, extra: {} },
        { kind: 'removeSelf' as const, delayMs: 0, extra: {} },
        { kind: 'showTable' as const, table: { identifier: 'cellar', name: '地下室' }, delayMs: 0, extra: {} },
        { kind: 'carry' as const, col: 3, row: 4, table: { identifier: '', name: '' }, delayMs: 0, extra: {} },
        {
          kind: 'tableSetting' as const,
          darkness: 'on' as const,
          fog: 'keep' as const,
          image: { identifier: 'img', name: 'map.png' },
          bgm: { identifier: '', name: '' },
          bgmStop: true,
          delayMs: 0,
          extra: {},
        },
        {
          kind: 'spawn' as const,
          target: { identifier: 'goblin-1', name: 'ゴブリン' },
          count: 3,
          place: 'presser' as const,
          delayMs: 0,
          extra: {},
        },
      ],
    };

    expect(parseSwitchDefinition(encodeSwitchDefinition(written))).toEqual(written);
  });

  it('reads a reach, a sight rule and a count that make no sense as none', () => {
    const read = parseSwitchDefinition(JSON.stringify({ range: -3, needsSight: 'no', repeat: 'twice' }));

    expect(read.range).toBe(0);
    expect(read.needsSight).toBe(true);
    expect(read.repeat).toBe('always');
    expect(parseSwitchDefinition(JSON.stringify({ range: 500 })).range).toBe(99);
    expect(parseSwitchDefinition(JSON.stringify({ needsSight: 'false' })).needsSight).toBe(false);
  });

  it('calls up at least one copy and no more than the most', () => {
    const count = (value: unknown) =>
      parseSwitchDefinition(JSON.stringify({ actions: [{ kind: 'spawn', count: value }] })).actions[0];

    expect(count(0)).toMatchObject({ count: 1, place: 'host' });
    expect(count(99)).toMatchObject({ count: 10 });
  });

  it('reads a speaker it has never heard of as the presser', () => {
    expect(parseSwitchDefinition('{"speaker":"narrator"}').speaker).toBe('presser');
  });

  it('reads the written forms of no as no, for a watcher flag handed back as text', () => {
    for (const no of ['', '0', 'false', 'FALSE', 0, false, null]) {
      expect(parseSwitchDefinition(JSON.stringify({ guests: no })).guests).toBe(false);
    }
    for (const yes of ['1', 'true', 1, true]) {
      expect(parseSwitchDefinition(JSON.stringify({ guests: yes })).guests).toBe(true);
    }
  });

  it('keeps what a newer version wrote, on the switch and on its actions, when it writes the switch back', () => {
    const newer = JSON.stringify({
      v: 2,
      label: 'lever',
      range: 2,
      actions: [
        { kind: 'say', text: 'creak', delayMs: 0, to: 'presser' },
        { kind: 'weather', sky: { name: 'storm' }, strength: 3, delayMs: 200 },
      ],
    });

    const read = parseSwitchDefinition(newer);
    const again = JSON.parse(encodeSwitchDefinition(read));

    expect(read.actions.map((action) => action.kind)).toEqual(['say', 'unknown']);
    expect(again.range).toBe(2);
    expect(again.actions[0].to).toBe('presser');
    expect(again.actions[1]).toEqual({ kind: 'weather', sky: { name: 'storm' }, strength: 3, delayMs: 200 });
  });

  it('drops an action with no kind at all rather than taking the rest with it', () => {
    const read = parseSwitchDefinition(
      JSON.stringify({ actions: [42, { text: 'no kind' }, { kind: 'say', text: 'kept' }] })
    );

    expect(read.actions).toHaveLength(1);
    expect(read.actions[0]).toMatchObject({ kind: 'say', text: 'kept' });
  });

  it('keeps waits between none and the longest, and the list of actions to its limit', () => {
    expect(clampSwitchDelay(-5)).toBe(0);
    expect(clampSwitchDelay('')).toBe(0);
    expect(clampSwitchDelay('abc')).toBe(0);
    expect(clampSwitchDelay(1234.4)).toBe(1234);
    expect(clampSwitchDelay(60_000)).toBe(MAX_SWITCH_DELAY_MS);

    const many = Array.from({ length: MAX_SWITCH_ACTIONS + 5 }, () => ({ kind: 'say', text: 'x' }));
    expect(parseSwitchDefinition(JSON.stringify({ actions: many })).actions).toHaveLength(MAX_SWITCH_ACTIONS);
  });

  it('says a switch does something only when something in it would be said or played', () => {
    const blank = defaultSwitchDefinition();
    expect(switchDoesAnything(blank)).toBe(false);
    expect(switchDoesAnything({ ...blank, actions: [newSwitchAction('say'), newSwitchAction('sound')] })).toBe(false);
    expect(
      switchDoesAnything({ ...blank, actions: [{ kind: 'unknown', raw: { kind: 'weather' }, delayMs: 0, extra: {} }] })
    ).toBe(false);
    expect(switchDoesAnything({ ...blank, actions: [{ ...newSwitchAction('say'), text: 'hello' }] })).toBe(true);
    expect(switchDoesAnything({ ...blank, actions: [{ kind: 'sound', name: 'bell', delayMs: 0, extra: {} }] })).toBe(
      true
    );
  });
});
