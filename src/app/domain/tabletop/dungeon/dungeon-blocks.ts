import { DungeonPropId } from '@axe/domain/media/texture-catalog';
import { DungeonAtmosphere, WaterwayPlan } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  cellAt,
  DungeonCell,
  DungeonFurnishing,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  DungeonSpout,
  maskOfKind,
  WaterwayKind,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import {
  DOOR_KIND_STYLES,
  DOOR_MODELS,
  type DoorKind,
  doorModelTurn,
  DOORS_SEEN_OVER,
  FURNISHING_MODELS,
  FURNISHING_SEGMENT_MODELS,
} from '@axe/domain/tabletop/dungeon/furnishing-models';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import { furnishedCells, FURNISHING_SHAPES } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { awayFrom, reliefOfWaterways } from '@axe/domain/tabletop/dungeon/sewer-channels';
import { areasOver, watersInLots } from '@axe/domain/tabletop/field/water-areas';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { blockLiftsTo } from '@axe/domain/tabletop/ground/block-lift';
import { HAZARD_PRESETS } from '@axe/domain/tabletop/hazard-presets';
import {
  MapAmbience,
  MapBlock,
  MapBlocks,
  MapHarm,
  MapLight,
  MapLighting,
  MapLightKind,
  MapPaint,
  MapSlowGround,
} from '@axe/domain/tabletop/map-blocks';

/** How thick the look over a pool of dangerous ground is laid. */
const HAZARD_AMBIENCE_DENSITY = 0.5;

/** How tall a pipe over a basin stands, as a share of the walls of the place. */
const SPOUT_HEIGHT_SHARE = 0.6;

/** How far a pipe over a basin reaches out from the bank it stands against, in cells. */
const SPOUT_DEPTH = 0.4;
/** How tall the bundled model of a pipe was made, in cells, which its block is made as tall as so that the model fills its cell. */
const SPOUT_MODEL_HEIGHT = 2.005;

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
  /**
   * Whether the furniture is stood as the bundled 3D models, as a table drawn on a canvas draws them.
   * A piece built of one block a cell, as on a board of hexes, is built of its blocks all the same.
   */
  models?: boolean;
  /** The kind of door hung in every doorway, in place of the one the place hangs. Left out, the place's own. */
  door?: DoorKind;
  /** What shape the cells are, which decides how the water is gathered into areas. Left out, squares. */
  gridType?: GridType;
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
 *
 * Where models are asked for, a piece stands as its model when it is one block; a run whose model is
 * one cell of it, as a counter's is, is built of a block to a cell, each standing as that model.
 * A piece whose model is made to the whole of its cell, as a part of a pipe is, takes the whole cell
 * as its model, so that it meets the part in the next cell. A piece made to take several cells, as a
 * bed is, is one block on every board, standing as its model over all of them. A piece that faces a
 * way has its model turned that way; a run lying down the board has its model turned a quarter. A
 * piece that lies on the floor as a picture is built as its top alone, walked over. On hexes, a piece
 * of several cells stands on the cell the furnisher names (`DungeonFurnishing.standsOn`).
 */
export function furnishingBlocks(
  piece: DungeonFurnishing,
  span: number,
  options: Pick<DungeonBlockOptions, 'models' | 'sheerWalls'>
): MapBlock[] {
  const run = piece.w > 1 || piece.h > 1;
  const lying = piece.w >= piece.h;
  const segmented = options.models === true && span > 1 && run && FURNISHING_SEGMENT_MODELS.includes(piece.piece);
  const made = options.models === true && FURNISHING_SHAPES[piece.piece].cells !== undefined;
  const rects = (span > 1 && !segmented) || made ? [piece] : cellsOf(piece);
  const turn = piece.facing ?? ((segmented ? !lying : piece.h > piece.w) ? 90 : 0);
  const standsOn = made && run ? piece.standsOn : undefined;
  const blocks: MapBlock[] = [];
  let altitude = 0;
  for (const level of [piece.piece, ...(piece.stack ?? [])]) {
    const shape = FURNISHING_SHAPES[level];
    const model = options.models && (rects.length === 1 || segmented) ? FURNISHING_MODELS[level] : undefined;
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
          shape.fill >= 1 || (model && shape.whole)
            ? undefined
            : !run
              ? { w: shape.fill, d: shape.fill }
              : lying
                ? { w: rect.w, d: shape.fill }
                : { w: shape.fill, d: rect.h },
        altitude: altitude || undefined,
        rotate: piece.spin || undefined,
        thing: level,
        ...(standsOn ? { standsOn } : {}),
        ...(shape.floor ? { floorOnly: true } : {}),
        ...(model ? { model, ...(turn ? { modelTurn: turn } : {}) } : {}),
      });
    }
    altitude += shape.height ?? 0;
  }
  return blocks;
}

