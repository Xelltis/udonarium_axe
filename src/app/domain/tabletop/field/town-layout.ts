import { seededRandom } from '@axe/core/util/seeded-random';
import { TownPlan } from '@axe/domain/tabletop/field/field-atmosphere';
import { fbm, makeValueNoise } from '@axe/domain/tabletop/field/field-noise';
import { MapPoint, MapRect } from '@axe/domain/tabletop/map-blocks';

/** One building standing on its lot. */
export interface FieldBuilding extends MapRect {
  /** How tall it stands to its roof, in cells. */
  height: number;
  /** How tall the podium it rises from is, in cells; nothing where it rises sheer from its lot. */
  podium: number;
  /** Which of the town's facades it wears, by index. */
  skin: number;
  /** How far it stands off square, in degrees. */
  spin: number;
  /** The cell of its roof a tank or a plant room stands on, if it carries one. */
  plant: MapPoint | null;
}

/** A town laid out: the band of ground each cell is painted with, and what stands on the lots. */
export interface TownGround {
  ground: Uint8Array;
  buildings: FieldBuilding[];
}

interface Span {
  start: number;
  size: number;
}

/** The narrowest a lot may be and still carry a building rather than a sliver of one. */
const MIN_BUILT_LOT = 2;

/** How big the puddles on a street are, in cells to the puddle. */
const PUDDLE_SCALE = 3;

function between(least: number, most: number, rng: () => number): number {
  return least + Math.floor(rng() * (most - least + 1));
}

/**
 * Where the blocks fall along one side of the board, with a street cut before each.
 *
 * It starts partway into a block, so that what lands on the board reads as a piece of a town
 * that goes on past its edge rather than a town that stops there.
 */
function blockSpans(total: number, plan: TownPlan, rng: () => number): Span[] {
  const spans: Span[] = [];
  let at = -Math.floor(rng() * plan.block.least);
  while (at < total) {
    const size = between(plan.block.least, plan.block.most, rng);
    const start = Math.max(0, at);
    const end = Math.min(total, at + size);
    if (start < end) spans.push({ start, size: end - start });
    at += size + between(plan.street.least, plan.street.most, rng);
  }
  return spans;
}

/** Cuts a block into lots no bigger than the plan allows, cutting the longer way first. */
function cutLots(rect: MapRect, plan: TownPlan, rng: () => number, lots: MapRect[]): void {
  const splitsAcross = rect.w > plan.lot.most && rect.w >= plan.lot.least * 2;
  const splitsDown = rect.h > plan.lot.most && rect.h >= plan.lot.least * 2;
  if (!splitsAcross && !splitsDown) {
    lots.push(rect);
    return;
  }
  const across = splitsAcross && (!splitsDown || rect.w >= rect.h);
  const length = across ? rect.w : rect.h;
  const cut = plan.lot.least + Math.floor(rng() * (length - plan.lot.least * 2 + 1));
  if (across) {
    cutLots({ x: rect.x, y: rect.y, w: cut, h: rect.h }, plan, rng, lots);
    cutLots({ x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }, plan, rng, lots);
  } else {
    cutLots({ x: rect.x, y: rect.y, w: rect.w, h: cut }, plan, rng, lots);
    cutLots({ x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut }, plan, rng, lots);
  }
}

/** Cuts a strip of frontage into narrow lots along its length, the last taking what is left. */
function cutStrip(rect: MapRect, plan: TownPlan, rng: () => number, lots: MapRect[]): void {
  const along = rect.w >= rect.h;
  const length = along ? rect.w : rect.h;
  let at = 0;
  while (at < length) {
    let size = between(plan.lot.least, plan.lot.most, rng);
    if (length - at - size < plan.lot.least) size = length - at;
    lots.push(
      along ? { x: rect.x + at, y: rect.y, w: size, h: rect.h } : { x: rect.x, y: rect.y + at, w: rect.w, h: size }
    );
    at += size;
  }
}

/**
 * Lines a block with narrow lots facing the street, and leaves the middle of it open.
 *
 * Row houses stand shoulder to shoulder along the pavement and keep their yards behind them. A
 * block too shallow to have a middle gets two rows back to back instead, so that every house
 * still has a front door on a street.
 */
function lineBlock(inner: MapRect, depth: number, plan: TownPlan, rng: () => number, lots: MapRect[]): void {
  const { x, y, w, h } = inner;
  if (h <= depth * 2) {
    const front = Math.ceil(h / 2);
    cutStrip({ x, y, w, h: front }, plan, rng, lots);
    if (h > front) cutStrip({ x, y: y + front, w, h: h - front }, plan, rng, lots);
    return;
  }
  if (w <= depth * 2) {
    const front = Math.ceil(w / 2);
    cutStrip({ x, y, w: front, h }, plan, rng, lots);
    if (w > front) cutStrip({ x: x + front, y, w: w - front, h }, plan, rng, lots);
    return;
  }
  cutStrip({ x, y, w, h: depth }, plan, rng, lots);
  cutStrip({ x, y: y + h - depth, w, h: depth }, plan, rng, lots);
  cutStrip({ x, y: y + depth, w: depth, h: h - depth * 2 }, plan, rng, lots);
  cutStrip({ x: x + w - depth, y: y + depth, w: depth, h: h - depth * 2 }, plan, rng, lots);
}

