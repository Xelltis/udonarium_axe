import { type GreatSwordTiming, greatSwordTimingOf } from '@axe/domain/effect/great-sword-looks';
import { greatBlade } from '@axe/domain/effect/scene/blade/great-blade';
import { drawLightBlade } from '@axe/domain/effect/scene/blade/light-blade';
import {
  drawGatherMotes,
  drawGatherWind,
  type GatherLook,
  layGatherGround,
} from '@axe/domain/effect/scene/blade/sword-gather';
import { type SwordPaint, swordPaintOf } from '@axe/domain/effect/scene/blade/sword-paint';
import {
  bladeWay,
  type SwordPose,
  swordPoseOf,
  swordTiltAt,
  underTorrent,
  upBlade,
  upSword,
} from '@axe/domain/effect/scene/blade/sword-pose';
import { drawReach, reachedApart, sweptWay } from '@axe/domain/effect/scene/blade/sword-reach';
import {
  drawBroken,
  drawSwingFan,
  drawTorrent,
  layTorrentFloor,
  torrentAt,
} from '@axe/domain/effect/scene/blade/sword-torrent';
import { drawWake } from '@axe/domain/effect/scene/blade/sword-wake';
import { drawTorrentElement } from '@axe/domain/effect/scene/blade/torrent-element';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  type StageTarget,
  within,
} from '@axe/domain/effect/scene/choreography';
import { layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, lightBall, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A great sword. Its wielder raises a sword overhead. Light is drawn in to it from all about and up
 * off the ground, the floor lights under them and the scene dims; the blade brightens and a blade of
 * radiance grows up from it, many cells tall, white at its heart and of its element at its edge. For
 * a beat everything hangs, and a glint runs up the blade. Then it is brought down towards the
 * target, turning about the hands that hold it, a vast fan of light behind it, and as it comes level
 * it is let go: everything is white for an instant, and a torrent of the element erupts along the
 * line from the wielder through the target and well past it, washing over every piece in the line.
 * Where the target stands the look the sword was given to land with goes off within the torrent. The
 * torrent thins from the wielder's end and passes on; motes drift up along the whole of its path,
 * the score it left on the floor cools, and the sword breaks into light.
 *
 * One sword is raised and brought down for all the targets of a cast, drawn with the first of them
 * that is drawn, along the line to it; each of the others takes the landing in its turn, and one the
 * first torrent does not reach has the sword swept round on to it and a torrent of its own loosed
 * along the line to it; see `sword-reach`. Cast by no one, it is raised in a place beside the target.
 */

/** How long the sword of steel takes to be raised into sight, at the most as a share of the gathering, in seconds. */
const RAISED_S = 0.3;
const RAISED_SHARE = 0.22;
/** How long everything is white as the blade is let go, and how long its rays last, in seconds. */
const WHITE_S = 0.09;
const RAYS_S = 0.26;
/** How long the sword takes to break into light once the torrent has passed, in seconds. */
const BREAKS_S = 0.5;
/** How long the score on the floor glows, and how long before the end everything left clears, in seconds. */
const COOLS_S = 1.5;
const CLEARS_S = 0.6;
/** How many shards of light the sword breaks into. */
const SHARDS = 16;

/** How the look it lands with is drawn, as the table of looks drawn in the scene gives it. */
type ImpactLook = (stage: Stage) => Staged;

/** The great sword, landing with the look `impactOf` gives for its preset's kind of landing, which lingers `lingerS`. */
export function skybladeWith(impactOf: ImpactLook, lingerS: number): Choreography {
  return { lingerS, draw: (stage) => drawSkyblade(stage, impactOf, lingerS) };
}

function drawSkyblade(stage: Stage, impactOf: ImpactLook, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { duration } = stage;
  const timing = greatSwordTimingOf(duration, stage.blowsAt[0]);
  const targets = stage.targets.length > 0 ? stage.targets : [ownTargetOf(stage)];
  const first = targets[0];
  const own = targets.find((target) => target.index === stage.index);
  if (first.index === stage.index) drawTechnique(drawn, stage, timing, first, targets, duration + lingerS);
  else if (own) drawReach(drawn, stage, timing, first, own, duration + lingerS);
  const since = stage.seconds - timing.releasesAt;
  if (since >= 0) {
    const impact = impactOf({
      ...stage,
      seconds: since,
      duration: Math.max(0.4, duration - timing.releasesAt),
      blowsAt: [0],
    });
    drawn.motes.push(...impact.motes);
    drawn.ribbons.push(...impact.ribbons);
    drawn.floor.push(...impact.floor);
    drawn.lights.push(...impact.lights);
  }
  return drawn;
}

/** The target a stage plays on, for a stage told of no targets. */
function ownTargetOf(stage: Stage): StageTarget {
  return { index: stage.index, x: stage.x, y: stage.y, z: stage.z, groundZ: stage.groundZ, widthPx: stage.cell };
}

/** The one sword of a cast at a moment, from its raising to the last of what it left; see the head of this file. */
function drawTechnique(
  drawn: Staged,
  stage: Stage,
  timing: GreatSwordTiming,
  first: StageTarget,
  targets: readonly StageTarget[],
  ends: number
): void {
  const t = stage.seconds;
  const U = stage.cell;
  const { preset, seed } = stage;
  const pose = swordPoseOf(stage, first);
  const paint = swordPaintOf(preset.impactEffectKind, preset.colorPrimary, preset.colorSecondary);
  const heading = bladeWay(pose, swordTiltAt(pose, timing, t));
  const since = t - timing.releasesAt;
  const raised = Math.min(RAISED_S, timing.gatheredAt * RAISED_SHARE);
  const grown = outCubic(within(t, raised * 0.5, timing.gatheredAt));
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const pieces = [...targets, ...(stage.bystanders ?? [])];
  const gather: GatherLook = {
    gathered: within(t, 0, timing.gatheredAt),
    alpha: 1 - within(t, timing.releasesAt, timing.thinsAt),
    grown,
    hangs: t >= timing.gatheredAt,
    seconds: t,
    seed,
  };
  layGatherGround(drawn, pose, paint, gather);
  const torrent = torrentAt(pose, timing, t, seed);
  const reached = since < 0 ? 0 : (torrent?.head ?? pose.runs);
  layTorrentFloor(drawn, pose, paint, torrent, reached, 1 - within(since, 0.2, COOLS_S), clearing, seed);

  const drawing = 1 - within(t, timing.swingsAt, timing.releasesAt);
  if (drawing > 0) {
    const coming = { ...gather, alpha: drawing };
    drawGatherWind(drawn, pose, paint, coming);
    drawGatherMotes(drawn, pose, paint, heading, coming);
  }
  const apart = targets.length > 1 && since > 0 ? reachedApart(stage, first, targets) : [];
  const held = apart.length > 0 ? { ...pose, way: sweptWay(pose, stage, first, apart, since) } : pose;
  const swept = held === pose ? heading : bladeWay(held, swordTiltAt(held, timing, t));
  drawSword(drawn, held, paint, swept, timing, t, raised, seed);
  if (since < 0.05) {
    const glint = within(t, timing.gatheredAt, timing.swingsAt - 0.05);
    drawLightBlade(drawn, pose, paint, heading, { grown, alpha: 1 - within(since, 0, 0.05), seconds: t, seed, glint });
  }
  drawSwingFan(drawn, pose, paint, timing, t, (seconds) => swordTiltAt(pose, timing, seconds));
  if (torrent) {
    drawTorrent(drawn, pose, paint, torrent, 1 - within(since, 0, WHITE_S));
    drawTorrentElement(drawn, pose, paint, torrent);
    drawBroken(drawn, pose, paint, torrent, pieces);
  }
  drawRelease(drawn, pose, paint, since, seed);
  drawWake(drawn, pose, paint, { timing, seconds: t, clearing, seed, pieces });

  if (since < 0) {
    const lit = upBlade(pose, heading, 0.3);
    drawn.lights.push({ ...lit, color: paint.ramp[4], strength: 0.85 * grown, reachPx: U * 3.4 });
  } else if (torrent) {
    const lit = underTorrent(pose, torrent.tail + (torrent.head - torrent.tail) * 0.5);
    drawn.lights.push({
      ...lit,
      z: pose.floorZ + pose.thick * 0.4,
      color: paint.ramp[4],
      strength: torrent.alpha * (0.8 + 0.2 * Math.sin(since * 47)),
      reachPx: U * 6,
    });
  }
}

/** The sword of steel in its wielder's hands: raised into sight, held, brought down, and broken into light once the torrent has passed. */
function drawSword(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  heading: Point,
  timing: GreatSwordTiming,
  t: number,
  raised: number,
  seed: number
): void {
  const U = pose.cell;
  const broken = within(t, timing.spentAt, timing.spentAt + BREAKS_S);
  const formed = outCubic(within(t, 0, raised));
  const tip = upSword(pose, heading, pose.steel * (0.65 + 0.35 * formed));
  const axis = { x: -heading.x, y: -heading.y, z: -heading.z };
  if (broken < 1) {
    const sword = greatBlade(tip, axis, pose.steel, {
      ramp: paint.ramp,
      alpha: (1 - broken) * Math.min(1, formed * 2),
      formed,
      glint: 0,
      forward: U * 0.4,
    });
    drawn.ribbons.push(...sword.ribbons);
    drawn.motes.push(...sword.motes);
  }
  if (broken <= 0) return;
  const since = t - timing.spentAt;
  for (let index = 0; index < SHARDS; index++) {
    const age = (since - scatter(index, seed + 71) * 0.3) / 0.9;
    if (age <= 0 || age >= 1) continue;
    const at = upSword(pose, heading, pose.steel * (0.1 + (index / SHARDS) * 0.85));
    const turn = index * 2.4 + seed;
    const out = U * 0.5 * outCubic(age);
    drawn.motes.push({
      x: at.x + Math.cos(turn) * out,
      y: at.y + Math.sin(turn) * out,
      z: at.z + U * 0.9 * age,
      size: U * (0.1 + 0.05 * (index % 3)),
      color: index % 2 === 0 ? paint.ramp[4] : paint.ramp[3],
      alpha: (1 - age) * (0.6 + 0.4 * Math.sin(since * 23 + index * 2.1)),
      blend: 'light',
      shape: 'flake',
      spin: since * (4 + (index % 3)) + index,
      variant: index,
      forward: U * 0.4,
    });
  }
}

/**
 * The instant the blade is let go: white before the wielder and on the floor there, rays of light
 * thrown out from it, and rings racing out over the floor.
 */
function drawRelease(drawn: Staged, pose: SwordPose, paint: SwordPaint, since: number, seed: number): void {
  if (since < 0 || since >= 0.6) return;
  const U = pose.cell;
  const floor = underTorrent(pose, U * 0.4);
  const burst = { ...floor, z: (pose.hands.z + pose.floorZ) / 2 };
  const dark = paint.element === 'dark';
  const white = dark ? paint.rim : '#ffffff';
  const left = 1 - within(since, 0, WHITE_S);
  if (left > 0) {
    drawn.floor.push(floorMark('disc', floor, U * 2.2, 1, white, 0.45 * left, 'light', 0));
    drawn.motes.push(glow(burst, U * 3, paint.halo, 0.7 * left, U * 0.6));
    drawn.motes.push(lightBall(burst, U * 0.7, white, left, U * 0.6 + 1));
  }
  drawn.motes.push(...starBurst(burst, U * 3.6, paint.halo, since / RAYS_S, U * 0.6 + 2, 8, seed));
  layShockRing(drawn, floor, U * 0.5, U * 5, U * 0.3, dark ? paint.rim : paint.sheath, since, 0.55);
  layShockRing(drawn, floor, U * 0.3, U * 3, U * 0.2, white, since - 0.06, 0.45);
}