/**
 * The water run through a place, as areas that never overlap: one lot for each way a channel runs and
 * for each kind of still water, each gathered into as few areas as cover it on the board's grid. The
 * floor under water is the board, so its surface stands as high over the board as its kind of water does.
 */
function watersOf(layout: DungeonLayout, plan: WaterwayPlan, gridType: GridType): MapAmbience[] {
  const waterway = layout.waterway;
  if (!waterway) return [];
  const wet: { index: number; lot: string }[] = [];
  for (let index = 0; index < waterway.kinds.length; index++) {
    const kind = waterway.kinds[index];
    if (kind === WaterwayKind.Dry || layout.cells[index] !== DungeonCell.Water) continue;
    wet.push({ index, lot: `${kind}:${kind === WaterwayKind.Basin ? -1 : waterway.flow[index]}` });
  }
  return watersInLots(wet, layout.width, layout.height, gridType, (lot) => {
    const [kind, flow] = lot.split(':').map(Number);
    const level = kind === WaterwayKind.Channel ? plan.channel : plan.basin;
    const runs = flow >= 0;
    return {
      surface: level.surface,
      color: plan.look.color,
      turbidity: plan.look.turbidity,
      dirt: plan.look.dirt,
      leaves: 0,
      ice: 0,
      flowSpeed: runs ? plan.flowSpeed : 0,
      flowDirection: runs ? flow : 0,
    };
  });
}

/** What wading the water of a place costs and does, laid over as few areas as cover all of it. */
function wadingOf(
  layout: DungeonLayout,
  plan: WaterwayPlan,
  gridType: GridType
): { slows: MapSlowGround[]; harms: MapHarm[] } {
  const { extraCost, amount, ailment, moment, color, thing } = plan.wading;
  const slows: MapSlowGround[] = [];
  const harms: MapHarm[] = [];
  for (const rect of areasOver(maskOfKind(layout, [DungeonCell.Water]), layout.width, layout.height, gridType)) {
    if (extraCost > 0) slows.push({ rect, extraCost, color });
    if (amount.length > 0 || ailment.length > 0) harms.push({ rect, thing, amount, ailment, moment, color });
  }
  return { slows, harms };
}

/**
 * The pipe that pours into a basin, stood against the wall it comes out of, in nobody's way and
 * hiding nothing. As the bundled model it fills its cell, its back to the wall and its mouth turned
 * out over the water. Otherwise it is a box as wide as its cell and a little deep, set back against
 * the wall, as high as most of the walls.
 *
 * The water is let in under it, and what stands on the ground is let down to the lowest of it under
 * its foot, so the pipe is lifted by as much as that lets it down, to stand as the walkway does:
 * `liftOf` answers how far, for the foot it stands on.
 */
