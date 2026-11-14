import { breathSurgeAt, type BreathTiming, breathTimingOf } from '@axe/domain/effect/breath-timing';
import {
  type BreathAxis,
  type BreathCone,
  breathConeOf,
  chestOf,
  coneAxis,
  coneWidthAt,
  headTurnAt,
  streamFrontAt,
} from '@axe/domain/effect/scene/breath/breath-cone';
import { drawGout, type GoutLayer, hazeOf, type StreamBrush } from '@axe/domain/effect/scene/breath/breath-draw';
import {
  drawLeftovers,
  type Leftovers,
  type LeftoverSetting,
  throwLeftovers,
} from '@axe/domain/effect/scene/breath/breath-leftovers';
import { type BreathLook, breathLookOf } from '@axe/domain/effect/scene/breath/breath-looks';
import { type Gout, goutAt, type StreamSetting, throwGouts } from '@axe/domain/effect/scene/breath/breath-stream';
import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  type StageMouth,
  type StageTarget,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { DUST, WARM } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  floorMark,
  glow,
  haze,
  keptFor,
  lerpPoint,
  lightBall,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/shot/streams';

/*
 * A breath: the caster draws it in, motes gathering at its mouth; it bursts out, white at the mouth
 * for an instant, and its front shoots down the cone to the furthest target; then it is blown steadily
 * for as long as the breath lasts, surging a few times a second and swaying, a thin haze about a body
 * of its element with a bright heart down its axis, streaks running down it, and its edge curling
 * off; where it meets a piece it breaks on it, wraps round it and is thrown back, and only a little
 * runs on past. As it fails it thins from the mouth, the last of it runs down the cone, and what it
 * left on each piece and on the floor about it burns, clings or glows on for a while.
 *
 * One cone is blown over all the targets of the cast, drawn with the first of them that is drawn;
 * what it leaves is drawn with each target, as the stream reaches it. All of the stream is held to its
 * own depth, so the pieces it passes behind hide it and it thins away close to the eye of one who
 * looks out from within it; the mouth alone is set a little further towards the eye, before the caster.
 */

/** How long it lingers after its playback while what it left clears, in seconds. */
const LINGER_S = 1.8;
/** How fast a breath of fire runs down its cone, in cells a second, and the longest it takes to run the whole of it, in seconds. */
const FLOWS_CELLS_S = 9;
const CROSSES_WITHIN_S = 0.9;
/** How long the mouth is white as the breath bursts, and how long its rays last, in seconds. */
const BURST_WHITE_S = 0.05;
const BURST_RAYS_S = 0.14;
/** How many discs the thin haze about the stream is laid in, and the widest one is, in cells. */
const HAZE_DISCS = 12;
const HAZE_WIDEST_CELLS = 2.8;
/** How far nearer the eye a disc of the haze is drawn, as a share of its size: enough that the floor under it does not cut it. */
const HAZE_NEARER = 0.35;

/** All a stream throws, a layer at a time, and what it was thrown with. */
interface Stream {
  readonly setting: StreamSetting;
  readonly layers: readonly (readonly [GoutLayer, readonly Gout[]])[];
}

const streamsByStage = new Map<string, Stream>();
const leftoversByStage = new Map<string, Leftovers>();

export const breath: Choreography = { lingerS: LINGER_S, draw: drawBreath };

function drawBreath(stage: Stage): Staged {
  const drawn = nothingStaged();
  const timing = breathTimingOf(stage.duration);
  const ends = stage.duration + LINGER_S;
  const look = breathLookOf(stage.preset);
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const targets = stage.targets.length > 0 ? stage.targets : [ownTargetOf(stage)];
  const first = targets[0];
  const mouth = stage.mouth ?? {
    x: first.x - stage.cell * 3,
    y: first.y + stage.cell * 2,
    z: first.z + stage.cell * 0.8,
    widthPx: stage.cell,
  };
  const told = `${stageKey(stage, ends)}|${look.element}|${look.carries}|${look.fiery}|${mouth.x}|${mouth.y}|${mouth.z}`;
  if (first.index === stage.index) drawStream(drawn, stage, look, ramp, timing, mouth, targets, told);

  const across = Math.hypot(stage.x - mouth.x, stage.y - mouth.y);
  const setting: LeftoverSetting = {
    look,
    timing,
    ramp,
    ends,
    downwind: across > 1 ? { x: (stage.x - mouth.x) / across, y: (stage.y - mouth.y) / across } : { x: 1, y: 0 },
  };
  const left = keptFor(leftoversByStage, told, () => throwLeftovers(throwerFor(stage, ends), stage, setting));
  drawLeftovers(drawn, stage, setting, left);
  return drawn;
}

