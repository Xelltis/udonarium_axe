import { rectKey } from '@axe/domain/tabletop/cell-rectangles';
import { DEFAULT_FUNCTION_SPEC, MapFunctionRole, MaskBlock, TerrainBlock } from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { createScene, FunctionLayer, MapScene, newId } from '@axe/features/map-editor/model/scene';
import {
  cellsForRole,
  FunctionPaintPlan,
  planFunctionPaint,
  sceneCarriesFunctions,
  sceneSpeaksFor,
} from '@axe/features/map-editor/model/table-apply';
import { sceneFromTable } from '@axe/features/map-editor/model/table-import';

function changesNothing(plan: FunctionPaintPlan, table: TableSnapshot): boolean {
  const sameBlocked =
    plan.blocked.length === table.blockedCells.length && plan.blocked.every((key) => table.blockedCells.includes(key));
  return (
    sameBlocked &&
    plan.terrain.add.length === 0 &&
    plan.terrain.remove.length === 0 &&
    plan.mask.add.length === 0 &&
    plan.mask.remove.length === 0 &&
    plan.trigger.add.length === 0 &&
    plan.trigger.remove.length === 0 &&
    plan.moveCost.add.length === 0 &&
    plan.moveCost.remove.length === 0
  );
}

/** A layer of the one movement brush at its far end, where nothing gets through. */
function shutLayer(cells: string[]): FunctionLayer {
  return layerOf('moveCost', cells, {
    spec: { ...DEFAULT_FUNCTION_SPEC, moveCost: { ...DEFAULT_FUNCTION_SPEC.moveCost, blocks: true } },
  });
}

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
    moveCostBlocks: [],
    ambienceBlocks: [],
    triggerBlocks: [],
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

describe('sceneCarriesFunctions()', () => {
  it('answers for a scene that was told what its cells do', () => {
    expect(sceneCarriesFunctions(sceneWith(layerOf('terrain', ['1,1'])))).toBe(true);
  });

  it('answers no for a scene that only ever had a picture drawn on it', () => {
    expect(sceneCarriesFunctions(createScene(10, 8, 50))).toBe(false);
  });

  it('answers yes for a layer that was emptied, since emptying it is something to say', () => {
    expect(sceneCarriesFunctions(sceneWith(layerOf('terrain', [])))).toBe(true);
  });
});

describe('sceneSpeaksFor()', () => {
  it('speaks for a role it holds a layer of', () => {
    expect(sceneSpeaksFor(sceneWith(layerOf('terrain', ['1,1'])), 'terrain')).toBe(true);
  });

  it('says nothing about a role it has never held a layer of', () => {
    expect(sceneSpeaksFor(sceneWith(layerOf('terrain', ['1,1'])), 'mask')).toBe(false);
  });

  it('goes on speaking for a role whose layer was deleted', () => {
    const scene = { ...createScene(10, 8, 50), paintedRoles: ['mask' as MapFunctionRole] };

    expect(sceneSpeaksFor(scene, 'mask')).toBe(true);
  });

  it('answers for the scene as a whole the same way', () => {
    expect(sceneSpeaksFor(createScene(10, 8, 50))).toBe(false);
    expect(sceneSpeaksFor({ ...createScene(10, 8, 50), paintedRoles: ['mask' as MapFunctionRole] })).toBe(true);
  });
});

