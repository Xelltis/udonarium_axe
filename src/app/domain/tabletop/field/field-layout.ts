import { seededRandom } from '@axe/core/util/seeded-random';
import { FIELD_PROP_SHAPES, FieldAtmosphere, FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';
import { makeValueNoise, ValueNoise, warpedFbm } from '@axe/domain/tabletop/field/field-noise';
import { FieldBuilding, layTown } from '@axe/domain/tabletop/field/town-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { HazardKind } from '@axe/domain/tabletop/hazard-presets';
import { hexLayoutOf, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { boardExtentPx } from '@axe/domain/tabletop/map-grid';

export interface FieldLayout {
  width: number;
  height: number;
  /** Which band of ground each cell fell into. */
  ground: Uint8Array;
  /** What stands on each cell, or an empty string where nothing does. */
  props: FieldGroundMark[];
  /** What stands on the ground as whole things rather than as cells: trees, boulders, crags. */
  objects: FieldObject[];
  /** Patches of ground with something in the air over them: a poisoned pool, a vent, a mire. */
  pools: FieldPool[];
  /** What stands on the lots of a town. Open country has none. */
  buildings: FieldBuilding[];
  /** How high the ground stands over the board, where it was raised at all. */
  relief?: GroundRaster | null;
}

/** What a cell is taken up by: something standing on it, a patch poured over it, a building, or nothing. */
export type FieldGroundMark = FieldPropId | 'pool' | 'building' | '';

/** A patch of ground that is not merely ground: what it is, and how thick it lies. */
export interface FieldPool {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  density: number;
  name: string;
  texture: string;
  /** What it is to walk into, where it is dangerous ground and not only a picture of it. */
  hazard?: HazardKind;
}

/**
 * One whole standing thing: a tree, a boulder, a crag.
 *
 * Placed as a thing rather than as a cell, because what makes it read as what it is - a
 * crown wider than its trunk, a stack of stone leaning off the grid - does not fit in one
 * square, and because two of them side by side have to differ to read as two.
 */
export interface FieldObject {
  x: number;
  y: number;
  prop: FieldPropId;
  /** What this one is made of, where its ground calls for something other than the usual. */
  skin?: { side: string; top: string };
  span: number;
  /** How far above its standing height this one sits. No two woods are level. */
  lift: number;
  /** How far it is turned off the grid, in degrees. */
  spin: number;
  /** How far from square its footprint falls, as a share of its width. */
  squash: number;
  /** How far each layer sits off the middle, in cells. A weathered stack is not a ziggurat. */
  drift: readonly { x: number; y: number }[];
}

/** The ground band a cell fell into, or 0 for a cell off the board. */
export function bandAt(layout: FieldLayout, x: number, y: number): number {
  if (x < 0 || y < 0 || layout.width <= x || layout.height <= y) return 0;
  return layout.ground[y * layout.width + x];
}

/** What takes up a cell, or empty for a cell off the board or with nothing on it. */
export function propAt(layout: FieldLayout, x: number, y: number): FieldGroundMark {
  if (x < 0 || y < 0 || layout.width <= x || layout.height <= y) return '';
  return layout.props[y * layout.width + x];
}

/** The four ways the ground can be tilted so that the low band gathers along one side. */
const RAMPS: readonly ((x: number, y: number, w: number, h: number) => number)[] = [
  (x, _y, w) => x / (w - 1),
  (x, _y, w) => 1 - x / (w - 1),
  (_x, y, _w, h) => y / (h - 1),
  (_x, y, _w, h) => 1 - y / (h - 1),
];

/** How many neighbours may already be taken before a cell is left clear, so ground stays open. */
const CROWD_LIMIT = 2;

/**
 * How the height field is read.
 *
 * Three octaves at this relief put the smallest fold at about three cells across; a fourth
 * would be finer than a cell, which is the static that made open ground read as a rash.
 */
const OCTAVES = 3;
/** How far a point is displaced before the height is read there, in lattice units. */
const WARP = 0.6;
/** How near two pools may lie, in cells. */
const POOL_SPACING = 8;

/** What is put down as a whole thing rather than as a cell of ground cover. */
const STANDING_PROPS: readonly FieldPropId[] = [
  'hill',
  'giantTree',
  'tree',
  'boulder',
  'outcrop',
  'cactus',
  'junk',
  'streetTree',
];

/** Below this share of the growth field nothing grows, and above it the stand thickens. */
const GROWTH_FLOOR = 0.3;
const GROWTH_GAIN = 2.4;

function bandFor(height: number, cuts: number[]): number {
  for (let i = 0; i < cuts.length; i++) {
    if (height <= cuts[i]) return i;
  }
  return cuts.length - 1;
}

/**
 * Puts the standing things in, as things rather than as a cell each.
 *
 * A tree is a trunk with a crown several times its width above it, and a crag is a stack of
 * stone leaning off the grid; one to a cell can only ever be a post with a lid or a block of
 * tofu. They are placed as whole things instead, no two closer than their own spacing, and
 * each one turned, squashed and lifted by its own amount so that no two are the same thing.
 */
function plant(
  prop: FieldPropId,
  atmosphere: FieldAtmosphere,
  ground: Uint8Array,
  props: FieldGroundMark[],
  objects: FieldObject[],
  width: number,
  height: number,
  growthField: Float64Array,
  thinnest: number,
  growthSpan: number,
  rng: () => number,
  scale: number
): void {
  const plans = atmosphere.props.filter((entry) => entry.prop === prop);
  if (plans.length === 0 || scale <= 0) return;

  const shape = FIELD_PROP_SHAPES[prop];
  const spacing = shape.spacing ?? 2;
  const standing = objects.filter((object) => object.prop === prop);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (props[index]) continue;
      // Ground of one kind carries more of a thing than ground of another, so each band
      // names its own thickness.
      const plan = plans.find((entry) => entry.bands.includes(ground[index]));
      if (!plan) continue;
      if (atmosphere.bands[ground[index]].bare) continue;

      const thickness = (growthField[index] - thinnest) / growthSpan;
      const clump = thickness <= GROWTH_FLOOR ? 0 : ((thickness - GROWTH_FLOOR) / (1 - GROWTH_FLOOR)) * GROWTH_GAIN;
      if (rng() >= plan.chance * scale * clump) continue;
      if (standing.some((other) => Math.abs(other.x - x) < spacing && Math.abs(other.y - y) < spacing)) continue;

      // Odd widths only: an even one cannot be centred on the cell it stands in.
      const grown = shape.span > 2 && rng() < 0.3 ? shape.span - 2 : shape.span;
      const reach = (grown - 1) / 2;
      if (x - reach < 0 || y - reach < 0 || width <= x + reach || height <= y + reach) continue;

      const object: FieldObject = {
        x,
        y,
        prop,
        skin: plan.skin,
        span: grown,
        lift: Math.round(rng() * 6) / 10,
        spin: Math.round((rng() * 2 - 1) * (shape.spin ?? 0)),
        squash: (rng() * 2 - 1) * (shape.squash ?? 0),
        drift: (shape.layers ?? []).map(() => ({
          x: (rng() * 2 - 1) * (shape.drift ?? 0),
          y: (rng() * 2 - 1) * (shape.drift ?? 0),
        })),
      };
      objects.push(object);
      standing.push(object);
      if (shape.claimsGround || shape.covers) {
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) props[(y + dy) * width + x + dx] = prop;
        }
      } else {
        props[index] = prop;
      }
    }
  }
}

