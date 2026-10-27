import {
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
      background: 'image-1',
      defeatEffect: '両断',
    };
    const written = writeBattleSettings(chosen);

    expect(JSON.parse(written)).toEqual({ background: 'image-1', defeatEffect: '両断' });
    expect(readBattleSettings(written)).toEqual(chosen);
  });
});
