import { type BladeTones, bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { type EarthTones, earthTonesOf, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { ball, glow, type Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { type StrikeLook, UNTHROWN_WAY } from '@axe/domain/effect/strike-looks';
import { strikeThrowOf } from '@axe/domain/effect/strike-reaction';

/*
 * The parts a blow is drawn with. The blow itself, a fist of force: a hard ball rimmed in near black,
 * its body the blow's colour at full strength and its heart white, so it holds over a bright table.
 * Where it lands, a star of thick spikes bursts out, each a dark rim about a coloured body about a
 * white heart, longer on the far side the blow drives on to; a solid white heart framed in the same
 * dark rim stamps the point struck; and rings of pressure snap out from it round the screen.
 *
 * Every length is in table pixels unless it says cells.
 */

/** Where a blow lands and which way it goes. */
export interface StrikeFrame {
  /** The foot of what it lands on, on the floor, and the point it lands on, its chest. */
  readonly floor: Point;
  readonly struck: Point;
  /** The way it drives, from the one who throws it to what it lands on, level and of length one. */
  readonly way: Point;
  /** Level and square to the way it drives, to its right as the one who throws it sees it. */
  readonly side: Point;
}

/** How high up what it lands on a blow lands, as a share of how tall it stands, and at the least, in cells. */
const LANDS_HIGH = 0.55;
const LANDS_LEAST = 0.3;
/** How close to what it lands on the one who throws a blow may stand for the way it drives to be told by where it stands, in cells. */
const THROWN_FROM_LEAST = 0.2;

/** Where a blow lands on a stage and which way it goes: from where it was thrown, or from the south-west for one thrown from nowhere. */
export function strikeFrameOf(stage: Stage): StrikeFrame {
  const dx = stage.origin ? stage.x - stage.origin.x : 0;
  const dy = stage.origin ? stage.y - stage.origin.y : 0;
  const far = Math.hypot(dx, dy);
  const way =
    far < stage.cell * THROWN_FROM_LEAST
      ? { x: UNTHROWN_WAY.x, y: UNTHROWN_WAY.y, z: 0 }
      : { x: dx / far, y: dy / far, z: 0 };
  return {
    floor: { x: stage.x, y: stage.y, z: stage.groundZ },
    struck: { x: stage.x, y: stage.y, z: stage.z + Math.max(stage.tall * LANDS_HIGH, stage.cell * LANDS_LEAST) },
    way,
    side: { x: -way.y, y: way.x, z: 0 },
  };
}

/** The colours a blow is drawn in, from its two colours: as a cut's are, a near black rim about a full body about a white heart. */
export function strikeTonesOf(stage: Stage): BladeTones {
  return bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
}

/** A point some way off another along a way. */
export function along(from: Point, way: Point, by: number): Point {
  return { x: from.x + way.x * by, y: from.y + way.y * by, z: from.z + way.z * by };
}

/** A way of length one. */
export function unit(way: Point): Point {
  const size = Math.hypot(way.x, way.y, way.z) || 1;
  return { x: way.x / size, y: way.y / size, z: way.z / size };
}

/** One spike of a star: which way it bursts, how far it reaches and how thick it is, as shares of the star's size. */
export interface StarSpike {
  readonly way: Point;
  readonly reach: number;
  readonly wide: number;
}

/**
 * The spikes of a star, spread evenly every way round a point and leant on to the way a blow drives,
 * those leaning on to it the longest: `lean` is how far, from 0 for an even star.
 */
export function starSpikes(count: number, drives: Point, lean: number, seed: number): StarSpike[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_unused, index) => {
    const up = 1 - ((index + 0.5) / count) * 1.7;
    const round = Math.sqrt(Math.max(0, 1 - up * up));
    const turn = index * golden + scatter(index, seed) * 0.6;
    const even = { x: Math.cos(turn) * round, y: Math.sin(turn) * round, z: up * 0.7 + 0.25 };
    const way = unit({ x: even.x + drives.x * lean, y: even.y + drives.y * lean, z: even.z + drives.z * lean });
    const ahead = Math.max(0, way.x * drives.x + way.y * drives.y + way.z * drives.z);
    return {
      way,
      reach: (index % 2 === 0 ? 1 : 0.62) * (0.8 + 0.35 * scatter(index, seed + 1)) * (1 + lean * 0.7 * ahead),
      wide: 0.15 + 0.07 * scatter(index, seed + 2),
    };
  });
}

/**
 * A star of thick spikes bursting out of a point, as large as `size` at its fullest and as far out as
 * `open` says, from 0 to 1: each a near black rim about the blow's body about a heart, white unless
 * `heart` says otherwise.
 */
export function drawStar(
  drawn: Staged,
  at: Point,
  size: number,
  spikes: readonly StarSpike[],
  tones: BladeTones,
  open: number,
  forward: number,
  heart = '#ffffff'
): void {
  if (open <= 0.01) return;
  for (const [color, wide, long, ahead] of [
    [tones.rim, 1.5, 1.12, 0],
    [tones.body, 1, 1, 1],
    [tones.pale, 0.62, 0.8, 2],
    [heart, 0.34, 0.6, 3],
  ] as const) {
    for (const spike of spikes) {
      const reach = size * spike.reach * long * open;
      const width = size * spike.wide * wide * (0.55 + 0.45 * open);
      if (reach < width) continue;
      drawn.motes.push({
        x: at.x + spike.way.x * reach,
        y: at.y + spike.way.y * reach,
        z: at.z + spike.way.z * reach,
        size: width,
        color,
        alpha: 1,
        blend: 'color',
        shape: 'tongue',
        velocity: { x: spike.way.x * reach, y: spike.way.y * reach, z: spike.way.z * reach },
        trail: 1,
        forward: forward + ahead,
      });
    }
  }
}

/** A hard round mark of the blow stamped over a point: a near black rim, the blow's body and a white heart. */
export function drawStamp(
  drawn: Staged,
  at: Point,
  size: number,
  tones: BladeTones,
  alpha: number,
  forward: number
): void {
  if (alpha <= 0.01 || size <= 0) return;
  drawn.motes.push(ball(at, size, tones.rim, alpha, forward, 0));
  drawn.motes.push(ball(at, size * 0.86, tones.body, alpha, forward + 1, 1.3));
  drawn.motes.push(ball(at, size * 0.66, tones.pale, alpha, forward + 2, 2.6));
  drawn.motes.push(ball(at, size * 0.5, '#ffffff', alpha, forward + 3, 3.9));
}

/**
 * Rings of pressure snapping out round the screen from where a blow lands, `since` seconds after it:
 * `count` of them, a little apart, each from small to as large as `reach` over `lasts` seconds.
 */
export function drawPressureRings(
  drawn: Staged,
  at: Point,
  reach: number,
  tones: BladeTones,
  since: number,
  lasts: number,
  count: number,
  forward: number
): void {
  for (let ring = 0; ring < count; ring++) {
    const share = 0.12 + 0.88 * within(since - ring * lasts * 0.28, 0, lasts);
    if (since < ring * lasts * 0.28 || share >= 1) continue;
    const size = reach * (0.25 + 0.75 * outCubic(share)) * (1 - ring * 0.14);
    const alpha = Math.pow(1 - share, 1.3);
    drawn.motes.push({ ...ball(at, size * 1.04, tones.rim, alpha * 0.85, forward, 0), shape: 'hoop' });
    drawn.motes.push({
      ...ball(at, size, ring % 2 === 0 ? tones.pale : '#ffffff', alpha, forward + 1, 0),
      shape: 'hoop',
    });
  }
}

/**
 * A fist of force: a hard ball rimmed in near black, the blow's body and a white heart, and behind it a
 * streak drawn out back along the way it came, as long as `streak`, widening up to the ball; `alpha`
 * fades it.
 */
export function drawFist(
  drawn: Staged,
  at: Point,
  wide: number,
  heading: Point,
  streak: number,
  tones: BladeTones,
  alpha: number,
  forward: number
): void {
  if (alpha <= 0.01) return;
  if (streak > wide * 0.5) {
    const tail = along(at, heading, -streak);
    const points = [0, 0.35, 0.7, 1].map((share) => ({
      x: tail.x + (at.x - tail.x) * share,
      y: tail.y + (at.y - tail.y) * share,
      z: tail.z + (at.z - tail.z) * share,
    }));
    const widths = [0, 0.4, 0.75, 1].map((share) => wide * share);
    drawn.ribbons.push(
      { points, widths: widths.map((width) => width * 1.3), color: tones.rim, alpha, blend: 'color' },
      { points, widths, color: tones.body, core: tones.hot, alpha, blend: 'color' }
    );
  }
  drawStamp(drawn, at, wide * 1.1, tones, alpha, forward + 3);
  drawn.motes.push(glow(at, wide * 1.7, tones.glow, 0.22 * alpha, forward + 2));
}

/** Lines of speed racing out from a point, in a fan about a way and as wide as `spread`, in radians, `since` seconds after it bursts. */
export function speedFan(
  drawn: Staged,
  at: Point,
  drives: Point,
  spread: number,
  reach: number,
  since: number,
  lasts: number,
  count: number,
  tones: BladeTones,
  seed: number,
  forward: number
): void {
  const racing = within(since, 0, lasts);
  if (racing <= 0 || racing >= 1) return;
  const side = { x: -drives.y, y: drives.x, z: 0 };
  for (let line = 0; line < count; line++) {
    const turn = (scatter(line, seed + 3) * 2 - 1) * spread;
    const rise = (scatter(line, seed + 4) * 1.4 - 0.25) * spread * 0.6;
    const way = unit({
      x: drives.x * Math.cos(turn) + side.x * Math.sin(turn),
      y: drives.y * Math.cos(turn) + side.y * Math.sin(turn),
      z: Math.sin(rise),
    });
    const out = reach * (0.2 + (0.8 + 0.4 * scatter(line, seed + 5)) * outCubic(racing));
    const speed = (reach / lasts) * 2.4 * (1 - racing);
    const mote: EffectMote = {
      ...glow(
        along(at, way, out),
        reach * (0.03 + 0.02 * scatter(line, seed + 6)),
        line % 3 === 0 ? '#ffffff' : tones.pale,
        1 - racing,
        forward
      ),
      blend: 'color',
      shape: 'spark',
      velocity: { x: way.x * speed, y: way.y * speed, z: way.z * speed },
      trail: 0.09,
    };
    drawn.motes.push(mote);
  }
}

/** The dust a blow kicks up off the floor: the dust of earth taken towards its dark broken ground, to show over a bright table. */
export function dustOf(earth: EarthTones): string {
  return mixColor(earth.dust, earth.earth, 0.35);
}

/**
 * The scores a piece knocked back drags along the floor behind its feet, as far as `strike-reaction`
 * throws it for the blow it is struck by, and the dust boiling up along them.
 */
export function laySkid(
  drawn: Staged,
  stage: Stage,
  knock: Point,
  look: StrikeLook,
  t: number,
  clearing: number
): void {
  const { cell } = stage;
  const { floor } = strikeFrameOf(stage);
  const earth = earthTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const thrown = strikeThrowOf(look);
  const skid = (cell / Math.max(0.1, stage.preset.sizeScale)) * thrown.cells;
  const dragged = outCubic(within(t, 0, thrown.outS));
  const across = { x: -knock.y, y: knock.x, z: 0 };
  for (const [foot, offset] of [
    [0, -0.13],
    [1, 0.13],
  ] as const) {
    const from = along(along(floor, across, cell * offset), knock, -cell * 0.1);
    const to = along(from, knock, cell * 0.1 + skid * dragged);
    layFissure(
      drawn,
      from,
      to,
      cell * 0.07,
      earth,
      0.15 * (1 - within(t, 0, 0.4)),
      0.85 * clearing,
      stage.seed + foot * 17
    );
  }
  if (t >= 0.9) return;
  for (let puff = 0; puff < 6; puff++) {
    const share = puff / 5;
    const born = share * thrown.outS;
    const age = within(t, born, born + 0.55 + 0.25 * scatter(puff, stage.seed));
    if (age <= 0 || age >= 1) continue;
    const at = along(floor, knock, skid * share);
    const size = cell * (0.28 + 0.4 * outCubic(age));
    const aside = (scatter(puff, stage.seed + 1) - 0.5) * cell * 0.4;
    drawn.motes.push({
      x: at.x + across.x * aside,
      y: at.y + across.y * aside,
      z: floor.z + size * 0.35 + cell * 0.25 * age,
      size,
      color: earth.dust,
      alpha: 0.55 * (1 - age),
      blend: 'color',
      shape: 'smoke',
      forward: 0,
    });
  }
}
