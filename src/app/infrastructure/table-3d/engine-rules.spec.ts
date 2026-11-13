import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import {
  fieldOfViewDeg,
  finishingOf,
  pictureKey,
  unwornPictureKeys,
  urlOfPictureKey,
  wornPictures,
} from '@axe/infrastructure/table-3d/engine-rules';
import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';

describe('fieldOfViewDeg', () => {
  it('sees a right angle through a box twice as tall as the eye stands off it', () => {
    expect(fieldOfViewDeg(6000, 3000)).toBeCloseTo(90, 10);
  });

  it('sees narrower the further off the eye stands', () => {
    expect(fieldOfViewDeg(1000, 3000)).toBeLessThan(fieldOfViewDeg(1000, 1000));
  });
});

describe('finishingOf', () => {
  it('spills no glow while nothing glows', () => {
    expect(finishingOf(TABLE_3D_QUALITY.standard, false)).toEqual({ ...TABLE_3D_QUALITY.standard, bloom: false });
  });

  it('keeps the plan as it is once anything glows, or where it spills no glow anyway', () => {
    expect(finishingOf(TABLE_3D_QUALITY.standard, true)).toBe(TABLE_3D_QUALITY.standard);
    expect(finishingOf(TABLE_3D_QUALITY.light, false)).toBe(TABLE_3D_QUALITY.light);
  });
});

describe('the pictures a world wears', () => {
  function worldWearing(parts: Partial<TableWorld>): TableWorld {
    return {
      board: null,
      walls: [],
      caps: [],
      sprites: [],
      coins: [],
      layers: [],
      water: { parts: [] },
      backdrops: [],
      models: [],
      ...parts,
    } as unknown as TableWorld;
  }

  it('names the pictures of the faces, the grids over walls, the picture sprites, the layers, the backdrops and the board', () => {
    const world = worldWearing({
      walls: [{ pictureUrl: 'wall.webp', gridUrl: 'grid.webp' }, { pictureUrl: 'bare.webp' }],
      caps: [{ pictureUrl: 'cap.webp' }],
      sprites: [{ look: { kind: 'picture', url: 'piece.webp' } }, { look: { kind: 'frame', bands: [], radiusPx: 0 } }],
      layers: [{ pictureUrl: 'under.webp' }],
      backdrops: [{ pictureUrl: 'far.webp' }],
      board: { pictureUrl: 'board.webp' },
    } as unknown as Partial<TableWorld>);

    expect([...wornPictures(world)].sort()).toEqual(
      ['bare.webp', 'board.webp', 'cap.webp', 'far.webp', 'grid.webp', 'piece.webp', 'under.webp', 'wall.webp'].sort()
    );
  });

  it('names no picture for a board wearing none', () => {
    expect(wornPictures(worldWearing({ board: { pictureUrl: '' } as unknown as TableWorld['board'] })).size).toBe(0);
  });

  it('picks out the loaded pictures nothing wears, by the url in their keys', () => {
    const keys = [pictureKey('wall.webp', 'true'), pictureKey('piece.webp', 'sprite'), pictureKey('old.webp', 'false')];

    expect(unwornPictureKeys(keys, new Set(['wall.webp', 'piece.webp']))).toEqual(['old.webp|false']);
    expect(urlOfPictureKey(pictureKey('a|b.webp', 'sprite'))).toBe('a|b.webp');
  });
});
