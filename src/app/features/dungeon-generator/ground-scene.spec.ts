import { cellKey, CellLayer } from '@axe/domain/map-editor/scene';
import { IMAGE_TEXTURE_PREFIX } from '@axe/domain/map-editor/textures';
import { DungeonAtmosphereId } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { GridType } from '@axe/domain/tabletop/game-table';
import { buildGroundScene } from '@axe/features/dungeon-generator/ground-scene';

const stone = { kind: 'texture' as const, id: 'stone_paving_big' };
const lava = { kind: 'texture' as const, id: 'lava' };

function scene(atmosphere: DungeonAtmosphereId = 'stoneDungeon') {
  const plan = planDungeon({ atmosphere, roomCount: 8, seed: 7 });
  return {
    plan,
    built: buildGroundScene(plan.layout, plan.blocks.paint, { floor: stone, hazard: lava }, 50),
  };
}

describe('buildGroundScene()', () => {
  it('covers the board a cell at a time, on squares', () => {
    const { plan, built } = scene();

    expect(built.cols).toBe(plan.layout.width);
    expect(built.rows).toBe(plan.layout.height);
    expect(built.cellPx).toBe(50);
    expect(built.gridType).toBe(GridType.SQUARE);
    expect(built.gridVisible).toBe(false);
  });

  it('paints every cell of every patch and nothing else', () => {
    const { plan, built } = scene();
    const layer = built.layers[0] as CellLayer;
    const cells = plan.blocks.paint.reduce((total, patch) => total + patch.rect.w * patch.rect.h, 0);

    expect(built.layers.length).toBe(1);
    expect(Object.keys(layer.cells).length).toBe(cells);
    for (const patch of plan.blocks.paint) {
      expect(layer.cells[cellKey(patch.rect.x, patch.rect.y)]).toBeDefined();
    }
  });

  it('gives the ground the chosen texture and the hazard its own', () => {
    const { plan, built } = scene('lavaCavern');
    const layer = built.layers[0] as CellLayer;
    const hazard = plan.blocks.paint.find((patch) => patch.kind === 'hazard');
    const floor = plan.blocks.paint.find((patch) => patch.kind === 'floor');

    expect(hazard).toBeDefined();
    expect(layer.cells[cellKey(floor!.rect.x, floor!.rect.y)]).toEqual({
      type: 'texture',
      textureId: 'stone_paving_big',
      scale: 1,
      rotation: 0,
    });
    expect(layer.cells[cellKey(hazard!.rect.x, hazard!.rect.y)]).toMatchObject({ textureId: 'lava' });
  });

  it('points a picture from the library at the image it came from', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 3, seed: 1 });
    const material = { kind: 'library' as const, identifier: 'some-hash' };
    const built = buildGroundScene(plan.layout, plan.blocks.paint, { floor: material, hazard: material }, 50);
    const layer = built.layers[0] as CellLayer;
    const first = plan.blocks.paint[0];

    expect(layer.cells[cellKey(first.rect.x, first.rect.y)]).toMatchObject({
      textureId: IMAGE_TEXTURE_PREFIX + 'some-hash',
    });
  });
});
