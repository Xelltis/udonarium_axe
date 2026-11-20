import { ROOM_SETTINGS, type RoomSettingSources } from '@axe/application/tabletop/room-settings';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { resolveRoomRules, ROOM_RULE_DEFAULTS, type RoomRules } from '@axe/domain/tabletop/room-rules';
import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';

describe('ROOM_SETTINGS', () => {
  /** What the settings are read from: the room's config, and a table that rules a reach of 3. */
  function sources(): RoomSettingSources {
    return {
      config: () => Config.instance,
      rules: (): RoomRules => resolveRoomRules(Config.instance.roomRuleAnswers, { zocRange: 3 }),
      zone: () => resolveZoneRules(Config.instance.zoneRuleAnswers),
    };
  }

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    Config.forget();
  });

  it('files every setting under the config field it keeps', () => {
    const misfiled = Object.entries(ROOM_SETTINGS).filter(([key, setting]) => setting.key !== key);

    expect(misfiled.map(([key]) => key)).toEqual([]);
  });

  it('reads every rule of play a table may answer as it is in force, as the room settings show it', () => {
    const rules = Object.keys(ROOM_RULE_DEFAULTS);
    const readRaw = Object.values(ROOM_SETTINGS).filter(
      (setting) => rules.includes(setting.key) && setting.source !== 'rule'
    );

    expect(readRaw.map((setting) => setting.key)).toEqual([]);
  });

  it('reads a rule still left to the table as the table has it, and writing it is the room answering', () => {
    const from = sources();

    expect(ROOM_SETTINGS.zocRange.read(from)).toBe(3);

    ROOM_SETTINGS.zocRange.write(from, 4.6);

    expect([Config.instance.zocRange, ROOM_SETTINGS.zocRange.read(from)]).toEqual([4, 4]);
  });

  it('reads a setting no table answers as the room keeps it', () => {
    const from = sources();

    ROOM_SETTINGS.moveStrict.write(from, true);

    expect([ROOM_SETTINGS.moveStrict.source, ROOM_SETTINGS.moveStrict.read(from)]).toEqual(['config', true]);
  });

  it('starts a table turned over to cells again at one cell a cell', () => {
    const from = sources();
    ROOM_SETTINGS.cellDistanceUnit.write(from, 'metre');
    ROOM_SETTINGS.cellDistance.write(from, 1.5);

    ROOM_SETTINGS.cellDistanceUnit.write(from, 'cell');

    expect([Config.instance.cellDistanceUnit, Config.instance.cellDistance]).toEqual(['cell', 1]);
  });
});