/** The target a stage plays on, for a stage told of no targets. */
function ownTargetOf(stage: Stage): StageTarget {
  return { index: stage.index, x: stage.x, y: stage.y, z: stage.z, groundZ: stage.groundZ, widthPx: stage.cell };
}

/** Throws every layer of a stream for the whole of a breath, what is drawn first thrown first. */
function throwStream(th: Thrower, setting: StreamSetting, look: BreathLook): Stream {
  const body = throwGouts(th, setting, look.body).sort((a, b) => b.edge - a.edge);
  const layers: (readonly [GoutLayer, readonly Gout[]])[] = [['body', body]];
  if (look.curls) layers.push(['curl', throwGouts(th, setting, look.curls)]);
  if (look.carried) layers.push(['carried', throwGouts(th, setting, look.carried)]);
  if (look.core) layers.push(['core', throwGouts(th, setting, look.core)]);
  layers.push(['streak', throwGouts(th, setting, look.streaks)]);
  return { setting, layers };
}

/** Draws the one stream of a cast at a moment: see the header. */
function drawStream(
  drawn: Staged,
  stage: Stage,
  look: BreathLook,
  ramp: readonly string[],
  timing: BreathTiming,
  mouth: StageMouth,
  targets: readonly StageTarget[],
  told: string
): void {
  const U = stage.cell;
  const t = stage.seconds;
  const drawnBefore = drawn.motes.length;
  const floorZ = Math.min(...targets.map((target) => target.groundZ));
  const cone = breathConeOf(mouth, targets, U, timing, floorZ);
  const pace = Math.max(FLOWS_CELLS_S * U, cone.ends / CROSSES_WITHIN_S) * look.force;
  const stood = targets
    .map((target) => `${target.x},${target.y},${target.z},${target.groundZ},${target.widthPx}`)
    .join(';');
  const stream = keptFor(streamsByStage, `${told}|${mouth.widthPx}|${stood}`, () =>
    throwStream(
      throwerFor(stage, stage.duration + LINGER_S),
      { cone, timing, targets, pace, buoyancy: look.buoyancy * U, seed: stage.seed },
      look
    )
  );
  const surge = breathSurgeAt(t, stage.seed);
  const blowing = Math.min(
    within(t, timing.burstsAt, timing.burstsAt + 0.05),
    1 - within(t, timing.failsAt, timing.spentAt)
  );
  const axis = coneAxis(cone, headTurnAt(cone, timing, t, stage.seed));
  const front = Math.min(streamFrontAt(cone, timing, t), cone.ends);
  const tail = t > timing.spentAt ? (t - timing.spentAt) * pace * 0.85 : 0;
  const axisAt = (along: number): Point => ({
    x: cone.mouth.x + axis.way.x * along,
    y: cone.mouth.y + axis.way.y * along,
    z: Math.max(floorZ, cone.mouth.z + axis.way.z * along + look.buoyancy * U * (along / cone.ends) ** 2),
  });

  if (t < timing.burstsAt)
    drawInhale(drawn, look, ramp, cone, axis, t / Math.max(timing.burstsAt, 0.001), U, stage.seed);
  drawBurst(drawn, look, ramp, cone, t - timing.burstsAt, U, stage.seed);
  if (front > tail) drawHaze(drawn, look, ramp, cone, axisAt, tail, front, (t * pace * 0.6) / cone.ends, U);
  drawFloorBand(drawn, look, ramp, cone, axisAt, tail, front, blowing * surge, U);

  const brush: StreamBrush = {
    drawn,
    look,
    ramp,
    cell: U,
    seconds: t,
    floorZ,
    axisAt: (along) => axisAt(along * cone.ends),
  };
  for (const [layer, gouts] of stream.layers) {
    for (const gout of gouts) {
      const state = goutAt(stream.setting, gout, t);
      if (state) drawGout(brush, layer, gout, state);
    }
  }

  const crackle = Math.floor(t / 0.05);
  const flashing = look.element === 'thunder' ? 0.55 + 0.45 * Math.abs(Math.sin(crackle * 12.9898 + stage.seed)) : 1;
  if (look.element === 'thunder' && blowing > 0 && front > U * 0.5) {
    const bolts = stage.preset.gradeLevel === 3 ? 4 : 3;
    for (let bolt = 0; bolt < bolts; bolt++) {
      const chest = chestOf(targets[(bolt + crackle) % targets.length]);
      const far = Math.hypot(chest.x - cone.mouth.x, chest.y - cone.mouth.y, chest.z - cone.mouth.z);
      const to = front < far ? lerpPoint(cone.mouth, chest, front / far) : chest;
      drawn.ribbons.push(
        ...lightningRibbons(
          cone.mouth,
          to,
          stage.seed + bolt * 31,
          crackle,
          U,
          ramp,
          0.9 * blowing * surge,
          floorZ,
          1.5
        )
      );
    }
  }
  if (look.element === 'wind' && front > tail) drawDustStrip(drawn, cone, axis, tail, front, t, blowing, U);
  if (blowing > 0) drawMouth(drawn, look, ramp, cone, blowing, surge * flashing, U);
  for (let index = drawnBefore; index < drawn.motes.length; index++) {
    if (!drawn.motes[index].exactDepth) drawn.motes[index] = { ...drawn.motes[index], exactDepth: true };
  }

  if (look.light <= 0) return;
  const color = look.element === 'fire' ? mixColor(ramp[4], WARM, 0.5) : ramp[4];
  const struck = Math.min(
    within(t, timing.reachesAt - 0.05, timing.reachesAt + 0.1),
    1 - within(t, timing.spentAt, timing.spentAt + cone.ends / pace + 0.4)
  );
  if (blowing > 0.02) {
    drawn.lights.push({
      ...cone.mouth,
      color,
      strength: look.light * 0.7 * blowing * surge * flashing,
      reachPx: U * 2.2,
    });
  }
  if (struck > 0.02) {
    const lit = axisAt(cone.reach * 0.85);
    drawn.lights.push({ ...lit, color, strength: look.light * struck * surge * flashing, reachPx: U * 3 });
  }
}

