import { CellRect, rectCells } from '@axe/domain/tabletop/cell-rectangles';
import { asHazardKind, DEFAULT_HAZARD_ELEMENT, DEFAULT_HAZARD_KIND } from '@axe/domain/tabletop/hazard-presets';
import {
  asMoveCostExtra,
  DEFAULT_MOVE_COST_COLOR,
  DEFAULT_MOVE_COST_EXTRA,
} from '@axe/domain/tabletop/table-move-cost';
import { encodeSlopeSides, parseSlopeSides } from '@axe/domain/tabletop/terrain-slope';
import {
  asTriggerMoment,
  asTriggerTarget,
  DEFAULT_TRIGGER_COLOR,
  DEFAULT_TRIGGER_MOMENT,
  DEFAULT_TRIGGER_TARGET,
  isPressMoment,
  TriggerMoment,
  TriggerTarget,
} from '@axe/domain/tabletop/trigger-event';

/**
 * What a painted cell does, and what it lays on the table.
 *
 * The map editor paints these, but what they mean belongs to the table rather than to the
 * editor: a cell closed to walking is closed however it came to be.
 */

export const MAP_FUNCTION_ROLES = ['moveCost', 'hazard', 'terrain', 'mask', 'trigger'] as const;

export type MapFunctionRole = (typeof MAP_FUNCTION_ROLES)[number];

export const DEFAULT_FUNCTION_ROLE: MapFunctionRole = 'moveCost';

/**
 * The role a scene saved before the two were one calls ground nobody may enter.
 *
 * What a cell costs and whether it may be entered at all are one question with one answer at
 * the far end of it, and they were two roles before they were one. A layer saved under the old
 * name is read as the new one with nothing getting through it.
 */
const LEGACY_BLOCK_ROLE = 'moveBlock';

/**
 * Reads a stored map editor function role, falling back to what movement costs for anything
 * unknown, the old name for ground nobody may enter included.
 */
export function asFunctionRole(value: unknown): MapFunctionRole {
  return typeof value === 'string' && (MAP_FUNCTION_ROLES as readonly string[]).includes(value)
    ? (value as MapFunctionRole)
    : DEFAULT_FUNCTION_ROLE;
}

/**
 * The role and the look of a stored layer read together, since one can change the other.
 *
 * A layer saved under the old name for ground nobody may enter carries no word about what
 * crossing it costs, and reading the two apart would hand it the default — ground a step dearer
 * than plain footing, which anybody may walk over. Read together it comes back shut.
 */
export function sanitizeFunctionLayerLook(
  rawRole: unknown,
  rawSpec: unknown
): { role: MapFunctionRole; spec: FunctionSpec } {
  const spec = sanitizeFunctionSpec(rawSpec);
  if (rawRole === LEGACY_BLOCK_ROLE) {
    return { role: 'moveCost', spec: { ...spec, moveCost: { ...spec.moveCost, blocks: true } } };
  }
  return { role: asFunctionRole(rawRole), spec };
}

/** The pictures a painted wall wears. Empty is glass: the wall stands but is not seen. */
export interface TerrainFaceImages {
  /** What every upright face wears unless it says otherwise. */
  wall: string;
  /** What the top and the underside wear unless they say otherwise. */
  floor: string;
  top: string;
  bottom: string;
  north: string;
  south: string;
  east: string;
  west: string;
}

/**
 * Where a block really sits, when that is not simply the corner of its cell.
 *
 * A wall that was turned, or that stands between cells, or that is two and a half cells
 * wide, cannot be said in cells alone. It is said here instead, so that reading it in and
 * laying it back down returns exactly what was there.
 */
export interface BlockPlacement {
  x: number;
  y: number;
  width: number;
  depth: number;
  rotate: number;
}

