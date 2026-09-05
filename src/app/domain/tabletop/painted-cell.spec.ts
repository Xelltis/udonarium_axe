import { encodePaintedCell, isPaintedByEditor, NOT_PAINTED, parsePaintedCell } from '@axe/domain/tabletop/painted-cell';

describe('parsePaintedCell()', () => {
  it('reads the cell an object was painted onto', () => {
    expect(parsePaintedCell('3,7')).toEqual({ col: 3, row: 7 });
    expect(parsePaintedCell('0,0')).toEqual({ col: 0, row: 0 });
  });

  it('writes a cell back the way it reads it', () => {
    expect(parsePaintedCell(encodePaintedCell({ col: 12, row: 4 }))).toEqual({ col: 12, row: 4 });
  });

  it('reads an object nobody painted as nothing', () => {
    expect(parsePaintedCell(NOT_PAINTED)).toBeNull();
    expect(parsePaintedCell(undefined)).toBeNull();
    expect(parsePaintedCell(null)).toBeNull();
  });

  it('reads anything it cannot place as nothing rather than guessing', () => {
    expect(parsePaintedCell('3')).toBeNull();
    expect(parsePaintedCell(',7')).toBeNull();
    expect(parsePaintedCell('3,')).toBeNull();
    expect(parsePaintedCell('a,b')).toBeNull();
    expect(parsePaintedCell('1.5,2')).toBeNull();
    expect(parsePaintedCell('-1,2')).toBeNull();
    expect(parsePaintedCell('3,7,9')).toBeNull();
  });
});

describe('isPaintedByEditor()', () => {
  it('tells the editor what it may touch', () => {
    expect(isPaintedByEditor('2,5')).toBe(true);
  });

  it('leaves anything placed by hand alone', () => {
    expect(isPaintedByEditor(NOT_PAINTED)).toBe(false);
    expect(isPaintedByEditor('置いた')).toBe(false);
  });
});