/** The breath drawn in: streaks of the element running in to the mouth from before it, and a glow swelling there. */
function drawInhale(
  drawn: Staged,
  look: BreathLook,
  ramp: readonly string[],
  cone: BreathCone,
  axis: BreathAxis,
  drawnIn: number,
  U: number,
  seed: number
): void {
  const mouth = cone.mouth;
  const gentle = look.element === 'holy' || look.element === 'wind';
  const color = look.element === 'dark' ? ramp[2] : look.element === 'wind' ? '#ffffff' : ramp[5];
  drawn.motes.push(
    glow(mouth, U * (0.2 + 0.5 * drawnIn), ramp[4], (gentle ? 0.25 : 0.4) * (0.4 + 0.6 * drawnIn), U * 0.3)
  );
  if (look.element === 'dark')
    drawn.motes.push(haze(mouth, U * (0.2 + 0.5 * drawnIn), '#000000', 0.6 * drawnIn, U * 0.3));
  for (let index = 0; index < 12; index++) {
    const round = (index / 12) * Math.PI * 2 + seed;
    const tilt = 0.3 + Math.abs(Math.sin(index * 2.3 + seed));
    const out = U * 1.3 * (1 - drawnIn) * (0.6 + 0.4 * Math.abs(Math.sin(index * 5.1 + seed)));
    const way = {
      x: axis.way.x * Math.cos(tilt) + (axis.side.x * Math.cos(round) + axis.lift.x * Math.sin(round)) * Math.sin(tilt),
      y: axis.way.y * Math.cos(tilt) + (axis.side.y * Math.cos(round) + axis.lift.y * Math.sin(round)) * Math.sin(tilt),
      z: axis.way.z * Math.cos(tilt) + (axis.side.z * Math.cos(round) + axis.lift.z * Math.sin(round)) * Math.sin(tilt),
    };
    const at = {
      x: mouth.x + way.x * out,
      y: mouth.y + way.y * out,
      z: Math.max(cone.floorZ, mouth.z + way.z * out),
    };
    const speed = U * 5 * (0.3 + 0.7 * drawnIn);
    drawn.motes.push({
      ...ball(at, U * 0.05, color, 0.3 + 0.7 * drawnIn, U * 0.3, 0),
      shape: 'spark',
      velocity: { x: -way.x * speed, y: -way.y * speed, z: -way.z * speed },
      trail: 0.09,
    });
  }
}

