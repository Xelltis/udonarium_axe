import { CellRect, largestRectangles, rectangleChange } from '@axe/domain/tabletop/cell-rectangles';
import {
  CellChange,
  DEFAULT_FUNCTION_SPEC,
  FunctionPaintPlan,
  FunctionSpec,
  MapFunctionRole,
} from '@axe/domain/tabletop/function-paint';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { FunctionLayer, MapScene } from '@axe/features/map-editor/model/scene';

export type { CellChange, FunctionPaintPlan };

/**
 * The cells one role holds across the whole scene.
 *
 * A layer that has been hidden counts all the same. Hiding is a way of getting a look at
 * what is underneath, and a table losing its walls because somebody closed an eye on them
 * would be a poor trade for that.
 */
export function cellsForRole(scene: MapScene, role: MapFunctionRole): string[] {
  const held = new Set<string>();
  for (const layer of scene.layers) {
    if (layer.kind !== 'function') continue;
    if ((layer as FunctionLayer).role !== role) continue;
    for (const key of Object.keys((layer as FunctionLayer).cells)) held.add(key);
  }
  return [...held];
}

/** The settings the first layer of a role carries, or the defaults where it has none. */
export function specForRole(scene: MapScene, role: MapFunctionRole): FunctionSpec {
  for (const layer of scene.layers) {
    if (layer.kind === 'function' && (layer as FunctionLayer).role === role) {
      return (layer as FunctionLayer).spec;
    }
  }
  return { ...DEFAULT_FUNCTION_SPEC };
}

/** The blocks a role's painting comes to, which is what the table is asked to build. */
function blocksFor(scene: MapScene, role: MapFunctionRole): CellRect[] {
  return largestRectangles(cellsForRole(scene, role));
}

/**
 * What laying the painted cells on the table would come to.
 *
 * Nothing is touched here: the answer is a list of what to add and what to take away, so
 * what the editor would do to a table can be read without a table to do it to.
 *
 * A scene on a different grid answers with nothing rather than guessing where its cells
 * would land. The cells were painted against one grid, and there is no honest way to hang
 * them on another.
 */
export function planFunctionPaint(scene: MapScene, table: TableSnapshot): FunctionPaintPlan | null {
  if (scene.cols !== table.cols || scene.rows !== table.rows || scene.gridType !== table.gridType) return null;

  return {
    blocked: cellsForRole(scene, 'moveBlock'),
    terrain: rectangleChange(blocksFor(scene, 'terrain'), table.terrainRects),
    mask: rectangleChange(blocksFor(scene, 'mask'), table.maskRects),
    terrainSpec: specForRole(scene, 'terrain').terrain,
    maskSpec: specForRole(scene, 'mask').mask,
  };
}

/** Whether the plan would change anything at all. */
export function planChangesNothing(plan: FunctionPaintPlan, table: TableSnapshot): boolean {
  const sameBlocked =
    plan.blocked.length === table.blockedCells.length && plan.blocked.every((key) => table.blockedCells.includes(key));
  return (
    sameBlocked &&
    plan.terrain.add.length === 0 &&
    plan.terrain.remove.length === 0 &&
    plan.mask.add.length === 0 &&
    plan.mask.remove.length === 0
  );
}
