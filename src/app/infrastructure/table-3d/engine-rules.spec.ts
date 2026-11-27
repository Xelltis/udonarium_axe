import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import {
  deepestGroundOf,
  fieldOfViewDeg,
  finishingOf,
  nodeWornPictures,
  pictureKey,
  seenOrShadowSeen,
  shadowCastingPictures,
  shadowLightsOf,
  shadowReachBox,
  sharedPictureKey,
  unwornPictureKeys,
  urlOfPictureKey,
  wornPictures,
} from '@axe/infrastructure/table-3d/engine-rules';
import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';
import {
  Box3,
  BufferGeometry,
  DirectionalLight,
  Frustum,
  Group,
  Layers,
  Mesh,
  MeshBasicNodeMaterial,
  Plane,
  PlaneGeometry,
  PointLight,
  Texture,
  Vector3,
} from 'three/webgpu';

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
  const shared = new Map<string, Texture>();
  const pictureOf = (key: string) => {
    if (!shared.has(key)) shared.set(key, new Texture());
    return shared.get(key);
  };
  const world = (board: boolean) =>
    ({
      board: board ? { pictureUrl: 'board.gif' } : null,
      layers: [{ pictureUrl: 'clouds.gif' }],
      backdrops: [{ pictureUrl: 'hills.gif' }],
    }) as unknown as TableWorld;

  it('names the shared pictures the board wears stretched, and the layers and the backdrops under a sky wear tiled', () => {
    expect(nodeWornPictures(world(true), true, pictureOf)).toEqual(
      new Set([
        pictureOf(sharedPictureKey('board.gif', false)),
        pictureOf(sharedPictureKey('clouds.gif', true)),
        pictureOf(sharedPictureKey('hills.gif', true)),
      ])
    );
  });

  it('names no backdrop where no sky stands them, and nothing where there is no board to lay them on', () => {
    expect(nodeWornPictures(world(true), false, pictureOf)).toEqual(
      new Set([pictureOf(sharedPictureKey('board.gif', false)), pictureOf(sharedPictureKey('clouds.gif', true))])
    );
    expect(nodeWornPictures(world(false), true, pictureOf)).toEqual(new Set());
  });
});

describe('shadowReachBox', () => {
  const standing = () => new Box3(new Vector3(0, 0, 0), new Vector3(10, 20, 10));

  it('reaches as far as the sun throws the shadow down to the floor, along its rays', () => {
    const reach = shadowReachBox(standing(), [{ runs: new Vector3(1, -1, 0) }], 1000);

    expect(reach.max.x).toBeCloseTo(30);
    expect(reach.min.y).toBeCloseTo(0);
    expect(reach.containsBox(standing())).toBe(true);
  });

  it('reaches as far as a lamp over the thing throws it out from under the lamp', () => {
    const reach = shadowReachBox(standing(), [{ at: new Vector3(0, 100, 0), reach: 1000 }], 1000);

    expect(reach.max.x).toBeCloseTo(12.5);
    expect(reach.max.z).toBeCloseTo(12.5);
  });

  it('takes the whole floor a lamp standing within the thing lights as where its shadow may fall', () => {
    const tall = new Box3(new Vector3(0, 0, 0), new Vector3(10, 50, 10));
    const atEye = new Vector3(-30, 25, 5);

    const lit = shadowReachBox(tall, [{ at: atEye, reach: 200 }], 1000);
    expect([lit.min.x, lit.max.x, lit.min.z, lit.max.z]).toEqual([-230, 170, -195, 205]);
    expect(shadowReachBox(tall, [{ at: atEye, reach: 200 }], 100).max.x).toBe(70);

    const thin = new Box3(new Vector3(-10, 0, 2), new Vector3(10, 50, 2.1));
    expect(
      shadowReachBox(thin, [{ at: new Vector3(0, 25, 0), reach: 300 }], 1000).containsPoint(new Vector3(0, 0, 250))
    ).toBe(true);
  });

  it('keeps the shadow of a thing close under a lamp whole between its corners, cut only to where the lamp reaches', () => {
    const board = new Box3(new Vector3(24, 0, -50), new Vector3(26, 100, 50));
    const reach = shadowReachBox(board, [{ at: new Vector3(0, 105, 0), reach: 300 }], 1400);

    expect(reach.containsPoint(new Vector3(250, 0, 0))).toBe(true);
    expect(reach.max.x).toBe(300);
  });

  it('adds nothing for a sun under the horizon, a lamp no higher than the foot of the thing, or one too far to light it', () => {
    expect(shadowReachBox(standing(), [{ runs: new Vector3(1, 0, 0) }], 1000)).toEqual(standing());
    expect(shadowReachBox(standing(), [{ at: new Vector3(50, 0, 0), reach: 1000 }], 1000)).toEqual(standing());
    expect(shadowReachBox(standing(), [{ at: new Vector3(1000, 10, 0), reach: 50 }], 1000)).toEqual(standing());
  });

  it('throws a long shadow of a low sun no further than the reach given', () => {
    expect(shadowReachBox(standing(), [{ runs: new Vector3(1, -0.01, 0) }], 50).max.x).toBeCloseTo(60, 0);
  });

  it('throws a shadow down into the deepest of the ground, and down to the foot of a thing sunk deeper', () => {
    expect(shadowReachBox(standing(), [{ runs: new Vector3(1, -1, 0) }], 1000, -40).max.x).toBeCloseTo(70);
    const sunk = new Box3(new Vector3(0, -40, 0), new Vector3(10, -20, 10));
    expect(shadowReachBox(sunk, [{ runs: new Vector3(1, -1, 0) }], 1000).min.y).toBeCloseTo(-40);
    expect(shadowReachBox(sunk, [{ runs: new Vector3(1, -1, 0) }], 1000).max.x).toBeCloseTo(30);
  });
});