/** The instant the breath bursts out: the mouth white for a moment and short rays shooting from it; nothing for a gentle breath. */
function drawBurst(
  drawn: Staged,
  look: BreathLook,
  ramp: readonly string[],
  cone: BreathCone,
  since: number,
  U: number,
  seed: number
): void {
  if (since < 0 || since >= BURST_RAYS_S) return;
  const share = since / BURST_RAYS_S;
  if (look.element === 'holy' || look.element === 'wind') {
    drawn.motes.push(glow(cone.mouth, U * (0.8 + 0.6 * share), ramp[5], 0.5 * (1 - share), U * 0.4));
    return;
  }
  const rays = look.element === 'dark' ? ramp[2] : ramp[4];
  drawn.motes.push(...starBurst(cone.mouth, U * 1.6, rays, share, U * 0.4, 4, seed));
  if (since >= BURST_WHITE_S) return;
  const heart = look.element === 'dark' ? '#000000' : '#ffffff';
  drawn.motes.push(lightBall(cone.mouth, U * 0.9, ramp[5], 0.8, U * 0.4));
  drawn.motes.push(ball(cone.mouth, U * 0.6, heart, 1, U * 0.4 + 1, 0));
}

/** The thin haze about the stream: wide soft discs of its colour flowing down it, between the last of the stream and its front. */
function drawHaze(
  drawn: Staged,
  look: BreathLook,
  ramp: readonly string[],
  cone: BreathCone,
  axisAt: (along: number) => Point,
  tail: number,
  front: number,
  flowed: number,
  U: number
): void {
  const { color, alpha } = hazeOf(look, ramp);
  const shown = Math.min(1, (front - tail) / (U * 1.5));
  for (let disc = 0; disc < HAZE_DISCS; disc++) {
    const share = (flowed + disc / HAZE_DISCS) % 1;
    const along = tail + (front - tail) * share;
    const size = Math.min(coneWidthAt(cone, along) * 1.55, U * HAZE_WIDEST_CELLS);
    const at = axisAt(along);
    const thick = Math.pow(Math.sin(Math.PI * share), 0.6) * shown;
    const nearer = size * HAZE_NEARER;
    drawn.motes.push(haze({ ...at, z: Math.max(at.z, cone.floorZ + size * 0.2) }, size, color, alpha * thick, nearer));
    if (look.element === 'holy') drawn.motes.push(glow(at, size, ramp[4], 0.12 * thick, nearer));
  }
}

/** The floor under the stream: lit by what glows, and darkened under a breath of darkness. */
function drawFloorBand(
  drawn: Staged,
  look: BreathLook,
  ramp: readonly string[],
  cone: BreathCone,
  axisAt: (along: number) => Point,
  tail: number,
  front: number,
  strength: number,
  U: number
): void {
  if (strength <= 0 || (look.light <= 0 && look.element !== 'dark')) return;
  for (const share of [0.3, 0.6, 0.9]) {
    const along = cone.ends * share;
    if (along > front || along < tail) continue;
    const at = axisAt(along);
    const under = { x: at.x, y: at.y, z: cone.floorZ };
    const reach = Math.max(U * 0.6, coneWidthAt(cone, along) * 0.8);
    if (look.element === 'dark') {
      drawn.floor.push(floorMark('disc', under, reach, 1, '#000000', 0.35 * strength, 'color', 0));
    } else {
      const color = look.element === 'fire' ? WARM : ramp[4];
      drawn.floor.push(floorMark('disc', under, reach, 1, color, 0.18 * look.light * strength, 'light', 0));
    }
  }
}

