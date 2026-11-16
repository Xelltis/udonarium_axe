import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { drawSlab, earthTonesOf, layDent, type Slab, throwSlabs } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, drawCloud, drawSpark, layShockRing, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import {
  type Crack,
  drawHangingRock,
  drawRisingForce,
  type HangingRock,
  hangingRocks,
  layGatherShadow,
  layWeb,
  webCracks,
} from '@axe/domain/effect/scene/strike/crush-ground';
import {
  along,
  drawFist,
  drawPressureRings,
  drawStamp,
  drawStar,
  laySkid,
  speedFan,
  type StarSpike,
  starSpikes,
  strikeFrameOf,
  strikeTonesOf,
  unit,
} from '@axe/domain/effect/scene/strike/strike-parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A crushing blow. Force is gathered into the fist before the target: streaks of it are drawn in from
 * all round, the fist swells and burns brighter, and the ground under it darkens and its dust is drawn
 * in. It lands in a beat of white, a hard white disc in a dark rim held through the stop; a star of
 * thick spikes bursts out of it and rings of pressure snap out. Then the force goes through: a cone of
 * it bursts out of the target's back and on far past it, rings of shock running along it, a second
 * star where it leaves. The floor shatters in a spreading web under the target, slabs of it levered up,
 * rocks torn out of it hang in the air and fall; earth is blown up and dust rolls out. Long after,
 * the web cools, dust drifts and motes of the blow's force rise off the cracks until it clears.
 */

/** How long the white beat holds after the stop, the star opens, holds and is gone, and the cone of force lasts, in seconds. */
const WHITE_S = 0.035;
const STAR_OPENS_S = 0.03;
const STAR_HOLDS_S = 0.12;
const STAR_GONE_S = 0.4;
const CONE_GROWS_S = 0.12;
const CONE_GOES_S = 0.48;
/** How far the cone of force bursts out of the target's back, and how wide it opens, in cells. */
const CONE_LONG = 2.2;
const CONE_WIDE = 1.1;
/** How far before the target the fist gathers its force, and how far out the streaks it draws in start, in cells. */
const FIST_BEFORE = 0.72;
const STREAKS_FROM = 1.7;
/** How long the web glows, in seconds. */
const COOLS_S = 2.2;

interface CrushThrow {
  readonly spikes: readonly StarSpike[];
  readonly exit: readonly StarSpike[];
  readonly cracks: readonly Crack[];
  readonly slabs: readonly Slab[];
  readonly hanging: readonly HangingRock[];
  readonly grit: readonly Rock[];
  readonly dust: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
}

const thrownByStage = new Map<string, CrushThrow>();