/**
 * Puts down the patches that are worse than ground.
 *
 * A marsh with nothing in it but mud is scenery; one with a pool of something in it that
 * wants you out of it is a place to fight over. The patch takes the ground it covers, so
 * nothing is left standing in the middle of it.
 */
function pourPools(
  atmosphere: FieldAtmosphere,
  ground: Uint8Array,
  props: FieldGroundMark[],
  pools: FieldPool[],
  width: number,
  height: number,
  rng: () => number
): void {
  for (const plan of atmosphere.pools ?? []) {
    for (let y = 1; y < height - plan.size; y++) {
      for (let x = 1; x < width - plan.size; x++) {
        if (rng() >= plan.chance / (width * height)) continue;
        if (!clearFor(ground, props, width, x, y, plan.size, plan.bands)) continue;
        if (pools.some((pool) => Math.abs(pool.x - x) < POOL_SPACING && Math.abs(pool.y - y) < POOL_SPACING)) continue;

        for (let dy = 0; dy < plan.size; dy++) {
          for (let dx = 0; dx < plan.size; dx++) props[(y + dy) * width + x + dx] = 'pool';
        }
        pools.push({
          x,
          y,
          w: plan.size,
          h: plan.size,
          kind: plan.kind,
          density: plan.density,
          name: plan.kind,
          texture: plan.texture,
          hazard: plan.hazard,
        });
      }
    }
  }
}

