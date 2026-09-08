import { parseCellKey } from '@axe/domain/tabletop/cell-key';
import { CellRect, largestRectangles } from '@axe/domain/tabletop/cell-rectangles';
import {
  BlockChange,
  blockChange,
  FunctionPaintPlan,
  MapFunctionRole,
  MaskBlock,
  TerrainBlock,
  TriggerBlock,
} from '@axe/domain/tabletop/function-paint';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
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

/**
 * The blocks a role's painting comes to, layer by layer.
 *
 * Each layer is cut on its own and keeps the look it carries, so two walls of different
 * stone stay two walls of different stone rather than collapsing into whichever came first.
 *
 * Layers are walked from the bottom up, and a cell already built on carries the next layer
 * that high: paint a wall over a wall and it becomes a second storey rather than the two
 * standing inside one another. Cells of a layer that start at different heights are cut
 * apart, since one block can only begin at one height.
 */
/**
 * The cells of a layer, gathered into as few blocks as will stand for them.
 *
 * On squares a run of cells is a rectangle and one block stands for a dozen. A terrain on a
 * hex board is drawn as a flower of `min(width, depth)` cells across, so a block standing for
 * a run of five would paint one and leave four bare: there, every cell is its own block.
 */
function blockRectsOf(cells: readonly string[], hex: boolean): CellRect[] {
  if (!hex) return largestRectangles(cells);
  const rects: CellRect[] = [];
  for (const key of cells) {
    const cell = parseCellKey(key);
    if (cell) rects.push({ col: cell.col, row: cell.row, width: 1, height: 1 });
  }
  return rects;
}

function terrainBlocksOf(scene: MapScene, cellPx: number, hex: boolean): TerrainBlock[] {
  const blocks: TerrainBlock[] = [];
  const standing = new Map<string, number>();
  for (const layer of functionLayersOf(scene, 'terrain')) {
    const spec = layer.spec.terrain;
    const cells = Object.keys(layer.cells);
    const byLevel = new Map<number, string[]>();
    for (const key of cells) {
      const level = standing.get(key) ?? 0;
      const group = byLevel.get(level);
      if (group) group.push(key);
      else byLevel.set(level, [key]);
    }
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const raised = level === 0 ? spec : { ...spec, altitude: spec.altitude + level * cellPx };
      for (const rect of blockRectsOf(byLevel.get(level) ?? [], hex)) {
        blocks.push({ ...rect, spec: raised });
      }
    }
    const tall = Math.max(0, Math.round(spec.height));
    for (const key of cells) standing.set(key, (standing.get(key) ?? 0) + tall);
  }
  return blocks;
}

function maskBlocksOf(scene: MapScene, hex: boolean): MaskBlock[] {
  const blocks: MaskBlock[] = [];
  for (const layer of functionLayersOf(scene, 'mask')) {
    for (const rect of blockRectsOf(Object.keys(layer.cells), hex)) {
      blocks.push({ ...rect, spec: layer.spec.mask });
    }
  }
  return blocks;
}

function triggerBlocksOf(scene: MapScene, hex: boolean): TriggerBlock[] {
  const blocks: TriggerBlock[] = [];
  for (const layer of functionLayersOf(scene, 'trigger')) {
    for (const rect of blockRectsOf(Object.keys(layer.cells), hex)) {
      blocks.push({ ...rect, spec: layer.spec.trigger });
    }
  }
  return blocks;
}

/**
 * Whether the scene says anything at all about what the table's cells do.
 *
 * A plan built from a scene holding none of these is a plan to take away everything the table
 * has, which is the right answer for somebody who deleted their layers and the wrong one for
 * somebody who only ever drew a floor.
 */
export function sceneCarriesFunctions(scene: MapScene, role?: MapFunctionRole): boolean {
  return scene.layers.some(
    (layer) => layer.kind === 'function' && (role === undefined || (layer as FunctionLayer).role === role)
  );
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
  const hex = isHexGrid(table.gridType);

  // A role the scene has no layer for is a role it has said nothing about, and saying nothing
  // is not the same as saying none. Emptying a layer still speaks — the layer is there — but a
  // scene that only ever had walls painted on it must not take the table's masks away with them.
  return {
    blocked: sceneCarriesFunctions(scene, 'moveBlock') ? cellsForRole(scene, 'moveBlock') : [...table.blockedCells],
    terrain: sceneCarriesFunctions(scene, 'terrain')
      ? blockChange(terrainBlocksOf(scene, table.cellPx, hex), table.terrainBlocks)
      : { add: [], remove: [] },
    mask: sceneCarriesFunctions(scene, 'mask')
      ? blockChange(maskBlocksOf(scene, hex), table.maskBlocks)
      : { add: [], remove: [] },
    trigger: sceneCarriesFunctions(scene, 'trigger')
      ? blockChange(triggerBlocksOf(scene, hex), table.triggerBlocks)
      : { add: [], remove: [] },
  };
}