/** Everything a painted wall is, which is everything a terrain of one block can be. */
export interface TerrainPaintSpec {
  name: string;
  /** The picture the piece itself is known by, which is not one of its faces. */
  imageIdentifier: string;
  altitude: number;
  showsAltitude: boolean;
  /** How tall it stands, in cells. Nought is a floor with no wall over it. */
  height: number;
  /** Whether it is a floor, a wall, or both. One of TerrainViewState. */
  mode: number;
  blocksSight: boolean;
  blocksLight: boolean;
  /** Whether a piece walks around it rather than up onto it. */
  blocksClimb: boolean;
  /** Whether the picture repeats across the block rather than being stretched over it. */
  tiledTexture: boolean;
  showsGrid: boolean;
  dropShadow: boolean;
  surfaceShading: boolean;
  locked: boolean;
  doorStyle: string;
  doorOpen: boolean;
  doorMirrored: boolean;
  slope: boolean;
  slopeDirection: number;
  /** The sides the slope runs down to, written as their names; empty falls back to the direction. */
  slopeSides: string;
  light: TerrainLightSpec;
  images: TerrainFaceImages;
  /** Null where the block sits square on its cells, which is where the brush put it. */
  placement: BlockPlacement | null;
}

export interface TerrainLightSpec {
  enabled: boolean;
  preset: string;
  brightRadius: number;
  dimRadius: number;
  color: string;
  angle: number;
  direction: number;
  pitch: number;
  animation: string;
}

export interface MaskPaintSpec {
  name: string;
  color: string;
  opacity: number;
  altitude: number;
  locked: boolean;
  showsLockMark: boolean;
  owner: string;
  /** How far it has been scratched away, and how far a scratch in hand has got. */
  scratchedGrids: string;
  scratchingGrids: string;
  preview: boolean;
  placement: BlockPlacement | null;
}

/** Everything painted ground that goes off under a piece is, which the table carries as it is. */
export interface TriggerPaintSpec {
  name: string;
  /** When it goes off: as a walk ends on it, or the moment it is stepped on. */
  moment: TriggerMoment;
  /** Whose pieces it has anything to say to. */
  targets: TriggerTarget;
  /** Whether going off once is the end of it. The older, coarser form of {@link repeat}. */
  once: boolean;
  /** How often it has another go in it, as one of TRIGGER_REPEATS. Empty falls back to `once`. */
  repeat: string;
  /** Whether the room sees the ground, or only the master does. The coarser form of `shownTo`. */
  open: boolean;
  /** Who it is drawn for, as one of SHOWN_TO. Empty falls back to `open`. */
  shownTo: string;
  /** Whether going off shows it to the room, so a sprung trap gives itself away. */
  reveals: boolean;
  /** A line to write in the room as it goes off, in place of saying only that it did. */
  say: string;
  /** The state to leave a piece in, by the name the room keeps it under. Empty leaves none. */
  ailment: string;
  /** How long that state lasts. Nought leaves it however long the room says. */
  ailmentRounds: number;
  /** The roll the ground asks whoever walks into it for. Empty asks for none. */
  check: string;
  /** What that roll has to reach. Empty asks for the roll without naming a number. */
  checkTarget: string;
  /** The dice the ground throws itself, instead of asking. Empty asks. */
  checkRoll: string;
  /** What it takes from somebody who made that roll. Empty takes nothing, `half` takes half. */
  passAmount: string;
  /** Whether what it says is kept back from the room, for the master to read alone. */
  silent: boolean;
  color: string;
  /** The name of the resource it takes from, and how much. A number or a handful of dice. */
  element: string;
  amount: string;
  /** The effect to play on whoever set it off, by name. Empty plays nothing. */
  effect: string;
  /** The sound to make as it goes off, by name. Empty makes none. */
  sound: string;
  /** The cut-in to play as it goes off, by name. Empty plays none. */
  cutIn: string;
  /** Whether it carries whoever ends a walk on it away to another cell. */
  warps: boolean;
  /** The cell it carries them to, counted from the top left of the board. */
  warpCol: number;
  warpRow: number;
  /**
   * The table it carries them onto, by identifier. Empty keeps them on the one they are on.
   *
   * A piece stands on every table at once, so carrying one to another floor is carrying the
   * room to it: the table the room is looking at changes with the piece.
   */
  warpTable: string;
  /**
   * What pressing the ground does, as `encodeSwitchDefinition` writes it, for ground that is
   * pressed rather than walked on. Empty for every other moment.
   */
  press: string;
}

/**
 * Everything painted ground that is dear to cross is, which is what it charges and how it looks.
 *
 * Shut ground is the far end of the same question rather than a thing of its own: a cell nobody
 * may enter is a cell that costs more than anybody has, so one brush paints both.
 */
