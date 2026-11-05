import { Terrain } from '@axe/domain/tabletop/terrain';
import { beamFacesOf } from '@axe/domain/tabletop/world/beam-faces';

const GRID = 50;
const DIMS = { widthPx: 1000, depthPx: 750, wallHeightPx: 500 };
const picture = (identifier: string) => `blob:${identifier}`;

describe('the faces of the blocks put on the walls', () => {
  const made: Terrain[] = [];
  afterEach(() => made.splice(0).forEach((terrain) => terrain.destroy()));

  /** A block two cells along the north wall, one down it and three out from it, its corner 350 along and 100 down. */
  function beam(surface = 'north-wall'): Terrain {
    const terrain = Terrain.create('beam', 2, 1, 3, 'planks', 'boards');
    terrain.location = { name: 'table', x: 350, y: 100, surface };
    made.push(terrain);
    return terrain;
  }

  function faces(terrain: Terrain, drawn = true) {
    return beamFacesOf([terrain], GRID, DIMS, () => drawn, picture);
  }

  it('stands a block out from the wall as the box it fills, leaving out the face against the wall', () => {
    const { walls, caps } = faces(beam());

    expect(walls.map((wall) => wall.id.split(':')[1]).sort()).toEqual(['beam-east', 'beam-top', 'beam-west']);
    expect(caps.map((cap) => cap.id.split(':')[1]).sort()).toEqual(['beam-north', 'beam-south']);
    const top = walls.find((wall) => wall.id.endsWith(':beam-top'))!;
    expect([top.ay, top.by]).toEqual([150, 150]);
    expect([Math.min(top.ax, top.bx), Math.max(top.ax, top.bx)]).toEqual([350, 450]);
    expect([top.basePx, top.topPx]).toEqual([350, 400]);
    const above = caps.find((cap) => cap.id.endsWith(':beam-north'))!;
    expect(above).toMatchObject({ zPx: 400, facing: 'up', pictureUrl: 'blob:planks' });
    expect(caps.find((cap) => cap.id.endsWith(':beam-south'))).toMatchObject({ zPx: 350, facing: 'down' });
  });

  it('wears each picture as the page’s own table does, running back along the wall', () => {
    const { walls, caps } = faces(beam());

    const top = walls.find((wall) => wall.id.endsWith(':beam-top'))!;
    expect(top.pictureUrl).toBe('blob:boards');
    const atFoot = (x: number) => top.uvs![top.ax === x ? 0 : 1];
    expect(atFoot(450)).toEqual({ x: 0, y: 0 });
    expect(atFoot(350)).toEqual({ x: 1, y: 0 });
    const above = caps.find((cap) => cap.id.endsWith(':beam-north'))!;
    const nearWall = above.outline.findIndex((point) => point.x === 450 && point.y === 0);
    expect(above.uvs![nearWall]).toEqual({ x: 0, y: 0 });
    const east = walls.find((wall) => wall.id.endsWith(':beam-east'))!;
    expect([east.ax, east.ay, east.bx, east.by]).toEqual([350, 150, 350, 0]);
    expect(east.uvs).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('lays the table’s grid over the face above, where the block asks for one', () => {
    const asks = beam();
    asks.isGrid = true;

    const { caps } = faces(asks);

    expect(caps.find((cap) => cap.id.endsWith(':beam-north'))?.gridded).toBe(true);
    expect(caps.find((cap) => cap.id.endsWith(':beam-south'))?.gridded).toBeUndefined();
  });

  it('tiles a tiled picture a cell at a time', () => {
    const tiled = beam();
    tiled.isTiledTexture = true;

    const top = faces(tiled).walls.find((wall) => wall.id.endsWith(':beam-top'))!;

    expect(top.tilePx).toBe(GRID);
    expect(top.uvs![top.ax === 350 ? 0 : 1]).toEqual({ x: 2, y: 0 });
  });

  it('stands a block on another wall out from that wall', () => {
    const { walls } = faces(beam('west-wall'));

    const top = walls.find((wall) => wall.id.endsWith(':beam-top'))!;
    expect([top.ax, top.bx]).toEqual([150, 150]);
    expect([Math.min(top.ay, top.by), Math.max(top.ay, top.by)]).toEqual([300, 400]);
  });

  it('draws nothing on a wall the table does not draw, nor on the floor', () => {
    const onFloor = Terrain.create('block', 1, 1, 1, 'planks', 'boards');
    made.push(onFloor);

    expect(faces(beam(), false)).toEqual({ walls: [], caps: [] });
    expect(faces(onFloor)).toEqual({ walls: [], caps: [] });
  });
});
