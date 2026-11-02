import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { CharacterLayout, characterSprites } from '@axe/domain/tabletop/world/character-sprites';

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
});
