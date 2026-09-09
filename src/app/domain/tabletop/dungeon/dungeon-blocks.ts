import { DungeonPropId } from '@axe/domain/media/texture-catalog';
import { DungeonAtmosphere } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  cellAt,
  DungeonCell,
  DungeonDoorLeaf,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  maskOfKind,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import { MapBlock, MapBlocks, MapLight, MapLightKind, MapPaint } from '@axe/domain/tabletop/map-blocks';

export const MAX_MERGE_SPAN = 12;
export interface DungeonBlockOptions {
  placeDoors: boolean;
  placeStairs: boolean;
  /** How many cells one block may stand for. Hexes take one each; see mergeSpanFor. */
  mergeSpan?: number;
}

export const DEFAULT_BLOCK_OPTIONS: DungeonBlockOptions = { placeDoors: true, placeStairs: true };

const OPEN_LIGHTS: readonly MapLightKind[] = ['campfire', 'brazier', 'stand'];
const WALL_LIGHTS: readonly MapLightKind[] = ['sconce', 'sconce', 'lantern'];

/** The four ways a light can look, with the heading that points away from that neighbour. */
/**
 * Where the stone lies, and which way a bracket fixed to it throws.
 *
 * The angle is the one everything else on the table measures: the cosine along x, the sine
 * along y, with y running down the board. Stone to the north is therefore thrown at ninety.
 */
const FACINGS: readonly [number, number, number][] = [
  [0, -1, 90],
  [0, 1, 270],
  [-1, 0, 0],
  [1, 0, 180],
];

/** The cells of a leaf, one by one, for a board whose cells will not gather into rectangles. */
function leafCells(leaf: DungeonDoorLeaf): DungeonRect[] {
  const cells: DungeonRect[] = [];
  for (let dy = 0; dy < leaf.h; dy++) {
    for (let dx = 0; dx < leaf.w; dx++) cells.push({ x: leaf.x + dx, y: leaf.y + dy, w: 1, h: 1 });
  }
  return cells;
}

function touchesOpenCell(layout: DungeonLayout, rect: DungeonRect): boolean {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const x = rect.x + dx;
      const y = rect.y + dy;
      const open =
        cellAt(layout, x + 1, y) !== DungeonCell.Rock ||
        cellAt(layout, x - 1, y) !== DungeonCell.Rock ||
        cellAt(layout, x, y + 1) !== DungeonCell.Rock ||
        cellAt(layout, x, y - 1) !== DungeonCell.Rock;
      if (open) return true;
    }
  }
  return false;
}

function roomsBeside(layout: DungeonLayout, rect: DungeonRect): number[] {
  const found = new Set<number>();
  for (const room of layout.rooms) {
    const near =
      rect.x <= room.x + room.w && room.x <= rect.x + rect.w && rect.y <= room.y + room.h && room.y <= rect.y + rect.h;
    if (near) found.add(room.index);
  }
  return [...found].sort((left, right) => left - right);
}

/**
 * Where to stand a light in each room, and what kind of light it should be.
 *
 * A sconce goes up against the stone and throws its light away from the wall; a fire stands
 * out in the open where there is room around it. Rooms lit all the same way look staged.
 */
function findLights(layout: DungeonLayout, count: number): MapLight[] {
  const lights: MapLight[] = [];
  const taken = new Set<number>();
  if (count < 1) return lights;

  for (const room of layout.rooms) {
    if (lights.length >= count) break;

    let wall: MapLight | null = null;
    let open: DungeonPoint | null = null;

    for (let dy = 0; dy < room.h && (!wall || !open); dy++) {
      for (let dx = 0; dx < room.w && (!wall || !open); dx++) {
        const x = room.x + dx;
        const y = room.y + dy;
        if (cellAt(layout, x, y) !== DungeonCell.Room) continue;
        // Two rooms sharing ground would otherwise stand two lights on the one cell.
        if (taken.has(y * layout.width + x)) continue;

        const stone = FACINGS.find(([ox, oy]) => cellAt(layout, x + ox, y + oy) === DungeonCell.Rock);
        if (stone && !wall) {
          // Facing is measured away from the stone the bracket is fixed to.
          wall = { x, y, kind: 'sconce', facing: stone[2], room: room.index };
        }
        const clear = FACINGS.every(([ox, oy]) => cellAt(layout, x + ox, y + oy) !== DungeonCell.Rock);
        if (clear && !open) open = { x, y };
      }
    }

    // A room with space to stand round a fire gets one; the cramped ones get something by the wall.
    const roomy = room.w * room.h >= 30 && open !== null;
    const chosen: MapLight | null =
      roomy && open
        ? { ...open, kind: OPEN_LIGHTS[lights.length % OPEN_LIGHTS.length], facing: 0, room: room.index }
        : wall && { ...wall, kind: WALL_LIGHTS[lights.length % WALL_LIGHTS.length] };
    if (!chosen) continue;
    lights.push(chosen);
    taken.add(chosen.y * layout.width + chosen.x);
  }

  return lights;
}

