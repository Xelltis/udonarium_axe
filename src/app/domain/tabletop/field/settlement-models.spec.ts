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
});
