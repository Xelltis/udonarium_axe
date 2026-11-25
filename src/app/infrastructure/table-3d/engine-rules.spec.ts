import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import {
  fieldOfViewDeg,
  finishingOf,
  nodeWornPictures,
  pictureKey,
  shadowCastingPictures,
  unwornPictureKeys,
  urlOfPictureKey,
  wornPictures,
} from '@axe/infrastructure/table-3d/engine-rules';
import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';
import { BufferGeometry, Group, Mesh, MeshBasicNodeMaterial, Texture } from 'three/webgpu';

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

describe('shadowCastingPictures', () => {
  it('names the pictures worn by what throws a shadow, and none worn by what throws none', () => {
    const root = new Group();
    const shadowed = new Texture();
    const laidOver = new Texture();
    const casting = new Mesh(new BufferGeometry(), new MeshBasicNodeMaterial({ map: shadowed }));
    casting.castShadow = true;
    const flat = new Mesh(new BufferGeometry(), new MeshBasicNodeMaterial({ map: laidOver }));
    flat.castShadow = false;
    root.add(casting, flat);

    expect(shadowCastingPictures(root)).toEqual(new Set([shadowed]));
    root.remove(casting);
    expect(shadowCastingPictures(root)).toEqual(new Set());
  });

  it('names the pictures of every material a mesh wears, where it wears more than one', () => {
    const root = new Group();
    const [front, back] = [new Texture(), new Texture()];
    const mesh = new Mesh(new BufferGeometry(), [
      new MeshBasicNodeMaterial({ map: front }),
      new MeshBasicNodeMaterial({ map: back }),
    ]);
    mesh.castShadow = true;
    root.add(mesh);

    expect(shadowCastingPictures(root)).toEqual(new Set([front, back]));
  });
});

describe('nodeWornPictures', () => {
  it('names the shared pictures the layers and the backdrops wear tiled, and the board stretched', () => {
    const shared = new Map<string, Texture>();
    const pictureOf = (url: string, tiled: boolean) => {
      const key = `${url}|${tiled}`;
      if (!shared.has(key)) shared.set(key, new Texture());
      return shared.get(key);
    };
    const world = {
      board: { pictureUrl: 'board.gif' },
      layers: [{ pictureUrl: 'clouds.gif' }],
      backdrops: [{ pictureUrl: 'hills.gif' }],
    } as unknown as TableWorld;

    expect(nodeWornPictures(world, pictureOf)).toEqual(
      new Set([pictureOf('clouds.gif', true), pictureOf('hills.gif', true), pictureOf('board.gif', false)])
    );
  });
});