/**
 * How tall a building on this lot stands.
 *
 * Downtown, the tallest stand in the middle of the board and it falls away toward the edges,
 * which is the skyline a city is recognised by; elsewhere any lot is as likely as any other.
 */
function heightFor(lot: MapRect, plan: TownPlan, width: number, height: number, rng: () => number): number {
  const { least, most } = plan.storeys;
  let share = rng();
  if (plan.downtown) {
    const reach = Math.hypot(width / 2, height / 2) || 1;
    const nearness = 1 - Math.hypot(lot.x + lot.w / 2 - width / 2, lot.y + lot.h / 2 - height / 2) / reach;
    share = Math.min(1, Math.max(0, nearness * 0.8 + share * 0.35));
  }
  return Math.round((least + (most - least) * share) * 10) / 10;
}

function build(lot: MapRect, plan: TownPlan, width: number, height: number, rng: () => number): FieldBuilding {
  const tall = heightFor(lot, plan, width, height, rng);
  const setback = plan.setbackAbove !== undefined && tall > plan.setbackAbove && lot.w >= 4 && lot.h >= 4;
  const podium = setback ? 1 + Math.floor(rng() * 2) : 0;
  const skin = Math.floor(rng() * plan.skins.length) % plan.skins.length;
  const spin = plan.spin ? Math.round((rng() * 2 - 1) * plan.spin) : 0;
  let plant: MapPoint | null = null;
  if (rng() * 100 < plan.roofPlant) {
    const roof = podium > 0 ? { x: lot.x + 1, y: lot.y + 1, w: lot.w - 2, h: lot.h - 2 } : lot;
    plant = { x: roof.x + Math.floor(rng() * roof.w), y: roof.y + Math.floor(rng() * roof.h) };
  }
  return { ...lot, height: tall, podium, skin, spin, plant };
}

/** Lays standing water over the lowest share of the street, in patches rather than cell by cell. */
function flood(ground: Uint8Array, plan: TownPlan, width: number, height: number, seed: number): void {
  const share = plan.puddles ?? 0;
  const puddle = plan.zones.puddle;
  if (share <= 0 || puddle === undefined) return;
  const noise = makeValueNoise(seed + 5153);
  const street: { index: number; depth: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (ground[index] !== plan.zones.street) continue;
      street.push({ index, depth: fbm(noise, x / PUDDLE_SCALE, y / PUDDLE_SCALE, 2) });
    }
  }
  street.sort((left, right) => left.depth - right.depth);
  const flooded = Math.round(street.length * share);
  for (let i = 0; i < flooded; i++) ground[street[i].index] = puddle;
}

/**
 * Lays out a town: its streets across the board, a pavement round each block between them, the
 * blocks cut into lots, and a building put up on every lot not left standing empty.
 *
 * The streets run straight across the board on one grid, unless the town is crooked and cuts
 * each row of blocks on its own so its lanes wander and meet at odd places. A town of row houses
 * lines each block with them and leaves the middle open for yards, and a town with puddles
 * leaves standing water in the lowest of its lanes. Density fills the lots up: at the middle of
 * the range as many stand empty as the plan says, at the bottom half as many again are built on,
 * and at the top nearly all of them.
 */
export function layTown(plan: TownPlan, width: number, height: number, seed: number, density: number): TownGround {
  const rng = seededRandom(seed + 6007);
  const ground = new Uint8Array(width * height).fill(plan.zones.street);
  const buildings: FieldBuilding[] = [];
  const built = Math.min(1, Math.max(0, (1 - plan.vacancy / 100) * (0.5 + density / 100)));

  const rows = blockSpans(height, plan, rng);
  const shared = blockSpans(width, plan, rng);
  for (const row of rows) {
    const columns = plan.crooked ? blockSpans(width, plan, rng) : shared;
    for (const column of columns) {
      const block = { x: column.start, y: row.start, w: column.size, h: row.size };
      for (let dy = 0; dy < block.h; dy++) {
        for (let dx = 0; dx < block.w; dx++) ground[(block.y + dy) * width + block.x + dx] = plan.zones.kerb;
      }
      const inner = {
        x: block.x + plan.kerb,
        y: block.y + plan.kerb,
        w: block.w - plan.kerb * 2,
        h: block.h - plan.kerb * 2,
      };
      if (inner.w < 1 || inner.h < 1) continue;
      for (let dy = 0; dy < inner.h; dy++) {
        for (let dx = 0; dx < inner.w; dx++) ground[(inner.y + dy) * width + inner.x + dx] = plan.zones.lot;
      }

      const lots: MapRect[] = [];
      if (plan.frontage) lineBlock(inner, plan.frontage, plan, rng, lots);
      else cutLots(inner, plan, rng, lots);
      for (const lot of lots) {
        if (lot.w < MIN_BUILT_LOT || lot.h < MIN_BUILT_LOT || rng() >= built) continue;
        buildings.push(build(lot, plan, width, height, rng));
      }
    }
  }

  flood(ground, plan, width, height, seed);
  return { ground, buildings };
}
