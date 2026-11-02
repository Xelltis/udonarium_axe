import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { GridType } from '@axe/domain/tabletop/game-table';
import { hitShape } from '@axe/domain/tabletop/pick/pick-geometry';
import { beamPickTarget, terrainPickShape, terrainPickTarget } from '@axe/domain/tabletop/pick/terrain-pick';
import { surfaceWorldBox } from '@axe/domain/tabletop/surface-space';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';

function downOnto(x: number, y: number): TableRay {
  return { origin: { x, y, z: 5000 }, direction: { x: 0, y: 0, z: -1 } };
}

describe('terrain pick shape', () => {
  const made: Terrain[] = [];
  function terrain(width: number, depth: number, height: number): Terrain {
    const block = Terrain.create('block', width, depth, height, '', '');
    block.location.x = 100;
    block.location.y = 100;
    made.push(block);
    return block;
  }

  afterEach(() => made.splice(0).forEach((block) => block.destroy()));

  it('stands a block on the ground it covers, as high as it is', () => {
    const shape = terrainPickShape(terrain(2, 1, 3), 50, GridType.SQUARE);
    expect(hitShape(downOnto(190, 140), shape)?.point.z).toBeCloseTo(150, 9);
    expect(hitShape(downOnto(210, 140), shape)).toBeNull();
  });

  it('lifts a block by as far as the raised ground under it lifts it', () => {
    const shape = terrainPickShape(terrain(2, 1, 3), 50, GridType.SQUARE, 30);

    expect(shape.base).toBe(30);
    expect(shape.top).toBe(30 + 150);
  });

  it('turns a block about its middle', () => {
    const block = terrain(2, 1, 1);
    block.rotate = 90;
    const shape = terrainPickShape(block, 50, GridType.SQUARE);
    // Two cells across and one deep, turned a quarter, is one across and two deep about (150,125).
    expect(hitShape(downOnto(140, 170), shape)).not.toBeNull();
    expect(hitShape(downOnto(190, 140), shape)).toBeNull();
  });

  it('lifts a block by its altitude and by what it rests on', () => {
    const block = terrain(1, 1, 1);
    block.altitude = 2;
    block.posZ = 10;
    expect(hitShape(downOnto(125, 125), terrainPickShape(block, 50, GridType.SQUARE))?.point.z).toBeCloseTo(160, 9);
  });

  it('gives a block on a hex board the outline of its hexagon, not the square round it', () => {
    const shape = terrainPickShape(terrain(1, 1, 1), 50, GridType.HEX_VERTICAL);
    expect(hitShape(downOnto(125, 125), shape)).not.toBeNull();
    expect(shape.outline.length).toBeGreaterThan(4);
  });

  it('meets a sloping block at the height its top has under the point looked at', () => {
    const ramp = terrain(2, 1, 2);
    ramp.slopeSides = ['w'];
    const shape = terrainPickShape(ramp, 50, GridType.SQUARE);
    const low = hitShape(downOnto(105, 125), shape)!.point.z;
    const high = hitShape(downOnto(195, 125), shape)!.point.z;
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThanOrEqual(100 + 1e-6);
  });
});

describe('terrain pick shape of a door', () => {
  const made: Terrain[] = [];
  function door(style: DoorStyle): Terrain {
    const block = Terrain.create('door', 1, 0.25, 2, '', '');
    block.location.x = 100;
    block.location.y = 100;
    block.doorStyle = style;
    made.push(block);
    return block;
  }

  afterEach(() => made.splice(0).forEach((block) => block.destroy()));

  it('stands a shut door where it was set', () => {
    expect(hitShape(downOnto(125, 105), terrainPickShape(door(DoorStyle.SWING), 50, GridType.SQUARE))).not.toBeNull();
  });

  it('swings an open door about the hinge at its left end, out of the opening', () => {
    const swung = door(DoorStyle.SWING);
    swung.isDoorOpen = true;
    const shape = terrainPickShape(swung, 50, GridType.SQUARE);
    expect(hitShape(downOnto(125, 105), shape)).toBeNull();
    // Turned 95 degrees about (100,106.25), it runs south from the hinge.
    expect(hitShape(downOnto(100, 140), shape)).not.toBeNull();
  });

  it('lifts a lifting door its own height and sinks a sinking one', () => {
    const lifted = door(DoorStyle.LIFT);
    lifted.isDoorOpen = true;
    expect(hitShape(downOnto(125, 105), terrainPickShape(lifted, 50, GridType.SQUARE))!.point.z).toBeCloseTo(200, 9);
    const sunk = door(DoorStyle.SINK);
    sunk.isDoorOpen = true;
    expect(hitShape(downOnto(125, 105), terrainPickShape(sunk, 50, GridType.SQUARE))!.point.z).toBeCloseTo(0, 9);
  });

  it('slides an open sliding door its own length along the wall', () => {
    const slid = door(DoorStyle.SLIDE);
    slid.isDoorOpen = true;
    const shape = terrainPickShape(slid, 50, GridType.SQUARE);
    expect(hitShape(downOnto(125, 105), shape)).toBeNull();
    expect(hitShape(downOnto(175, 105), shape)).not.toBeNull();
  });
});

describe('terrain pick target', () => {
  const made: Terrain[] = [];
  const dims = { widthPx: 1000, depthPx: 750, wallHeightPx: 300 };

  function block(surface: string | undefined): Terrain {
    const terrain = Terrain.create('block', 2, 1, 1, '', '');
    terrain.location = { name: 'table', x: 100, y: 40, surface };
    made.push(terrain);
    return terrain;
  }

  afterEach(() => made.splice(0).forEach((terrain) => terrain.destroy()));

  it('names the floor as the face a block on the floor stands on', () => {
    const target = terrainPickTarget(block(undefined), 50, GridType.SQUARE);
    expect(target.surface).toBe('floor');
    expect(target.shapes[0].kind).toBe('prism');
  });

  it('stands a block stuck to a board out of the board, in the board’s frame', () => {
    // A board standing on the line y = 300 like a wall, facing south.
    const frame = {
      origin: { x: 0, y: 300, z: 200 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: -1 },
      normal: { x: 0, y: 1, z: 0 },
    };
    const target = terrainPickTarget(block('a-board'), 50, GridType.SQUARE, frame);
    const northward: TableRay = { origin: { x: 150, y: 1000, z: 140 }, direction: { x: 0, y: -1, z: 0 } };

    expect(target.surface).toBe('a-board');
    expect(hitShape(northward, target.shapes[0])!.point.y).toBeCloseTo(350, 9);
    expect(hitShape({ ...northward, origin: { x: 150, y: 1000, z: 180 } }, target.shapes[0])).toBeNull();
  });

  it('fills the box a beam put on a wall fills, and names the wall', () => {
    const beam = block('north-wall');
    beam.altitude = 1;
    const target = beamPickTarget(beam, 50, dims);
    const box = surfaceWorldBox('north-wall', 100, 40, 100, 50, 50, 50, dims);

    expect(target.surface).toBe('north-wall');
    expect(target.shapes[0]).toEqual({
      kind: 'prism',
      outline: [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY },
      ],
      base: box.minZ,
      top: box.maxZ,
    });
  });
});
