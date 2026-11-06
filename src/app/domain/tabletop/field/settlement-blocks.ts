import type { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import {
  DOOR_KIND_STYLES,
  DOOR_MODELS,
  type DoorKind,
  doorModelTurn,
} from '@axe/domain/tabletop/dungeon/furnishing-models';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import {
  type CropKind,
  LOW_WALLS,
  SETTLEMENT_WALL_HEIGHTS,
  SETTLEMENT_WALL_KINDS,
  type SettlementLayout,
  type SettlementThing,
  type SettlementWallKind,
  SLOWING_CROPS,
} from '@axe/domain/tabletop/field/settlement-layout';
import { alongTurn, outwardTurn, type SettlementModelId } from '@axe/domain/tabletop/field/settlement-models';
import type {
  MapAmbience,
  MapBlock,
  MapLight,
  MapPaint,
  MapRect,
  MapSlowGround,
} from '@axe/domain/tabletop/map-blocks';

/** What a settlement comes to on the table: what stands, what is painted, what is slow to cross, the water and the lights. */
export interface SettlementBlocks {
  readonly blocks: MapBlock[];
  readonly paint: MapPaint[];
  readonly slows: MapSlowGround[];
  readonly ambiences: MapAmbience[];
  readonly lights: MapLight[];
}

type Skin = { readonly side: WallTextureId; readonly top: WallTextureId | TextureId };

/** What each kind of wall is built of, and what it is called. */
const WALLS: Readonly<Record<SettlementWallKind, { readonly skin: Skin; readonly thing: string }>> = {
  palisade: { skin: { side: 'wall_timber', top: 'wall_timber' }, thing: 'palisade' },
  watchtower: { skin: { side: 'wall_timber', top: 'wood_plank' }, thing: 'watchtower' },
  stoneWall: { skin: { side: 'wall_ashlar', top: 'stone_paving_big' }, thing: 'stoneWall' },
  tower: { skin: { side: 'wall_ashlar', top: 'stone_paving_big' }, thing: 'tower' },
  timberWall: { skin: { side: 'wall_timber', top: 'wall_timber' }, thing: 'wall' },
  stoneRoomWall: { skin: { side: 'wall_ashlar', top: 'stone_tile' }, thing: 'wall' },
  fence: { skin: { side: 'wall_timber', top: 'wall_timber' }, thing: 'fence' },
  boardWall: { skin: { side: 'wall_timber', top: 'wall_timber' }, thing: 'barn' },
  hideWall: { skin: { side: 'wall_earth', top: 'wall_earth' }, thing: 'tent' },
};

/**
 * The model a block of wall is drawn as and how far it is turned, or null for one built of its blocks:
 * a run of the wall round a fort a tile to a cell, facing out, a wall of the keep's rooms the same alike
 * on both sides, and a tower or a watchtower whole, fitted to its block, where it is a block of its own
 * rather than one of the cells of a board of hexes.
 */
function wallModelOf(
  kind: SettlementWallKind,
  rect: MapRect,
  settlement: SettlementLayout,
  span: number
): { model: SettlementModelId; turn: number } | null {
  const ring = settlement.ring;
  const outward = () => (ring ? outwardTurn(rect, ring.middle, ring.reach) : alongTurn(rect));
  switch (kind) {
    case 'palisade':
      return { model: 'palisade_spikes', turn: outward() };
    case 'stoneWall':
      return { model: 'stone_wall_battlement', turn: outward() };
    case 'stoneRoomWall':
      return { model: 'stone_room_wall', turn: alongTurn(rect) };
    case 'tower':
      if (span <= 1) return null;
      if (rect.w === rect.h) return { model: 'stone_tower_round', turn: 0 };
      return { model: 'stone_tower_square', turn: rect.w > rect.h ? 90 : 0 };
    case 'watchtower':
      return span > 1 && rect.w === 2 && rect.h === 2 ? { model: 'watchtower_wood', turn: 0 } : null;
    case 'timberWall':
      return { model: settlement.kind === 'village' ? 'timber_frame_wall' : 'log_wall', turn: alongTurn(rect) };
    case 'fence':
      return { model: 'rail_fence', turn: alongTurn(rect) };
    case 'boardWall':
      return { model: 'plank_wall', turn: alongTurn(rect) };
    case 'hideWall':
      return { model: 'hide_wall', turn: alongTurn(rect) };
    default:
      return null;
  }
}

/** The model each small thing is drawn as, kept to its own shape within its cell. */
const THING_MODELS: Readonly<Record<SettlementThing['thing'], SettlementModelId>> = {
  well: 'well',
  hay: 'hay',
  cart: 'cart',
  totem: 'totem',
  hearth: 'hearth',
};

/**
 * The door each wall is hung with: a fort of logs a gate of planks, a fort of stone a portcullis that
 * lifts, a room a door of planks.
 */
const DOORS: Readonly<Record<'gate' | 'door', Partial<Record<SettlementWallKind, DoorKind>>>> = {
  gate: { palisade: 'door_wood', stoneWall: 'door_iron_grate' },
  door: { timberWall: 'door_wood', stoneRoomWall: 'door_wood', boardWall: 'door_wood' },
};

/** What each small thing standing on a cell is built of, how tall it is and how much of the cell it fills. */
const THINGS: Readonly<
  Record<
    SettlementThing['thing'],
    { readonly skin: Skin; readonly height: number; readonly fill: number; readonly blocksSight: boolean }
  >
> = {
  well: { skin: { side: 'wall_rubble', top: 'stone_tile' }, height: 1, fill: 0.9, blocksSight: false },
  hay: { skin: { side: 'wall_earth', top: 'steppe' }, height: 0.8, fill: 0.8, blocksSight: false },
  cart: { skin: { side: 'wall_timber', top: 'wood_plank' }, height: 1, fill: 0.8, blocksSight: false },
  totem: { skin: { side: 'wall_timber', top: 'wall_timber' }, height: 2.5, fill: 0.4, blocksSight: false },
  hearth: { skin: { side: 'wall_rubble', top: 'rubble_floor' }, height: 0.25, fill: 0.9, blocksSight: false },
};

/** What each crop's field is painted with, under what grows on it. */
const CROP_GROUND: Readonly<Record<CropKind, TextureId>> = {
  vegetable: 'black_soil',
  wheat: 'desert',
  corn: 'black_soil',
  rice: 'black_soil',
};

/** How thick a fence stands, in cells: a rail between posts, not a wall. */
const FENCE_THICKNESS = 0.2;

/** The colour slow ground of each crop is shown in on the table. */
const CROP_COLOURS: Readonly<Record<CropKind, string>> = {
  vegetable: '#6b8a3a',
  wheat: '#c9a83a',
  corn: '#7a9a2a',
  rice: '#5f8a6a',
};

/** The model each crop grows as, one cell of it to every cell of its field, its rows along the field. */
const CROP_MODELS: Readonly<Record<CropKind, SettlementModelId>> = {
  vegetable: 'crop_vegetable',
  wheat: 'crop_wheat',
  corn: 'crop_corn',
  rice: 'crop_rice',
};

/**
 * How thick the block a crop is drawn on stands, in cells: thin enough that whoever walks into the
 * field stands on the ground, and that it hides nothing and stops nobody, as the crop drawn on it
 * stands as tall as it grows.
 */
const CROP_BLOCK_CELLS = 0.02;

/** What a paddy's water is: shallow over its mud, murky and green. */
const PADDY_WATER = { surface: 0.08, color: '#6e7448', turbidity: 0.8, dirt: 0.35, leaves: 0, ice: 0 } as const;

/** What crossing a field of a crop that slows costs over plain footing. */
const CROP_COST = 1;

/**
 * The runs a fence stands in, each a thin rail down the middle of its cells: along a row wherever two
 * cells or more of it run side by side, and down a column for the rest, no run longer than `span`.
 */
function fenceRuns(
  mask: Uint8Array,
  width: number,
  height: number,
  span: number
): { rect: MapRect; footprint: { w: number; d: number } }[] {
  const runs: { rect: MapRect; footprint: { w: number; d: number } }[] = [];
  const used = new Uint8Array(mask.length);
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y) || used[y * width + x] || !at(x + 1, y)) continue;
      let w = 0;
      while (w < span && at(x + w, y) && !used[y * width + x + w]) used[y * width + x + w++] = 1;
      runs.push({ rect: { x, y, w, h: 1 }, footprint: { w, d: FENCE_THICKNESS } });
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (!at(x, y) || used[y * width + x]) continue;
      let h = 0;
      while (h < span && at(x, y + h) && !used[(y + h) * width + x]) {
        used[(y + h) * width + x] = 1;
        h++;
      }
      runs.push({ rect: { x, y, w: 1, h }, footprint: { w: FENCE_THICKNESS, d: h } });
    }
  }
  return runs;
}

