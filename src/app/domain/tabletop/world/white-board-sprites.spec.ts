import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';
import { whiteBoardSprites } from '@axe/domain/tabletop/world/white-board-sprites';

function frameOf(pitch: number) {
  const board = { width: 4, height: 2, pitch, rotate: 0, posZ: 0, location: { x: 100, y: 200 } };
  return whiteBoardFrame(
    board as Pick<WhiteBoard, 'width' | 'height' | 'pitch' | 'rotate' | 'posZ'> & typeof board,
    50
  );
}

describe('the sprite a white board is drawn with', () => {
  it('lays the picture of its face over the whole face of a board lying flat, in the order of lying things', () => {
    const [face] = whiteBoardSprites({
      id: 'board',
      frame: frameOf(0),
      picture: { url: 'blob:board', widthPx: 200, heightPx: 100 },
    });

    expect(face).toMatchObject({ id: 'board#face', kind: 'white-board', widthPx: 200, heightPx: 100, twoSided: true });
    expect(face.centre).toEqual({ x: 200, y: 250, z: 0 });
    expect(face.order).toBe(0);
  });

  it('stands the picture up with a board raised off the table, its foot on the table', () => {
    const [face] = whiteBoardSprites({
      id: 'board',
      frame: frameOf(90),
      picture: { url: 'blob:board', widthPx: 200, heightPx: 100 },
    });

    expect(face.centre.x).toBeCloseTo(200, 6);
    expect(face.centre.y).toBeCloseTo(300, 6);
    expect(face.centre.z).toBeCloseTo(50, 6);
    expect(face.order).toBeUndefined();
  });

  it('draws nothing of a board not pictured yet', () => {
    expect(whiteBoardSprites({ id: 'board', frame: frameOf(0), picture: null })).toEqual([]);
  });
});
