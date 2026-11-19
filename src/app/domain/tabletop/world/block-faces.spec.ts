import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { blockFacesOf, SHEET_LIFT_PX } from '@axe/domain/tabletop/world/block-faces';
import { LYING_LIFT_PX } from '@axe/domain/tabletop/world/table-sprites';

const GRID = 50;
const picture = (identifier: string) => `blob:${identifier}`;

describe('the faces of the blocks', () => {
  const made: Terrain[] = [];
  afterEach(() => made.splice(0).forEach((terrain) => terrain.destroy()));

  /** A block two cells wide, one deep and two high, its corner at (100, 50). */
  function block(): Terrain {
    const terrain = Terrain.create('block', 2, 1, 2, 'stone', 'grass');
    terrain.location = { name: 'table', x: 100, y: 50 };
    made.push(terrain);
    return terrain;
  }

  function faces(terrain: Terrain) {
    return blockFacesOf([terrain], GRID, GridType.SQUARE, picture);
  }

  it('stands each side from its foot to its top, left to right as it is seen from outside', () => {
    const { walls, caps } = faces(block());

    const north = walls.find((wall) => wall.id.endsWith(':north'))!;
    expect(north).toMatchObject({ ax: 200, ay: 50, bx: 100, by: 50, basePx: 0, topPx: 100, pictureUrl: 'blob:stone' });
    expect(walls.map((wall) => wall.id.split(':')[1])).toEqual(['north', 'east', 'south', 'west']);
    expect(caps).toHaveLength(1);
    expect(caps[0]).toMatchObject({ zPx: 100, facing: 'up', pictureUrl: 'blob:grass' });
  });

  it('stands the two sides of a block with no thickness a hair apart, so a sheet stood on a wall is in front of it', () => {
    const sheet = Terrain.create('sheet', 2, 0, 2, 'poster', 'grass');
    sheet.location = { name: 'table', x: 100, y: 100 };
    made.push(sheet);
    const wall = Terrain.create('wall', 2, 1, 2, 'stone', 'grass');
    wall.location = { name: 'table', x: 100, y: 50 };
    made.push(wall);

    const sheetFaces = faces(sheet).walls;
    const north = sheetFaces.find((face) => face.id.endsWith(':north'))!;
    const south = sheetFaces.find((face) => face.id.endsWith(':south'))!;
    expect([north.ay, north.by]).toEqual([100 - SHEET_LIFT_PX, 100 - SHEET_LIFT_PX]);
    expect([south.ay, south.by]).toEqual([100 + SHEET_LIFT_PX, 100 + SHEET_LIFT_PX]);
    expect([Math.min(south.ax, south.bx), Math.max(south.ax, south.bx)]).toEqual([100, 200]);
    // The wall's face it is stood against lies behind the sheet's face looking out from it.
    const wallSouth = faces(wall).walls.find((face) => face.id.endsWith(':south'))!;
    expect(wallSouth.ay).toBe(100);
    expect(south.ay).toBeGreaterThan(wallSouth.ay);
    expect(faces(sheet).caps[0].uvs!.every((uv) => Number.isFinite(uv.x) && Number.isFinite(uv.y))).toBe(true);
  });

  it('lays the top of a block as high as nothing a hair over what it lies on, and leaves one with height as it is', () => {
    const tile = Terrain.create('tile', 1, 1, 0, 'stone', 'rug');
    tile.location = { name: 'table', x: 100, y: 50 };
    made.push(tile);

    expect(faces(tile).caps[0]).toMatchObject({ zPx: SHEET_LIFT_PX, facing: 'up' });
    expect(faces(tile).walls).toEqual([]);
    expect(faces(block()).caps[0].zPx).toBe(100);
  });

  it('lays the top of a block as high as nothing over that of another laid before it where they overlap, never under the things lying on them', () => {
    const tile = (x: number, y: number) => {
      const laid = Terrain.create('tile', 2, 2, 0, 'stone', 'rug');
      laid.location = { name: 'table', x, y };
      made.push(laid);
      return laid;
    };
    const first = tile(100, 100);
    const second = tile(150, 150);
    const apart = tile(400, 400);
    const third = tile(120, 120);
    const fourth = tile(400, 400);

    const tops = blockFacesOf([first, second, apart, third, fourth], GRID, GridType.SQUARE, picture).caps.map(
      (cap) => cap.zPx
    );
    // Each over every one before it that it overlaps; one standing apart from the rest as low as the first.
    expect(tops[0]).toBe(SHEET_LIFT_PX);
    expect(tops[1]).toBeGreaterThan(tops[0]);
    expect(tops[2]).toBe(SHEET_LIFT_PX);
    expect(tops[3]).toBeGreaterThan(tops[1]);
    expect(tops[4]).toBeGreaterThan(tops[2]);
    // However many lie one over another, all stay under where the things lying on them are drawn.
    const piled = Array.from({ length: 12 }, () => tile(100, 100));
    for (const cap of blockFacesOf(piled, GRID, GridType.SQUARE, picture).caps) {
      expect(cap.zPx).toBeLessThan(LYING_LIFT_PX);
    }
  });

  describe('the faces marked as a sheet’s', () => {
    function sized(width: number, depth: number, height: number): Terrain {
      const terrain = Terrain.create('sheet', width, depth, height, 'poster', 'grass');
      terrain.location = { name: 'table', x: 100, y: 100 };
      made.push(terrain);
      return terrain;
    }

    it('marks none of the faces of a block with thickness every way', () => {
      const hanging = block();
      hanging.altitude = 1;

      for (const terrain of [block(), hanging]) {
        const { walls, caps } = faces(terrain);
        expect([...walls, ...caps].filter((face) => face.sheet !== undefined)).toEqual([]);
      }
    });

    it('draws the sides of a block as wide or as deep as nothing from outside only, and its top from both sides', () => {
      for (const terrain of [sized(0, 2, 2), sized(2, 0, 2)]) {
        const { walls, caps } = faces(terrain);
        expect(walls).toHaveLength(4);
        expect(walls.map((wall) => wall.sheet)).toEqual(['outside', 'outside', 'outside', 'outside']);
        expect(caps.map((cap) => cap.sheet)).toEqual(['both']);
      }
    });

    it('draws the top of a block as high as nothing lying on the floor from both sides', () => {
      const { walls, caps } = faces(sized(2, 1, 0));

      expect(walls).toEqual([]);
      expect(caps.map((cap) => [cap.facing, cap.sheet])).toEqual([['up', 'both']]);
    });

    it('draws the top and the underside of a block as high as nothing hanging above the floor from outside only', () => {
      const hanging = sized(2, 1, 0);
      hanging.altitude = 1;
      const sloped = sized(2, 1, 0);
      sloped.altitude = 1;
      sloped.slopeSides = ['e'];

      for (const terrain of [hanging, sloped]) {
        const { caps } = faces(terrain);
        expect(caps.map((cap) => [cap.facing, cap.sheet, cap.zPx])).toEqual([
          ['up', 'outside', 50 + SHEET_LIFT_PX],
          ['down', 'outside', 50],
        ]);
      }
    });

    it('marks a sheet on a hex table as on a square one, a block of hex cells having thickness both ways across', () => {
      const onHex = (terrain: Terrain) => blockFacesOf([terrain], GRID, GridType.HEX_VERTICAL, picture);

      expect(onHex(sized(0, 2, 2)).walls.map((wall) => wall.sheet)).toEqual([
        'outside',
        'outside',
        'outside',
        'outside',
      ]);
      const cells = onHex(sized(1, 1, 2));
      expect(cells.walls).toHaveLength(6);
      expect([...cells.walls, ...cells.caps].filter((face) => face.sheet !== undefined)).toEqual([]);
      expect(onHex(sized(1, 1, 0)).caps.map((cap) => cap.sheet)).toEqual(['both']);
    });

    it('marks a glass sheet as any other', () => {
      const glass = Terrain.create('pane', 2, 0, 2, '', '');
      glass.location = { name: 'table', x: 100, y: 100 };
      made.push(glass);

      const { walls } = faces(glass);
      expect(walls.every((wall) => wall.glass && wall.sheet === 'outside')).toBe(true);
    });
  });

  it('lifts a block by as far as the raised ground under it lifts it', () => {
    const { walls, caps } = blockFacesOf(
      [block()],
      GRID,
      GridType.SQUARE,
      picture,
      () => null,
      () => 30
    );

    expect(walls.find((wall) => wall.id.endsWith(':north'))).toMatchObject({ basePx: 30, topPx: 130 });
    expect(caps[0]).toMatchObject({ zPx: 130 });
  });

  it('marks the flat top of a block sunk into the floor up to its top as lying on the floor, and no other face', () => {
    const lying = (terrain: Terrain, liftPx = 0) =>
      blockFacesOf(
        [terrain],
        GRID,
        GridType.SQUARE,
        picture,
        () => null,
        () => liftPx
      ).caps.map((cap) => [cap.facing, cap.zPx, cap.onFloor]);
    const sunk = block();
    sunk.altitude = -2;
    const deeper = block();
    deeper.altitude = -3;
    const hanging = block();
    hanging.altitude = 1;
    const sloped = block();
    sloped.altitude = -2;
    sloped.slopeSides = ['e'];
    const flat = Terrain.create('tile', 2, 1, 0, 'stone', 'grass');
    flat.location = { name: 'table', x: 100, y: 50 };
    made.push(flat);

    expect(lying(sunk)).toEqual([['up', 0, true]]);
    expect(lying(sunk, 30)).toEqual([['up', 30, true]]);
    expect(lying(block())).toEqual([['up', 100, undefined]]);
    expect(lying(deeper)).toEqual([['up', -50, undefined]]);
    expect(lying(hanging)).toEqual([
      ['up', 150, undefined],
      ['down', 50, undefined],
    ]);
    expect(lying(sloped).every(([, , onFloor]) => onFloor === undefined)).toBe(true);
    expect(lying(flat)).toEqual([['up', SHEET_LIFT_PX, undefined]]);
  });

  it('turns a block about its middle', () => {
    const turned = block();
    turned.rotate = 90;
    const outline = faces(turned).caps[0].outline;
    const xs = outline.map((point) => point.x);
    const ys = outline.map((point) => point.y);

    // Two cells across and one deep, turned a quarter, is one across and two deep about (150, 75).
    expect(Math.min(...xs)).toBeCloseTo(125, 6);
    expect(Math.max(...xs)).toBeCloseTo(175, 6);
    expect(Math.min(...ys)).toBeCloseTo(25, 6);
    expect(Math.max(...ys)).toBeCloseTo(125, 6);
  });

  it('gives a block hanging above the floor its underside', () => {
    const hanging = block();
    hanging.altitude = 1;
    const caps = faces(hanging).caps;
    expect(caps.find((cap) => cap.facing === 'down')).toMatchObject({ zPx: 50 });
  });

  it('draws an open door where it has gone: swung about its hinge, or lifted out of the way', () => {
    const swung = block();
    swung.doorStyle = DoorStyle.SWING;
    swung.isDoorOpen = true;
    const shut = { ...faces(block()).caps[0] };
    expect(faces(swung).caps[0].outline).not.toEqual(shut.outline);

    const lifted = block();
    lifted.doorStyle = DoorStyle.LIFT;
    lifted.isDoorOpen = true;
    expect(faces(lifted).caps[0].zPx).toBe(200);
  });

  it('lays a sloping top as pieces with a height at each corner, and folds the sides under it', () => {
    const ramp = block();
    ramp.slopeSides = ['e'];
    const { walls, caps } = faces(ramp);

    const heights = caps.filter((cap) => cap.facing === 'up').flatMap((cap) => cap.heights ?? []);
    expect(Math.min(...heights)).toBeCloseTo(0, 6);
    expect(Math.max(...heights)).toBeCloseTo(100, 6);
    const north = walls.find((wall) => wall.id.endsWith(':north'))!;
    expect(north.profile!.map((stop) => stop.heightPx)).toEqual([0, 100]);
  });

  describe('in the fog', () => {
    const half = { cols: 2, rows: 1, cleared: [true, false], brightness: [1, 1] };

    function fogged(terrain: Terrain, cover: typeof half | null) {
      return blockFacesOf([terrain], GRID, GridType.SQUARE, picture, () => cover);
    }

    it('cuts a block back to the cells the seat has reached', () => {
      const { walls, caps } = fogged(block(), half);

      expect(caps.map((cap) => cap.id.split(':')[1])).toEqual(['top@0']);
      const xs = caps[0].outline.map((point) => point.x);
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([100, 150]);
      const sides = walls.map((wall) => wall.id.split(':')[1]);
      expect(sides).toEqual(['north@0', 'south@0', 'west@0']);
      const north = walls.find((wall) => wall.id.endsWith('north@0'))!;
      expect(north).toMatchObject({ ax: 150, bx: 100, uFrom: 0.5, uTo: 1 });
    });

    it('draws nothing of a block none of which has been reached', () => {
      const { walls, caps } = fogged(block(), { ...half, cleared: [false, false] });
      expect(walls).toHaveLength(0);
      expect(caps).toHaveLength(0);
    });

    it('draws a sloping block whole once any of it has been reached, as the page does', () => {
      const ramp = block();
      ramp.slopeSides = ['e'];
      expect(fogged(ramp, half).walls.map((wall) => wall.id.split(':')[1])).toEqual(['north', 'east', 'south', 'west']);
    });
  });

  it('lays a stretched picture in the block’s own frame, so it turns with the block', () => {
    const turned = block();
    turned.rotate = 90;
    expect(faces(turned).caps[0].uvs).toEqual(faces(block()).caps[0].uvs);
  });

  it('lays the table’s grid over the top of a block that asks for it, and not under it', () => {
    const gridded = block();
    gridded.isGrid = true;
    gridded.altitude = 1;
    const caps = faces(gridded).caps;
    expect(caps.find((cap) => cap.facing === 'up')?.gridded).toBe(true);
    expect(caps.find((cap) => cap.facing === 'down')?.gridded).toBeUndefined();
    expect(faces(block()).caps[0].gridded).toBeUndefined();
  });
});