/** A crushing blow on a stage: see the head of this file. */
export function drawCrush(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const landsAt = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - landsAt;
  const { struck, floor, way } = strikeFrameOf(stage);
  const tones = strikeTonesOf(stage);
  const forward = cell * 0.6;
  const fist = along({ ...struck, z: struck.z + cell * 0.04 }, way, -cell * FIST_BEFORE);

  if (t < 0) {
    drawGathering(drawn, stage, fist, within(stage.seconds, 0, landsAt), forward);
    return drawn;
  }
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const earth = earthTonesOf(ramp);
  const ends = stage.duration + lingerS - landsAt;
  const clearing = 1 - within(t, ends - 0.45, ends);
  const toward = Math.atan2(way.y, way.x);
  const many = Math.max(1, stage.targets.length);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const fewer = (count: number) => th.count(Math.max(2, Math.round(count / Math.sqrt(many))));
    return {
      spikes: starSpikes(18, way, 0.45, stage.seed),
      exit: starSpikes(10, way, 1.1, stage.seed + 5),
      cracks: webCracks(th, many > 2 ? 7 : 9, toward, stage.seed),
      slabs: throwSlabs(th, floor, fewer(7), [0.6, 1.35], 0, 5.5),
      hanging: hangingRocks(th, floor, fewer(12), [0.3, 1.4]),
      grit: throwRocks(th, floor, fewer(40), {
        size: [0.04, 0.08],
        up: [2.5, 7],
        out: [0.8, 4],
        bornAt: [0, 0.06],
        fan: { toward, spread: 1.1, share: 0.6 },
        bounce: 0.25,
      }),
      dust: [
        ...earthPlumes(th, floor, fewer(3), earth.dust, {
          rise: [1.6, 3.4],
          bornAt: [0.02, 0.16],
          long: 0.9,
          life: [0.7, 1.2],
        }),
        ...kickedDust(th, floor, fewer(16), earth.dust, {
          speed: [3.2, 7],
          size: [0.5, 0.85],
          bornAt: [0, 0.1],
          from: 0.6,
          alpha: 0.5,
        }),
        ...kickedDust(th, floor, fewer(10), earth.sand, {
          speed: [5, 10],
          size: [0.3, 0.5],
          bornAt: [0, 0.04],
          fan: { toward, spread: 0.6 },
          rise: [0.4, 2.4],
          alpha: 0.7,
          life: [0.35, 0.6],
          jet: 1.4,
        }),
      ],
      sparks: thrownSparks(th, struck, fewer(22), [4, 10], [0, 0.03]),
    };
  });
  const heat = Math.pow(Math.max(0, 1 - t / COOLS_S), 1.3);

  layDent(drawn, floor, cell * 0.78 * Math.min(1, t / 0.04 + 0.3), earth, clearing, stage.seed);
  layWeb(drawn, floor, thrown.cracks, cell, earth, t, heat, clearing, many > 2 ? 1 : 2);
  laySkid(drawn, stage, way, 'crush', t, clearing);
  if (heat > 0.02) drawn.floor.push(floorMark('disc', floor, cell * 0.9, 1, earth.glow, 0.35 * heat, 'light', 0));
  layShockRing(drawn, floor, cell * 0.4, cell * 3.4, cell * 0.2, tones.glow, t, 0.5);
  layShockRing(drawn, floor, cell * 0.3, cell * 2.4, cell * 0.14, tones.pale, t - 0.1, 0.45);
  for (const slab of thrown.slabs) drawSlab(drawn, slab, t, cell, earth, clearing);
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
  for (const rock of thrown.grit) drawRock(drawn, rock, t, cell, earth);
  for (const rock of thrown.hanging) drawHangingRock(drawn, rock, t, cell, earth, clearing);
  drawRisingForce(drawn, floor, thrown.cracks, cell, [tones.glow, tones.pale], t, ends, forward * 0.5);

  drawThrough(drawn, stage, thrown.exit, t, forward);
  speedFan(drawn, struck, way, 0.45, cell * 3.4, t, 0.36, 18, tones, stage.seed, forward);
  const open = (0.8 + 0.2 * outCubic(within(t, 0, STAR_OPENS_S))) * (1 - within(t, STAR_HOLDS_S, STAR_GONE_S));
  if (t >= WHITE_S) drawStar(drawn, struck, cell * 1.75, thrown.spikes, tones, open, forward);
  drawStamp(drawn, struck, cell * 0.75 * (1 - within(t, 0.04, 0.2)), tones, 1, forward + 4);
  drawPressureRings(drawn, struck, cell * 3, tones, t, 0.3, 3, forward - 2);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  drawWhiteBeat(drawn, stage, thrown.spikes, t, forward);
  if (t < 0.3) {
    drawn.lights.push({ ...struck, color: '#ffffff', strength: 1.4 * (1 - t / 0.3), reachPx: cell * 2.8 });
  } else if (heat > 0.05) {
    drawn.lights.push({
      ...floor,
      z: floor.z + cell * 0.4,
      color: earth.glow,
      strength: 0.9 * heat,
      reachPx: cell * 2.4,
    });
  }
  return drawn;
}

/**
 * The force gathered into the fist, `share` of the way to the blow: the fist swelling and burning
 * brighter, streaks drawn in to it from all round, the ground under it darkening and its dust drawn in.
 */
function drawGathering(drawn: Staged, stage: Stage, fist: Point, share: number, forward: number): void {
  const { cell } = stage;
  const { floor, way } = strikeFrameOf(stage);
  const tones = strikeTonesOf(stage);
  const swell = outCubic(share);
  const flicker = 0.85 + 0.15 * Math.sin(stage.seconds * 61);
  layGatherShadow(drawn, along(floor, way, -cell * FIST_BEFORE * 0.5), cell * (1.9 - 0.5 * swell), 0.28 * swell);
  for (let streak = 0; streak < 12; streak++) {
    const cycle = (share * 2.2 + scatter(streak, stage.seed + 31)) % 1;
    const round = scatter(streak, stage.seed + 32) * Math.PI * 2;
    const rise = (scatter(streak, stage.seed + 33) - 0.35) * 1.4;
    const from = unit({ x: Math.cos(round), y: Math.sin(round), z: rise });
    const far = cell * STREAKS_FROM * (1 - cycle) + cell * 0.2;
    const at = along(fist, from, far);
    const inward = { x: -from.x, y: -from.y, z: -from.z };
    drawn.motes.push(
      flowingMote('lick', at, inward, cell * 0.09, cell * (0.35 + 0.4 * cycle), stage.seconds * 9 + streak, {
        color: streak % 2 === 0 ? tones.body : tones.rim,
        core: tones.hot,
        alpha: Math.min(1, cycle * 4, (1 - cycle) * 6) * Math.min(1, share * 3),
        forward,
        variant: streak,
      })
    );
  }
  for (let mote = 0; mote < 6; mote++) {
    const cycle = (share * 1.6 + scatter(mote, stage.seed + 41)) % 1;
    const round = scatter(mote, stage.seed + 42) * Math.PI * 2;
    const far = cell * (0.4 + 1.3 * (1 - cycle));
    drawn.motes.push({
      x: floor.x + Math.cos(round) * far,
      y: floor.y + Math.sin(round) * far,
      z: floor.z + cell * 0.12,
      size: cell * 0.35,
      color: earthTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7)).dust,
      alpha: 0.4 * Math.min(1, cycle * 4, (1 - cycle) * 3) * swell,
      blend: 'color',
      shape: 'smoke',
      forward: 0,
    });
  }
  drawFist(
    drawn,
    fist,
    cell * (0.18 + 0.3 * swell) * flicker,
    way,
    cell * 0.2 * swell,
    tones,
    Math.min(1, share * 4),
    forward
  );
  drawn.motes.push(glow(fist, cell * (0.6 + 0.9 * swell), tones.glow, 0.25 * swell * flicker, forward - 1));
  drawn.lights.push({ ...fist, color: tones.glow, strength: 0.25 + 0.4 * swell, reachPx: cell * 1.6 });
}

