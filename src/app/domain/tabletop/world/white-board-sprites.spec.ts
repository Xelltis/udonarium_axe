import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { LYING_LIFT_PX } from '@axe/domain/tabletop/world/table-sprites';
import { whiteBoardSprites } from '@axe/domain/tabletop/world/white-board-sprites';

function frameOf(pitch: number) {
  const board = { width: 4, height: 2, pitch, rotate: 0, posZ: 0, location: { x: 100, y: 200 } };
  return whiteBoardFrame(
    board as Pick<WhiteBoard, 'width' | 'height' | 'pitch' | 'rotate' | 'posZ'> & typeof board,
    50
  );
}

const PICTURE = { url: 'blob:board', widthPx: 200, heightPx: 100 };
const LOOK = { colour: '#f4f1e8', opacity: 1 };

/** The way a sprite lying along two directions looks out of its front: across it crossed with up it. */
function frontOf(sprite: TableWorldSprite): { x: number; y: number; z: number } {
  if (sprite.facing === 'eye') throw new Error('the sprite is turned to the eye');
  const a = sprite.facing.across;
  const up = { x: -sprite.facing.down.x, y: -sprite.facing.down.y, z: -sprite.facing.down.z };
  // The board's space is the scene's seen in a mirror, so the front is the cross taken the other way round.
  return { x: up.y * a.z - up.z * a.y, y: up.z * a.x - up.x * a.z, z: up.x * a.y - up.y * a.x };
}

describe('the sprite a white board is drawn with', () => {
  it('lays the picture of its face over the whole face of a board lying flat, as far off the floor as anything lying flat', () => {
    const [face] = whiteBoardSprites({ id: 'board', frame: frameOf(0), picture: PICTURE, ...LOOK });

    expect(face).toMatchObject({ id: 'board#face', kind: 'white-board', widthPx: 200, heightPx: 100 });
    expect(face.look).toEqual({ kind: 'picture', url: 'blob:board' });
    expect(face.centre).toEqual({ x: 200, y: 250, z: LYING_LIFT_PX });
    expect(face.order).toBe(LYING_LIFT_PX);
  });

  it('shows the picture of its face from in front only, looking up from a board lying flat', () => {
    const [face] = whiteBoardSprites({ id: 'board', frame: frameOf(0), picture: PICTURE, ...LOOK });

    expect(face.twoSided).toBe(false);
    expect(frontOf(face).z).toBeCloseTo(1, 6);
  });

  it('draws its back as its colour alone, as opaque as its face, looking the other way from where the face stands', () => {
    for (const pitch of [0, 60, 90]) {
      const [face, back, ...rest] = whiteBoardSprites({
        id: 'board',
        frame: frameOf(pitch),
        picture: PICTURE,
        colour: '#336699',
        opacity: 0.4,
      });

      expect(rest).toEqual([]);
      expect(back).toMatchObject({ id: 'board#back', owner: 'board', kind: 'white-board', twoSided: false });
      expect(back.look).toEqual({ kind: 'colour', colour: '#336699' });
      expect(back.opacity).toBe(0.4);
      expect(face.opacity).toBeUndefined();
      expect([back.centre, back.widthPx, back.heightPx, back.order]).toEqual([
        face.centre,
        face.widthPx,
        face.heightPx,
        face.order,
      ]);
      const [front, behind] = [frontOf(face), frontOf(back)];
      expect(behind.x).toBeCloseTo(-front.x, 6);
      expect(behind.y).toBeCloseTo(-front.y, 6);
      expect(behind.z).toBeCloseTo(-front.z, 6);
      expect(Math.hypot(front.x, front.y, front.z)).toBeCloseTo(1, 6);
    }
  });

  it('draws no back for a board whose face is clear, which stays clear from behind', () => {
    const sprites = whiteBoardSprites({
      id: 'board',
      frame: frameOf(90),
      picture: PICTURE,
      colour: '#336699',
      opacity: 0,
    });

    expect(sprites.map((sprite) => sprite.id)).toEqual(['board#face']);
  });

  it('keeps the opacity of its back between clear and solid', () => {
    const [, back] = whiteBoardSprites({
      id: 'board',
      frame: frameOf(90),
      picture: PICTURE,
      colour: '#336699',
      opacity: 3,
    });

    expect(back.opacity).toBe(1);
  });

  it('stands the picture up with a board raised off the table, its foot on the table', () => {
    const [face] = whiteBoardSprites({ id: 'board', frame: frameOf(90), picture: PICTURE, ...LOOK });

    expect(face.centre.x).toBeCloseTo(200, 6);
    expect(face.centre.y).toBeCloseTo(300, 6);
    expect(face.centre.z).toBeCloseTo(50, 6);
    expect(face.order).toBeUndefined();
  });

  it('draws nothing of a board not pictured yet, not its back either', () => {
    expect(whiteBoardSprites({ id: 'board', frame: frameOf(0), picture: null, ...LOOK })).toEqual([]);
  });
});
