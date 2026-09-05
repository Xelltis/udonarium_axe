import { encodeCellKey, parseCellKey } from '@axe/domain/tabletop/cell-key';

describe('parseCellKey()', () => {
  it('reads the cell a key names', () => {
    expect(parseCellKey('3,7')).toEqual({ col: 3, row: 7 });
    expect(parseCellKey('0,0')).toEqual({ col: 0, row: 0 });
  });

  it('writes a cell back the way it reads it', () => {
    expect(parseCellKey(encodeCellKey({ col: 12, row: 4 }))).toEqual({ col: 12, row: 4 });
  });

  it('reads an empty key as nothing', () => {
    expect(parseCellKey('')).toBeNull();
    expect(parseCellKey(undefined)).toBeNull();
    expect(parseCellKey(null)).toBeNull();
  });

  it('reads anything it cannot place as nothing rather than guessing', () => {
    expect(parseCellKey('3')).toBeNull();
    expect(parseCellKey(',7')).toBeNull();
    expect(parseCellKey('3,')).toBeNull();
    expect(parseCellKey('a,b')).toBeNull();
    expect(parseCellKey('1.5,2')).toBeNull();
    expect(parseCellKey('-1,2')).toBeNull();
    expect(parseCellKey('3,7,9')).toBeNull();
  });
});
