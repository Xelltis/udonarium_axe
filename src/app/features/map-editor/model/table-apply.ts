import { largestRectangles } from '@axe/domain/tabletop/cell-rectangles';
import {
  BlockChange,
  blockChange,
  DEFAULT_FUNCTION_SPEC,
  FunctionPaintPlan,
  FunctionSpec,
  MapFunctionRole,
  MaskBlock,
  TerrainBlock,
} from '@axe/domain/tabletop/function-paint';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { FunctionLayer, MapScene } from '@axe/features/map-editor/model/scene';

export type { BlockChange, FunctionPaintPlan };

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

/**
 * The blocks a role's painting comes to, layer by layer.
 *
 * Each layer is cut on its own and keeps the look it carries, so two walls of different
 * stone stay two walls of different stone rather than collapsing into whichever came first.
 */
function terrainBlocksOf(scene: MapScene): TerrainBlock[] {
  const blocks: TerrainBlock[] = [];
  for (const layer of functionLayersOf(scene, 'terrain')) {
    for (const rect of largestRectangles(Object.keys(layer.cells))) {
      blocks.push({ ...rect, spec: layer.spec.terrain });
    }
  }
  return blocks;
}

function maskBlocksOf(scene: MapScene): MaskBlock[] {
  const blocks: MaskBlock[] = [];
  for (const layer of functionLayersOf(scene, 'mask')) {
    for (const rect of largestRectangles(Object.keys(layer.cells))) {
      blocks.push({ ...rect, spec: layer.spec.mask });
    }
  }
  return blocks;
}

function functionLayersOf(scene: MapScene, role: MapFunctionRole): FunctionLayer[] {
  return scene.layers.filter(
    (layer): layer is FunctionLayer => layer.kind === 'function' && (layer as FunctionLayer).role === role
  );
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
    terrain: blockChange(terrainBlocksOf(scene), table.terrainBlocks),
    mask: blockChange(maskBlocksOf(scene), table.maskBlocks),
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
