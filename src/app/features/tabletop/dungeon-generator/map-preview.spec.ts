import { TEXTURE_BASE_COLOR, WALL_TEXTURE_BASE_COLOR } from '@axe/domain/media/texture-catalog';
import { planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';
import { buildMapPreview, previewColors, TORCH_FILL } from '@axe/features/tabletop/dungeon-generator/map-preview';

const colors = previewColors('wall_ashlar', 'stone_paving_big', 'lava');

function plan(atmosphere: 'stoneDungeon' | 'lavaCavern' = 'stoneDungeon') {
  return planDungeon({ atmosphere, roomCount: 8, seed: 7 });
}

describe('previewColors()', () => {
  it('reads the floor and the hazard straight out of the catalog', () => {
    expect(colors.floor).toBe(TEXTURE_BASE_COLOR.stone_paving_big);
    expect(colors.hazard).toBe(TEXTURE_BASE_COLOR.lava);
  });

  it('sinks the rock below the floor so the plan can be read', () => {
    // Ashlar and the paving beside it are near enough the same grey to read as one field.
    const brightness = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

    expect(colors.wall).not.toBe(WALL_TEXTURE_BASE_COLOR.wall_ashlar);
    expect(brightness(colors.wall)).toBeLessThan(brightness(colors.floor) * 0.6);
  });

  it('falls back to a plain grey for a picture from the library', () => {
    const fallback = previewColors('some-hash', 'other-hash', 'lava');

    expect(fallback.wall).toMatch(/^#[0-9a-f]{6}$/);
    expect(fallback.floor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('buildMapPreview()', () => {
  it('spans the board in cells', () => {
    const { layout, blocks } = plan();

    expect(buildMapPreview(layout, blocks, colors).viewBox).toBe(`0 0 ${layout.width} ${layout.height}`);
  });

  it('draws the painted ground, then every block, then the lights', () => {
    const { layout, blocks } = plan();
    const preview = buildMapPreview(layout, blocks, colors);

    expect(preview.rects.length).toBe(blocks.paint.length + blocks.blocks.length + blocks.torchSpots.length);
  });

  it('keeps every rectangle where its block is', () => {
    const { layout, blocks } = plan();
    const preview = buildMapPreview(layout, blocks, colors);

    blocks.blocks.forEach((block, index) => {
      expect(preview.rects[blocks.paint.length + index]).toMatchObject(block.rect);
    });
  });

  it('paints walls and floors from the chosen materials', () => {
    const { layout, blocks } = plan();
    const preview = buildMapPreview(layout, blocks, colors);

    blocks.paint.forEach((patch, index) => {
      if (patch.kind === 'floor') expect(preview.rects[index].fill).toBe(colors.floor);
    });
    blocks.blocks.forEach((block, index) => {
      if (block.kind === 'wall') expect(preview.rects[blocks.paint.length + index].fill).toBe(colors.wall);
    });
  });

  it('marks where each torch stands', () => {
    const { layout, blocks } = plan();
    const preview = buildMapPreview(layout, blocks, colors);

    expect(blocks.torchSpots.length).toBeGreaterThan(0);
    expect(preview.rects.filter((rect) => rect.fill === TORCH_FILL).length).toBe(blocks.torchSpots.length);
  });

  it('shows the lava in a cave that has some', () => {
    const { layout, blocks } = plan('lavaCavern');
    const preview = buildMapPreview(layout, blocks, colors);
    const hazard = blocks.paint.filter((patch) => patch.kind === 'hazard').length;

    expect(hazard).toBeGreaterThan(0);
    expect(preview.rects.filter((rect) => rect.fill === colors.hazard).length).toBe(hazard);
  });

  describe('on a hex board', () => {
    const blocks = {
      blocks: [
        { kind: 'wall', rect: { x: 0, y: 0, w: 1, h: 1 }, blocksSight: true, locked: true, rooms: [] },
        { kind: 'wall', rect: { x: 1, y: 0, w: 1, h: 1 }, blocksSight: true, locked: true, rooms: [] },
        { kind: 'wall', rect: { x: 0, y: 1, w: 1, h: 1 }, blocksSight: true, locked: true, rooms: [] },
      ],
      paint: [],
      ambiences: [],
      torchRooms: [],
      torchSpots: [],
      lights: [],
    } as unknown as MapBlocks;
    const size = { width: 4, height: 4 };

    it('staggers the cells, so the preview is the board that will be built', () => {
      const squared = buildMapPreview(size, blocks, colors, GridType.SQUARE);
      const hexed = buildMapPreview(size, blocks, colors, GridType.HEX_VERTICAL);

      expect(squared.rects[0].y).toBe(squared.rects[1].y);
      expect(hexed.rects[0].y).not.toBe(hexed.rects[1].y);
    });

    it('draws a box round what was actually laid out rather than a count of cells', () => {
      const squared = buildMapPreview(size, blocks, colors, GridType.SQUARE);
      const hexed = buildMapPreview(size, blocks, colors, GridType.HEX_VERTICAL);

      expect(squared.viewBox).toBe('0 0 4 4');
      expect(hexed.viewBox).not.toBe(squared.viewBox);
    });

    it('is squares when nothing else was asked for', () => {
      expect(buildMapPreview(size, blocks, colors).viewBox).toBe('0 0 4 4');
    });
  });
});

describe('buildMapPreview() of a town', () => {
  it('shows a building by its roof and a planting by its leaves, so the one is not taken for the other', () => {
    const plan = planField({ atmosphere: 'city', size: 60, density: 50, seed: 7 });
    const preview = buildMapPreview(plan.layout, plan.blocks, previewColors('wall_facade', 'asphalt', ''));
    const fillOf = (thing: string) => {
      const index = plan.blocks.blocks.findIndex((block) => block.thing === thing);
      expect(index).toBeGreaterThanOrEqual(0);
      return preview.rects[plan.blocks.paint.length + index].fill;
    };

    expect(fillOf('building')).toBe(TEXTURE_BASE_COLOR.rooftop);
    expect(fillOf('bush')).not.toBe(fillOf('building'));
  });
});
