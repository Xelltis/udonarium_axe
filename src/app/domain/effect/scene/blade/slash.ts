import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  drawCloud,
  drawSpark,
  DUST,
  layShockRing,
  rollingDust,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { type SlashHit, slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A cut: the blade sweeps an arc through the air across the target from the side its caster stands,
 * fast and easing at its end, a hard bright edge with a hot core and a softer light about it, its
 * tail thinning and fading behind it; where it crosses the target sparks fly and light flashes in a
 * cross. The forms differ as the old ones did: one stroke, five in a flurry, a drawing cut that is
 * stillness, a glint, an instant line and a wound that opens after it, a wide sweep and a cleave from
 * above, both gathered first, the cleave breaking the ground.
 */

/** How long a cut lingers after its playback while its wound fades, in seconds. */
const LINGER_S = 0.6;
/** How far through its stroke the blade crosses the target. */
const CROSSES_AT = 0.3;
/** How far round the arc the blade sweeps, either side of the target, in radians. */
const SWEEP = 1.35;
/** How much of the arc its tail trails behind the blade, in radians. */
const TAIL = 1.6;
/** The longest a stroke takes to sweep, in seconds. */
const STROKE_S = 0.32;
/** How far a drawing cut's wound opens after the line, in seconds. */
const WOUND_OPENS_S = 0.16;

interface CutThrow {
  /** The sparks each stroke throws where it crosses. */
  readonly sparks: readonly (readonly ThrownMote[])[];
  readonly dust: ReturnType<typeof rollingDust>;
}

const thrownByStage = new Map<string, CutThrow>();

export const slash: Choreography = { lingerS: LINGER_S, draw: drawSlash };

/** The ways a stroke sweeps: across the target as its caster sees it, and up, and back towards the caster. */
interface Frame {
  readonly across: Point;
  readonly up: Point;
  readonly toward: Point;
}

function drawSlash(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const style = stage.preset.slashLook;
  const hits = slashHits(style);
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const chest = { x: stage.x, y: stage.y, z: stage.z + cell * 0.55 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const frame = frameOf(stage);
  const ends = duration + LINGER_S;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return {
      sparks: hits.map((hit) => {
        const at = (hit.at + hit.span * CROSSES_AT) * duration + (style === 'iai' ? WOUND_OPENS_S : 0);
        return thrownSparks(th, chest, th.count(hits.length > 1 ? 10 : 20), [3.5, 9], [at, at + 0.02]);
      }),
      dust: style === 'heavy' || style === 'wide' ? rollingDust(th, floor, th.count(10), [2, 5]) : [],
    };
  });
  const forward = cell * 0.5;

  if (style === 'wide' || style === 'heavy') drawGathering(drawn, hits[0], stage, chest, frame, ramp, forward);
  if (style === 'iai') drawStillness(drawn, hits[0], stage, chest, frame, ramp, forward);

  hits.forEach((hit, index) => {
    // A stroke is quick, whatever its share of a long playback, and crosses as its blow lands.
    const takes = style === 'iai' ? Math.max(hit.span * duration, 0.07) : Math.min(hit.span * duration, STROKE_S);
    const from = (hit.at + hit.span * CROSSES_AT) * duration - takes * CROSSES_AT;
    const local = (t - from) / takes;
    const centre = {
      x: chest.x + frame.across.x * hit.offsetX * cell,
      y: chest.y + frame.across.y * hit.offsetX * cell,
      z: chest.z - hit.offsetY * cell,
    };
    if (style === 'iai') drawDrawingCut(drawn, hit, centre, frame, cell, ramp, t - from, takes);
    else drawStroke(drawn, hit, centre, frame, cell, ramp, local);
    // Where it crosses: light flashing in a cross and the sparks thrown off.
    const crossing = t - (from + takes * CROSSES_AT) - (style === 'iai' ? WOUND_OPENS_S : 0);
    if (crossing >= 0 && crossing < 0.16) {
      const fading = 1 - crossing / 0.16;
      const size = cell * (0.5 + hit.thickness / 60);
      drawn.motes.push({
        ...glow(centre, size, '#ffffff', fading, forward * 1.5),
        shape: 'flare',
        trail: 4 * fading + 1,
      });
      drawn.motes.push({ ...glow(centre, size * 0.9, ramp[5], fading, forward * 1.5), shape: 'star', spin: 0.6 });
      drawn.lights.push({ ...centre, color: ramp[5], strength: 1.2 * fading, reachPx: cell * 2 });
    }
    for (const [spark, flying] of thrown.sparks[index].entries())
      drawSpark(drawn, flying, t, cell * 0.8, ramp, spark, forward);
  });

  if (style === 'heavy' || style === 'wide') drawBreaking(drawn, hits[0], stage, floor, ramp, thrown.dust, forward);
  return drawn;
}

