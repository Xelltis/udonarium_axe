import {
  isGroupAnswered,
  readRuleFlag,
  readRuleNumber,
  readRuleText,
  resolveRoomRules,
  ROOM_RULE_DEFAULTS,
  ROOM_RULE_GROUPS,
  RoomRules,
  writeRuleFlag,
  writeRuleNumber,
  writeRuleText,
} from '@axe/domain/tabletop/room-rules';

const table: RoomRules = {
  moveRangeEnabled: false,
  moveRangeElementNames: '駆け足',
  moveDiagonally: false,
  diagonalMove: 'none',
  piecesShareCells: false,
  pieceImageInCell: false,
  moveRangeAlways: true,
  zocAlways: true,
  cellDistance: 5,
  cellDistanceUnit: 'foot',
  zocMode: 'stop',
  zocRange: 2,
  zocExtraCost: 3,
  zocEngages: false,
  breakOutMode: 'weighed',
  breakOutCost: 1,
  engagementCountsSize: true,
  facingMark: 'arrow',
};

describe('readRuleFlag()', () => {
  it('reads the two answers a room can write', () => {
    expect(readRuleFlag('1')).toBe(true);
    expect(readRuleFlag('0')).toBe(false);
  });

  it('reads nothing written as no answer', () => {
    expect(readRuleFlag('')).toBeNull();
    expect(readRuleFlag(undefined)).toBeNull();
    expect(readRuleFlag(null)).toBeNull();
  });

  it('reads a flag a loaded room turned back into a boolean', () => {
    expect(readRuleFlag(true)).toBe(true);
    expect(readRuleFlag(false)).toBe(false);
  });

  it('writes an answer back the way it reads it', () => {
    expect(readRuleFlag(writeRuleFlag(true))).toBe(true);
    expect(readRuleFlag(writeRuleFlag(false))).toBe(false);
    expect(readRuleFlag(writeRuleFlag(null))).toBeNull();
  });

  it('never writes an empty string for an answer it has', () => {
    expect(writeRuleFlag(false)).not.toBe('');
  });
});

describe('readRuleNumber()', () => {
  it('reads a number the room wrote, zero included', () => {
    expect(readRuleNumber(0)).toBe(0);
    expect(readRuleNumber(4)).toBe(4);
  });

  it('reads anything below zero as no answer', () => {
    expect(readRuleNumber(-1)).toBeNull();
  });

  it('reads what is not a number as no answer', () => {
    expect(readRuleNumber('')).toBeNull();
    expect(readRuleNumber('nought')).toBeNull();
    expect(readRuleNumber(Number.NaN)).toBeNull();
  });

  it('writes an answer back the way it reads it', () => {
    expect(readRuleNumber(writeRuleNumber(0))).toBe(0);
    expect(readRuleNumber(writeRuleNumber(6))).toBe(6);
    expect(readRuleNumber(writeRuleNumber(null))).toBeNull();
  });
});

describe('readRuleText()', () => {
  it('reads a word the room wrote', () => {
    expect(readRuleText('metre')).toBe('metre');
  });

  it('reads nothing written as no answer', () => {
    expect(readRuleText('')).toBeNull();
    expect(readRuleText(undefined)).toBeNull();
  });

  it('writes an answer back the way it reads it', () => {
    expect(readRuleText(writeRuleText('cell'))).toBe('cell');
    expect(readRuleText(writeRuleText(null))).toBeNull();
  });
});

describe('resolveRoomRules()', () => {
  it('leaves a room that has answered nothing to the table it has out', () => {
    expect(resolveRoomRules(null, table)).toEqual(table);
    expect(resolveRoomRules({}, table)).toEqual(table);
  });

  it('takes over only the rule the room has answered', () => {
    const settled = resolveRoomRules({ zocMode: 'cost' }, table);

    expect(settled.zocMode).toBe('cost');
    expect(settled.zocRange).toBe(table.zocRange);
    expect(settled.moveRangeEnabled).toBe(table.moveRangeEnabled);
  });

  it('hears an answer of no as an answer', () => {
    const ruled: RoomRules = { ...table, moveDiagonally: true, zocRange: 4 };

    expect(resolveRoomRules({ moveDiagonally: false }, ruled).moveDiagonally).toBe(false);
    expect(resolveRoomRules({ zocRange: 0 }, ruled).zocRange).toBe(0);
  });

  it('falls back on the defaults with no table out', () => {
    expect(resolveRoomRules(null, null)).toEqual(ROOM_RULE_DEFAULTS);
  });

  it('answers for a table that is missing a rule of its own', () => {
    const settled = resolveRoomRules(null, { zocMode: 'block' });

    expect(settled.zocMode).toBe('block');
    expect(settled.cellDistance).toBe(ROOM_RULE_DEFAULTS.cellDistance);
  });

  it('reads a table that only ever said corners may be cut as counting one apiece', () => {
    const older = { moveDiagonally: true };

    expect(resolveRoomRules(null, older).diagonalMove).toBe('equal');
    expect(resolveRoomRules(null, { moveDiagonally: false }).diagonalMove).toBe('none');
  });

  it('lets the room say how a corner is counted over a table that only said whether', () => {
    const settled = resolveRoomRules({ diagonalMove: 'alternating' }, { ...table, moveDiagonally: true });

    expect(settled.diagonalMove).toBe('alternating');
  });

  it('holds a room to a way of counting the table knows', () => {
    expect(resolveRoomRules({ diagonalMove: 'sideways' }, table).diagonalMove).toBe(table.diagonalMove);
    expect(resolveRoomRules({ diagonalMove: 'sideways' }, { moveDiagonally: true }).diagonalMove).toBe('equal');
  });

  it('holds a room to a mode the table knows', () => {
    expect(resolveRoomRules({ zocMode: 'nonsense' as RoomRules['zocMode'] }, table).zocMode).toBe(
      ROOM_RULE_DEFAULTS.zocMode
    );
  });
});

describe('isGroupAnswered()', () => {
  it('says a room that has answered nothing owns no group', () => {
    expect(isGroupAnswered(null, 'moveRange')).toBe(false);
    expect(isGroupAnswered({}, 'zoc')).toBe(false);
  });

  it("says a group is the room's the moment one of its rules is answered", () => {
    expect(isGroupAnswered({ zocRange: 2 }, 'zoc')).toBe(true);
    expect(isGroupAnswered({ zocRange: 2 }, 'moveRange')).toBe(false);
  });

  it('hears an answer of no as an answer', () => {
    expect(isGroupAnswered({ moveDiagonally: false }, 'moveRange')).toBe(true);
  });

  it('puts every rule in exactly one group', () => {
    const grouped = Object.values(ROOM_RULE_GROUPS).flat();

    expect([...grouped].sort()).toEqual(Object.keys(ROOM_RULE_DEFAULTS).sort());
  });
});
