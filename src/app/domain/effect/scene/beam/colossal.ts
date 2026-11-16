import { BEAM_FIRES_AT, beamTimingOf } from '@axe/domain/effect/beam-looks';
import {
  type BeamLine,
  beamLineOf,
  type BeamPose,
  beamRingOf,
  beamSwellAt,
  onLine,
} from '@axe/domain/effect/scene/beam/beam-body';
import {
  layBeamEmbers,
  layBowWash,
  layGathering,
  layOrb,
  layRelease,
  layTrench,
  layTrenchSmoke,
  type Washed,
} from '@axe/domain/effect/scene/beam/beam-parts';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { footUnder } from '@axe/domain/effect/scene/effect-mouth';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, layShockRing, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, hueOf, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A colossal beam, whatever its body is drawn as. It gathers before its caster, its line shown by a
 * thin lance for an instant, and is let go in a white flash that the clock holds on: the whole of it
 * is there at once, from its muzzle through its target and far beyond. It pours for as long as it is
 * fired, washing over every piece that stands in it, burning a trench along the floor under it and
 * lighting the floor either side; then it thins from its muzzle and breaks up into embers of light
 * that drift on the way it ran, and the trench is left to glow, cool and smoke.
 */

/** How far beyond its target a colossal beam runs, and over how much of that it is drawn out to a point, in cells. */
const BEYOND = 5;
const TAIL = 1.9;
/** How far before the middle of its caster the ball gathers, in cells, and at the most as a share of the way to the target. */
const BEFORE = 0.55;
const BEFORE_AT_MOST = 0.5;
/** How far off a beam cast from nowhere comes from, in cells. */
const FROM_NOWHERE = 5.5;
/** How high over the floor the middle of the beam runs at the least, as a share of its width. */
const CLEARS_FLOOR = 0.52;
/** How often a ring is shed at the muzzle while the beam pours, how long it rides down it, in seconds, and how fast, in widths a second. */
const RING_EVERY_S = 0.3;
const RING_RIDES_S = 0.8;
const RING_PACE = 9;
/** How long the trench goes on glowing once the beam has left it, in seconds. */
const TRENCH_COOLS_S = 1.5;
/** How many pieces standing by are washed over at the most. */
const MOST_WASHED = 4;

/** How the body of a colossal beam is drawn, and in what colours it throws light off. */
export interface ColossalLook {
  /** How wide its body is, in cells. */
  readonly wide: number;
  /** The colours of what it throws off: the streaks it gathers, what breaks off it on a piece, and its embers. */
  colorsOf(ramp: readonly string[]): readonly string[];
  /** Lays its body; `glare` is how much of the white of its release is still on it. */
  layBody(drawn: Staged, pose: BeamPose, ramp: readonly string[], glare: number): void;
  /** The steps of colour the ball at its muzzle is of, the colour of the light it throws, and the colour it lights the floor at a share of its length; its own colour without them. */
  orbOf?(ramp: readonly string[]): readonly string[];
  lightOf?(ramp: readonly string[]): string;
  floorOf?(ramp: readonly string[], share: number): string;
  /** Lays what is its own while it gathers, `gather` of the way to its release, and while it pours. */
  layGathering?(
    drawn: Staged,
    stage: Stage,
    line: BeamLine,
    floor: Point,
    ramp: readonly string[],
    gather: number
  ): void;
  layPouring?(drawn: Staged, stage: Stage, pose: BeamPose, ramp: readonly string[], since: number): void;
}

/** The line a colossal beam runs along, the floor under its muzzle, and how far along it its target stands. */
export interface ColossalLine {
  readonly line: BeamLine;
  readonly floor: Point;
  readonly strikes: number;
}

/**
 * Where a colossal beam runs: from before its caster's body, on the side of its target, high enough
 * to clear the floor, through its target and on beyond it; cast from nowhere, in from off to one side.
 */
