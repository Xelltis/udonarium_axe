import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';

describe('appendPieceDataElements', () => {
  function pieceWithCommon(): { identifier: string; commonDataElement: DataElement } {
    return { identifier: 'piece-1', commonDataElement: DataElement.create('common', '') };
  }

  it('adds the name and the sizes in the order given, each under the piece', () => {
    const piece = pieceWithCommon();
    appendPieceDataElements(piece, 'A wall', { width: 3, height: 2, depth: 4 });
    const children = piece.commonDataElement.children as DataElement[];
    expect(children.map((child) => [child.name, child.value, child.identifier])).toEqual([
      ['name', 'A wall', 'name_piece-1'],
      ['width', 3, 'width_piece-1'],
      ['height', 2, 'height_piece-1'],
      ['depth', 4, 'depth_piece-1'],
    ]);
  });

  it('adds no opacity unless one is given', () => {
    const piece = pieceWithCommon();
    appendPieceDataElements(piece, 'A lamp', {});
    expect(piece.commonDataElement.getFirstElementByName('opacity')).toBeNull();
  });

  it('adds the opacity as a resource that starts full', () => {
    const piece = pieceWithCommon();
    appendPieceDataElements(piece, 'A mask', { width: 1 }, 80);
    const opacity = piece.commonDataElement.getFirstElementByName('opacity')!;
    expect(opacity.type).toBe(DataElementType.NUMBER_RESOURCE);
    expect(opacity.value).toBe(80);
    expect(opacity.currentValue).toBe(80);
    expect(opacity.identifier).toBe('opacity_piece-1');
  });
});
