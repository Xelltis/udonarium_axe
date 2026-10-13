import { cellsByKind, moveKindNamed, parseMoveKinds, PLAIN_MOVE_KIND } from '@axe/domain/tabletop/move/move-kind';

describe('move-kind', () => {
  describe('parseMoveKinds', () => {
    it('reads name:factor:cap rows, the cap left empty for none', () => {
      expect(parseMoveKinds('駆け足:3:, 歩き:1, そろり:1:3')).toEqual([
        { name: '駆け足', factor: 3, capM: null },
        { name: '歩き', factor: 1, capM: null },
        { name: 'そろり', factor: 1, capM: 3 },
      ]);
    });

    it('leaves out a row with no name, a factor of nothing, a cap it cannot read and a name given twice', () => {
      expect(parseMoveKinds(':2,速:0,遅:1:x,歩:1,歩:2')).toEqual([{ name: '歩', factor: 1, capM: null }]);
    });

    it('gives the plain kind alone where nothing can be read', () => {
      expect(parseMoveKinds('')).toEqual([PLAIN_MOVE_KIND]);
    });
  });

  it('finds a kind by name, or the first', () => {
    const kinds = parseMoveKinds('a:3,b:1');

    expect(moveKindNamed(kinds, 'b').factor).toBe(1);
    expect(moveKindNamed(kinds, 'none').name).toBe('a');
    expect(moveKindNamed([], null)).toEqual(PLAIN_MOVE_KIND);
  });

  describe('cellsByKind', () => {
    it('multiplies the movement and holds it to the cap, in whole cells', () => {
      expect(cellsByKind({ name: 'a', factor: 3, capM: null }, 10, 1)).toBe(30);
      expect(cellsByKind({ name: 'c', factor: 1, capM: 3 }, 10, 1)).toBe(3);
      expect(cellsByKind({ name: 'c', factor: 1, capM: 3 }, 2, 1)).toBe(2);
      expect(cellsByKind({ name: 'c', factor: 1, capM: 3 }, 10, 1.5)).toBe(2);
    });

    it('does not lose a cell to a fraction a binary number cannot hold', () => {
      expect(cellsByKind({ name: 'c', factor: 1, capM: 0.3 }, 10, 0.1)).toBe(3);
    });
  });
});
