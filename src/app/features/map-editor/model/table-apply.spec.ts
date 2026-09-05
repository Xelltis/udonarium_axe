import { GridType } from '@axe/domain/tabletop/game-table';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { DEFAULT_FUNCTION_SPEC, MapFunctionRole } from '@axe/features/map-editor/model/function-layer';
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

function snapshot(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    cols: 10,
    rows: 8,
    cellPx: 50,
    gridType: GridType.SQUARE,
    floorImageIdentifier: '',
    blockedCells: [],
    terrainCells: [],
    maskCells: [],
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
      snapshot({ terrainCells: ['1,0', '2,0'] })
    )!;

    expect(plan.terrain.add).toEqual(['0,0']);
    expect(plan.terrain.remove).toEqual(['2,0']);
  });

  it('leaves a cell that was already there alone', () => {
    const plan = planFunctionPaint(sceneWith(layerOf('mask', ['4,4'])), snapshot({ maskCells: ['4,4'] }))!;

    expect(plan.mask.add).toEqual([]);
    expect(plan.mask.remove).toEqual([]);
  });

  it('takes each role its own settings', () => {
    const scene = sceneWith(
      layerOf('terrain', ['0,0'], { spec: { ...DEFAULT_FUNCTION_SPEC, terrainHeight: 5 } }),
      layerOf('mask', ['1,1'], { spec: { ...DEFAULT_FUNCTION_SPEC, maskColor: '#abcdef' } })
    );

    const plan = planFunctionPaint(scene, snapshot())!;

    expect(plan.terrainSpec.terrainHeight).toBe(5);
    expect(plan.maskSpec.maskColor).toBe('#abcdef');
  });

  it('refuses a scene painted against a different grid', () => {
    expect(planFunctionPaint(sceneWith(), snapshot({ cols: 12 }))).toBeNull();
    expect(planFunctionPaint(sceneWith(), snapshot({ rows: 9 }))).toBeNull();
    expect(planFunctionPaint(sceneWith(), snapshot({ gridType: GridType.HEX_VERTICAL }))).toBeNull();
  });

  it('takes away everything the editor painted where the scene has nothing left', () => {
    const plan = planFunctionPaint(sceneWith(), snapshot({ terrainCells: ['0,0'], maskCells: ['1,1'] }))!;

    expect(plan.terrain.remove).toEqual(['0,0']);
    expect(plan.mask.remove).toEqual(['1,1']);
    expect(plan.blocked).toEqual([]);
  });
});

describe('planChangesNothing()', () => {
  it('says so where the table already matches', () => {
    const table = snapshot({ blockedCells: ['1,1'], terrainCells: ['2,2'] });
    const plan = planFunctionPaint(sceneWith(layerOf('moveBlock', ['1,1']), layerOf('terrain', ['2,2'])), table)!;

    expect(planChangesNothing(plan, table)).toBe(true);
  });

  it('says otherwise for a cell that would be closed and was not', () => {
    const table = snapshot();
    const plan = planFunctionPaint(sceneWith(layerOf('moveBlock', ['1,1'])), table)!;

    expect(planChangesNothing(plan, table)).toBe(false);
  });
});
