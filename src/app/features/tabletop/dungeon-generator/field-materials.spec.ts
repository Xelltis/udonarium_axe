import { FIELD_ATMOSPHERES } from '@axe/domain/tabletop/field/field-atmosphere';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { MapBlock, MapBlocks, MapMaterial } from '@axe/domain/tabletop/map-blocks';
import { withFieldMaterials } from '@axe/features/tabletop/dungeon-generator/field-materials';

function block(sideId: string, topId: string): MapBlock {
  return {
    kind: 'prop',
    rect: { x: 0, y: 0, w: 1, h: 1 },
    blocksSight: false,
    locked: false,
    rooms: [],
    skin: { side: { kind: 'texture', id: sideId }, top: { kind: 'texture', id: topId } },
    height: 1,
  };
}

function blocksOf(...list: MapBlock[]): MapBlocks {
  return { blocks: list, paint: [], ambiences: [], torchRooms: [], torchSpots: [], lights: [] };
}

describe('withFieldMaterials', () => {
  const atmosphere = FIELD_ATMOSPHERES.wasteland;
  const ground: MapMaterial = { kind: 'texture', id: 'sand' };
  const prop: MapMaterial = { kind: 'texture', id: 'wall_sandstone' };

  it('dresses a post in the material the panel asked for', () => {
    const result = withFieldMaterials(blocksOf(block('wall_timber', 'black_soil')), atmosphere, ground, prop);

    expect(result.blocks[0].skin!.side).toEqual(prop);
  });

  it('leaves a cactus in its own skin', () => {
    const result = withFieldMaterials(blocksOf(block('cactus_skin', 'cactus_skin')), atmosphere, ground, prop);

    expect(result.blocks[0].skin!.side).toEqual({ kind: 'texture', id: 'cactus_skin' });
  });

  it('leaves foliage alone, since it wears a ground texture', () => {
    const result = withFieldMaterials(blocksOf(block('forest', 'forest')), atmosphere, ground, prop);

    expect(result.blocks[0].skin!.side).toEqual({ kind: 'texture', id: 'forest' });
  });

  it('paints the band the preset calls its own with the chosen ground', () => {
    const blocks: MapBlocks = {
      ...blocksOf(),
      paint: [
        {
          kind: 'floor',
          rect: { x: 0, y: 0, w: 1, h: 1 },
          material: { kind: 'texture', id: atmosphere.defaultGround },
        },
        { kind: 'floor', rect: { x: 1, y: 0, w: 1, h: 1 }, material: { kind: 'texture', id: 'rubble_floor' } },
      ],
    };

    const result = withFieldMaterials(blocks, atmosphere, ground, prop);

    expect(result.paint[0].material).toEqual(ground);
    expect(result.paint[1].material).toEqual({ kind: 'texture', id: 'rubble_floor' });
  });

  it('leaves every piece in the skin the preset gave it until a material is chosen', () => {
    const slum = FIELD_ATMOSPHERES.slum;
    const plan = planField({ atmosphere: 'slum', size: 48, density: 100, seed: 42 });
    const result = withFieldMaterials(plan.blocks, slum, ground, null);

    expect(result.blocks).toBe(plan.blocks.blocks);
    const facades = new Set(
      result.blocks.filter((each) => each.thing === 'building').map((each) => (each.skin!.side as { id: string }).id)
    );
    expect(facades).toEqual(new Set(slum.town!.skins.map((skin) => skin.side)));
  });

  it('dresses the buildings of a town in the material asked for, and leaves what stands on their roofs in steel', () => {
    const city = FIELD_ATMOSPHERES.city;
    const plan = planField({ atmosphere: 'city', size: 40, density: 100, seed: 42 });
    const glass: MapMaterial = { kind: 'library', identifier: 'glass' };
    const result = withFieldMaterials(plan.blocks, city, ground, glass);

    for (const block of result.blocks.filter((each) => each.thing === 'building'))
      expect(block.skin!.side).toEqual(glass);
    const units = result.blocks.filter((each) => each.thing === 'roofUnit');
    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) expect(unit.skin!.side).toEqual({ kind: 'texture', id: 'metal_grate' });
  });
});
