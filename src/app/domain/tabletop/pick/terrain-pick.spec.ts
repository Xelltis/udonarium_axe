import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { GridType } from '@axe/domain/tabletop/game-table';
import { hitShape } from '@axe/domain/tabletop/pick/pick-geometry';
import { terrainPickShape } from '@axe/domain/tabletop/pick/terrain-pick';
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
