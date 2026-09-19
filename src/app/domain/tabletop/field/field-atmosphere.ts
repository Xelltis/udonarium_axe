import { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import { MapLightKind, MapMood } from '@axe/domain/tabletop/map-blocks';

export const FIELD_ATMOSPHERE_IDS = [
  'woodland',
  'meadow',
  'coast',
  'marsh',
  'snowfield',
  'wasteland',
  'city',
  'sfCity',
  'slum',
  'dump',
] as const;

export type FieldAtmosphereId = (typeof FIELD_ATMOSPHERE_IDS)[number];

export const FIELD_PROP_IDS = ['tree', 'bush', 'boulder', 'outcrop', 'hill', 'cactus', 'junk', 'streetTree'] as const;

export type FieldPropId = (typeof FIELD_PROP_IDS)[number];

export interface FieldPropShape {
  /** A prop wears whatever picture suits it, a wall texture or a ground one. */
  side: WallTextureId | TextureId;
  top: WallTextureId | TextureId;
  height: number;
  /** How wide a patch of it grows, in cells. An outcrop is a hillside, not a stone. */
  span: number;
  blocksSight: boolean;
  /** How far off the ground it starts. A canopy hangs; everything else sits on the earth. */
  altitude?: number;
  /** The post that holds it up, where it is held up by one rather than standing on the ground. */
  trunk?: { side: WallTextureId; top: TextureId; width: number; height: number };
  /**
   * What it is built of, in layers from the bottom up.
   *
   * One slab is a table on a leg, or a block of tofu. A crown narrows as it rises and a
   * boulder narrows as it rises, and it is that taper - and the daylight the taper leaves
   * at the corners - that reads as a growing or a weathered thing rather than as furniture.
   */
  layers?: readonly { spread: number; height: number }[];
  /**
   * How far it may be turned off the grid, in degrees, and how far from square its footprint
   * may fall. Nothing in open country is square to the board or square in itself.
   */
  spin?: number;
  squash?: number;
  /**
   * How far a layer may sit off the middle of the one under it, in cells.
   *
   * Layers stacked concentrically make a ziggurat, which is a built thing. What weather
   * leaves behind is off-centre, and that is most of the difference.
   */
  drift?: number;
  /** How near two of them may stand, in cells, when they are placed as whole things. */
  spacing?: number;
  /** Whether it takes the ground it covers, so that nothing else is put down on top of it. */
  claimsGround?: boolean;
  /** Stubs set out on its flanks, which is what tells a cactus from a post. */
  arms?: readonly { at: number; reach: number; size: number; height: number }[];
}

/**
 * A tree is not a box.
 *
 * Built as one it is a plank with a leaf lid, which reads as a vegetable pushed out of the
 * ground rather than as a tree. It takes two pieces: a post of a third of a cell standing on
 * the earth, and a canopy hanging over it that is wider than the post and clear of the ground,
 * so that what walks under a wood walks under it.
 */
export const FIELD_PROP_SHAPES: Record<FieldPropId, FieldPropShape> = {
  tree: {
    side: 'forest',
    top: 'forest',
    height: 0.9,
    span: 5,
    blocksSight: true,
    altitude: 1.5,
    trunk: { side: 'wall_timber', top: 'black_soil', width: 0.38, height: 1.9 },
    layers: [
      { spread: 4.8, height: 0.55 },
      { spread: 3.2, height: 0.5 },
      { spread: 1.6, height: 0.45 },
    ],
    drift: 0.35,
    spacing: 3,
  },
  bush: { side: 'steppe', top: 'steppe', height: 0.45, span: 1, blocksSight: false },
  /**
   * A stone worn round, not a little pyramid.
   *
   * Layers that only ever narrow are a staircase, and a staircase is the one thing a grid
   * makes on its own. A boulder is undercut: its widest course sits above its foot, so the
   * base is in shadow and the mass leans out over it.
   *
   * The courses are near enough the same width as each other, though. Seen from the side a
   * stone is about as wide most of the way up as it is at the bottom, and narrows only at the
   * crown; courses that step in and out by a third of their width read as stacked plates.
   */
  boulder: {
    side: 'rock',
    top: 'rock',
    height: 0.9,
    span: 1,
    blocksSight: false,
    layers: [
      { spread: 0.82, height: 0.3 },
      { spread: 0.92, height: 0.34 },
      { spread: 0.56, height: 0.2 },
    ],
    spin: 45,
    squash: 0.32,
    drift: 0.08,
    spacing: 2,
  },
  outcrop: {
    side: 'rock_moss',
    top: 'rock_moss',
    height: 2.4,
    span: 3,
    blocksSight: true,
    layers: [
      { spread: 2.4, height: 0.8 },
      { spread: 2.7, height: 0.9 },
      { spread: 1.6, height: 0.7 },
    ],
    spin: 45,
    squash: 0.28,
    drift: 0.14,
    spacing: 4,
  },
  /**
   * A column with its arms up.
   *
   * What tells a cactus from a post is the pair of stubs on its flanks, so it is a narrow
   * trunk with two of them set at different heights on opposite sides.
   */
  cactus: {
    side: 'cactus_skin',
    top: 'cactus_skin',
    height: 1.4,
    span: 1,
    blocksSight: false,
    layers: [
      { spread: 0.34, height: 0.6 },
      { spread: 0.3, height: 0.6 },
      { spread: 0.22, height: 0.2 },
    ],
    arms: [
      { at: 0.55, reach: 0.28, size: 0.2, height: 0.42 },
      { at: 0.85, reach: -0.26, size: 0.18, height: 0.34 },
    ],
    spin: 45,
    spacing: 3,
  },
  /**
   * A heap of scrap: sheets of tin and whatever else was not worth carrying off.
   *
   * Built the way a boulder is, undercut and off square, since a heap left lying is as shapeless
   * as a stone is and a box of rust would read as a crate.
   */
  junk: {
    side: 'wall_corrugated',
    top: 'slum_ground',
    height: 0.7,
    span: 1,
    blocksSight: false,
    layers: [
      { spread: 0.86, height: 0.28 },
      { spread: 0.7, height: 0.24 },
      { spread: 0.42, height: 0.18 },
    ],
    spin: 45,
    squash: 0.3,
    drift: 0.12,
    spacing: 2,
  },
  /**
   * A tree planted in the pavement.
   *
   * A wood's tree is a crown five cells across; one that grows beside a row of houses has a
   * narrow crown on a thin trunk, hung clear of the heads of whoever walks under it and kept
   * off the walls behind it.
   */
  streetTree: {
    side: 'forest',
    top: 'forest',
    height: 0.9,
    span: 3,
    blocksSight: false,
    altitude: 1.3,
    trunk: { side: 'wall_timber', top: 'black_soil', width: 0.18, height: 1.5 },
    layers: [
      { spread: 1.15, height: 0.4 },
      { spread: 0.85, height: 0.35 },
      { spread: 0.45, height: 0.25 },
    ],
    drift: 0.08,
    spacing: 4,
  },
  /**
   * A rise in the ground rather than a thing standing on it.
   *
   * The ground itself is a picture painted flat, so the only way a meadow gets a fold in it
   * is to build one: broad, low steps with the grass of the field on top of them.
   */
  hill: {
    side: 'black_soil',
    top: 'steppe',
    height: 1.2,
    span: 7,
    blocksSight: false,
    layers: [
      { spread: 6.6, height: 0.28 },
      { spread: 4.8, height: 0.26 },
      { spread: 3, height: 0.24 },
    ],
    spin: 10,
    squash: 0.22,
    drift: 0.5,
    spacing: 9,
    claimsGround: true,
  },
};

/**
 * A band of ground, taken by height.
 *
 * The lowest band is water on a coast and hollows on a moor, and it is the one thing the
 * ground of a field cannot be painted without: every cell lands in some band.
 */
export interface GroundBand {
  /** How much of the board this band covers by the time it ends, counting from the lowest. */
  upTo: number;
  texture: TextureId;
  /** Whether a piece can be put down here at all. Nothing grows out of open water. */
  bare?: boolean;
}

export interface FieldPropPlan {
  prop: FieldPropId;
  /** What this ground makes it of, where that is not what it is usually made of. */
  skin?: { side: WallTextureId | TextureId; top: TextureId };
  /** How much of the ground it takes where it grows thickest, from nothing to all of it. */
  chance: number;
  /** Which bands it grows in, by index. */
  bands: readonly number[];
}

/** A patch of ground with something in the air over it, and how often one turns up. */
export interface FieldPoolPlan {
  kind: string;
  texture: TextureId;
  density: number;
  /** How wide across it spreads, in cells. */
  size: number;
  /** About how many of them a board gets. */
  chance: number;
  bands: readonly number[];
}

/**
 * How a built-up place is laid out: its streets, the blocks between them, and what stands on each lot.
 *
 * Nothing about a town comes out of the lie of the land. Its streets are cut across the board and
 * its buildings are put down in the lots between them, so it has a plan of its own rather than
 * bands of ground read off a height.
 */
export interface TownPlan {
  /** How wide a street is cut, in cells, at its narrowest and at its widest. */
  street: { least: number; most: number };
  /** How big a block between streets is, in cells, at its smallest and at its largest. */
  block: { least: number; most: number };
  /** How wide the pavement round a block is, in cells. */
  kerb: number;
  /** How small a lot may be cut and how big it may be left, in cells. */
  lot: { least: number; most: number };
  /** How tall a building stands, in cells, at its lowest and at its highest. */
  storeys: { least: number; most: number };
  /** Whether the tallest stand in the middle of the board, the way they do downtown. */
  downtown: boolean;
  /** How many lots in a hundred stand empty at a middling density. */
  vacancy: number;
  /** What the buildings are made of; each building wears one of these. */
  skins: readonly { side: WallTextureId; top: WallTextureId | TextureId }[];
  /** How tall a building has to be before it rises from a podium, set back from the edge of its lot. */
  setbackAbove?: number;
  /** How many buildings in a hundred carry a tank or a plant room on the roof. */
  roofPlant: number;
  /** What the tank on a roof is made of. Left out, steel; an old walk-up keeps its water in a wooden tub. */
  plantSkin?: { side: WallTextureId | TextureId; top: WallTextureId | TextureId };
  /**
   * How deep a row house runs back from the pavement, in cells, where a block is lined with
   * them rather than filled; the middle of the block is left for yards.
   */
  frontage?: number;
  /** Whether each row of blocks is cut on its own, so that the lanes crossing it do not line up. */
  crooked?: boolean;
  /** How far a building may stand off square, in degrees. Left out, square to its street. */
  spin?: number;
  /** How much of its lot a building leaves bare round its walls, in cells on each side. */
  inset?: number;
  /** How much of the street stands under water, from none of it to all of it. */
  puddles?: number;
  /** Which band of ground each part of the town is painted with. */
  zones: { street: number; kerb: number; lot: number; puddle?: number };
}

/** What a place is lit by at night, and where those lights may stand. */
export interface FieldFirePlan {
  kinds: readonly MapLightKind[];
  bands: readonly number[];
  /** The colours they burn, taken in turn. Left out, each burns the colour of its kind. */
  colors?: readonly string[];
}

export interface FieldAtmosphere extends MapMood {
  id: FieldAtmosphereId;
  defaultGround: TextureId;
  defaultProp: WallTextureId;
  bands: readonly GroundBand[];
  props: readonly FieldPropPlan[];
  /** How large the hills are, in cells to the hill. */
  relief: number;
  /**
   * How much a hollow holding water counts as lower ground, from nothing to as much as the
   * height itself. It is what breaks the bands out of rings round the high ground.
   */
  damp: number;
  /** Patches of ground that are worse than ground: a poisoned pool, a vent. */
  pools?: readonly FieldPoolPlan[];
  /**
   * How much of a slope runs across the board, from nothing to all of it.
   *
   * Height taken from noise alone puts its water in ponds in the middle. A coast needs the
   * sea along one side, which is a ramp with the noise laid over it.
   */
  gradient?: number;
  /** How the place is built up, where it is a town rather than open country. */
  town?: TownPlan;
  /** What it is lit by and where. Left out, fires anywhere on open ground. */
  fires?: FieldFirePlan;
}

export const MIN_FIELD_SIZE = 20;
export const MAX_FIELD_SIZE = 60;
export const MIN_FIELD_DENSITY = 0;
export const MAX_FIELD_DENSITY = 100;

/**
 * A requested board width held between 20 and 60 cells and rounded; the smallest for anything that
 * is not a number.
 */
export function clampFieldSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_FIELD_SIZE;
  return Math.min(MAX_FIELD_SIZE, Math.max(MIN_FIELD_SIZE, Math.round(size)));
}

