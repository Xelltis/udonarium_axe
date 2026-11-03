import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { CharacterLayout, characterRollPivot, characterSprites } from '@axe/domain/tabletop/world/character-sprites';

const dims = { widthPx: 1000, depthPx: 800, wallHeightPx: 300 };

const character: CharacterLayout = {
  id: 'hero',
  frame: surfaceFrame('floor', dims),
  onFloor: true,
  x: 100,
  y: 200,
  z: 0,
  sizePx: 50,
  rotateDeg: 0,
  rollDeg: 0,
  dropShadow: false,
  lean: null,
  altitudePx: 0,
  pedestal: { url: 'blob:pedestal', widthPx: 50, heightPx: 50 },
  picture: { url: 'blob:hero', width: 100, height: 200 },
  pictureHeightPx: null,
  pictureWidthPx: null,
  fitsInCell: false,
  facesEye: true,
  opacity: 1,
};

describe('the sprites a character is drawn with', () => {
  it('lays the pedestal on the floor under the piece and stands the picture up from its middle, as wide as the cell', () => {
    const [pedestal, picture] = characterSprites(character);

    expect(pedestal).toMatchObject({
      id: 'hero#pedestal',
      kind: 'character',
      centre: { x: 125, y: 225, z: 1 },
      look: { kind: 'picture', url: 'blob:pedestal' },
      order: 1,
    });
    expect(picture).toMatchObject({
      id: 'hero#picture',
      centre: { x: 125, y: 225, z: 1 + 50 },
      widthPx: 50,
      heightPx: 100,
      facing: 'eye',
    });
  });

  it('raises the picture by its altitude, and draws it as tall and as wide as it is asked to be', () => {
    const [, picture] = characterSprites({ ...character, altitudePx: 50, pictureHeightPx: 80, pictureWidthPx: 30 });

    expect(picture).toMatchObject({ widthPx: 30, heightPx: 80, centre: { z: 1 + 50 + 40 } });
  });

  it('holds the picture inside the cell on a table seen from above', () => {
    const [, picture] = characterSprites({ ...character, fitsInCell: true });

    expect(picture).toMatchObject({ widthPx: 25, heightPx: 50, centre: { z: 1 + 25 } });
  });

  it('lays a picture of the pedestal reaching past the cell off its middle, turned with the piece', () => {
    const reaching = { url: 'blob:pedestal', widthPx: 50, heightPx: 70, offsetX: 0, offsetY: -20 };

    const [square] = characterSprites({ ...character, pedestal: reaching });
    const [turned] = characterSprites({ ...character, pedestal: reaching, rotateDeg: 90 });
    const [plain] = characterSprites(character);

    expect(square.heightPx).toBe(70);
    expect(square.centre.x).toBeCloseTo(plain.centre.x, 6);
    expect(square.centre.y).toBeCloseTo(plain.centre.y - 10, 6);
    expect(Math.hypot(turned.centre.x - plain.centre.x, turned.centre.y - plain.centre.y)).toBeCloseTo(10, 6);
    expect(turned.centre.y).toBeCloseTo(plain.centre.y, 6);
  });

  it('lays the picture inside the pedestal on a wall, as a poster', () => {
    const north = surfaceFrame('north-wall', dims);

    const [pedestal, picture] = characterSprites({ ...character, frame: north, onFloor: false, y: 50 });

    expect(picture.centre).toEqual(pedestal.centre);
    expect(picture).toMatchObject({ widthPx: 25, heightPx: 50, facing: pedestal.facing });
  });

  it('draws a piece in stealth half clear, and nothing of one whose pedestal the page keeps to itself', () => {
    expect(characterSprites({ ...character, opacity: 0.5 })[1].opacity).toBe(0.5);
    expect(characterSprites({ ...character, pedestal: null })).toEqual([]);
  });

  it('swings the picture about the middle of the cell’s height as far as the piece is tipped over', () => {
    const [, picture] = characterSprites({ ...character, facesEye: false, rollDeg: 90 });

    // Tipped a quarter over, the picture lies along the floor's east, its foot at the pivot's west.
    expect(picture.centre.x).toBeCloseTo(125 + 25, 6);
    expect(picture.centre.z).toBeCloseTo(1 + 25, 6);
    const facing = picture.facing as Exclude<typeof picture.facing, 'eye'>;
    expect(facing.down.x).toBeCloseTo(-1, 6);
    expect(facing.across.z).toBeCloseTo(-1, 6);
  });

  it('casts the picture’s shadow, squashed to half its height, ending at the middle of the cell', () => {
    const [, shadow] = characterSprites({ ...character, dropShadow: true });

    expect(shadow).toMatchObject({
      id: 'hero#shadow',
      centre: { x: 125, y: 200 + 25 - 25, z: 1 },
      widthPx: 50,
      heightPx: 50,
      brightness: 0,
      opacity: 0.7,
      order: 1,
    });
  });

  it('leans the pedestal and the shadow as the ground under the piece leans, and stands the picture upright', () => {
    const [pedestal, shadow, picture] = characterSprites({
      ...character,
      dropShadow: true,
      lean: { eastward: 1, southward: 0 },
    });

    const across = (pedestal.facing as Exclude<typeof pedestal.facing, 'eye'>).across;
    expect(across.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(across.z).toBeCloseTo(Math.SQRT1_2, 6);
    expect(shadow.facing).toEqual(pedestal.facing);
    expect(picture.facing).toBe('eye');
  });
});

describe('where a character is tipped over about', () => {
  it('is the middle of its cell’s height over the middle of its pedestal, at its altitude', () => {
    expect(characterRollPivot(character)).toEqual({ x: 125, y: 225, z: 1 + 25 });
    expect(characterRollPivot({ ...character, altitudePx: 50 })).toEqual({ x: 125, y: 225, z: 1 + 50 + 25 });
  });

  it('is nowhere for a character on a wall, whose picture lies on the wall', () => {
    expect(characterRollPivot({ ...character, frame: surfaceFrame('north-wall', dims), onFloor: false })).toBeNull();
  });
});