/** Whether a whole patch of ground is of the right sort and has nothing standing on it. */
function clearFor(
  ground: Uint8Array,
  props: FieldGroundMark[],
  width: number,
  x: number,
  y: number,
  size: number,
  bands: readonly number[]
): boolean {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const index = (y + dy) * width + x + dx;
      if (props[index]) return false;
      if (!bands.includes(ground[index])) return false;
    }
  }
  return true;
}

/** The heights at which each band gives way to the next, so that each gets the share it asked for. */
function quantileCuts(heights: Float64Array, shares: readonly number[]): number[] {
  const sorted = Float64Array.from(heights).sort();
  return shares.map((share) => {
    const at = Math.min(sorted.length - 1, Math.max(0, Math.round(share * sorted.length) - 1));
    return sorted[at];
  });
}

/** Whether the whole footprint stands on ground that will take it, and on nothing else. */
function fits(
  atmosphere: FieldAtmosphere,
  ground: Uint8Array,
  props: FieldGroundMark[],
  width: number,
  height: number,
  x: number,
  y: number,
  span: number
): boolean {
  if (width - span < x || height - span < y) return false;
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      const index = (y + dy) * width + x + dx;
      if (props[index]) return false;
      if (atmosphere.bands[ground[index]].bare) return false;
    }
  }
  return true;
}

function crowded(props: FieldGroundMark[], width: number, height: number, x: number, y: number): boolean {
  let taken = 0;
  if (0 < x && props[y * width + x - 1]) taken++;
  if (x < width - 1 && props[y * width + x + 1]) taken++;
  if (0 < y && props[(y - 1) * width + x]) taken++;
  if (y < height - 1 && props[(y + 1) * width + x]) taken++;
  return CROWD_LIMIT <= taken;
}

/**
 * Lays out open ground: what it is made of, and what grows on it.
 *
 * Height decides the ground, a second noise decides where things grow thickest, and a
 * neighbour count keeps a wood from closing into a wall nobody can walk through. A town takes
 * its ground from its streets instead, and nothing grows where a building stands.
 *
 * Open country is raised as high as `reliefCells` from its lowest ground to its highest, along the
 * same height the bands are cut from, with open water left level; nothing is raised where it is 0.
 * Raised so, the ground makes its own hills, and none is built of steps of blocks on it.
 */
