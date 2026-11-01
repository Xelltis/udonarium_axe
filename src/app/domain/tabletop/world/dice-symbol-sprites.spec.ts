import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { DiceSymbolLayout, diceSymbolSprites } from '@axe/domain/tabletop/world/dice-symbol-sprites';

const dims = { widthPx: 1000, depthPx: 800, wallHeightPx: 300 };

const die: DiceSymbolLayout = {
  id: 'die',
  frame: surfaceFrame('floor', dims),
  onFloor: true,
  x: 100,
  y: 200,
  z: 0,
  sizePx: 50,
  rotateDeg: 0,
  picture: { url: 'blob:face', width: 100, height: 120 },
  pictureHeightPx: null,
  facesEye: true,
  pictureBrightness: 1,
  frameBrightness: 1,
  frameColour: 'orange',
};

describe('the sprites a die is drawn with', () => {
  it('lays its frame on the floor, lifted as the page lifts a die, in its colour inside a dark rim', () => {
    const [frame] = diceSymbolSprites(die);

    expect(frame).toMatchObject({
      id: 'die#frame',
      owner: 'die',
      kind: 'dice-symbol',
      centre: { x: 125, y: 225, z: 1 },
      widthPx: 50,
      heightPx: 50,
      facing: { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 } },
      twoSided: false,
    });
    expect(frame.look).toEqual({
      kind: 'frame',
      bands: [
        { widthPx: 6, colour: 'orange' },
        { widthPx: 2, colour: '#212121' },
      ],
      radiusPx: 5,
    });
  });

  it('stands its picture up from the frame’s middle, as wide as the die, turned to the reader', () => {
    const [, picture] = diceSymbolSprites(die);

    expect(picture).toMatchObject({
      centre: { x: 125, y: 225, z: 1 + 30 },
      widthPx: 50,
      heightPx: 60,
      facing: 'eye',
      look: { kind: 'picture', url: 'blob:face' },
    });
  });

  it('stands its picture square to the die where pictures do not turn to the reader', () => {
    const [, picture] = diceSymbolSprites({ ...die, facesEye: false, rotateDeg: 90 });

    const facing = picture.facing as Exclude<typeof picture.facing, 'eye'>;
    expect(facing.across.x).toBeCloseTo(0, 9);
    expect(facing.across.y).toBeCloseTo(1, 9);
    expect(facing.down).toEqual({ x: -0, y: -0, z: -1 });
  });

  it('draws its picture as tall as it is asked to be, and as wide as that makes it', () => {
    const [, picture] = diceSymbolSprites({ ...die, pictureHeightPx: 90 });

    expect(picture.heightPx).toBe(90);
    expect(picture.widthPx).toBe(75);
    expect(picture.centre.z).toBe(1 + 45);
  });

  it('lays its picture on a wall it stands on, rising from the frame’s middle', () => {
    const north = surfaceFrame('north-wall', dims);

    const [frame, picture] = diceSymbolSprites({ ...die, frame: north, onFloor: false, y: 50 });

    expect(frame.centre).toEqual({ x: 125, y: 1, z: 225 });
    expect(picture.centre).toEqual({ x: 125, y: 1, z: 225 + 30 });
    expect(picture.facing).toEqual(frame.facing);
  });

  it('draws only its frame while its picture is not known, and nothing for a die of no size', () => {
    expect(diceSymbolSprites({ ...die, picture: null }).map((sprite) => sprite.id)).toEqual(['die#frame']);
    expect(diceSymbolSprites({ ...die, sizePx: 0 })).toEqual([]);
  });
});