/**
 * A rectangle cut into rectangles no more than `span` cells across either way, each a block of its
 * own, as the walls are gathered: a cell each on a board of hexes.
 */
function cutUp(rect: MapRect, span: number): MapRect[] {
  const step = Math.max(1, Math.floor(span));
  const parts: MapRect[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y += step) {
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      parts.push({ x, y, w: Math.min(step, rect.x + rect.w - x), h: Math.min(step, rect.y + rect.h - y) });
    }
  }
  return parts;
}

/**
 * The blocks, paint, slow ground, water and lights a settlement is built of on the table. Its walls are
 * gathered into as few blocks as `span` lets, every one of them standing on its whole cells; its doors
 * are hung as the doors of a dungeon are, each as tall as the wall it hangs in, as the bundled model
 * of its kind where `models` asks.
 */
export function settlementBlocks(
  settlement: SettlementLayout,
  width: number,
  height: number,
  span: number,
  models: boolean
): SettlementBlocks {
  const blocks: MapBlock[] = [];
  SETTLEMENT_WALL_KINDS.forEach((kind, index) => {
    const mask = new Uint8Array(settlement.walls.length);
    for (let cell = 0; cell < mask.length; cell++) mask[cell] = settlement.walls[cell] === index + 1 ? 1 : 0;
    const { skin, thing } = WALLS[kind];
    const low = LOW_WALLS.includes(kind);
    const runs =
      kind === 'fence'
        ? fenceRuns(mask, width, height, span)
        : mergeMaskToRects(mask, width, height, span).map((rect) => ({ rect, footprint: undefined }));
    for (const { rect, footprint } of runs) {
      const drawn = models ? wallModelOf(kind, rect, settlement, span) : null;
      blocks.push({
        kind: 'prop',
        rect,
        blocksSight: !low,
        blocksClimb: !low,
        locked: false,
        rooms: [],
        skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
        height: SETTLEMENT_WALL_HEIGHTS[kind],
        ...(footprint ? { footprint } : {}),
        thing,
        ...(drawn ? { model: drawn.model, modelTurn: drawn.turn || undefined } : {}),
      });
    }
  });

  for (const door of settlement.doors) {
    const prop = DOORS[door.kind][door.wall] ?? 'door_wood';
    const model = models ? DOOR_MODELS[prop] : undefined;
    blocks.push({
      kind: 'door',
      rect: { x: door.x, y: door.y, w: 1, h: 1 },
      blocksSight: true,
      blocksClimb: true,
      locked: false,
      rooms: [],
      across: door.across,
      prop,
      doorStyle: DOOR_KIND_STYLES[prop],
      doorMirrored: door.mirrored,
      height: SETTLEMENT_WALL_HEIGHTS[door.wall],
      ...(door.kind === 'gate' ? { thing: 'gate' } : {}),
      ...(model ? { model, modelTurn: doorModelTurn(door.across, door.mirrored) || undefined } : {}),
    });
  }

  for (const item of settlement.things) {
    const { skin, height: tall, fill, blocksSight } = THINGS[item.thing];
    const model = models ? THING_MODELS[item.thing] : undefined;
    const filled = model ? 1 : fill;
    blocks.push({
      kind: 'prop',
      rect: { x: item.x, y: item.y, w: 1, h: 1 },
      blocksSight,
      locked: false,
      rooms: [],
      skin: { side: { kind: 'texture', id: skin.side }, top: { kind: 'texture', id: skin.top } },
      height: tall,
      ...(filled < 1 ? { footprint: { w: filled, d: filled } } : {}),
      thing: item.thing,
      ...(model ? { model } : {}),
    });
  }

  const paint: MapPaint[] = [];
  const slows: MapSlowGround[] = [];
  const ambiences: MapAmbience[] = [];
  for (const { rect, crop } of settlement.crops) {
    paint.push({ kind: 'floor', rect, material: { kind: 'texture', id: CROP_GROUND[crop] } });
    if (models) {
      for (const field of cutUp(rect, span)) {
        blocks.push({
          kind: 'prop',
          rect: field,
          blocksSight: false,
          locked: false,
          rooms: [],
          skin: { side: { kind: 'texture', id: CROP_GROUND[crop] }, top: { kind: 'texture', id: CROP_GROUND[crop] } },
          height: CROP_BLOCK_CELLS,
          floorOnly: true,
          thing: crop,
          model: CROP_MODELS[crop],
          modelTurn: alongTurn(rect) || undefined,
        });
      }
    }
    if (SLOWING_CROPS.includes(crop)) slows.push({ rect, extraCost: CROP_COST, color: CROP_COLOURS[crop] });
    if (crop === 'rice')
      ambiences.push({ rect, kind: 'water', density: 0.6, name: 'water', water: { ...PADDY_WATER } });
  }

  const lights: MapLight[] = settlement.fires.map((fire, room) => ({
    x: fire.x,
    y: fire.y,
    kind: fire.kind,
    facing: 0,
    room,
  }));
  return { blocks, paint, slows, ambiences, lights };
}
