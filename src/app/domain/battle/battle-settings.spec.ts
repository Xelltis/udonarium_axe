import {
  BATTLE_PICTURE_LIMIT,
  BattleSettings,
  DEFAULT_BATTLE_SETTINGS,
  readBattleSettings,
  writeBattleSettings,
} from '@axe/domain/battle/battle-settings';

describe('readBattleSettings()', () => {
  it('reads a room that never touched the stage, or was written before it, as the defaults', () => {
    expect(readBattleSettings('')).toEqual(DEFAULT_BATTLE_SETTINGS);
  });

  it('reads anything unreadable or of the wrong kind as the default', () => {
    expect(readBattleSettings('{broken')).toEqual(DEFAULT_BATTLE_SETTINGS);
    expect(readBattleSettings('[1,2]')).toEqual(DEFAULT_BATTLE_SETTINGS);
    expect(readBattleSettings('{"defeat":"no","background":3,"defeatResource":"   "}')).toEqual(
      DEFAULT_BATTLE_SETTINGS
    );
  });

  it('reads a stage it does not draw as the castle by day', () => {
    expect(readBattleSettings('{"theme":"cyberpunk"}').theme).toBe('cyberpunk');
    expect(readBattleSettings('{"theme":"horror-day"}').theme).toBe('horror-day');
    expect(readBattleSettings('{"theme":"underwater"}').theme).toBe('fantasy-day');
    expect(readBattleSettings('{"theme":"fantasy-night"}').theme).toBe('fantasy-day');
    expect(readBattleSettings('{"theme":3}').theme).toBe('fantasy-day');
  });

  it('keeps each picture once, and drops what is not one', () => {
    expect(readBattleSettings('{"pictures":["a",3,"","b","a",null]}').pictures).toEqual(['a', 'b']);
    expect(readBattleSettings('{"pictures":"a"}').pictures).toEqual([]);
  });

  it('keeps the picture drawn among the pictures, even past the limit', () => {
    const many = Array.from({ length: BATTLE_PICTURE_LIMIT + 3 }, (_, index) => `picture-${index}`);

    expect(readBattleSettings('{"background":"lone"}').pictures).toEqual(['lone']);
    const read = readBattleSettings(JSON.stringify({ pictures: many, background: 'lone' }));
    expect(read.pictures).toHaveLength(BATTLE_PICTURE_LIMIT);
    expect(read.pictures.at(-1)).toBe('lone');
    expect(read.pictures[0]).toBe('picture-0');
  });

  it('reads what the room chose and keeps the rest at the defaults', () => {
    expect(readBattleSettings('{"defeat":false,"defeatResource":" 生命力 "}')).toEqual({
      ...DEFAULT_BATTLE_SETTINGS,
      defeat: false,
      defeatResource: '生命力',
    });
  });
});

describe('writeBattleSettings()', () => {
  it('writes nothing for the defaults', () => {
    expect(writeBattleSettings({ ...DEFAULT_BATTLE_SETTINGS })).toBe('');
  });

  it('writes only what differs, and reads back as it was written', () => {
    const chosen: BattleSettings = {
      ...DEFAULT_BATTLE_SETTINGS,
      theme: 'horror',
      background: 'image-1',
      pictures: ['image-2', 'image-1'],
      defeatEffect: '両断',
    };
    const written = writeBattleSettings(chosen);

    expect(JSON.parse(written)).toEqual({
      theme: 'horror',
      background: 'image-1',
      pictures: ['image-2', 'image-1'],
      defeatEffect: '両断',
    });
    expect(readBattleSettings(written)).toEqual(chosen);
  });
});
