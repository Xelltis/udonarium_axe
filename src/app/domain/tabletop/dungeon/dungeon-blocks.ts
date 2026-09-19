import { DungeonPropId } from '@axe/domain/media/texture-catalog';
import { DungeonAtmosphere } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  cellAt,
  DungeonCell,
  DungeonFurnishing,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  maskOfKind,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import { furnishedCells, FURNISHING_SHAPES } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { MapBlock, MapBlocks, MapLight, MapLighting, MapLightKind, MapPaint } from '@axe/domain/tabletop/map-blocks';

export const MAX_MERGE_SPAN = 12;
export interface DungeonBlockOptions {
  placeDoors: boolean;
  placeStairs: boolean;
  /**
   * Whether the walls of the place are too sheer to get up.
   *
   * Stone walls are what a dungeon is made of, so a party that can step over them is walking
   * a floor plan rather than a dungeon. A door shut is part of that wall; opened, it is a way
   * through like any other.
   */
  sheerWalls?: boolean;
  /** How many cells one block may stand for. Hexes take one each; see mergeSpanFor. */
  mergeSpan?: number;
}

export const DEFAULT_BLOCK_OPTIONS: DungeonBlockOptions = { placeDoors: true, placeStairs: true };

const OPEN_LIGHTS: readonly MapLightKind[] = ['campfire', 'brazier', 'stand'];
const WALL_LIGHTS: readonly MapLightKind[] = ['sconce', 'sconce', 'lantern'];
const FIRELIGHT: MapLighting = { wall: WALL_LIGHTS, open: OPEN_LIGHTS };

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

/** The cells of a door leaf or a piece of furniture, one by one, for a board whose cells will not gather into rectangles. */
function cellsOf(rect: DungeonRect): DungeonRect[] {
  const cells: DungeonRect[] = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) cells.push({ x: rect.x + dx, y: rect.y + dy, w: 1, h: 1 });
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
 * A place lit only from its walls gets a light on the wall of every room, big or small, and
 * nothing is put where furniture stands.
 */
function findLights(
  layout: DungeonLayout,
  count: number,
  lighting: MapLighting = FIRELIGHT,
  furnished: ReadonlySet<number> = new Set()
): MapLight[] {
  const lights: MapLight[] = [];
  const taken = new Set<number>(furnished);
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
    const roomy = room.w * room.h >= 30 && open !== null && lighting.open.length > 0;
    const chosen: MapLight | null =
      roomy && open
        ? { ...open, kind: lighting.open[lights.length % lighting.open.length], facing: 0, room: room.index }
        : wall && { ...wall, kind: lighting.wall[lights.length % lighting.wall.length] };
    if (!chosen) continue;
    if (lighting.colors?.length) chosen.color = lighting.colors[lights.length % lighting.colors.length];
    lights.push(chosen);
    taken.add(chosen.y * layout.width + chosen.x);
  }

  return lights;
}

/**
 * The blocks one piece of furniture is built of: one for the whole of it, or one to a cell on a
 * board whose cells will not gather into rectangles, and again for whatever is stacked on it.
 *
 * A run is as long as the cells it covers and as deep as its shape fills; a piece that fills its
 * cells whole takes all of them; anything else fills the same share of its cell both ways.
 */
function furnishingBlocks(piece: DungeonFurnishing, span: number, options: DungeonBlockOptions): MapBlock[] {
  const run = piece.w > 1 || piece.h > 1;
  const lying = piece.w >= piece.h;
  const rects = span > 1 ? [piece] : cellsOf(piece);
  const blocks: MapBlock[] = [];
  let altitude = 0;
  for (const level of [piece.piece, ...(piece.stack ?? [])]) {
    const shape = FURNISHING_SHAPES[level];
    for (const rect of rects) {
      blocks.push({
        kind: shape.skin ? 'prop' : 'wall',
        rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        blocksSight: shape.blocksSight,
        blocksClimb: shape.skin ? false : options.sheerWalls === true,
        locked: false,
        rooms: [],
        skin: shape.skin && {
          side: { kind: 'texture', id: shape.skin.side },
          top: { kind: 'texture', id: shape.skin.top },
        },
        height: shape.height,
        footprint:
          shape.fill >= 1
            ? undefined
            : !run
              ? { w: shape.fill, d: shape.fill }
              : lying
                ? { w: rect.w, d: shape.fill }
                : { w: shape.fill, d: rect.h },
        altitude: altitude || undefined,
        rotate: piece.spin || undefined,
        thing: level,
      });
    }
    altitude += shape.height ?? 0;
  }
  return blocks;
}

function doorPropFor(atmosphere: DungeonAtmosphere): DungeonPropId {
  if (atmosphere.door) return atmosphere.door;
  if (atmosphere.algorithm === 'cave') return 'door_stone';
  return atmosphere.id === 'crypt' ? 'door_iron_grate' : 'door_wood';
}

/**
 * Turns a dungeon layout into what gets built on the table: wall blocks, floor and hazard paint, doors,
 * stairs and room lights.
 *
 * Rock is merged into rectangles up to the merge span, and only walls that border open ground block sight.
 * Doors and stairs are left out when the options say so. No up stair is placed when the party enters by a
 * tunnel mouth, and no down stair when the exit is the entrance. Furniture stands on the floor it was put
 * on, a pillar made of the walls of the place and anything else of its own stuff. Lights go in rooms up to
 * the atmosphere's torch count, lit the way the atmosphere is lit.
 */
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
      blocksClimb: options.sheerWalls === true,
      locked: false,
      rooms: boundary ? roomsBeside(layout, rect) : [],
    });
  }

  // A door stands on the floor rather than instead of it: its slab is a quarter of a cell
  // thick, so leaving its cell unpainted would show bare table beside it and a hole once it opens.
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
      for (const rect of span > 1 ? [hung] : cellsOf(leaf)) {
        blocks.push({
          kind: 'door',
          rect,
          blocksSight: true,
          blocksClimb: options.sheerWalls === true,
          locked: leaf.locked,
          rooms: leaf.rooms,
          across: leaf.across,
          prop: doorPropFor(atmosphere),
          doorStyle: atmosphere.doorStyle,
          doorMirrored: leaf.mirrored,
          disguised: leaf.hidden || undefined,
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

  for (const piece of layout.furnishings ?? []) blocks.push(...furnishingBlocks(piece, span, options));

  // A light is not terrain. Made one, its picture is painted on all four sides of a box and
  // spills out around it; a light source of its own stands in the cell like a piece does.
  const lights = findLights(layout, atmosphere.torches, atmosphere.lighting, furnishedCells(layout));

  return {
    blocks,
    paint,
    ambiences: [],
    torchRooms: lights.map((light) => light.room),
    torchSpots: lights.map((light) => ({ x: light.x, y: light.y })),
    lights,
  };
}
