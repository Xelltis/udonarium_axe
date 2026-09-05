import { rectKey } from '@axe/domain/tabletop/cell-rectangles';
import { DEFAULT_FUNCTION_SPEC, MapFunctionRole, MaskBlock, TerrainBlock } from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { createScene, FunctionLayer, MapScene, newId } from '@axe/features/map-editor/model/scene';
import { cellsForRole, planChangesNothing, planFunctionPaint } from '@axe/features/map-editor/model/table-apply';

function layerOf(role: MapFunctionRole, cells: string[], over: Partial<FunctionLayer> = {}): FunctionLayer {
  const held: Record<string, true> = {};
  for (const key of cells) held[key] = true;
  return {
    id: newId(),
    kind: 'function',
    name: role,
    visible: true,
    locked: false,
    opacity: 1,
    role,
    cells: held,
    spec: { ...DEFAULT_FUNCTION_SPEC },
    ...over,
  };
}

function sceneWith(...layers: FunctionLayer[]): MapScene {
  return { ...createScene(10, 8, 50), layers };
}

function terrainBlock(rect: { col: number; row: number; width: number; height: number }): TerrainBlock {
  return { ...rect, spec: { ...DEFAULT_FUNCTION_SPEC.terrain } };
}

function maskBlock(rect: { col: number; row: number; width: number; height: number }): MaskBlock {
  return { ...rect, spec: { ...DEFAULT_FUNCTION_SPEC.mask } };
}

function snapshot(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    cols: 10,
    rows: 8,
    cellPx: 50,
    gridType: GridType.SQUARE,
    floorImageIdentifier: '',
    blockedCells: [],
    terrainBlocks: [],
    maskBlocks: [],
    ...over,
  };
}

describe('cellsForRole()', () => {
  it('gathers every layer of one role together', () => {
    const scene = sceneWith(layerOf('terrain', ['0,0']), layerOf('terrain', ['1,1']), layerOf('mask', ['2,2']));

    expect(cellsForRole(scene, 'terrain').sort()).toEqual(['0,0', '1,1']);
  });

  it('counts a layer that has been hidden all the same', () => {
    const scene = sceneWith(layerOf('terrain', ['0,0'], { visible: false }));

    expect(cellsForRole(scene, 'terrain')).toEqual(['0,0']);
  });

  it('takes a cell painted twice only once', () => {
    const scene = sceneWith(layerOf('mask', ['3,3']), layerOf('mask', ['3,3']));

    expect(cellsForRole(scene, 'mask')).toEqual(['3,3']);
  });
});

describe('planFunctionPaint()', () => {
  it('closes the table on whatever the scene holds, replacing what was there', () => {
    const plan = planFunctionPaint(sceneWith(layerOf('moveBlock', ['1,1'])), snapshot({ blockedCells: ['5,5'] }))!;

    expect(plan.blocked).toEqual(['1,1']);
  });

  it('adds what was painted and takes away what was rubbed out', () => {
    const plan = planFunctionPaint(
      sceneWith(layerOf('terrain', ['0,0', '1,0'])),
      snapshot({
        terrainBlocks: [
          terrainBlock({ col: 1, row: 0, width: 1, height: 1 }),
          terrainBlock({ col: 2, row: 0, width: 1, height: 1 }),
        ],
      })
    )!;

    expect(plan.terrain.add.map(rectKey)).toEqual(['0,0,2,1']);
    expect(plan.terrain.remove.map(rectKey).sort()).toEqual(['1,0,1,1', '2,0,1,1']);
  });

  it('leaves a cell that was already there alone', () => {
    const plan = planFunctionPaint(
      sceneWith(layerOf('mask', ['4,4'])),
      snapshot({ maskBlocks: [maskBlock({ col: 4, row: 4, width: 1, height: 1 })] })
    )!;

    expect(plan.mask.add).toEqual([]);
    expect(plan.mask.remove).toEqual([]);
  });

  it('gives every block the look of the layer it came from', () => {
    const scene = sceneWith(
      layerOf('terrain', ['0,0'], {
        spec: { ...DEFAULT_FUNCTION_SPEC, terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, height: 5 } },
      }),
      layerOf('terrain', ['4,4'], {
        spec: { ...DEFAULT_FUNCTION_SPEC, terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, height: 2 } },
      }),
      layerOf('mask', ['1,1'], {
        spec: { ...DEFAULT_FUNCTION_SPEC, mask: { ...DEFAULT_FUNCTION_SPEC.mask, color: '#abcdef' } },
      })
    );

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrain.add.map((block) => block.spec.height).sort()).toEqual([2, 5]);
    expect(plan.mask.add[0].spec.color).toBe('#abcdef');
  });

  it('refuses a scene painted against a different grid', () => {
    expect(planFunctionPaint(sceneWith(), snapshot({ cols: 12 }))).toBeNull();
    expect(planFunctionPaint(sceneWith(), snapshot({ rows: 9 }))).toBeNull();
    expect(planFunctionPaint(sceneWith(), snapshot({ gridType: GridType.HEX_VERTICAL }))).toBeNull();
  });

  it('takes away everything the editor painted where the scene has nothing left', () => {
    const plan = planFunctionPaint(
      sceneWith(),
      snapshot({
        terrainBlocks: [terrainBlock({ col: 0, row: 0, width: 1, height: 1 })],
        maskBlocks: [maskBlock({ col: 1, row: 1, width: 1, height: 1 })],
      })
    )!;

    expect(plan.terrain.remove.map(rectKey)).toEqual(['0,0,1,1']);
    expect(plan.mask.remove.map(rectKey)).toEqual(['1,1,1,1']);
    expect(plan.blocked).toEqual([]);
  });
});