export function colossalLineOf(stage: Stage, wide: number): ColossalLine {
  const { cell } = stage;
  const high = wide * CLEARS_FLOOR;
  const strike = { x: stage.x, y: stage.y, z: Math.max(stage.z + cell * 0.55, stage.groundZ + high) };
  const base = stage.mouth ?? stage.origin;
  let muzzle: Point;
  let floorZ = stage.groundZ;
  if (base && stage.origin) {
    const dx = strike.x - base.x;
    const dy = strike.y - base.y;
    const far = Math.hypot(dx, dy) || 1;
    const before = Math.min(cell * BEFORE, far * BEFORE_AT_MOST);
    floorZ = stage.mouth ? footUnder(stage.mouth) : stage.origin.z - (cell / stage.preset.sizeScale) * 0.6;
    muzzle = { x: base.x + (dx / far) * before, y: base.y + (dy / far) * before, z: Math.max(base.z, floorZ + high) };
  } else {
    const off = (cell * FROM_NOWHERE) / Math.SQRT2;
    muzzle = { x: strike.x - off, y: strike.y + off, z: strike.z };
  }
  const reach = beamLineOf(muzzle, strike);
  const end = onLine(reach, reach.length + cell * BEYOND);
  return {
    line: beamLineOf(muzzle, { ...end, z: Math.max(end.z, stage.groundZ + high) }),
    floor: { x: muzzle.x, y: muzzle.y, z: floorZ },
    strikes: reach.length,
  };
}

/** How much of its detail a colossal beam keeps where a cast fires several: what the scene draws in a frame is shared between them. */
function detailOf(stage: Stage): number {
  return Math.min(1, Math.pow(2 / Math.max(1, stage.targets.length), 0.8));
}

/** The pieces standing in a beam's line besides its own target, nearest the muzzle first. */
function washedBy(stage: Stage, line: BeamLine, wide: number): Washed[] {
  const others = [...stage.targets.filter((target) => target.index !== stage.index), ...(stage.bystanders ?? [])];
  const washed: Washed[] = [];
  for (const piece of others) {
    const dx = piece.x - line.from.x;
    const dy = piece.y - line.from.y;
    const along = dx * line.way.x + dy * line.way.y;
    const off = Math.abs(dx * line.side.x + dy * line.side.y);
    if (along < wide * 0.5 || along > line.length - wide || off > (wide + piece.widthPx) * 0.5) continue;
    washed.push({ x: piece.x, y: piece.y, z: piece.z, widthPx: piece.widthPx, along });
  }
  return washed.sort((a, b) => a.along - b.along).slice(0, MOST_WASHED);
}

const sparksByStage = new Map<string, ThrownMote[]>();

