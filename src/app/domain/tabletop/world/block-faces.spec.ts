import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { blockFacesOf } from '@axe/domain/tabletop/world/block-faces';

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