export function generateField(
  atmosphere: FieldAtmosphere,
  width: number,
  height: number,
  seed: number,
  density: number,
  reliefCells = 0,
  gridType: GridType = GridType.SQUARE
): FieldLayout {
  const relief = Math.max(1, atmosphere.relief);
  const ground = new Uint8Array(width * height);
  const props: FieldGroundMark[] = new Array(width * height).fill('');
  const objects: FieldObject[] = [];
  const pools: FieldPool[] = [];

  const land = makeValueNoise(seed);
  const drift = makeValueNoise(seed + 4409);
  const damp = makeValueNoise(seed + 2237);
  const growth = makeValueNoise(seed + 1013);
  const rng = seededRandom(seed + 7919);
  const ramp = RAMPS[Math.floor(rng() * RAMPS.length) % RAMPS.length];

  const buildings: FieldBuilding[] = [];
  let raster: GroundRaster | null = null;
  if (atmosphere.town) {
    const town = layTown(atmosphere.town, width, height, seed, density);
    ground.set(town.ground);
    buildings.push(...town.buildings);
    for (const building of buildings) {
      for (let dy = 0; dy < building.h; dy++) {
        for (let dx = 0; dx < building.w; dx++) props[(building.y + dy) * width + building.x + dx] = 'building';
      }
    }
  } else {
    const heightAt = (x: number, y: number) =>
      raisedAt(atmosphere, x, y, width, height, relief, land, drift, damp, ramp);
    const raised = raiseGround(atmosphere, ground, width, height, heightAt);
    if (reliefCells > 0) raster = reliefOf(atmosphere, { width, height }, gridType, reliefCells, raised, heightAt);
  }

  // Levelled over the board, the same way the height is, so that the bare places are as bare
  // and the thick places as thick whatever this particular board's noise happened to span.
  const growthField = new Float64Array(width * height);
  let thinnest = Infinity;
  let thickest = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = warpedFbm(growth, drift, x / (relief * 0.7), y / (relief * 0.7), 2, WARP);
      growthField[y * width + x] = value;
      thinnest = Math.min(thinnest, value);
      thickest = Math.max(thickest, value);
    }
  }
  const growthSpan = thickest - thinnest || 1;

  const scale = density / 50;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = ground[y * width + x];
      if (atmosphere.bands[band].bare) continue;
      if (crowded(props, width, height, x, y)) continue;

      // A wood is thick in places and thin in others, never evenly sprinkled, and the patches
      // it comes in are the size of the ground's own folds. Squaring it empties the thin parts
      // rather than dusting them, which is what makes a stand of trees read as a stand.
      const thickness = (growthField[y * width + x] - thinnest) / growthSpan;
      // Below the line nothing grows at all, which is what leaves clearings between the stands.
      const clump = thickness <= GROWTH_FLOOR ? 0 : ((thickness - GROWTH_FLOOR) / (1 - GROWTH_FLOOR)) * GROWTH_GAIN;
      for (const plan of atmosphere.props) {
        if (STANDING_PROPS.includes(plan.prop)) continue;
        if (!plan.bands.includes(band)) continue;
        const shape = FIELD_PROP_SHAPES[plan.prop];
        if (!fits(atmosphere, ground, props, width, height, x, y, shape.span)) continue;
        if (rng() < plan.chance * scale * clump) {
          for (let dy = 0; dy < shape.span; dy++) {
            for (let dx = 0; dx < shape.span; dx++) props[(y + dy) * width + x + dx] = plan.prop;
          }
          break;
        }
      }
    }
  }

  for (const prop of STANDING_PROPS) {
    if (raster && FIELD_PROP_SHAPES[prop].claimsGround) continue;
    plant(prop, atmosphere, ground, props, objects, width, height, growthField, thinnest, growthSpan, rng, scale);
  }
  pourPools(atmosphere, ground, props, pools, width, height, rng);

  return { width, height, ground, props, objects, pools, buildings, relief: raster };
}

/**
 * Reads the ground of open country off a height, one band to each share of it.
 *
 * Moisture is mixed in before the bands are cut rather than shifting a cell across one
 * afterwards: a hollow that holds water is lower ground as far as what grows there is
 * concerned, and folding it in here is what keeps each band to the share it asked for. Where
 * each band starts is read off the board rather than set against the raw height, so a preset
 * gets as much water or wood as it asked for whatever this board's noise happened to do.
 */
function raiseGround(
  atmosphere: FieldAtmosphere,
  ground: Uint8Array,
  width: number,
  height: number,
  heightAt: (x: number, y: number) => number
): { raised: Float64Array; cuts: number[] } {
  const raised = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raised[y * width + x] = heightAt(x, y);
  }
  const cuts = quantileCuts(
    raised,
    atmosphere.bands.map((band) => band.upTo)
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      ground[index] = bandFor(raised[index], cuts);
    }
  }
  return { raised, cuts };
}