/** Draws a colossal beam on one target at a moment, its body as `look` has it: see the header. */
export function drawColossal(stage: Stage, look: ColossalLook, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const colors = look.colorsOf(ramp);
  const orb = look.orbOf?.(ramp) ?? ramp;
  const wide = cell * look.wide;
  const timing = beamTimingOf(duration, stage.blowsAt[0] ?? duration * BEAM_FIRES_AT);
  const { line, floor, strikes } = colossalLineOf(stage, wide);
  const detail = detailOf(stage);
  const forward = cell * 0.4;
  const ends = duration + lingerS;
  const since = t - timing.firesAt;
  const struck = onLine(line, strikes);
  const trench = {
    from: { ...onLine(line, wide * 0.9), z: stage.groundZ },
    to: { ...onLine(line, line.length - cell * TAIL * 0.6), z: stage.groundZ },
    wide: wide * 0.62,
    seed: stage.seed,
  };

  if (since < 0) {
    const gather = within(t, 0, timing.firesAt);
    layGathering(
      drawn,
      {
        at: line.from,
        floor,
        line,
        cell,
        size: wide * 0.95,
        seconds: t,
        seed: stage.seed,
        streaks: Math.round(40 * detail),
        colors,
      },
      orb,
      gather
    );
    look.layGathering?.(drawn, stage, line, floor, ramp, gather);
    if (t >= timing.lanceAt) {
      const shot = within(t, timing.lanceAt, timing.firesAt);
      const points = [line.from, onLine(line, line.length * shot * 0.5), onLine(line, line.length * shot)];
      drawn.ribbons.push({
        points,
        widths: [wide * 0.2, wide * 0.12, 0],
        color: hue,
        alpha: 0.9,
        blend: 'color',
        soft: 0.5,
      });
      drawn.ribbons.push({ points, widths: [wide * 0.09, wide * 0.05, 0], color: '#ffffff', alpha: 1, blend: 'color' });
    }
    if (stage.origin) drawn.motes.push(glow(stage.origin, cell * 0.9, ramp[4], 0.35 * gather, forward));
    return drawn;
  }

  layTrench(
    drawn,
    trench,
    ramp,
    since,
    timing.goneAt - timing.firesAt,
    Math.min(TRENCH_COOLS_S, ends - timing.goneAt - 0.65),
    1 - within(t, ends - 0.5, ends),
    Math.max(10, Math.round(28 * detail))
  );
  layTrenchSmoke(drawn, trench, cell, t - timing.goneAt, ends - timing.goneAt, Math.round(12 * detail));

  if (t < timing.goneAt) {
    const failing = within(t, timing.failsAt, timing.goneAt);
    const glare = 1 - within(t, timing.firesAt + 0.02, timing.settledAt);
    const pose: BeamPose = {
      line,
      wide: wide * (1 + 0.05 * Math.sin(t * 31) + 0.03 * Math.sin(t * 77)),
      steady: wide,
      seconds: t,
      seed: stage.seed,
      power: 1 - 0.35 * failing,
      reached: 1,
      failing,
      tail: cell * TAIL,
      floorZ: stage.groundZ,
      detail,
    };
    const left = 1 - failing;
    const rings: ReturnType<typeof beamRingOf>[] = [];
    for (
      let ring = Math.max(0, Math.floor((since - RING_RIDES_S) / RING_EVERY_S));
      ring * RING_EVERY_S + 0.25 <= since;
      ring++
    ) {
      const rode = since - (ring * RING_EVERY_S + 0.25);
      if (rode >= RING_RIDES_S || ring * RING_EVERY_S + 0.25 > timing.failsAt - timing.firesAt) continue;
      const share = rode / RING_RIDES_S;
      const along = wide * (0.8 + RING_PACE * rode);
      if (along > line.length - cell * TAIL) continue;
      rings.push(
        beamRingOf(
          line,
          {
            along,
            radius: wide * (0.78 + 0.5 * share) * beamSwellAt(pose, along),
            thick: wide * 0.07 * (1 - share * 0.5),
            color: ramp[5],
            alpha: (1 - share) * left,
          },
          stage.groundZ + 1
        )
      );
    }
    for (const mark of [0.12, 0.3, 0.48, 0.66, 0.84]) {
      const under = { ...onLine(line, line.length * mark), z: stage.groundZ };
      const glows = look.floorOf?.(ramp, mark) ?? hue;
      drawn.floor.push(floorMark('disc', under, wide * 2.1, 1, glows, (0.2 + 0.12 * glare) * left, 'light', 0));
    }
    drawn.ribbons.push(...rings.map((ring) => ring.far));
    look.layBody(drawn, pose, ramp, glare);
    look.layPouring?.(drawn, stage, pose, ramp, since);
    layOrb(drawn, line.from, line.way, wide * (1.2 + 0.08 * Math.sin(t * 43)) * left, orb, left, t);
    drawn.ribbons.push(...rings.map((ring) => ring.near));

    const own: Washed = {
      x: stage.x,
      y: stage.y,
      z: stage.z,
      widthPx: stage.targets.find((target) => target.index === stage.index)?.widthPx ?? cell,
      along: strikes,
    };
    layBowWash(drawn, line, own, cell, wide, colors, t, stage.seed, left, Math.round(16 * detail));
    washedBy(stage, line, wide).forEach((piece, index) =>
      layBowWash(
        drawn,
        line,
        piece,
        cell,
        wide * 0.8,
        colors,
        t,
        stage.seed + index * 31 + 7,
        left,
        Math.round(9 * detail)
      )
    );
    layRelease(drawn, line, floor, cell, wide, orb, since, stage.seed);
    layShockRing(drawn, floor, cell * 0.5, cell * 5.5, cell * 0.2, hue, since - 0.02, 0.45);
    const flare = 1 - within(since, 0, 0.12);
    const lit = look.lightOf?.(ramp) ?? mixColor(ramp[4], hue, 0.6);
    drawn.lights.push({
      ...line.from,
      color: lit,
      strength: (0.7 + 0.9 * flare) * left,
      reachPx: cell * (3.5 + 1.5 * flare),
    });
    drawn.lights.push({ ...struck, color: lit, strength: (0.6 + 0.5 * flare) * left, reachPx: cell * 3.5 });
  }
  layBeamEmbers(
    drawn,
    line,
    cell,
    wide,
    colors,
    t - timing.failsAt,
    Math.min(1.6, ends - timing.failsAt - 0.3),
    stage.seed,
    Math.round(84 * detail)
  );

  const sparks = keptFor(sparksByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return thrownSparks(
      th,
      struck,
      th.count(Math.round(46 * detail)),
      [5, 15],
      [timing.firesAt, timing.firesAt + 0.05]
    );
  });
  for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell * 1.4, ramp, index, forward);
  return drawn;
}