export interface MoveCostPaintSpec {
  /** Whether nothing gets through it at all, whatever it would otherwise charge. */
  blocks: boolean;
  /**
   * Whether it is a road: crossed in half a step rather than in one.
   *
   * The far end of the same brush. Shut ground costs more than anybody has, plain ground costs
   * one, and a road costs half, so the one picker runs the whole way from one to the other.
   */
  halves: boolean;
  /** What entering it costs on top of the one step the ground is worth. */
  extraCost: number;
  color: string;
}

/**
 * Dangerous ground laid in one stroke: a look, a going and a thing that happens.
 *
 * Only the kind and what it takes from are painted. What each kind comes to is a table of its
 * own, so that a bog is the same bog in every room and adding another is a line there rather
 * than a new brush here.
 */
export interface HazardPaintSpec {
  /** Which of HAZARD_KINDS it is. */
  kind: string;
  /** The resource it takes from, by name. Empty takes nothing whatever the kind says. */
  element: string;
}

/** What a role lays on the table, the same for every cell the layer holds. */
export interface FunctionSpec {
  moveCost: MoveCostPaintSpec;
  hazard: HazardPaintSpec;
  terrain: TerrainPaintSpec;
  mask: MaskPaintSpec;
  trigger: TriggerPaintSpec;
}

export const NO_FACE_IMAGES: TerrainFaceImages = {
  wall: '',
  floor: '',
  top: '',
  bottom: '',
  north: '',
  south: '',
  east: '',
  west: '',
};

export const TERRAIN_FACE_KEYS: readonly (keyof TerrainFaceImages)[] = [
  'wall',
  'floor',
  'top',
  'bottom',
  'north',
  'south',
  'east',
  'west',
];

export const DEFAULT_FUNCTION_SPEC: FunctionSpec = {
  moveCost: {
    blocks: false,
    halves: false,
    extraCost: DEFAULT_MOVE_COST_EXTRA,
    color: DEFAULT_MOVE_COST_COLOR,
  },
  hazard: {
    kind: DEFAULT_HAZARD_KIND,
    element: DEFAULT_HAZARD_ELEMENT,
  },
  terrain: {
    name: '',
    imageIdentifier: '',
    altitude: 0,
    showsAltitude: false,
    height: 1,
    mode: 3,
    blocksSight: true,
    blocksLight: true,
    blocksClimb: false,
    tiledTexture: false,
    showsGrid: false,
    dropShadow: true,
    surfaceShading: true,
    locked: false,
    doorStyle: 'none',
    doorOpen: false,
    doorMirrored: false,
    slope: false,
    slopeDirection: 0,
    slopeSides: '',
    light: {
      enabled: false,
      preset: 'custom',
      brightRadius: 0,
      dimRadius: 0,
      color: '#ffd9a0',
      angle: 360,
      direction: 0,
      pitch: 0,
      animation: 'none',
    },
    images: { ...NO_FACE_IMAGES },
    placement: null,
  },
  mask: {
    name: '',
    color: '#555555',
    opacity: 0.6,
    altitude: 0,
    locked: false,
    showsLockMark: true,
    owner: '',
    scratchedGrids: '',
    scratchingGrids: '',
    preview: false,
    placement: null,
  },
  trigger: {
    name: '',
    moment: DEFAULT_TRIGGER_MOMENT,
    targets: DEFAULT_TRIGGER_TARGET,
    once: false,
    repeat: '',
    open: false,
    shownTo: '',
    reveals: false,
    say: '',
    ailment: '',
    ailmentRounds: 0,
    check: '',
    checkTarget: '',
    checkRoll: '',
    passAmount: '',
    silent: false,
    color: DEFAULT_TRIGGER_COLOR,
    element: '',
    amount: '',
    effect: '',
    sound: '',
    cutIn: '',
    warps: false,
    warpCol: 0,
    warpRow: 0,
    warpTable: '',
    press: '',
  },
};

function sanitizePlacement(value: unknown): BlockPlacement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const held = value as Record<string, unknown>;
  const number = (key: string): number => {
    const amount = Number(held[key]);
    return Number.isFinite(amount) ? amount : 0;
  };
  return {
    x: number('x'),
    y: number('y'),
    width: Math.max(0, number('width')),
    depth: Math.max(0, number('depth')),
    rotate: number('rotate'),
  };
}

function countIn(held: Record<string, unknown>, key: string, fallback: number, least: number, most: number): number {
  const amount = Number(held[key]);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(most, Math.max(least, amount));
}