describe('shadowLightsOf', () => {
  it('reads the sun throwing shadows by the way its rays run, from where it stands to where it looks', () => {
    const sun = new DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.position.set(0, 100, 0);
    sun.target.position.set(50, 0, 0);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();

    const [light] = shadowLightsOf(sun, []);

    expect('runs' in light && light.runs.toArray()).toEqual([50, -100, 0]);
  });

  it('reads each lamp lit with its shadow where it stands, as far as it reaches, and none unlit, hidden or unshadowed', () => {
    const sun = new DirectionalLight(0xffffff, 0);
    const lamp = (intensity: number, castShadow: boolean, distance: number) => {
      const made = new PointLight(0xffffff, intensity, distance);
      made.castShadow = castShadow;
      made.position.set(5, 25, 5);
      made.updateMatrixWorld();
      return made;
    };
    const hidden = lamp(1, true, 0);
    hidden.visible = false;

    const lights = shadowLightsOf(sun, [
      lamp(1, true, 120),
      lamp(1, true, 0),
      lamp(0, true, 120),
      lamp(1, false, 120),
      hidden,
    ]);

    expect(lights).toEqual([
      { at: new Vector3(5, 25, 5), reach: 120 },
      { at: new Vector3(5, 25, 5), reach: Infinity },
    ]);
  });
});

describe('seenOrShadowSeen', () => {
  const eye = new Layers();
  const view = new Frustum(
    ...[
      [1, 0, 0, 0],
      [-1, 0, 0, 100],
      [0, 1, 0, 1000],
      [0, -1, 0, 1000],
      [0, 0, 1, 1000],
      [0, 0, -1, 1000],
    ].map(([x, y, z, constant]) => new Plane(new Vector3(x, y, z), constant))
  );
  const board = (x: number, castShadow: boolean, layer = 0) => {
    const made = new Mesh(new PlaneGeometry(10, 20), new MeshBasicNodeMaterial());
    made.position.set(x, 10, 0);
    made.castShadow = castShadow;
    made.layers.set(layer);
    made.updateMatrixWorld();
    return made;
  };
  const sun = { lights: [{ runs: new Vector3(1, -1, 0) }], reach: 1000, floor: 0 };

  it('sees what is drawn for the camera in its view', () => {
    expect(seenOrShadowSeen(board(50, false), eye, view, sun)).toBe(true);
  });

  it('sees a board standing for a shadow alone, out of the view, whose shadow falls in it', () => {
    expect(seenOrShadowSeen(board(-15, true, 1), eye, view, sun)).toBe(true);
  });

  it('sees neither what throws no shadow out of the view, nor a shadow while no light throws one', () => {
    expect(seenOrShadowSeen(board(-15, false), eye, view, sun)).toBe(false);
    expect(seenOrShadowSeen(board(-15, true, 1), eye, view, { ...sun, lights: [] })).toBe(false);
    expect(seenOrShadowSeen(board(50, true, 1), eye, view, { ...sun, lights: [] })).toBe(false);
    expect(seenOrShadowSeen(board(-200, true, 1), eye, view, sun)).toBe(false);
  });
});

describe('deepestGroundOf', () => {
  it('reads the deepest of the board’s ground, and the table where the ground is flat or there is no board', () => {
    const ground = { points: new Float32Array([-80, -90, 0, 50, 0, -30, 0, 50, 20]) };
    expect(deepestGroundOf({ board: { ground } } as unknown as TableWorld)).toBe(-30);
    expect(deepestGroundOf({ board: { ground: null } } as unknown as TableWorld)).toBe(0);
    expect(deepestGroundOf({ board: null } as unknown as TableWorld)).toBe(0);
  });
});
