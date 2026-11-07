import { objectBlocksOf, objectPlacementsOf } from '@axe/domain/map-editor/object-placements';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { DEFAULT_FUNCTION_SPEC, type ObjectPaintSpec } from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { cellCentre } from '@axe/domain/tabletop/map-grid';
import { paintedBlockFootprintOf } from '@axe/domain/tabletop/painted-block-footprint';
import { placeableModelOf } from '@axe/domain/tabletop/placeable-models';
import { TerrainViewState } from '@axe/domain/tabletop/terrain';

const square = cellGridOf(20, 15, 50, GridType.SQUARE);

function brush(over: Partial<ObjectPaintSpec> = {}): ObjectPaintSpec {
  return { ...DEFAULT_FUNCTION_SPEC.object, ...over };
}

function cells(cols: number, rows: number): string[] {
  const keys: string[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) keys.push(`${col},${row}`);
  return keys;
}

/** The middle of a placed object's box, in table px. */
function middleOf(placed: { x: number; y: number; width: number; depth: number }, cellPx: number) {
  return { x: placed.x + (placed.width * cellPx) / 2, y: placed.y + (placed.depth * cellPx) / 2 };
}

describe('objectPlacementsOf()', () => {
  it('sets the same cells out the same way each time, and leaves those set out where they were as more are painted', () => {
    const spec = brush({ density: 0.6 });

    const once = objectPlacementsOf(cells(6, 6), spec, square);
    const again = objectPlacementsOf([...cells(6, 6)].reverse(), spec, square);
    const more = objectPlacementsOf(cells(9, 6), spec, square);

    expect(again).toEqual(once);
    for (const placed of once) expect(more).toContainEqual(placed);
  });

  it('stands one in the middle of every cell, turned alike, in the proportions of its model', () => {
    const spec = brush({ model: 'prop_desk', arrangement: 'cell', size: 1.2, turn: 90 });
    const desk = placeableModelOf('prop_desk')!;

    const placed = objectPlacementsOf(['2,3', '4,3'], spec, square);

    expect(placed).toHaveLength(2);
    expect(placed.map((one) => one.rotate)).toEqual([90, 90]);
    expect(middleOf(placed[0], 50)).toEqual(cellCentre({ x: 2, y: 3 }, square));
    expect(placed[0].width).toBeCloseTo(1.2, 3);
    expect(placed[0].depth).toBeCloseTo((1.2 * desk.made.deep) / desk.made.wide, 3);
    expect(placed[0].height).toBeCloseTo((1.2 * desk.made.tall) / desk.made.wide, 3);
  });

  it('scatters a share of the cells about the density, each near the middle of its own cell', () => {
    const painted = cells(20, 15);

    const placed = objectPlacementsOf(painted, brush({ density: 0.3, seed: 7 }), square);

    expect(placed.length).toBeGreaterThan(painted.length * 0.2);
    expect(placed.length).toBeLessThan(painted.length * 0.4);
    for (const one of placed) {
      const middle = middleOf(one, 50);
      const cell = { x: Math.floor(middle.x / 50), y: Math.floor(middle.y / 50) };
      const centre = cellCentre(cell, square);
      expect(Math.abs(middle.x - centre.x)).toBeLessThanOrEqual(12.5 + 0.01);
      expect(Math.abs(middle.y - centre.y)).toBeLessThanOrEqual(12.5 + 0.01);
    }
  });

  it('scatters them another way for another seed, and turns them alike where asked to', () => {
    const painted = cells(8, 8);

    const one = objectPlacementsOf(painted, brush({ seed: 1 }), square);
    const other = objectPlacementsOf(painted, brush({ seed: 2 }), square);
    const alike = objectPlacementsOf(painted, brush({ turnRandom: false, turn: 45 }), square);

    expect(other).not.toEqual(one);
    expect(new Set(alike.map((placed) => placed.rotate))).toEqual(new Set([45]));
  });

  it('sets a model held in the room out as a square of the size, as tall as the brush says', () => {
    const [placed] = objectPlacementsOf(
      ['1,1'],
      brush({ model: 'room-model', arrangement: 'cell', size: 2, height: 3 }),
      square
    );

    expect([placed.width, placed.depth, placed.height]).toEqual([2, 2, 3]);
  });

  it('stands one in the middle of a hex, and none off the board', () => {
    const hex = cellGridOf(10, 8, 60, GridType.HEX_VERTICAL);

    const placed = objectPlacementsOf(
      ['3,4', '10,1', '-1,0'],
      brush({ arrangement: 'cell', model: 'prop_crate', size: 1 }),
      hex
    );

    expect(placed).toHaveLength(1);
    const middle = middleOf(placed[0], 60);
    const centre = cellCentre({ x: 3, y: 4 }, hex);
    expect(centre).not.toEqual(cellCentre({ x: 3, y: 4 }, cellGridOf(10, 8, 60, GridType.SQUARE)));
    expect(middle.x).toBeCloseTo(centre.x, 1);
    expect(middle.y).toBeCloseTo(centre.y, 1);
  });
});

describe('objectBlocksOf()', () => {
  it('lays each as a box drawn as its model, known by the cells a block read back off the table is', () => {
    const spec = brush({ density: 1, name: 'オーク' });

    const blocks = objectBlocksOf(cells(3, 3), spec, square, 'held-oak');
    const placed = objectPlacementsOf(cells(3, 3), spec, square);

    expect(blocks).toHaveLength(placed.length);
    blocks.forEach((block, index) => {
      const stood = paintedBlockFootprintOf(
        { location: { x: placed[index].x, y: placed[index].y }, rotate: placed[index].rotate },
        placed[index].width,
        placed[index].depth,
        square
      )!;
      expect({ col: block.col, row: block.row, width: block.width, height: block.height }).toEqual(stood.rect);
      expect(block.spec.placement).toEqual(stood.placement);
      expect(block.spec).toMatchObject({
        model: 'held-oak',
        name: 'オーク',
        height: placed[index].height,
        mode: TerrainViewState.ALL,
        blocksClimb: true,
        blocksSight: true,
      });
    });
  });

  it('lays one walked over as a floor a piece steps onto, as tall as it is, that hides nothing; and none for a model held nowhere', () => {
    const spec = brush({ model: 'crop_wheat', arrangement: 'cell', size: 1, blocksMove: false, blocksSight: true });
    const [placed] = objectPlacementsOf(['0,0'], spec, square);

    const [block] = objectBlocksOf(['0,0'], spec, square, 'held-wheat');

    expect(block.spec).toMatchObject({
      height: placed.height,
      mode: TerrainViewState.FLOOR,
      blocksSight: false,
      blocksClimb: false,
    });
    expect(placed.height).toBeGreaterThan(0);
    expect(objectBlocksOf(['0,0'], spec, square, '')).toEqual([]);
  });

  it('lays each locked, as a generated field lays its trees, and marked as laid by the brush', () => {
    const [block] = objectBlocksOf(['0,0'], brush(), square, 'held-oak');

    expect(block.spec).toMatchObject({ locked: true, paintedObject: true });
  });
});