function flagIn(held: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof held[key] === 'boolean' ? (held[key] as boolean) : fallback;
}

function textIn(held: Record<string, unknown>, key: string, fallback: string): string {
  return typeof held[key] === 'string' ? (held[key] as string) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Reads the face pictures of a painted wall from loose saved data. A face that is missing or not
 * text comes back empty.
 */
export function sanitizeFaceImages(value: unknown): TerrainFaceImages {
  const held = asRecord(value);
  const images = { ...NO_FACE_IMAGES };
  for (const face of TERRAIN_FACE_KEYS) images[face] = textIn(held, face, '');
  return images;
}

function sanitizeLight(value: unknown): TerrainLightSpec {
  const held = asRecord(value);
  const fallback = DEFAULT_FUNCTION_SPEC.terrain.light;
  const number = (key: string, miss: number): number => {
    const amount = Number(held[key]);
    return Number.isFinite(amount) ? amount : miss;
  };
  return {
    enabled: flagIn(held, 'enabled', fallback.enabled),
    preset: textIn(held, 'preset', fallback.preset),
    brightRadius: number('brightRadius', fallback.brightRadius),
    dimRadius: number('dimRadius', fallback.dimRadius),
    color: textIn(held, 'color', fallback.color),
    angle: number('angle', fallback.angle),
    direction: number('direction', fallback.direction),
    pitch: number('pitch', fallback.pitch),
    animation: textIn(held, 'animation', fallback.animation),
  };
}

/**
 * Reads a function spec from loose saved data, such as a stored map editor scene.
 *
 * Every field that is missing or of the wrong type takes its default, and numbers are held to their
 * allowed ranges, so the result is always complete.
 */
export function sanitizeFunctionSpec(value: unknown): FunctionSpec {
  const held = asRecord(value);
  const moveCost = asRecord(held['moveCost']);
  const hazard = asRecord(held['hazard']);
  const terrain = asRecord(held['terrain']);
  const mask = asRecord(held['mask']);
  const trigger = asRecord(held['trigger']);
  const fallback = DEFAULT_FUNCTION_SPEC;

  return {
    hazard: {
      kind: asHazardKind(hazard['kind']),
      element: textIn(hazard, 'element', fallback.hazard.element),
    },
    moveCost: {
      blocks: flagIn(moveCost, 'blocks', fallback.moveCost.blocks),
      halves: flagIn(moveCost, 'halves', fallback.moveCost.halves),
      extraCost: asMoveCostExtra(moveCost['extraCost']),
      color: textIn(moveCost, 'color', fallback.moveCost.color),
    },
    terrain: {
      name: textIn(terrain, 'name', fallback.terrain.name),
      imageIdentifier: textIn(terrain, 'imageIdentifier', fallback.terrain.imageIdentifier),
      altitude: countIn(terrain, 'altitude', fallback.terrain.altitude, -999, 999),
      showsAltitude: flagIn(terrain, 'showsAltitude', fallback.terrain.showsAltitude),
      height: countIn(terrain, 'height', fallback.terrain.height, 0, 99),
      mode: countIn(terrain, 'mode', fallback.terrain.mode, 0, 3),
      blocksSight: flagIn(terrain, 'blocksSight', fallback.terrain.blocksSight),
      blocksLight: flagIn(terrain, 'blocksLight', fallback.terrain.blocksLight),
      blocksClimb: flagIn(terrain, 'blocksClimb', fallback.terrain.blocksClimb),
      tiledTexture: flagIn(terrain, 'tiledTexture', fallback.terrain.tiledTexture),
      showsGrid: flagIn(terrain, 'showsGrid', fallback.terrain.showsGrid),
      dropShadow: flagIn(terrain, 'dropShadow', fallback.terrain.dropShadow),
      surfaceShading: flagIn(terrain, 'surfaceShading', fallback.terrain.surfaceShading),
      locked: flagIn(terrain, 'locked', fallback.terrain.locked),
      doorStyle: textIn(terrain, 'doorStyle', fallback.terrain.doorStyle),
      doorOpen: flagIn(terrain, 'doorOpen', fallback.terrain.doorOpen),
      doorMirrored: flagIn(terrain, 'doorMirrored', fallback.terrain.doorMirrored),
      slope: flagIn(terrain, 'slope', fallback.terrain.slope),
      slopeDirection: countIn(terrain, 'slopeDirection', fallback.terrain.slopeDirection, 0, 4),
      slopeSides: encodeSlopeSides(parseSlopeSides(textIn(terrain, 'slopeSides', fallback.terrain.slopeSides))),
      light: sanitizeLight(terrain['light']),
      images: sanitizeFaceImages(terrain['images']),
      placement: sanitizePlacement(terrain['placement']),
    },
    mask: {
      name: textIn(mask, 'name', fallback.mask.name),
      color: textIn(mask, 'color', fallback.mask.color),
      opacity: countIn(mask, 'opacity', fallback.mask.opacity, 0, 1),
      altitude: countIn(mask, 'altitude', fallback.mask.altitude, -999, 999),
      locked: flagIn(mask, 'locked', fallback.mask.locked),
      showsLockMark: flagIn(mask, 'showsLockMark', fallback.mask.showsLockMark),
      owner: textIn(mask, 'owner', fallback.mask.owner),
      scratchedGrids: textIn(mask, 'scratchedGrids', fallback.mask.scratchedGrids),
      scratchingGrids: textIn(mask, 'scratchingGrids', fallback.mask.scratchingGrids),
      preview: flagIn(mask, 'preview', fallback.mask.preview),
      placement: sanitizePlacement(mask['placement']),
    },
    trigger: {
      name: textIn(trigger, 'name', fallback.trigger.name),
      moment: asTriggerMoment(trigger['moment']),
      targets: asTriggerTarget(trigger['targets']),
      once: flagIn(trigger, 'once', fallback.trigger.once),
      repeat: textIn(trigger, 'repeat', fallback.trigger.repeat),
      open: flagIn(trigger, 'open', fallback.trigger.open),
      shownTo: textIn(trigger, 'shownTo', fallback.trigger.shownTo),
      reveals: flagIn(trigger, 'reveals', fallback.trigger.reveals),
      say: textIn(trigger, 'say', fallback.trigger.say),
      ailment: textIn(trigger, 'ailment', fallback.trigger.ailment),
      ailmentRounds: countIn(trigger, 'ailmentRounds', fallback.trigger.ailmentRounds, 0, 999),
      check: textIn(trigger, 'check', fallback.trigger.check),
      checkTarget: textIn(trigger, 'checkTarget', fallback.trigger.checkTarget),
      checkRoll: textIn(trigger, 'checkRoll', fallback.trigger.checkRoll),
      passAmount: textIn(trigger, 'passAmount', fallback.trigger.passAmount),
      silent: flagIn(trigger, 'silent', fallback.trigger.silent),
      color: textIn(trigger, 'color', fallback.trigger.color),
      element: textIn(trigger, 'element', fallback.trigger.element),
      amount: textIn(trigger, 'amount', fallback.trigger.amount),
      effect: textIn(trigger, 'effect', fallback.trigger.effect),
      sound: textIn(trigger, 'sound', fallback.trigger.sound),
      cutIn: textIn(trigger, 'cutIn', fallback.trigger.cutIn),
      warps: flagIn(trigger, 'warps', fallback.trigger.warps),
      warpCol: countIn(trigger, 'warpCol', fallback.trigger.warpCol, 0, 999),
      warpRow: countIn(trigger, 'warpRow', fallback.trigger.warpRow, 0, 999),
      warpTable: textIn(trigger, 'warpTable', fallback.trigger.warpTable),
      ...pressFields(trigger, fallback.trigger),
    },
  };
}

/**
 * What a brush for pressed ground carries of its count, and what pressing it does.
 *
 * Pressed ground keeps its count in its switch, so the trap's own count is left at nothing for it;
 * written otherwise, ground laid and read back again would read as a different painting and be
 * laid afresh, forgetting it had been pressed. Every other moment carries nothing to press.
 */
function pressFields(
  trigger: Record<string, unknown>,
  fallback: TriggerPaintSpec
): Pick<TriggerPaintSpec, 'press'> & Partial<Pick<TriggerPaintSpec, 'once' | 'repeat'>> {
  if (!isPressMoment(asTriggerMoment(trigger['moment']))) return { press: '' };
  return { press: textIn(trigger, 'press', fallback.press), once: false, repeat: '' };
}

/** A block of wall, and the look it wears. Every block carries its own. */
export interface TerrainBlock extends CellRect {
  spec: TerrainPaintSpec;
}

export interface MaskBlock extends CellRect {
  spec: MaskPaintSpec;
}

export interface TriggerBlock extends CellRect {
  spec: TriggerPaintSpec;
}

export interface MoveCostBlock extends CellRect {
  spec: MoveCostPaintSpec;
}

/** The look of dangerous ground as the table carries it, apart from what it does. */
export interface AmbienceBlock extends CellRect {
  spec: AmbiencePaintSpec;
}

/** Everything the look of a stretch of dangerous ground is. */
export interface AmbiencePaintSpec {
  /** Which of the ground-clinging AmbienceKinds it is drawn as. */
  kind: string;
  color: string;
  density: number;
  /** Whether nobody sees through it, which is what makes a bank of fog worth walking round. */
  blocksSight: boolean;
}

/** A block as far as stacking cares: the cells it covers, the altitude it is laid by and its height in cells. */
type StandingBlock = CellRect & { spec: { altitude: number; height: number } };

/**
 * How many cells up each block starts, given the blocks stacked beneath it, in the same order as
 * the blocks were given.
 *
 * Blocks are laid from the ground up, lowest altitude first and in the order given where two are
 * level, so a wall laid over a wall starts where the one below leaves off. A block spanning cells
 * of unequal standing starts on the tallest stack under any of them, since a wall cannot begin at
 * two heights at once.
 */
export function terrainStackLevels(blocks: readonly StandingBlock[]): number[] {
  const order = blocks
    .map((_, index) => index)
    .sort((a, b) => blocks[a].spec.altitude - blocks[b].spec.altitude || a - b);
  const standing = new Map<string, number>();
  const levels = new Array<number>(blocks.length).fill(0);
  for (const index of order) {
    const block = blocks[index];
    const cells = rectCells(block);
    let level = 0;
    for (const key of cells) level = Math.max(level, standing.get(key) ?? 0);
    levels[index] = level;
    const tall = Math.max(0, Math.round(block.spec.height));
    for (const key of cells) standing.set(key, level + tall);
  }
  return levels;
}

/** The look a spec stands for, so that two alike share one layer. */
export function lookKey(spec: unknown): string {
  return JSON.stringify(spec);
}

/** What one block is known by, which is where it stands and what it looks like. */
export function blockKey(block: CellRect, spec: unknown): string {
  return `${block.col},${block.row},${block.width},${block.height}|${lookKey(spec)}`;
}

export interface BlockChange<T extends CellRect> {
  add: T[];
  /**
   * The blocks to pull down, each with the look it was found wearing.
   *
   * Where it stands is not enough to know it by: a floor and a wall can share a footprint,
   * and pulling down by footprint alone takes the one nobody touched with it.
   */
  remove: T[];
}

/** What has to change on the table for it to match what was painted. */
export interface FunctionPaintPlan {
  /**
   * Every cell the table should be closed on, which replaces whatever it held before.
   *
   * Painted with the same brush as the ground that merely costs more, and kept apart here only
   * because the table carries the two differently: one map of shut cells, and a block apiece for
   * everything with a price on it.
   */
  blocked: string[];
  moveCost: BlockChange<MoveCostBlock>;
  /** The looks of dangerous ground, which only the hazard brush ever lays. */
  ambience: BlockChange<AmbienceBlock>;
  terrain: BlockChange<TerrainBlock>;
  mask: BlockChange<MaskBlock>;
  trigger: BlockChange<TriggerBlock>;
}

/**
 * What has to be built and pulled down for one set of blocks to become another.
 *
 * A block whose look changed is pulled down and built again rather than dressed in place:
 * one rule covers both, and the table ends up with exactly what was painted either way.
 */
export function blockChange<T extends CellRect & { spec: unknown }>(
  wanted: readonly T[],
  held: readonly T[]
): BlockChange<T> {
  const wantedKeys = new Set(wanted.map((block) => blockKey(block, block.spec)));
  const heldKeys = new Set(held.map((block) => blockKey(block, block.spec)));
  return {
    add: wanted.filter((block) => !heldKeys.has(blockKey(block, block.spec))),
    remove: held.filter((block) => !wantedKeys.has(blockKey(block, block.spec))),
  };
}
