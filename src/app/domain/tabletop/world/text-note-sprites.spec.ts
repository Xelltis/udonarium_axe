import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { LYING_LIFT_PX, type TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { TextNoteLayout, textNoteSprites } from '@axe/domain/tabletop/world/text-note-sprites';

const note: TextNoteLayout = {
  id: 'note',
  frame: surfaceFrame('floor', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 }),
  x: 200,
  y: 300,
  z: 0,
  altitudePx: 50,
  rotateDeg: 0,
  upright: true,
  face: { url: 'blob:panel', widthPx: 100, heightPx: 80 },
};

describe('the sprite a note is drawn with', () => {
  it('stands its panel up from the line through the point it hangs from, at its altitude, facing south', () => {
    const [panel] = textNoteSprites(note);

    expect(panel).toMatchObject({
      id: 'note#panel',
      kind: 'text-note',
      centre: { x: 200, y: 300, z: LYING_LIFT_PX + 0.15 + 50 + 40 },
      widthPx: 100,
      heightPx: 80,
      facing: { across: { x: 1, y: 0, z: 0 }, down: { x: -0, y: -0, z: -1 } },
      look: { kind: 'picture', url: 'blob:panel' },
    });
    expect(panel.order).toBeUndefined();
  });

  describe('seen from behind', () => {
    const paper = { colour: '#161b22', opacity: 0.9 };
    const papered: TextNoteLayout = { ...note, face: { ...note.face!, paper } };

    /** The way a sprite looks out of its front, in the board's space, which is the scene's seen in a mirror. */
    function frontOf(sprite: TableWorldSprite): { x: number; y: number; z: number } {
      if (sprite.facing === 'eye') throw new Error('the sprite is turned to the eye');
      const a = sprite.facing.across;
      const up = { x: -sprite.facing.down.x, y: -sprite.facing.down.y, z: -sprite.facing.down.z };
      return { x: up.y * a.z - up.z * a.y, y: up.z * a.x - up.x * a.z, z: up.x * a.y - up.y * a.x };
    }

    it('draws the back of a note standing up as its paper alone, as opaque, looking the other way from where its panel stands', () => {
      for (const rotateDeg of [0, 30, 90]) {
        const [panel, back, ...rest] = textNoteSprites({ ...papered, rotateDeg });

        expect(rest).toEqual([]);
        expect(panel.look).toEqual({ kind: 'picture', url: 'blob:panel' });
        expect(back).toMatchObject({ id: 'note#back', owner: 'note', kind: 'text-note', twoSided: false });
        expect(back.look).toEqual({ kind: 'colour', colour: '#161b22' });
        expect(back.opacity).toBe(0.9);
        expect([back.centre, back.widthPx, back.heightPx, back.order]).toEqual([
          panel.centre,
          panel.widthPx,
          panel.heightPx,
          undefined,
        ]);
        const [front, behind] = [frontOf(panel), frontOf(back)];
        expect(front.z).toBeCloseTo(0, 6);
        expect(Math.hypot(front.x, front.y)).toBeCloseTo(1, 6);
        expect(behind.x).toBeCloseTo(-front.x, 6);
        expect(behind.y).toBeCloseTo(-front.y, 6);
        expect(behind.z).toBeCloseTo(-front.z, 6);
      }
    });

    it('faces the panel of a note standing unturned to the south, and its back to the north', () => {
      const [panel, back] = textNoteSprites(papered);

      expect(frontOf(panel).y).toBeCloseTo(1, 6);
      expect(frontOf(back).y).toBeCloseTo(-1, 6);
    });

    it('draws no back for a note lying down, which shows none', () => {
      expect(textNoteSprites({ ...papered, upright: false }).map((sprite) => sprite.id)).toEqual(['note#panel']);
    });

    it('draws no back for a note whose paper the page has not told, or whose paper is clear', () => {
      expect(textNoteSprites(note).map((sprite) => sprite.id)).toEqual(['note#panel']);
      const clear = { ...papered, face: { ...note.face!, paper: { colour: '#161b22', opacity: 0 } } };
      expect(textNoteSprites(clear).map((sprite) => sprite.id)).toEqual(['note#panel']);
    });
  });

  it('lays its panel back from that line with its top furthest off, lying flat in its order', () => {
    const [panel] = textNoteSprites({ ...note, upright: false });

    expect(panel.centre).toEqual({ x: 200, y: 300 - 40, z: LYING_LIFT_PX + 0.15 + 50 });
    expect(panel.order).toBe(LYING_LIFT_PX + 0.15 + 50);
  });

  it('draws nothing of a note whose panel is not pictured yet', () => {
    expect(textNoteSprites({ ...note, face: null })).toEqual([]);
  });
});
