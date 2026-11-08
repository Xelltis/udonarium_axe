import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
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
      centre: { x: 200, y: 300, z: 0.15 + 50 + 40 },
      widthPx: 100,
      heightPx: 80,
      facing: { across: { x: 1, y: 0, z: 0 }, down: { x: -0, y: -0, z: -1 } },
      look: { kind: 'picture', url: 'blob:panel' },
    });
    expect(panel.order).toBeUndefined();
  });

  it('lays its panel back from that line with its top furthest off, lying flat in its order', () => {
    const [panel] = textNoteSprites({ ...note, upright: false });

    expect(panel.centre).toEqual({ x: 200, y: 300 - 40, z: 0.15 + 50 });
    expect(panel.order).toBe(0.15 + 50);
  });

  it('draws nothing of a note whose panel is not pictured yet', () => {
    expect(textNoteSprites({ ...note, face: null })).toEqual([]);
  });
});