describe('planChangesNothing()', () => {
  it('says so where the table already matches', () => {
    const table = snapshot({
      blockedCells: ['1,1'],
      terrainBlocks: [terrainBlock({ col: 2, row: 2, width: 1, height: 1 })],
    });
    const plan = planFunctionPaint(sceneWith(layerOf('moveBlock', ['1,1']), layerOf('terrain', ['2,2'])), table)!;

    expect(planChangesNothing(plan, table)).toBe(true);
  });

  it('says otherwise for a cell that would be closed and was not', () => {
    const table = snapshot();
    const plan = planFunctionPaint(sceneWith(layerOf('moveBlock', ['1,1'])), table)!;

    expect(planChangesNothing(plan, table)).toBe(false);
  });
});

describe('the blocks a painting comes to', () => {
  it('lays a row of painted cells as one long wall rather than a row of posts', () => {
    const plan = planFunctionPaint(sceneWith(layerOf('terrain', ['0,0', '1,0', '2,0'])), snapshot())!;

    expect(plan.terrain.add.map(rectKey)).toEqual(['0,0,3,1']);
  });

  it('leaves a wall that already stands exactly as it is', () => {
    const table = snapshot({ terrainBlocks: [terrainBlock({ col: 0, row: 0, width: 3, height: 1 })] });

    const plan = planFunctionPaint(sceneWith(layerOf('terrain', ['0,0', '1,0', '2,0'])), table)!;

    expect(plan.terrain.add).toEqual([]);
    expect(plan.terrain.remove).toEqual([]);
    expect(planChangesNothing(plan, table)).toBe(true);
  });

  it('rebuilds a wall that grew rather than adding a post beside it', () => {
    const table = snapshot({ terrainBlocks: [terrainBlock({ col: 0, row: 0, width: 3, height: 1 })] });

    const plan = planFunctionPaint(sceneWith(layerOf('terrain', ['0,0', '1,0', '2,0', '3,0'])), table)!;

    expect(plan.terrain.add.map(rectKey)).toEqual(['0,0,4,1']);
    expect(plan.terrain.remove.map(rectKey)).toEqual(['0,0,3,1']);
  });
});

describe('walls painted over walls', () => {
  function wallLayer(cells: string[], over: Partial<typeof DEFAULT_FUNCTION_SPEC.terrain> = {}): FunctionLayer {
    return layerOf('terrain', cells, {
      spec: { ...DEFAULT_FUNCTION_SPEC, terrain: { ...DEFAULT_FUNCTION_SPEC.terrain, ...over } },
    });
  }

  it('sets the upper layer on top of the one beneath rather than inside it', () => {
    const scene = sceneWith(wallLayer(['2,2']), wallLayer(['2,2'], { name: 'upper' }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrain.add.map((block) => block.spec.altitude)).toEqual([0, 50]);
  });

  it('counts the height of what is beneath, not the number of layers', () => {
    const scene = sceneWith(wallLayer(['2,2'], { height: 3 }), wallLayer(['2,2'], { name: 'upper' }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrain.add.map((block) => block.spec.altitude)).toEqual([0, 150]);
  });

  it('leaves a layer on the ground where nothing stands under it', () => {
    const scene = sceneWith(wallLayer(['2,2']), wallLayer(['5,5'], { name: 'apart' }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrain.add.every((block) => block.spec.altitude === 0)).toBe(true);
  });

  it('cuts a layer apart where it starts at two heights at once', () => {
    const scene = sceneWith(wallLayer(['2,2']), wallLayer(['2,2', '3,2'], { name: 'upper' }));

    const plan = planFunctionPaint(scene, snapshot())!;

    const raised = plan.terrain.add.filter((block) => block.spec.altitude === 50);
    const grounded = plan.terrain.add.filter((block) => block.spec.altitude === 0);
    expect(raised.map(rectKey)).toEqual(['2,2,1,1']);
    expect(grounded.map(rectKey)).toEqual(['2,2,1,1', '3,2,1,1']);
  });

  it('keeps a floor from lifting what is painted over it', () => {
    const scene = sceneWith(wallLayer(['2,2'], { height: 0 }), wallLayer(['2,2'], { name: 'upper' }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrain.add.map((block) => block.spec.altitude)).toEqual([0, 0]);
  });
});