/** How high open country stands at a point, in cells across and down, before it is cut into bands. */
function raisedAt(
  atmosphere: FieldAtmosphere,
  x: number,
  y: number,
  width: number,
  height: number,
  relief: number,
  land: ValueNoise,
  drift: ValueNoise,
  damp: ValueNoise,
  ramp: (x: number, y: number, w: number, h: number) => number
): number {
  const gradient = atmosphere.gradient ?? 0;
  const noise = warpedFbm(land, drift, x / relief, y / relief, OCTAVES, WARP);
  const tilt = gradient > 0 ? ramp(x, y, width, height) : 0;
  const wetness = warpedFbm(damp, drift, x / (relief * 1.6), y / (relief * 1.6), 2, WARP);
  const height01 = noise * (1 - gradient) + tilt * gradient;
  return height01 + (wetness - 0.5) * atmosphere.damp;
}

/** How far over the surface of the water beside it the land of a field with water starts, in cells. */
const SHORE_RISE_CELLS = 0.1;

/**
 * The ground of open country raised along the height its bands were cut from, at every sample of the
 * ground over the board: as high as `reliefCells` where the board stands highest, and at the board
 * where it stands lowest, or along the shore of the open water its lowest bands are. Under that water
 * the ground is dug down from the shore, as deep as the deepest of its bands asks where the board lies
 * lowest and never deeper than the ground is raised, so the water's surface lies at the board and the
 * shore runs wherever the ground comes up through it; water that asks for no depth is left level. The
 * land beside dug water starts a little over the surface, so the shore is a line, not sand awash.
 */
function reliefOf(
  atmosphere: FieldAtmosphere,
  size: { width: number; height: number },
  gridType: GridType,
  reliefCells: number,
  { raised, cuts }: { raised: Float64Array; cuts: number[] },
  heightAt: (x: number, y: number) => number
): GroundRaster {
  let lowest = Infinity;
  let top = -Infinity;
  for (const value of raised) {
    lowest = Math.min(lowest, value);
    top = Math.max(top, value);
  }
  let shore = lowest;
  for (let band = 0; band < atmosphere.bands.length - 1 && atmosphere.bands[band].bare; band++) {
    shore = cuts[band];
  }
  const span = top - shore || 1;
  const dug = Math.min(reliefCells, Math.max(0, ...atmosphere.bands.map((band) => band.water?.depth ?? 0)));
  const fall = shore - lowest || 1;
  const rise = dug > 0 ? Math.min(SHORE_RISE_CELLS, reliefCells) : 0;
  const extent = boardExtentPx(size, { type: gridType, sizePx: 1 });
  const columns = Math.ceil(extent.widthPx * GROUND_SAMPLES_PER_CELL) + 1;
  const rows = Math.ceil(extent.heightPx * GROUND_SAMPLES_PER_CELL) + 1;
  const heights = new Float32Array(columns * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const at = layoutPointOf(gridType, i / GROUND_SAMPLES_PER_CELL, j / GROUND_SAMPLES_PER_CELL);
      const raisedTo = heightAt(at.x, at.y);
      heights[j * columns + i] =
        dug > 0 && raisedTo <= shore
          ? 0 - dug * Math.min(1, (shore - raisedTo) / fall)
          : rise + (reliefCells - rise) * Math.min(1, Math.max(0, (raisedTo - shore) / span));
    }
  }
  return { columns, rows, heights };
}

/**
 * Where a point of the board, in cells from its top left, falls among the cells of the layout, which
 * read their heights at their indices: a square's index is half a cell short of its middle, and a hex
 * column or row is taken at its average stagger, so the ground runs on unbroken from one to the next.
 */
function layoutPointOf(gridType: GridType, x: number, y: number): { x: number; y: number } {
  if (!isHexGrid(gridType)) return { x: x - 0.5, y: y - 0.5 };
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(1, isFlatTopGrid(gridType));
  return isFlatTop ? { x: x / colSpacing, y: y / rowSpacing - 0.25 } : { x: x / colSpacing - 0.25, y: y / rowSpacing };
}