/** The dust a wind peels off the floor under it: low clouds rolling down the cone and out to its sides. */
function drawDustStrip(
  drawn: Staged,
  cone: BreathCone,
  axis: BreathAxis,
  tail: number,
  front: number,
  t: number,
  blowing: number,
  U: number
): void {
  if (blowing <= 0) return;
  for (let cloud = 0; cloud < 8; cloud++) {
    const share = (t * 0.9 + cloud / 8) % 1;
    const along = tail + (front - tail) * (0.1 + 0.9 * share);
    const aside = (cloud % 2 === 0 ? 1 : -1) * coneWidthAt(cone, along) * (0.15 + 0.3 * share);
    const at = {
      x: cone.mouth.x + axis.way.x * along + axis.side.x * aside,
      y: cone.mouth.y + axis.way.y * along + axis.side.y * aside,
      z: cone.floorZ + U * (0.12 + 0.1 * share),
    };
    drawn.motes.push({
      ...smokePuff(at, U * (0.4 + 0.5 * share), DUST, 0.3 * blowing * Math.sin(Math.PI * share), U * 0.2),
      exactDepth: true,
    });
  }
}

/** The mouth while it blows: the heart of the stream, hottest and brightest there, kept before the caster. */
function drawMouth(
  drawn: Staged,
  look: BreathLook,
  ramp: readonly string[],
  cone: BreathCone,
  blowing: number,
  pulse: number,
  U: number
): void {
  const mouth = cone.mouth;
  const wide = cone.widthAtMouth * pulse;
  const forward = U * 0.3;
  const whole = Math.min(1, blowing * 2);
  switch (look.element) {
    case 'fire':
      drawn.motes.push(glow(mouth, U * 0.9, ramp[5], 0.5 * blowing * pulse, forward));
      drawn.motes.push(ball(mouth, wide * 0.95, ramp[5], whole, forward, 1));
      drawn.motes.push(ball(mouth, wide * 0.55, '#ffffff', whole, forward + 1, 2.6));
      return;
    case 'ice':
      drawn.motes.push(glow(mouth, U * 0.8, ramp[4], 0.45 * blowing * pulse, forward));
      drawn.motes.push(haze(mouth, wide * 1.4, '#ffffff', 0.8 * blowing, forward));
      return;
    case 'poison':
      drawn.motes.push(glow(mouth, U * 0.6, ramp[3], 0.2 * blowing * pulse, forward));
      drawn.motes.push(haze(mouth, wide * 1.5, mixColor('#7fbf2a', '#ffffff', 0.3), 0.5 * blowing, forward));
      return;
    case 'thunder':
      drawn.motes.push(glow(mouth, U * (0.6 + 0.5 * pulse), ramp[5], 0.7 * blowing, forward));
      drawn.motes.push(ball(mouth, wide * 0.6, '#ffffff', whole, forward + 1, 0));
      return;
    case 'wind':
      drawn.motes.push(haze(mouth, wide * 1.4, '#ffffff', 0.25 * blowing, forward));
      return;
    case 'dark':
      drawn.motes.push(glow(mouth, U * 0.9, ramp[2], 0.5 * blowing * pulse, forward));
      drawn.motes.push(haze(mouth, wide * 1.6, '#000000', 0.8 * blowing, forward));
      return;
    case 'holy':
      drawn.motes.push(glow(mouth, U, ramp[5], 0.5 * blowing * pulse, forward));
      drawn.motes.push(haze(mouth, wide * 1.4, '#ffffff', 0.5 * blowing, forward));
      return;
  }
}