/**
 * The beat of white the blow lands in, held through the stop and gone just after it: the star of the
 * blow burst out white in its dark rim, larger than it will be, about a white heart.
 */
function drawWhiteBeat(drawn: Staged, stage: Stage, spikes: readonly StarSpike[], t: number, forward: number): void {
  if (t >= WHITE_S) return;
  const { cell } = stage;
  const { struck, floor } = strikeFrameOf(stage);
  const tones = strikeTonesOf(stage);
  const left = 1 - t / WHITE_S;
  const white = { ...tones, body: '#ffffff' };
  drawn.floor.push(floorMark('disc', floor, cell * 1.3, 1, '#ffffff', 0.25 * left, 'light', 0));
  drawStar(drawn, struck, cell * 1.85, spikes, white, 1, forward + 5);
  drawn.motes.push(ball(struck, cell * 1.05, tones.rim, left, forward + 9, 0));
  drawn.motes.push(ball(struck, cell * 0.98, '#ffffff', left, forward + 10, 3.4));
}

/**
 * The force going through, `t` seconds after the blow: a cone of it bursting out of the target's back
 * and on far past it, breaking away from it as it goes, rings of shock running along it, and a second
 * star where it leaves the target.
 */
function drawThrough(drawn: Staged, stage: Stage, exit: readonly StarSpike[], t: number, forward: number): void {
  const { cell } = stage;
  const { struck, way, side } = strikeFrameOf(stage);
  const tones = strikeTonesOf(stage);
  const goes = within(t, 0.02, CONE_GOES_S);
  if (goes > 0 && goes < 1) {
    const grown = outCubic(within(t, 0.02, CONE_GROWS_S));
    const fading = 1 - within(t, 0.2, CONE_GOES_S);
    const root = along(struck, way, cell * (0.15 + 0.9 * Math.pow(within(t, 0.18, CONE_GOES_S), 1.4)));
    const long = cell * CONE_LONG * grown * (0.7 + 0.3 * fading);
    const wide = cell * CONE_WIDE * (0.6 + 0.4 * grown);
    for (const [shape, color, core, wider, longer, alpha, ahead] of [
      ['jet', tones.rim, tones.rim, 1.15, 1.04, 0.9, 0],
      ['jet', tones.body, tones.pale, 1, 1, 1, 1],
      ['jet', tones.hot, '#ffffff', 0.5, 0.82, 1, 2],
      ['gust', tones.pale, '#ffffff', 1.5, 1.2, 0.45, 3],
    ] as const) {
      drawn.motes.push(
        flowingMote(shape, root, way, wide * wider, long * longer, t * 8 + ahead, {
          color,
          core,
          alpha: alpha * fading,
          forward: forward + ahead,
          variant: stage.seed % 5,
        })
      );
    }
    for (let ring = 0; ring < 3; ring++) {
      const running = within(t, 0.02 + ring * 0.05, 0.36 + ring * 0.05);
      if (running <= 0 || running >= 1) continue;
      const far = cell * (0.4 + CONE_LONG * outCubic(running));
      const radius = cell * (0.25 + 0.42 * (far / cell));
      const at = along(struck, way, far);
      const points = Array.from({ length: 21 }, (_unused, index) => {
        const turn = (index / 20) * Math.PI * 2;
        return {
          x: at.x + side.x * Math.cos(turn) * radius,
          y: at.y + side.y * Math.cos(turn) * radius,
          z: Math.max(stage.groundZ + 1, at.z + Math.sin(turn) * radius),
        };
      });
      const left = 1 - running;
      drawn.ribbons.push(
        { points, widths: cell * 0.13 * left + 1, color: tones.rim, alpha: 0.8 * left, blend: 'color' },
        { points, widths: cell * 0.07 * left + 1, color: tones.pale, core: '#ffffff', alpha: left, blend: 'color' }
      );
    }
  }
  const leaves = within(t, 0.05, 0.32);
  if (leaves > 0 && leaves < 1) {
    const open = outCubic(within(leaves, 0, 0.15)) * (1 - within(leaves, 0.4, 1));
    drawStar(drawn, along(struck, way, cell * 0.5), cell * 1.15, exit, tones, open, forward);
  }
}