/**
 * A requested prop density held between 0 and 100 and rounded; 50 for anything that is not a
 * number.
 */
export function clampFieldDensity(density: number): number {
  if (!Number.isFinite(density)) return 50;
  return Math.min(MAX_FIELD_DENSITY, Math.max(MIN_FIELD_DENSITY, Math.round(density)));
}

export const FIELD_ATMOSPHERES: Record<FieldAtmosphereId, FieldAtmosphere> = {
  woodland: {
    id: 'woodland',
    defaultGround: 'steppe',
    defaultProp: 'wall_timber',
    relief: 11,
    damp: 0.45,
    // The wood is trees standing on the ground, not a picture of a wood painted on it: the
    // high band is the floor of the forest and what makes it a forest is what stands there.
    bands: [
      { upTo: 0.26, texture: 'swamp_mud' },
      { upTo: 0.58, texture: 'steppe' },
      { upTo: 1, texture: 'black_soil' },
    ],
    props: [
      { prop: 'tree', chance: 0.85, bands: [2] },
      { prop: 'tree', chance: 0.14, bands: [1] },
      { prop: 'bush', chance: 0.05, bands: [0, 1] },
      { prop: 'boulder', chance: 0.03, bands: [2] },
    ],
    darkness: 0,
    ambientColor: '#101a12',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 1,
  },
  meadow: {
    id: 'meadow',
    defaultGround: 'steppe',
    defaultProp: 'wall_rubble',
    relief: 12,
    damp: 0.45,
    bands: [
      { upTo: 0.38, texture: 'black_soil' },
      { upTo: 0.82, texture: 'steppe' },
      { upTo: 1, texture: 'gravel' },
    ],
    props: [
      { prop: 'hill', chance: 0.08, bands: [1] },
      { prop: 'bush', chance: 0.06, bands: [1] },
      { prop: 'tree', chance: 0.09, bands: [1] },
      { prop: 'boulder', chance: 0.06, bands: [2] },
    ],
    darkness: 0,
    ambientColor: '#141a10',
    weatherKind: 'bloom',
    weatherDensity: 0.15,
    gridShow: true,
    torches: 1,
  },
  coast: {
    id: 'coast',
    defaultGround: 'sand',
    defaultProp: 'wall_rubble',
    relief: 14,
    damp: 0.45,
    gradient: 0.6,
    bands: [
      { upTo: 0.34, texture: 'sea', bare: true },
      { upTo: 0.46, texture: 'shallows', bare: true },
      { upTo: 0.68, texture: 'sand' },
      { upTo: 1, texture: 'steppe' },
    ],
    props: [
      { prop: 'boulder', chance: 0.06, bands: [2] },
      { prop: 'bush', chance: 0.04, bands: [3] },
      { prop: 'outcrop', chance: 0.05, bands: [3] },
    ],
    darkness: 0,
    ambientColor: '#0e161c',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 1,
  },
  marsh: {
    id: 'marsh',
    defaultGround: 'swamp_mud',
    defaultProp: 'wall_timber',
    relief: 10,
    damp: 0.45,
    gradient: 0.15,
    bands: [
      { upTo: 0.4, texture: 'shallows', bare: true },
      { upTo: 0.74, texture: 'swamp_mud' },
      { upTo: 1, texture: 'moss_stone_floor' },
    ],
    props: [
      { prop: 'tree', chance: 0.13, bands: [1, 2] },
      { prop: 'bush', chance: 0.07, bands: [1] },
    ],
    pools: [{ kind: 'miasma', texture: 'poison_pool', density: 0.55, size: 3, chance: 5, bands: [0, 1] }],
    darkness: 0.35,
    ambientColor: '#101511',
    weatherKind: 'fog',
    weatherDensity: 0.3,
    gridShow: true,
    torches: 2,
  },
  snowfield: {
    id: 'snowfield',
    defaultGround: 'gravel',
    defaultProp: 'wall_ice',
    relief: 12,
    damp: 0.45,
    bands: [
      { upTo: 0.4, texture: 'ice' },
      { upTo: 0.85, texture: 'gravel' },
      { upTo: 1, texture: 'rock' },
    ],
    props: [
      { prop: 'tree', chance: 0.06, bands: [1] },
      { prop: 'boulder', chance: 0.05, bands: [1, 2] },
      { prop: 'outcrop', chance: 0.06, bands: [2] },
    ],
    darkness: 0,
    ambientColor: '#141c22',
    weatherKind: 'snow',
    weatherDensity: 0.35,
    gridShow: true,
    torches: 2,
  },
  wasteland: {
    id: 'wasteland',
    defaultGround: 'desert',
    defaultProp: 'wall_sandstone',
    relief: 11,
    damp: 0.45,
    bands: [
      { upTo: 0.38, texture: 'packed_earth' },
      { upTo: 0.82, texture: 'desert' },
      { upTo: 1, texture: 'rubble_floor' },
    ],
    props: [
      { prop: 'boulder', chance: 0.07, bands: [1, 2] },
      { prop: 'cactus', chance: 0.06, bands: [1] },
      { prop: 'outcrop', chance: 0.08, bands: [2] },
      { prop: 'bush', chance: 0.04, bands: [0], skin: { side: 'rock_moss', top: 'rock_moss' } },
    ],
    darkness: 0,
    ambientColor: '#1a140e',
    weatherKind: 'sand',
    weatherDensity: 0.2,
    gridShow: true,
    torches: 1,
  },
  /**
   * Streets between office blocks, the tallest in the middle, at dusk.
   *
   * The blocks are cut on one grid so the avenues run straight across the board, with a
   * pavement round each block and a square here and there where a lot was left open. The towers
   * are glass or concrete, and stop at seven cells: any taller and a table seen at a slant is
   * all facade and no street.
   */
  city: {
    id: 'city',
    defaultGround: 'asphalt',
    defaultProp: 'wall_facade',
    relief: 10,
    damp: 0,
    bands: [
      { upTo: 0.4, texture: 'asphalt' },
      { upTo: 0.7, texture: 'sidewalk' },
      { upTo: 1, texture: 'stone_tile' },
    ],
    props: [{ prop: 'bush', chance: 0.3, bands: [2] }],
    town: {
      street: { least: 2, most: 3 },
      block: { least: 7, most: 11 },
      kerb: 1,
      lot: { least: 3, most: 5 },
      storeys: { least: 2.5, most: 7 },
      downtown: true,
      vacancy: 12,
      skins: [
        { side: 'wall_facade', top: 'rooftop' },
        { side: 'wall_facade_concrete', top: 'rooftop' },
      ],
      setbackAbove: 4.5,
      roofPlant: 45,
      zones: { street: 0, kerb: 1, lot: 2 },
    },
    fires: { kinds: ['streetlamp'], bands: [1] },
    darkness: 0.35,
    ambientColor: '#101626',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 10,
  },
  /**
   * The same streets a century on, at night and in the rain.
   *
   * Towers of black glass banded with light and white panels seamed with it, streets paved in
   * metal, squares that glow, and light poles burning cyan and magenta along the walkways.
   */
  sfCity: {
    id: 'sfCity',
    defaultGround: 'sf_road',
    defaultProp: 'wall_sf_glass',
    relief: 10,
    damp: 0,
    bands: [
      { upTo: 0.4, texture: 'sf_road' },
      { upTo: 0.7, texture: 'sf_walkway' },
      { upTo: 1, texture: 'neon_floor' },
    ],
    props: [],
    town: {
      street: { least: 2, most: 3 },
      block: { least: 7, most: 11 },
      kerb: 1,
      lot: { least: 3, most: 5 },
      storeys: { least: 3.5, most: 8 },
      downtown: true,
      vacancy: 14,
      skins: [
        { side: 'wall_sf_glass', top: 'sf_rooftop' },
        { side: 'wall_sf_panel', top: 'sf_rooftop' },
      ],
      setbackAbove: 5,
      roofPlant: 50,
      zones: { street: 0, kerb: 1, lot: 2 },
    },
    fires: { kinds: ['neonpole'], bands: [1], colors: ['#00e5ff', '#ff2bd6'] },
    darkness: 0.6,
    ambientColor: '#0a0820',
    weatherKind: 'rain',
    weatherDensity: 0.2,
    gridShow: true,
    torches: 12,
  },
  /**
   * An old quarter of brick walk-ups, the kind of downtown the city grew out of.
   *
   * Every block is lined with row houses standing shoulder to shoulder on the pavement, brick
   * and brownstone, three and four storeys with water tanks on some of the roofs and yards
   * behind them in the middle of the block. Trees grow out of the pavement, lamps light it,
   * and now and then somebody has a fire going in a drum on the corner.
   */
  slum: {
    id: 'slum',
    defaultGround: 'asphalt',
    defaultProp: 'wall_brick_tenement',
    relief: 10,
    damp: 0,
    bands: [
      { upTo: 0.4, texture: 'asphalt' },
      { upTo: 0.7, texture: 'sidewalk' },
      { upTo: 1, texture: 'concrete_floor' },
    ],
    props: [{ prop: 'streetTree', chance: 0.7, bands: [1] }],
    town: {
      street: { least: 2, most: 2 },
      block: { least: 9, most: 12 },
      kerb: 1,
      lot: { least: 2, most: 3 },
      storeys: { least: 2.5, most: 4 },
      downtown: false,
      vacancy: 8,
      skins: [
        { side: 'wall_brick_tenement', top: 'tar_roof' },
        { side: 'wall_brownstone', top: 'tar_roof' },
      ],
      roofPlant: 30,
      plantSkin: { side: 'wood_plank', top: 'wood_plank' },
      frontage: 3,
      zones: { street: 0, kerb: 1, lot: 2 },
    },
    fires: { kinds: ['streetlamp', 'streetlamp', 'brazier'], bands: [1] },
    darkness: 0.35,
    ambientColor: '#17121a',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 9,
  },
  /**
   * The tip at the edge of town where the city's rubbish ends up, and the people who live off it.
   *
   * Tin shacks put up anyhow along lanes of mud, heaps of scrap between them and standing water
   * in the ruts, in the rain. The lanes wander because every row of shacks was put up on its own,
   * the shacks are low, knocked off square and never quite touching, and whoever is out tonight
   * is round a drum.
   */
  dump: {
    id: 'dump',
    defaultGround: 'slum_ground',
    defaultProp: 'wall_corrugated',
    relief: 9,
    damp: 0,
    bands: [
      { upTo: 0.5, texture: 'slum_ground' },
      { upTo: 0.85, texture: 'rubble_floor' },
      { upTo: 1, texture: 'swamp_mud' },
    ],
    props: [
      { prop: 'junk', chance: 0.14, bands: [0, 1] },
      { prop: 'bush', chance: 0.04, bands: [1], skin: { side: 'rock_moss', top: 'rock_moss' } },
    ],
    town: {
      street: { least: 1, most: 2 },
      block: { least: 4, most: 7 },
      kerb: 0,
      lot: { least: 2, most: 3 },
      storeys: { least: 1, most: 1.8 },
      downtown: false,
      vacancy: 24,
      skins: [{ side: 'wall_corrugated', top: 'wall_corrugated' }],
      roofPlant: 0,
      crooked: true,
      spin: 6,
      inset: 0.22,
      puddles: 0.22,
      zones: { street: 0, kerb: 0, lot: 1, puddle: 2 },
    },
    fires: { kinds: ['brazier', 'campfire'], bands: [0, 1] },
    darkness: 0.5,
    ambientColor: '#140f0a',
    weatherKind: 'rain',
    weatherDensity: 0.3,
    gridShow: true,
    torches: 6,
  },
};

/** The mood with that id, or woodland for an unknown one. */
export function fieldAtmosphereById(id: string): FieldAtmosphere {
  return FIELD_ATMOSPHERES[id as FieldAtmosphereId] ?? FIELD_ATMOSPHERES.woodland;
}