function doorPropFor(atmosphere: DungeonAtmosphere): DungeonPropId {
  if (atmosphere.algorithm === 'cave') return 'door_stone';
  return atmosphere.id === 'crypt' ? 'door_iron_grate' : 'door_wood';
}

export function layoutToBlocks(
  layout: DungeonLayout,
  atmosphere: DungeonAtmosphere,
  options: DungeonBlockOptions = DEFAULT_BLOCK_OPTIONS
): MapBlocks {
  const blocks: MapBlock[] = [];
  const paint: MapPaint[] = [];
  const span = options.mergeSpan ?? MAX_MERGE_SPAN;

  const rockMask = maskOfKind(layout, [DungeonCell.Rock]);
  for (const rect of mergeMaskToRects(rockMask, layout.width, layout.height, span)) {
    // Rock buried behind more rock cannot be seen past, so it need not be tested against.
    const boundary = touchesOpenCell(layout, rect);
    blocks.push({
      kind: 'wall',
      rect,
      blocksSight: boundary,
      locked: false,
      rooms: boundary ? roomsBeside(layout, rect) : [],
    });
  }

  // A door stands on the floor rather than instead of it: its slab is a quarter of a cell
  // thick, so leaving its cell unpainted showed bare table beside it and a hole once it opened.
  const floorMask = maskOfKind(layout, [DungeonCell.Room, DungeonCell.Corridor, DungeonCell.Door]);
  for (const rect of mergeMaskToRects(floorMask, layout.width, layout.height, span)) {
    paint.push({ kind: 'floor', rect });
  }

  const hazardMask = maskOfKind(layout, [DungeonCell.Hazard]);
  for (const rect of mergeMaskToRects(hazardMask, layout.width, layout.height, span)) {
    paint.push({ kind: 'hazard', rect });
  }

  if (options.placeDoors) {
    for (const leaf of layout.doorLeaves) {
      const hung = { x: leaf.x, y: leaf.y, w: leaf.w, h: leaf.h };
      for (const rect of span > 1 ? [hung] : leafCells(leaf)) {
        blocks.push({
          kind: 'door',
          rect,
          blocksSight: true,
          locked: leaf.locked,
          rooms: leaf.rooms,
          across: leaf.across,
          prop: doorPropFor(atmosphere),
          doorStyle: atmosphere.doorStyle,
          doorMirrored: leaf.mirrored,
        });
      }
    }
  }

  if (options.placeStairs) {
    // Walked in through a break in the outer wall, the break itself is the way in; a stair
    // drawn on top of it would say the party climbed down into their own doorway.
    if (!layout.mouth) {
      blocks.push({
        kind: 'stairUp',
        rect: { x: layout.entrance.x, y: layout.entrance.y, w: 1, h: 1 },
        blocksSight: false,
        locked: false,
        rooms: [0],
        prop: 'stair_up',
      });
    }
    const sameSpot = layout.exit.x === layout.entrance.x && layout.exit.y === layout.entrance.y;
    if (!sameSpot) {
      blocks.push({
        kind: 'stairDown',
        rect: { x: layout.exit.x, y: layout.exit.y, w: 1, h: 1 },
        blocksSight: false,
        locked: false,
        rooms: [],
        prop: 'stair_down',
      });
    }
  }

  // A light is not terrain. Made one, its picture is painted on all four sides of a box and
  // spills out around it; a light source of its own stands in the cell like a piece does.
  const lights = findLights(layout, atmosphere.torches);

  return {
    blocks,
    paint,
    ambiences: [],
    torchRooms: lights.map((light) => light.room),
    torchSpots: lights.map((light) => ({ x: light.x, y: light.y })),
    lights,
  };
}
