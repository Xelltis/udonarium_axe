import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { sealSeedOf } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, type Point } from '@axe/domain/effect/scene/parts';
import { hueTone, layBoldBand } from '@axe/domain/effect/scene/space/space-bold';

/*
 * The circle a summoning is written in, laid flat on the floor: a band of glyphs between rims, written
 * round by a pen of light, and a star of five points within it, traced stroke by stroke in one line by
 * the same pen, each turning its own way once it is written. A summoning is told by its own colours:
 * bodies of the full colour of its deep colour, set on a near black, with lines of its light colour
 * taken to gold burning through them. Every line of it is laid four times, light glowing under a heavy
 * underlay of near black, a body of the deep colour and a gold heart, so it holds on a bright table.
 */

/** The colours of a summoning: its near black, the dark of its rims, the full colour of its bodies, its gold, and the pale of its gold. */
export interface SummonTones {
  readonly ink: string;
  readonly rim: string;
  readonly body: string;
  readonly gold: string;
  readonly pale: string;
}

/** The colours of a summoning: its bodies of the hue of its deep colour, and its gold of the hue of its light colour. */
export function summonTonesOf(light: string, deep: string): SummonTones {
  return {
    ink: hueTone(deep, 0.07, 0.7),
    rim: hueTone(deep, 0.17, 0.85),
    body: hueTone(deep, 0.42, 1),
    gold: hueTone(light, 0.55, 1),
    pale: hueTone(light, 0.82, 1),
  };
}

/** Where the points of the star lie out from the middle of the circle, as a share of its reach: as the floor mark lays them. */
const STAR_REACH = 0.7;
/** The order the pen traces the points of the star in, so that the whole star is one line. */
const STAR_ORDER = [0, 2, 4, 1, 3, 0];

/** How a circle is seen at a moment: how much of each part is written, how far each is turned, and how lit it is. */
export interface CircleLook {
  readonly band: number;
  readonly star: number;
  readonly bandTurn: number;
  readonly starTurn: number;
  /** How much of the circle is seen, its colour and its light. */
  readonly alpha: number;
  readonly lit: number;
  /** How white its light is, from its own glow at 0 to white at 1. */
  readonly white: number;
  /** What picks its glyphs. */
  readonly pattern: number;
  /** The colour of the heart of its lines: the gold of the effect. */
  readonly heart: string;
}

/**
 * Where a point of the star lies on the table: as the floor mark draws it, its points at turns
 * counted from the north the way the mark is turned, and the mark's turns run against the table's.
 */
export function starPoint(middle: Point, reach: number, turn: number, index: number): Point {
  const angle = turn - (Math.PI / 2 + (index * Math.PI * 2) / 5);
  return {
    x: middle.x + Math.cos(angle) * reach * STAR_REACH,
    y: middle.y + Math.sin(angle) * reach * STAR_REACH,
    z: middle.z,
  };
}

/** Where on the table the pen writing the band of glyphs is, when so much of the band is written. */
export function bandPenAt(middle: Point, reach: number, turn: number, written: number): Point {
  const angle = turn - written * Math.PI * 2;
  return { x: middle.x + Math.cos(angle) * reach * 0.86, y: middle.y + Math.sin(angle) * reach * 0.86, z: middle.z };
}

/**
 * Lays one part of the circle as a mark, four times over: light glowing wide under a heavy underlay of
 * near black, a body of the deep colour and a gold heart, since colour is laid over light.
 */
function laySealPart(
  drawn: Staged,
  floor: Point,
  reach: number,
  part: 'glyphs' | 'star',
  written: number,
  turn: number,
  tones: SummonTones,
  look: CircleLook
): void {
  if (written <= 0.002 || look.alpha <= 0.01) return;
  const seed = sealSeedOf(part, look.pattern, written);
  if (look.lit > 0.01) {
    const light = mixColor(tones.gold, '#ffffff', look.white);
    drawn.floor.push(floorMark('seal', floor, reach, 0.3, light, 0.32 * look.lit, 'light', seed, turn));
  }
  drawn.floor.push(floorMark('seal', floor, reach, 0.23, tones.ink, 0.95 * look.alpha, 'color', seed, turn));
  drawn.floor.push(floorMark('seal', floor, reach, 0.14, tones.body, look.alpha, 'color', seed, turn));
  const heart = mixColor(look.heart, '#ffffff', 0.85 * look.white);
  drawn.floor.push(
    floorMark('seal', floor, reach, 0.06, heart, look.alpha * Math.min(1, 0.45 + look.lit), 'color', seed, turn)
  );
}

/** Lays the circle on the floor as it is seen at a moment. */
export function layCircle(drawn: Staged, floor: Point, reach: number, tones: SummonTones, look: CircleLook): void {
  laySealPart(drawn, floor, reach, 'glyphs', look.band, look.bandTurn, tones, look);
  laySealPart(drawn, floor, reach, 'star', look.star, look.starTurn, tones, look);
}

/**
 * Traces the star in one line with a pen of light, as far as `traced` says from nothing to all of it,
 * as a band along the floor: the strokes traced so far and the pen at the end of them.
 */
export function traceStar(
  drawn: Staged,
  floor: Point,
  reach: number,
  turn: number,
  traced: number,
  alpha: number,
  tones: SummonTones,
  cell: number,
  forward: number
): Point | null {
  if (traced <= 0 || alpha <= 0.01) return null;
  const strokes = STAR_ORDER.length - 1;
  const along = Math.min(1, traced) * strokes;
  const points: Point[] = [starPoint(floor, reach, turn, STAR_ORDER[0])];
  for (let stroke = 0; stroke < strokes && stroke < along; stroke++) {
    const from = starPoint(floor, reach, turn, STAR_ORDER[stroke]);
    const to = starPoint(floor, reach, turn, STAR_ORDER[stroke + 1]);
    const share = Math.min(1, along - stroke);
    points.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share, z: floor.z });
  }
  const head = points[points.length - 1];
  layBoldBand(
    drawn,
    points.map((point) => ({ ...point, z: point.z + 1 })),
    { rim: tones.ink, body: tones.body, core: tones.gold, glow: tones.gold, lit: alpha, wide: cell * 0.2, alpha }
  );
  if (traced < 1) drawPen(drawn, head, tones, cell, forward);
  return head;
}

/** The pen of light that writes the circle: a burning point of gold on the floor throwing a spark or two. */
export function drawPen(drawn: Staged, at: Point, tones: SummonTones, cell: number, forward: number): void {
  const lifted = { x: at.x, y: at.y, z: at.z + cell * 0.06 };
  drawn.motes.push(glow(lifted, cell * 1.1, tones.gold, 0.8, forward));
  drawn.motes.push({ ...glow(lifted, cell * 0.65, '#ffffff', 1, forward + 1), shape: 'star', spin: at.x * 0.1 });
  drawn.floor.push(floorMark('disc', at, cell * 0.55, 1, tones.gold, 0.6, 'light', 0));
}