/** The ways a stroke sweeps, from where its caster stands, or from the south for one cast from nowhere. */
function frameOf(stage: Stage): Frame {
  const dx = stage.origin ? stage.x - stage.origin.x : 0;
  const dy = stage.origin ? stage.y - stage.origin.y : -1;
  const length = Math.hypot(dx, dy) || 1;
  const heading = { x: dx / length, y: dy / length };
  return {
    across: { x: -heading.y, y: heading.x, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    toward: { x: -heading.x, y: -heading.y, z: 0 },
  };
}

/** A point on a stroke's arc, a turn round from its middle, in the plane its angle tilts it to. */
function onArc(centre: Point, frame: Frame, hit: SlashHit, radius: number, turn: number): Point {
  const angle = (hit.angle * Math.PI) / 180;
  // The way the blade travels: across, tilted up or down by its angle; a blow brought down steeply
  // travels down, from above.
  const steep = -Math.sin(angle) > 0.5 ? -1 : 1;
  const travel = {
    x: frame.across.x * Math.cos(angle) * steep,
    y: frame.across.y * Math.cos(angle) * steep,
    z: -Math.sin(angle) * steep,
  };
  const along = Math.sin(turn) * radius;
  const bulge = (Math.cos(turn) - 0.75) * radius * 0.5;
  return {
    x: centre.x + travel.x * along + frame.toward.x * bulge,
    y: centre.y + travel.y * along + frame.toward.y * bulge,
    z: centre.z + travel.z * along + frame.toward.z * bulge,
  };
}

/**
 * One stroke at a share of its way: its blade's head sweeping round the arc fast, easing at the end,
 * its tail trailing behind it and thinning; as the head stops the tail runs up to it and is gone.
 */
function drawStroke(
  drawn: Staged,
  hit: SlashHit,
  centre: Point,
  frame: Frame,
  cell: number,
  ramp: readonly string[],
  share: number
): void {
  if (share <= 0 || share >= 1.35) return;
  const head = -SWEEP + 2 * SWEEP * outCubic(Math.min(1, share));
  const catching = within(share, 1, 1.35);
  const tail = Math.max(-SWEEP, head - TAIL * (1 - catching));
  if (head - tail < 0.02) return;
  const radius = (hit.reach / 2) * cell;
  const thick = cell * Math.min(hit.thickness / 60, 0.5) * (1 - catching * 0.7);
  drawn.ribbons.push(...bladeRibbons(centre, frame, hit, radius, tail, head, thick, ramp, 1 - catching));
}

/** The bands of a blade's arc between two turns: a soft light about it, and a hard edge with a white core, both thinning to the tail. */
function bladeRibbons(
  centre: Point,
  frame: Frame,
  hit: SlashHit,
  radius: number,
  tail: number,
  head: number,
  thick: number,
  ramp: readonly string[],
  alpha: number
): EffectRibbon[] {
  const steps = 22;
  const points = Array.from({ length: steps + 1 }, (_unused, index) =>
    onArc(centre, frame, hit, radius, tail + ((head - tail) * index) / steps)
  );
  const shares = points.map((_point, index) => index / steps);
  return [
    // A soft light about the blade.
    {
      points,
      widths: shares.map((share) => thick * 2 * Math.pow(share, 0.8)),
      color: ramp[2],
      core: ramp[4],
      alpha: 0.55 * alpha,
      alphas: shares.map((share) => share * share),
      blend: 'light',
    },
    // A dark rim, so the edge holds on a bright table.
    {
      points,
      widths: shares.map((share) => thick * 0.72 * Math.pow(share, 0.6)),
      color: ramp[1],
      alpha: 0.9 * alpha,
      alphas: shares.map((share) => Math.min(1, share * 1.4)),
      blend: 'color',
    },
    // The edge itself: light colour, white at its core.
    {
      points,
      widths: shares.map((share) => thick * 0.5 * Math.pow(share, 0.6)),
      color: ramp[4],
      core: '#ffffff',
      alpha,
      alphas: shares.map((share) => Math.min(1, share * 1.6)),
      blend: 'color',
    },
  ];
}

/** The gathering before a wide sweep or a cleave: light drawn in to the target, and the line of the stroke pulled taut. */
function drawGathering(
  drawn: Staged,
  hit: SlashHit,
  stage: Stage,
  chest: Point,
  frame: Frame,
  ramp: readonly string[],
  forward: number
): void {
  const { cell } = stage;
  const charge = within(stage.seconds, 0, hit.at * stage.duration);
  if (charge <= 0 || charge >= 1) return;
  drawn.motes.push(glow(chest, cell * (1.4 - charge * 0.9), ramp[5], charge * 0.7, forward));
  for (let index = 0; index < 8; index++) {
    const turn = (Math.PI * 2 * index) / 8 + stage.seed;
    const out = cell * (2.2 - charge * 1.9);
    const at = { x: chest.x + Math.cos(turn) * out, y: chest.y + Math.sin(turn) * out, z: chest.z };
    const speed = cell * 3 * charge;
    drawn.motes.push({
      ...glow(at, cell * 0.06, ramp[5], charge, forward),
      shape: 'spark',
      velocity: { x: -Math.cos(turn) * speed, y: -Math.sin(turn) * speed, z: 0 },
      trail: 0.18,
    });
  }
  // The line the stroke will take, drawn taut.
  const radius = (hit.reach / 2) * cell;
  const line = [onArc(chest, frame, hit, radius, -SWEEP), onArc(chest, frame, hit, radius, SWEEP)];
  drawn.ribbons.push({
    points: line,
    widths: cell * 0.03,
    color: ramp[4],
    core: '#ffffff',
    alpha: charge * charge * 0.8,
    blend: 'light',
  });
}

/** The stillness before a drawing cut: nothing moves but a glint growing along the line it will take. */
function drawStillness(
  drawn: Staged,
  hit: SlashHit,
  stage: Stage,
  chest: Point,
  frame: Frame,
  ramp: readonly string[],
  forward: number
): void {
  const { cell } = stage;
  const hold = within(stage.seconds, 0, hit.at * stage.duration);
  if (hold <= 0 || hold >= 1) return;
  const half = cell * (0.3 + hold * 0.9);
  const travel = { x: frame.across.x, y: frame.across.y, z: Math.sin((-hit.angle * Math.PI) / 180) };
  drawn.ribbons.push({
    points: [
      { x: chest.x - travel.x * half, y: chest.y - travel.y * half, z: chest.z - travel.z * half },
      chest,
      { x: chest.x + travel.x * half, y: chest.y + travel.y * half, z: chest.z + travel.z * half },
    ],
    widths: [0, cell * 0.035, 0],
    color: ramp[4],
    core: '#ffffff',
    alpha: hold * hold,
    blend: 'light',
  });
  drawn.motes.push(glow(chest, cell * 0.25, '#ffffff', hold * hold * 0.6, forward));
}

/**
 * A drawing cut: the line drawn at once, long and thin and nearly level, held an instant and thinning
 * away; and after it the wound opening, a moment later, where the sparks fly.
 */
function drawDrawingCut(
  drawn: Staged,
  hit: SlashHit,
  centre: Point,
  frame: Frame,
  cell: number,
  ramp: readonly string[],
  since: number,
  takes: number
): void {
  if (since < 0) return;
  const lasts = takes + 0.35;
  const left = 1 - since / lasts;
  if (left <= 0) return;
  const half = (hit.reach / 2) * cell;
  const angle = (hit.angle * Math.PI) / 180;
  const travel = { x: frame.across.x * Math.cos(angle), y: frame.across.y * Math.cos(angle), z: -Math.sin(angle) };
  const drawnOut = Math.min(1, since / Math.max(takes * 0.3, 0.02));
  const points = Array.from({ length: 9 }, (_unused, index) => {
    const share = (index / 8) * 2 - 1;
    const reach = share * half * drawnOut;
    return { x: centre.x + travel.x * reach, y: centre.y + travel.y * reach, z: centre.z + travel.z * reach };
  });
  const across = points.map((_point, index) => Math.sin((index / 8) * Math.PI));
  drawn.ribbons.push({
    points,
    widths: across.map((share) => cell * 0.12 * share * left),
    color: ramp[3],
    core: '#ffffff',
    alpha: left,
    blend: 'color',
  });
  drawn.ribbons.push({
    points,
    widths: across.map((share) => cell * 0.4 * share * left),
    color: ramp[2],
    alpha: 0.5 * left,
    blend: 'light',
  });
  // The wound opening after the line: a brief burst of light along it.
  const wound = (since - WOUND_OPENS_S) / 0.25;
  if (wound > 0 && wound < 1) {
    drawn.ribbons.push({
      points,
      widths: across.map((share) => cell * 0.28 * share * (1 - wound)),
      color: ramp[4],
      core: '#ffffff',
      alpha: 1 - wound,
      blend: 'light',
    });
  }
}

/** What a wide sweep or a cleave breaks: the ground under a cleave cracks, and dust is thrown out by both. */
function drawBreaking(
  drawn: Staged,
  hit: SlashHit,
  stage: Stage,
  floor: Point,
  ramp: readonly string[],
  dust: ReturnType<typeof rollingDust>,
  forward: number
): void {
  const { cell } = stage;
  const struck = (hit.at + hit.span * CROSSES_AT) * stage.duration;
  const since = stage.seconds - struck;
  if (since < 0) return;
  const clearing = 1 - within(since, stage.duration - struck + LINGER_S - 0.4, stage.duration - struck + LINGER_S);
  if (stage.preset.slashLook === 'heavy') {
    drawn.floor.push(
      floorMark(
        'cracks',
        floor,
        cell * 1.6 * Math.min(1, since / 0.1),
        0.3,
        DUST,
        0.75 * clearing,
        'color',
        stage.seed % 89,
        stage.seed
      )
    );
    if (since < 0.6) {
      drawn.floor.push(
        floorMark('cracks', floor, cell * 1.6, 0.14, ramp[4], 1 - since / 0.6, 'light', stage.seed % 89, stage.seed)
      );
    }
  }
  layShockRing(drawn, floor, cell * 0.3, cell * 2.2, cell * 0.1, ramp[4], since, 0.35);
  for (const cloud of dust) drawCloud(drawn, cloud, since, cell, forward);
}