function spoutBlock(
  spout: DungeonSpout,
  wallHeight: number,
  models: boolean,
  liftOf: ReturnType<typeof blockLiftsTo>
): MapBlock {
  const [ax, ay] = awayFrom(spout.facing);
  const rect = { x: spout.x, y: spout.y, w: 1, h: 1 };
  const block = {
    kind: 'prop' as const,
    rect,
    blocksSight: false,
    blocksClimb: false,
    locked: false,
    rooms: [],
    skin: {
      side: { kind: 'texture' as const, id: 'wall_metal' as const },
      top: { kind: 'texture' as const, id: 'wall_metal' as const },
    },
    thing: 'drainPipe',
  };
  if (models) {
    return {
      ...block,
      height: SPOUT_MODEL_HEIGHT,
      altitude: liftOf({ rect }),
      model: 'prop_drainPipe',
      modelTurn: (spout.facing + 270) % 360,
    };
  }
  const back = (1 - SPOUT_DEPTH) / 2;
  const footprint = ax === 0 ? { w: 1, d: SPOUT_DEPTH } : { w: SPOUT_DEPTH, d: 1 };
  const offset = { x: ax === 0 ? 0 : -ax * back, y: ay === 0 ? 0 : -ay * back };
  return {
    ...block,
    height: wallHeight * SPOUT_HEIGHT_SHARE,
    altitude: liftOf({ rect, offset, footprint }),
    footprint,
    offset,
  };
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
 *
 * The floor under water is painted as any other floor is. The water over it is laid as areas of water,
 * and as ground that costs something to wade and harms whoever is caught in it, both gathered on the
 * board's grid; a pipe stands over each basin where one pours into it.
 */
export function layoutToBlocks(
  layout: DungeonLayout,
  atmosphere: DungeonAtmosphere,
  options: DungeonBlockOptions = DEFAULT_BLOCK_OPTIONS
): MapBlocks {
  const blocks: MapBlock[] = [];
  const paint: MapPaint[] = [];
  const ambiences: MapAmbience[] = [];
  const span = options.mergeSpan ?? MAX_MERGE_SPAN;

  // A round place is no wider than its round: what lies outside it is no part of it, and stands bare.
  const rockMask = maskOfKind(layout, [DungeonCell.Rock]);
  layout.outside?.forEach((outside, cell) => {
    if (outside) rockMask[cell] = 0;
  });
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
  const floorMask = maskOfKind(layout, [DungeonCell.Room, DungeonCell.Corridor, DungeonCell.Door, DungeonCell.Water]);
  for (const rect of mergeMaskToRects(floorMask, layout.width, layout.height, span)) {
    paint.push({ kind: 'floor', rect });
  }

  const hazardMask = maskOfKind(layout, [DungeonCell.Hazard]);
  const hazardKind = atmosphere.cave?.hazardKind;
  for (const rect of mergeMaskToRects(hazardMask, layout.width, layout.height, span)) {
    paint.push({ kind: 'hazard', rect, hazard: hazardKind });
    // The look goes over the patch rather than into the picture the table wears: a pool that
    // shimmers is what tells a party the floor there is not floor.
    if (hazardKind) {
      const look = HAZARD_PRESETS[hazardKind].ambience;
      ambiences.push({ rect, kind: look, density: HAZARD_AMBIENCE_DENSITY, name: look });
    }
  }

  if (options.placeDoors) {
    const prop = options.door ?? doorPropFor(atmosphere);
    const doorStyle = options.door ? DOOR_KIND_STYLES[options.door] : atmosphere.doorStyle;
    for (const leaf of layout.doorLeaves) {
      const hung = { x: leaf.x, y: leaf.y, w: leaf.w, h: leaf.h };
      // A door dressed as its wall stays its wall's faces: a model of a door would give it away.
      const model = options.models && !leaf.hidden ? DOOR_MODELS[prop] : undefined;
      for (const rect of span > 1 ? [hung] : cellsOf(leaf)) {
        blocks.push({
          kind: 'door',
          rect,
          blocksSight: leaf.hidden || !DOORS_SEEN_OVER.includes(prop),
          blocksClimb: options.sheerWalls === true,
          locked: leaf.locked,
          rooms: leaf.rooms,
          across: leaf.across,
          prop,
          doorStyle,
          doorMirrored: leaf.mirrored,
          disguised: leaf.hidden || undefined,
          ...(model ? { model, modelTurn: doorModelTurn(leaf.across, leaf.mirrored) || undefined } : {}),
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
        prop: atmosphere.stairs?.up ?? 'stair_up',
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
        prop: atmosphere.stairs?.down ?? 'stair_down',
      });
    }
  }

  for (const piece of layout.furnishings ?? []) blocks.push(...furnishingBlocks(piece, span, options));

  const waterways = atmosphere.waterways;
  const gridType = options.gridType ?? GridType.SQUARE;
  const wading = waterways ? wadingOf(layout, waterways, gridType) : { slows: [], harms: [] };
  if (waterways) {
    ambiences.push(...watersOf(layout, waterways, gridType));
    const liftOf = blockLiftsTo(
      waterways.walkway,
      layout.relief ?? reliefOfWaterways(layout, waterways, gridType),
      gridType
    );
    for (const spout of layout.spouts ?? []) {
      if (cellAt(layout, spout.x, spout.y) !== DungeonCell.Water) continue;
      blocks.push(spoutBlock(spout, atmosphere.wallHeight, options.models === true, liftOf));
    }
  }

  // A light is not terrain. Made one, its picture is painted on all four sides of a box and
  // spills out around it; a light source of its own stands in the cell like a piece does.
  const lights = findLights(layout, atmosphere.torches, atmosphere.lighting, furnishedCells(layout));

  return {
    blocks,
    paint,
    ambiences,
    ...(wading.slows.length > 0 ? { slows: wading.slows } : {}),
    ...(wading.harms.length > 0 ? { harms: wading.harms } : {}),
    traps: (layout.traps ?? []).map((trap) => ({ x: trap.x, y: trap.y, kind: trap.kind })),
    torchRooms: lights.map((light) => light.room),
    torchSpots: lights.map((light) => ({ x: light.x, y: light.y })),
    lights,
  };
}
