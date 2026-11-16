import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { floorMark, glow, haze, lightBall, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import {
  bandPenAt,
  type CircleLook,
  drawPen,
  layCircle,
  type SummonTones,
  summonTonesOf,
  traceStar,
} from '@axe/domain/effect/scene/space/summon-circle';
import {
  drawArrival,
  drawArrivingLight,
  drawPillar,
  drawRisingRays,
} from '@axe/domain/effect/scene/space/summon-pillar';
import { spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A summoning, told by its own colours: bodies of the full colour of its deep colour on a near black,
 * with gold burning through them. The floor darkens and a pen of gold runs round it, writing a band of
 * glyphs between two rims; then it traces a star of five points within, stroke by stroke in one line. The circle wakes:
 * its band turns one way and its star the other, faster and faster, light welling up through every line
 * of it into a pillar about the one it calls, rings running up the pillar and motes rising in it. Then
 * what is called arrives: the circle blazes white, the pillar flares and a ring races out over the
 * floor, and the one called is borne up in it. The pillar rises away, and the circle burns out glyph
 * by glyph, its star last, under drifting motes.
 */

const LINGER_S = SCENE_LINGER_S.warp ?? 1;
/** When the pen starts and finishes writing the band of glyphs, in seconds. */
const BAND_FROM_S = 0.08;
const BAND_BY_S = 0.7;
/** When it starts and finishes tracing the star, in seconds. */
const STAR_FROM_S = 0.66;
const STAR_BY_S = 1.04;
/** How fast the band and the star turn once written, in radians a second, at their fastest just before the arrival. */
const BAND_TURNS = 0.5;
const STAR_TURNS = -0.8;
/** How long after the arrival the circle starts to burn out, and how long its band and its star take to, in seconds. */
const BURNS_OUT_AFTER_S = 0.75;
const BAND_GOES_S = 1.1;
const STAR_GOES_S = 0.8;

/**
 * Where the circle is written and how far it reaches, and whether this stage writes it: under one
 * alone, about it; under several, one circle about them all, written by the first of them, wide
 * enough to take them all in.
 */
function circleOf(stage: Stage): { readonly middle: Point; readonly reach: number; readonly writes: boolean } {
  const own = { x: stage.x, y: stage.y, z: stage.groundZ };
  const alone = stage.cell * 1.65;
  if (stage.targets.length < 2) return { middle: own, reach: alone, writes: true };
  const lead = stage.targets[0];
  const x = stage.targets.reduce((sum, target) => sum + target.x, 0) / stage.targets.length;
  const y = stage.targets.reduce((sum, target) => sum + target.y, 0) / stage.targets.length;
  const far = Math.max(...stage.targets.map((target) => Math.hypot(target.x - x, target.y - y)));
  return {
    middle: { x, y, z: lead.groundZ },
    reach: Math.max(alone, far + stage.cell * 0.9),
    writes: lead.index === stage.index,
  };
}

/** How far a part of the circle has turned by a moment: still while it is written, then faster and faster up to the arrival, slowing after it. */
function turnedBy(t: number, from: number, arrives: number, rate: number): number {
  if (t <= from) return 0;
  const spun = Math.min(t, arrives) - from;
  const ramp = spun * spun * (0.5 / Math.max(0.1, arrives - from)) + spun * 0.5;
  const after = Math.max(0, t - arrives);
  return rate * (ramp + after * (1 - Math.min(1, after / 2) * 0.5));
}

/** The circle as it is seen at a moment of the summoning. */
function circleAt(stage: Stage, t: number, arrives: number, tones: SummonTones): CircleLook {
  const since = t - arrives;
  const burnsFrom = arrives + BURNS_OUT_AFTER_S;
  const band = Math.min(
    within(t, BAND_FROM_S, BAND_BY_S),
    1 - within(t, burnsFrom + 0.2, burnsFrom + 0.2 + BAND_GOES_S)
  );
  const starSeen = within(t, STAR_BY_S - 0.04, STAR_BY_S + 0.12);
  const star = Math.min(
    starSeen,
    1 - within(t, burnsFrom + BAND_GOES_S * 0.6, burnsFrom + BAND_GOES_S * 0.6 + STAR_GOES_S)
  );
  const waking = within(t, STAR_BY_S, arrives);
  const pulse = 0.5 + 0.5 * Math.sin(t * (8 + 10 * waking));
  const blaze = since >= 0 ? Math.max(0, 1 - since / 0.5) : 0;
  const cooling = within(t, arrives + 0.3, burnsFrom + 0.4);
  return {
    band,
    star,
    bandTurn: (stage.seed % 11) * 0.37 + turnedBy(t, BAND_BY_S, arrives, BAND_TURNS),
    starTurn: (stage.seed % 7) * 0.53 + turnedBy(t, STAR_BY_S, arrives, STAR_TURNS),
    alpha: 1 - within(t, burnsFrom + BAND_GOES_S + STAR_GOES_S * 0.4, burnsFrom + BAND_GOES_S + STAR_GOES_S + 0.3),
    lit: Math.max(blaze, (0.75 + 0.25 * pulse * waking) * (1 - 0.75 * cooling)),
    white: blaze,
    pattern: stage.seed % 97,
    heart: tones.gold,
  };
}

/** The floor the circle is written on, darkened to its near black within a rim of its deep colour, and lit from it while the circle is awake. */
function layGround(drawn: Staged, floor: Point, reach: number, tones: SummonTones, t: number, arrives: number): void {
  const dark = Math.min(within(t, 0, 0.3), 1 - within(t, arrives + 1.2, arrives + 2.4));
  drawn.floor.push(floorMark('disc', floor, reach * 1.5, 1, tones.rim, 0.6 * dark, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, reach * 1.08, 1, tones.ink, 0.75 * dark, 'color', 0));
  const glowing = within(t, STAR_BY_S, arrives) * (1 - within(t, arrives + 0.2, arrives + 1.4));
  if (glowing > 0.01) {
    drawn.floor.push(floorMark('disc', floor, reach * 1.05, 1, tones.body, 0.45 * glowing, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 1.2, 1, tones.gold, 0.12 * glowing, 'light', 0));
  }
}

/** Motes drifting down over the circle as it burns out. */
function drawDrifting(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: SummonTones,
  cell: number,
  since: number,
  forward: number
): void {
  if (since < 0.2) return;
  for (let mote = 0; mote < 22; mote++) {
    const born = 0.2 + (mote / 22) * 1.6;
    const age = (since - born) / 1.6;
    if (age < 0 || age >= 1) continue;
    const turn = mote * 2.39;
    const out = reach * (0.15 + 0.75 * ((mote * 0.618) % 1));
    const at = {
      x: floor.x + Math.cos(turn + age) * out,
      y: floor.y + Math.sin(turn + age) * out,
      z: floor.z + cell * (2.6 - 2.5 * age),
    };
    drawn.motes.push({
      ...glow(
        at,
        cell * (0.15 + 0.05 * Math.sin(since * 13 + mote)),
        mote % 3 === 0 ? '#ffffff' : tones.gold,
        1 - age,
        forward
      ),
      shape: 'star',
      spin: mote + since,
    });
  }
}

/** A summoning: see the header. */
export function drawSummon(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration, tall } = stage;
  const t = stage.seconds;
  if (t >= duration + LINGER_S) return drawn;
  const arrives = spaceBeatAt('summon', duration);
  const since = t - arrives;
  const tones = summonTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + tall * 0.5 };
  const circle = circleOf(stage);
  const { middle, reach } = circle;
  const forward = cell * 0.4;
  const look = circleAt(stage, t, arrives, tones);
  const welling = outCubic(within(t, STAR_BY_S, arrives));
  const gone = within(t, arrives + 0.15, arrives + 1.1);

  if (circle.writes) {
    layGround(drawn, middle, reach, tones, t, arrives);
    layCircle(drawn, middle, reach, tones, look);
    if (t >= BAND_FROM_S && t < BAND_BY_S) {
      drawPen(drawn, bandPenAt(middle, reach, look.bandTurn, look.band), tones, cell, forward);
    }
    traceStar(
      drawn,
      middle,
      reach,
      look.starTurn,
      within(t, STAR_FROM_S, STAR_BY_S),
      1 - within(t, STAR_BY_S + 0.05, STAR_BY_S + 0.3),
      tones,
      cell,
      forward
    );
    if (t < STAR_BY_S + 0.12 && t >= BAND_BY_S - 0.02) {
      const left = 1 - within(t, BAND_BY_S - 0.02, BAND_BY_S + 0.25);
      drawn.floor.push(floorMark('ring', middle, reach * 0.99, 0.08, tones.gold, left, 'light', 0));
    }
    drawRisingRays(drawn, stage, middle, reach, tones, welling * (1 - gone), forward);
    if (since < 0) {
      drawn.lights.push({
        ...middle,
        z: middle.z + cell * 0.5,
        color: tones.gold,
        strength: 0.5 + 1.1 * welling,
        reachPx: reach * 1.6,
      });
    } else {
      drawArrival(drawn, stage, middle, reach, tones, since);
      drawDrifting(drawn, middle, reach, tones, cell, since, forward);
    }
  }
  drawPillar(drawn, stage, floor, stage.targets.length < 2 ? reach : cell * 1.3, tones, welling, since, forward);
  if (since < 0) {
    if (welling > 0.6) {
      const near = (welling - 0.6) / 0.4;
      drawn.motes.push(haze(chest, tall * 1.6, tones.body, 0.3 * near, forward));
      drawn.motes.push(glow(chest, tall * 1.6, tones.gold, 0.35 * near, forward));
    }
    return drawn;
  }
  drawArrivingLight(drawn, stage, floor, chest, tones, since, forward);
  if (since < 0.3) {
    const left = 1 - since / 0.3;
    drawn.motes.push(lightBall(chest, cell * 0.9 * left, '#ffffff', 1, forward + 3));
    drawn.motes.push(...starBurst(chest, cell * 3.4, tones.gold, since / 0.3, forward + 3, 10, stage.seed % 9));
  }
  return drawn;
}
