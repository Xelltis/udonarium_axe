import { CellRect, rectCells } from '@axe/domain/tabletop/cell-rectangles';
import { TerrainBlock, terrainStackLevels } from '@axe/domain/tabletop/function-paint';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import {
  DEFAULT_FUNCTION_SPEC,
  FunctionSpec,
  lookKey,
  MapFunctionRole,
} from '@axe/features/map-editor/model/function-layer';
import {
  createScene,
  FunctionLayer,
  ImageLayer,
  MapScene,
  newId,
  sceneHeightPx,
  sceneWidthPx,
} from '@axe/features/map-editor/model/scene';

export type { TableSnapshot };

export const IMPORTED_FLOOR_LAYER_NAME = 'floor';

function functionLayer(
  role: MapFunctionRole,
  name: string,
  cells: readonly string[],
  spec: FunctionSpec = DEFAULT_FUNCTION_SPEC
): FunctionLayer {
  const held: Record<string, true> = {};
  for (const key of cells) held[key] = true;
  return {
    id: newId(),
    kind: 'function',
    name,
    visible: true,
    locked: false,
    opacity: 1,
    role,
    cells: held,
    spec: { ...spec },
  };
}

/**
 * The blocks gathered into one layer per look.
 *
 * Two walls of different stone are two layers. Poured into one they would come back out
 * wearing whichever look happened to be read first, and half the table would change its
 * face the next time the painting was laid.
 */
function layersByLook<T extends CellRect & { spec: unknown }>(
  blocks: readonly T[],
  role: MapFunctionRole,
  name: string,
  specOf: (block: T) => FunctionSpec
): FunctionLayer[] {
  const grouped = new Map<string, { spec: FunctionSpec; cells: string[] }>();
  for (const block of blocks) {
    const key = lookKey(block.spec);
    const held = grouped.get(key) ?? { spec: specOf(block), cells: [] };
    held.cells.push(...rectCells(block));
    grouped.set(key, held);
  }
  return [...grouped.values()].map((held, index) =>
    functionLayer(role, grouped.size > 1 ? `${name} ${index + 1}` : name, held.cells, held.spec)
  );
}

/**
 * The walls gathered into one layer per look, and per storey.
 *
 * A wall standing on another is read as starting where the one below leaves off, and the
 * height it was found at is taken off what the layer carries. Laying the painting back down
 * puts that height on again, so a table read in and written straight back out is unchanged
 * while a layer newly painted over another still climbs on top of it.
 */
function terrainLayers(blocks: readonly TerrainBlock[], cellPx: number, name: string): FunctionLayer[] {
  const levels = terrainStackLevels(blocks);
  const grouped = new Map<string, { spec: FunctionSpec; level: number; cells: string[] }>();
  blocks.forEach((block, index) => {
    const level = levels[index];
    const base = level === 0 ? block.spec : { ...block.spec, altitude: block.spec.altitude - level * cellPx };
    const key = `${level}|${lookKey(base)}`;
    const held = grouped.get(key) ?? { spec: { ...DEFAULT_FUNCTION_SPEC, terrain: base }, level, cells: [] };
    held.cells.push(...rectCells(block));
    grouped.set(key, held);
  });
  const storeys = [...grouped.values()].sort((a, b) => a.level - b.level);
  return storeys.map((held, index) =>
    functionLayer('terrain', storeys.length > 1 ? `${name} ${index + 1}` : name, held.cells, held.spec)
  );
}

/**
 * The scene a table comes into the editor as.
 *
 * The floor arrives as a picture rather than as the shapes that made it: it was baked into
 * one the moment it was laid on the table, and there is nothing to take back apart. It is
 * locked, so that painting over the map cannot drag the map itself about.
 *
 * Everything standing on the table comes back as cells, however it got there, and each block
 * carries the whole of what it looks like so that laying it down again puts it back as it was.
 */
export function sceneFromTable(table: TableSnapshot): MapScene {
  const scene = createScene(
    Math.max(1, Math.floor(table.cols)),
    Math.max(1, Math.floor(table.rows)),
    Math.max(1, Math.floor(table.cellPx)),
    table.gridType
  );

  // A picture is placed by its middle rather than its corner, so a floor put at the origin
  // would hang off the top left with only a quarter of it over the map.
  const width = sceneWidthPx(scene);
  const height = sceneHeightPx(scene);

  const layers: MapScene['layers'] = [];
  if (table.floorImageIdentifier.length > 0) {
    const floor: ImageLayer = {
      id: newId(),
      kind: 'image',
      name: IMPORTED_FLOOR_LAYER_NAME,
      visible: true,
      locked: true,
      opacity: 1,
      items: [
        {
          id: newId(),
          imageIdentifier: table.floorImageIdentifier,
          x: width / 2,
          y: height / 2,
          w: width,
          h: height,
          rotation: 0,
          opacity: 1,
        },
      ],
    };
    layers.push(floor);
  }

  layers.push(
    ...layersByLook(table.maskBlocks, 'mask', 'mask', (block) => ({ ...DEFAULT_FUNCTION_SPEC, mask: block.spec }))
  );
  layers.push(...terrainLayers(table.terrainBlocks, table.cellPx, 'terrain'));
  layers.push(
    ...layersByLook(table.triggerBlocks, 'trigger', 'event', (block) => ({
      ...DEFAULT_FUNCTION_SPEC,
      trigger: block.spec,
    }))
  );
  if (table.blockedCells.length > 0) layers.push(functionLayer('moveBlock', 'no entry', table.blockedCells));

  return { ...scene, layers };
}
