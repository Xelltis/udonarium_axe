import { bundledModelUrl } from '@axe/domain/tabletop/bundled-model-url';
import { settlementBlocks } from '@axe/domain/tabletop/field/settlement-blocks';
import { laySettlement } from '@axe/domain/tabletop/field/settlement-layout';
import { isSettlementModel, outwardTurn, settlementModelUrl } from '@axe/domain/tabletop/field/settlement-models';

describe('the models of a settlement', () => {
  const middle = { x: 20, y: 15 };
  const reach = { x: 14, y: 10 };

  it('turns a run of wall to face away from what it walls in, whichever side of it the run is on', () => {
    expect(outwardTurn({ x: 10, y: 25, w: 8, h: 1 }, middle, reach)).toBe(0);
    expect(outwardTurn({ x: 10, y: 4, w: 8, h: 1 }, middle, reach)).toBe(180);
    expect(outwardTurn({ x: 34, y: 10, w: 1, h: 6 }, middle, reach)).toBe(270);
    expect(outwardTurn({ x: 5, y: 10, w: 1, h: 6 }, middle, reach)).toBe(90);
    expect(outwardTurn({ x: 33, y: 16, w: 1, h: 1 }, middle, reach)).toBe(270);
    expect(outwardTurn({ x: 21, y: 24, w: 1, h: 1 }, middle, reach)).toBe(0);
  });

  it('is served from beside the page, as every bundled model is looked up by its name', () => {
    expect(isSettlementModel('palisade_spikes')).toBe(true);
    expect(isSettlementModel('tree_oak')).toBe(false);
    expect(bundledModelUrl('palisade_spikes')).toBe(settlementModelUrl('palisade_spikes'));
    expect(settlementModelUrl('palisade_spikes')).toBe('assets/models/settlement/palisade_spikes.glb');
  });

  it('draws the palisade of a barbarian fort as logs with stakes crossed in front, facing out, and keeps its blocks where asked', () => {
    const fort = laySettlement('barbarianFort', 40, 30, 7);
    const modelled = settlementBlocks(fort, 40, 30, 12, true).blocks.filter((block) => block.thing === 'palisade');
    expect(modelled.length).toBeGreaterThan(0);
    expect(modelled.every((block) => block.model === 'palisade_spikes')).toBe(true);
    const south = modelled.filter((block) => block.rect.y > 20 && block.rect.w > block.rect.h);
    expect(south.length).toBeGreaterThan(0);
    expect(south.every((block) => (block.modelTurn ?? 0) === 0)).toBe(true);
    const north = modelled.filter((block) => block.rect.y < 10 && block.rect.w > block.rect.h);
    expect(north.length).toBeGreaterThan(0);
    expect(north.every((block) => block.modelTurn === 180)).toBe(true);

    const plain = settlementBlocks(fort, 40, 30, 12, false).blocks.filter((block) => block.thing === 'palisade');
    expect(plain.every((block) => block.model === undefined)).toBe(true);
  });

  it('draws a stone fort of battlements facing out, round towers on its corners and square ones by its gate', () => {
    const fort = laySettlement('stoneFort', 40, 30, 7);
    const blocks = settlementBlocks(fort, 40, 30, 12, true).blocks;
    const towers = blocks.filter((block) => block.thing === 'tower');
    expect(towers.filter((tower) => tower.model === 'stone_tower_round')).toHaveLength(4);
    expect(towers.filter((tower) => tower.model === 'stone_tower_square')).toHaveLength(2);
    const walls = blocks.filter((block) => block.thing === 'stoneWall');
    expect(walls.every((wall) => wall.model === 'stone_wall_battlement')).toBe(true);
    const south = walls.filter((wall) => wall.rect.y > 20 && wall.rect.w > wall.rect.h);
    expect(south.length).toBeGreaterThan(0);
    expect(south.every((wall) => (wall.modelTurn ?? 0) === 0)).toBe(true);
    const keep = blocks.filter((block) => block.thing === 'wall');
    expect(keep.every((wall) => wall.model === 'stone_room_wall')).toBe(true);
    expect(keep.filter((wall) => wall.rect.h > wall.rect.w).every((wall) => wall.modelTurn === 90)).toBe(true);

    const barbarian = settlementBlocks(laySettlement('barbarianFort', 40, 30, 7), 40, 30, 12, true).blocks;
    const watchtowers = barbarian.filter((block) => block.thing === 'watchtower');
    expect(watchtowers.length).toBeGreaterThan(0);
    expect(
      watchtowers
        .filter((tower) => tower.rect.w === 2 && tower.rect.h === 2)
        .every((tower) => tower.model === 'watchtower_wood')
    ).toBe(true);
  });

  it('keeps a tower of a board of hexes built of its blocks, a cell each, and still draws the runs of wall', () => {
    const blocks = settlementBlocks(laySettlement('stoneFort', 40, 30, 7), 40, 30, 1, true).blocks;
    expect(blocks.filter((block) => block.thing === 'tower').every((tower) => tower.model === undefined)).toBe(true);
    expect(
      blocks.filter((block) => block.thing === 'stoneWall').every((wall) => wall.model === 'stone_wall_battlement')
    ).toBe(true);
  });
});