describe('planFunctionPaint()', () => {
  it('takes away what a deleted layer had laid', () => {
    const scene = { ...createScene(10, 8, 50), paintedRoles: ['mask' as MapFunctionRole] };

    const plan = planFunctionPaint(
      scene,
      snapshot({ maskBlocks: [maskBlock({ col: 4, row: 4, width: 1, height: 1 })] })
    )!;

    expect(plan.mask.remove.map(rectKey)).toEqual(['4,4,1,1']);
  });

  it('leaves a table alone where the scene never held that layer at all', () => {
    const scene = { ...createScene(10, 8, 50), paintedRoles: ['terrain' as MapFunctionRole] };

    const plan = planFunctionPaint(
      scene,
      snapshot({ maskBlocks: [maskBlock({ col: 4, row: 4, width: 1, height: 1 })] })
    )!;

    expect(plan.mask.remove).toEqual([]);
  });

  it('clears the shut cells a deleted movement layer had painted', () => {
    const scene = { ...createScene(10, 8, 50), paintedRoles: ['moveCost' as MapFunctionRole] };

    const plan = planFunctionPaint(scene, snapshot({ blockedCells: ['5,5'] }))!;

    expect(plan.blocked).toEqual([]);
  });

  it('closes the table on whatever the scene holds, replacing what was there', () => {
    const plan = planFunctionPaint(sceneWith(shutLayer(['1,1'])), snapshot({ blockedCells: ['5,5'] }))!;

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

  it('cuts a run of hexes into a block apiece, since one hex block paints one cell', () => {
    const hexScene = { ...sceneWith(layerOf('terrain', ['0,0', '1,0', '2,0'])), gridType: GridType.HEX_VERTICAL };

    const plan = planFunctionPaint(hexScene, snapshot({ gridType: GridType.HEX_VERTICAL }))!;

    expect(plan.terrain.add.map(rectKey).sort()).toEqual(['0,0,1,1', '1,0,1,1', '2,0,1,1']);
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

  it('takes away what a layer that has been emptied used to hold', () => {
    const plan = planFunctionPaint(
      sceneWith(layerOf('terrain', []), layerOf('mask', []), shutLayer([])),
      snapshot({
        terrainBlocks: [terrainBlock({ col: 0, row: 0, width: 1, height: 1 })],
        maskBlocks: [maskBlock({ col: 1, row: 1, width: 1, height: 1 })],
        blockedCells: ['2,2'],
      })
    )!;

    expect(plan.terrain.remove.map(rectKey)).toEqual(['0,0,1,1']);
    expect(plan.mask.remove.map(rectKey)).toEqual(['1,1,1,1']);
    expect(plan.blocked).toEqual([]);
  });

  it('leaves alone what the scene has no layer for, since it has said nothing about it', () => {
    // Somebody who only ever painted walls has not asked for the table's masks to go.
    const plan = planFunctionPaint(
      sceneWith(layerOf('terrain', ['0,0'])),
      snapshot({
        terrainBlocks: [terrainBlock({ col: 5, row: 5, width: 1, height: 1 })],
        maskBlocks: [maskBlock({ col: 1, row: 1, width: 1, height: 1 })],
        blockedCells: ['2,2'],
      })
    )!;

    expect(plan.terrain.remove.map(rectKey)).toEqual(['5,5,1,1']);
    expect(plan.mask.remove).toEqual([]);
    expect(plan.mask.add).toEqual([]);
    expect(plan.blocked).toEqual(['2,2']);
  });
});

describe('changesNothing()', () => {
  it('says so where the table already matches', () => {
    const table = snapshot({
      blockedCells: ['1,1'],
      terrainBlocks: [terrainBlock({ col: 2, row: 2, width: 1, height: 1 })],
    });
    const plan = planFunctionPaint(sceneWith(shutLayer(['1,1']), layerOf('terrain', ['2,2'])), table)!;

    expect(changesNothing(plan, table)).toBe(true);
  });

  it('says otherwise for a cell that would be closed and was not', () => {
    const table = snapshot();
    const plan = planFunctionPaint(sceneWith(shutLayer(['1,1'])), table)!;

    expect(changesNothing(plan, table)).toBe(false);
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
    expect(changesNothing(plan, table)).toBe(true);
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

describe('painting ground that goes off', () => {
  it('answers with the blocks the layer holds, and what each of them does', () => {
    const spec = {
      ...DEFAULT_FUNCTION_SPEC,
      trigger: { ...DEFAULT_FUNCTION_SPEC.trigger, element: 'HP', amount: '2d6', moment: 'enter' as const },
    };
    const scene = sceneWith(layerOf('trigger', ['1,1', '2,1'], { spec }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.trigger.add.length).toBe(1);
    expect(plan.trigger.add[0]).toMatchObject({ col: 1, row: 1, width: 2, height: 1 });
    expect(plan.trigger.add[0].spec).toMatchObject({ element: 'HP', amount: '2d6', moment: 'enter' });
  });

  it('leaves the ground a table already holds alone where the scene never mentions it', () => {
    const scene = sceneWith(layerOf('mask', ['1,1']));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.trigger).toEqual({ add: [], remove: [] });
  });

  it('takes away ground the scene has stopped holding', () => {
    const held = { col: 3, row: 3, width: 1, height: 1, spec: { ...DEFAULT_FUNCTION_SPEC.trigger } };
    const scene = sceneWith(layerOf('trigger', []));

    const plan = planFunctionPaint(scene, snapshot({ triggerBlocks: [held] }))!;

    expect(plan.trigger.remove).toEqual([held]);
  });
});

describe('painting ground that costs more to cross', () => {
  it('answers with the blocks the layer holds, and what each of them charges', () => {
    const spec = {
      ...DEFAULT_FUNCTION_SPEC,
      moveCost: { blocks: false, halves: false, extraCost: 2, color: '#445566' },
    };
    const scene = sceneWith(layerOf('moveCost', ['1,1', '2,1'], { spec }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.moveCost.add.length).toBe(1);
    expect(plan.moveCost.add[0]).toMatchObject({ col: 1, row: 1, width: 2, height: 1 });
    expect(plan.moveCost.add[0].spec).toEqual({ blocks: false, halves: false, extraCost: 2, color: '#445566' });
  });

  it('leaves the ground a table already holds alone where the scene never mentions it', () => {
    const scene = sceneWith(layerOf('mask', ['1,1']));

    expect(planFunctionPaint(scene, snapshot())!.moveCost).toEqual({ add: [], remove: [] });
  });

  it('takes away ground the scene has stopped holding', () => {
    const held = { col: 3, row: 3, width: 1, height: 1, spec: { ...DEFAULT_FUNCTION_SPEC.moveCost } };
    const scene = sceneWith(layerOf('moveCost', []));

    const plan = planFunctionPaint(scene, snapshot({ moveCostBlocks: [held] }))!;

    expect(plan.moveCost.remove).toEqual([held]);
  });

  it('sorts what one brush painted into the shut cells and the dear blocks', () => {
    const dear = { ...DEFAULT_FUNCTION_SPEC, moveCost: { ...DEFAULT_FUNCTION_SPEC.moveCost, extraCost: 2 } };
    const scene = sceneWith(shutLayer(['1,1']), layerOf('moveCost', ['3,3'], { spec: dear }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.blocked).toEqual(['1,1']);
    expect(plan.moveCost.add).toHaveLength(1);
    expect(plan.moveCost.add[0]).toMatchObject({ col: 3, row: 3 });
  });

  it('leaves the shut cells a table holds alone where the scene never picks the brush up', () => {
    const plan = planFunctionPaint(sceneWith(layerOf('mask', ['1,1'])), snapshot({ blockedCells: ['5,5'] }))!;

    expect(plan.blocked).toEqual(['5,5']);
  });

  it('leaves a stretch that was painted again exactly where it stood', () => {
    const held = { col: 1, row: 1, width: 2, height: 1, spec: { ...DEFAULT_FUNCTION_SPEC.moveCost } };
    const scene = sceneWith(layerOf('moveCost', ['1,1', '2,1']));

    expect(planFunctionPaint(scene, snapshot({ moveCostBlocks: [held] }))!.moveCost).toEqual({
      add: [],
      remove: [],
    });
  });
});

describe('reading painted ground that goes off back in and laying it down again', () => {
  it('leaves the table exactly as it was found', () => {
    const table = snapshot({
      triggerBlocks: [
        {
          col: 2,
          row: 3,
          width: 2,
          height: 1,
          spec: { ...DEFAULT_FUNCTION_SPEC.trigger, name: '落とし穴', element: 'HP', amount: '2d6' },
        },
      ],
    });

    const plan = planFunctionPaint(sceneFromTable(table), table)!;

    expect(changesNothing(plan, table)).toBe(true);
  });
});

describe('painting dangerous ground', () => {
  function hazardLayer(cells: string[], kind: string, element = 'HP'): FunctionLayer {
    return layerOf('hazard', cells, {
      name: 'poison',
      spec: { ...DEFAULT_FUNCTION_SPEC, hazard: { kind, element } },
    });
  }

  it('lays a look, a going and a thing that happens from one stroke', () => {
    const plan = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'briar')), snapshot())!;

    expect(plan.ambience.add).toHaveLength(1);
    expect(plan.moveCost.add).toHaveLength(1);
    expect(plan.trigger.add).toHaveLength(1);
  });

  it('draws the look its kind is drawn as', () => {
    const plan = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'lava')), snapshot())!;

    expect(plan.ambience.add[0].spec.kind).toBe('lava');
  });

  it('lays a fog bank nobody sees through, and leaves the rest see-through', () => {
    const fog = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'fog')), snapshot())!;
    const bog = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'bog')), snapshot())!;

    expect(fog.ambience.add[0].spec.blocksSight).toBe(true);
    expect(bog.ambience.add[0].spec.blocksSight).toBe(false);
  });

  it('takes from the resource the brush was pointed at', () => {
    const plan = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'briar', 'ライフ')), snapshot())!;

    expect(plan.trigger.add[0].spec.element).toBe('ライフ');
    expect(plan.trigger.add[0].spec.amount).toBe('1d6');
  });

  it('lays nothing that happens where the kind takes nothing and marks nobody', () => {
    const plan = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'bog')), snapshot())!;

    expect(plan.trigger.add).toHaveLength(0);
    expect(plan.moveCost.add).toHaveLength(1);
  });

  it('lays what happens even where nothing is taken, for a kind that leaves a mark', () => {
    const plan = planFunctionPaint(sceneWith(hazardLayer(['1,1'], 'ice', '')), snapshot())!;

    expect(plan.trigger.add).toHaveLength(1);
    expect(plan.trigger.add[0].spec.ailment).toBe('転倒');
    expect(plan.trigger.add[0].spec.element).toBe('');
  });

  it('leaves the looks a table already holds alone where the scene never picks the brush up', () => {
    const table = snapshot({
      ambienceBlocks: [
        { col: 0, row: 0, width: 1, height: 1, spec: { kind: 'swamp', color: '', density: 0.6, blocksSight: false } },
      ],
    });

    const plan = planFunctionPaint(sceneWith(layerOf('mask', ['1,1'])), table)!;

    expect(plan.ambience).toEqual({ add: [], remove: [] });
  });

  it('lays dangerous ground beside ground painted one part at a time', () => {
    const dear = { ...DEFAULT_FUNCTION_SPEC, moveCost: { ...DEFAULT_FUNCTION_SPEC.moveCost, extraCost: 2 } };
    const scene = sceneWith(hazardLayer(['1,1'], 'bog'), layerOf('moveCost', ['5,5'], { spec: dear }));

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.moveCost.add).toHaveLength(2);
  });

  it('leaves what it laid exactly where it stood when the same stroke is applied again', () => {
    const scene = sceneWith(hazardLayer(['1,1'], 'briar'));
    const first = planFunctionPaint(scene, snapshot())!;
    const table = snapshot({
      ambienceBlocks: first.ambience.add,
      moveCostBlocks: first.moveCost.add,
      triggerBlocks: first.trigger.add,
    });

    const again = planFunctionPaint(scene, table)!;

    expect(again.ambience).toEqual({ add: [], remove: [] });
    expect(again.moveCost).toEqual({ add: [], remove: [] });
    expect(again.trigger).toEqual({ add: [], remove: [] });
  });
});
