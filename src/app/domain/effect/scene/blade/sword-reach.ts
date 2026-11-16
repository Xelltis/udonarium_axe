import type { GreatSwordTiming } from '@axe/domain/effect/great-sword-looks';
import { type SwordPaint, swordPaintOf } from '@axe/domain/effect/scene/blade/sword-paint';
import { type SwordPose, swordPoseOf } from '@axe/domain/effect/scene/blade/sword-pose';
import { drawBroken, drawTorrent, layTorrentFloor, torrentAt } from '@axe/domain/effect/scene/blade/sword-torrent';
import { drawWake } from '@axe/domain/effect/scene/blade/sword-wake';
import { drawTorrentElement } from '@axe/domain/effect/scene/blade/torrent-element';
import { type Stage, type Staged, type StageTarget, within } from '@axe/domain/effect/scene/choreography';
import { smooth } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A great sword cast on several targets. The one sword is brought down towards the first of them
 * and its torrent erupts along the line to it; then, as the blow lands on each of the others in its
 * turn, the sword is swept round on to it and a torrent erupts along the line from the wielder to
 * that one too, a branch shorter than the first, washing over it and running on past it, scoring
 * the floor and leaving what its element leaves, so that every target is reached. A target that
 * stands within the first torrent, or within one loosed on to an earlier target, is reached by it
 * and takes no torrent of its own.
 */

/** How long the whiteness of a torrent lasts as it erupts, how long the score it leaves glows, and how long before the end it clears, in seconds. */
const WHITE_S = 0.09;
const COOLS_S = 1.5;
const CLEARS_S = 0.6;
/** How long the sword takes to sweep round on to each later target, in seconds, up to its torrent's eruption. */
const SWEEPS_S = 0.12;
/** How far past its target a torrent loosed on to a later target runs, in cells: shorter than the first, as a branch of it. */
const RUNS_ON_CELLS = 5;

/**
 * What a torrent loosed on to a later target is painted as. One of wind is drawn as a plain torrent
 * of its colours, with all the lines of speed and streaks a plain one has, and without the cyclone
 * about it, which the first carries: several of them would be more than a frame may draw.
 */
function plainOf(paint: SwordPaint): SwordPaint {
  return paint.element === 'wind' ? { ...paint, element: 'light' } : paint;
}

/** Whether a piece stands within the torrent a sword looses along a pose, across its width and along its run. */
function standsInTorrent(pose: SwordPose, piece: StageTarget): boolean {
  const dx = piece.x - pose.foot.x;
  const dy = piece.y - pose.foot.y;
  const along = dx * pose.way.x + dy * pose.way.y;
  const aside = Math.abs(-dx * pose.way.y + dy * pose.way.x);
  return along > 0 && along < pose.rootAt + pose.runs && aside < pose.thick * 0.5 + piece.widthPx * 0.5;
}

/** Where the sword is as it looses a torrent on to a later target: along the line to it, the torrent running a branch's length past it. */
function reachPoseOf(stage: Stage, target: StageTarget): SwordPose {
  const along = swordPoseOf(stage, target);
  const runs = along.far - along.rootAt + target.widthPx * 0.5 + along.cell * RUNS_ON_CELLS;
  return { ...along, runs: Math.min(along.runs, runs) };
}

/**
 * The later targets of a cast that take a torrent of their own, in their order: those standing
 * outside the first torrent and outside each torrent loosed on to an earlier one.
 */
export function reachedApart(stage: Stage, first: StageTarget, targets: readonly StageTarget[]): StageTarget[] {
  const loosed = [swordPoseOf(stage, first)];
  const apart: StageTarget[] = [];
  for (const target of targets) {
    if (target.index === first.index || loosed.some((pose) => standsInTorrent(pose, target))) continue;
    apart.push(target);
    loosed.push(reachPoseOf(stage, target));
  }
  return apart;
}

/**
 * The torrent loosed on to a later target of a cast, on the stage of that target, whose own playback
 * is behind the first's by as much as its blow lands later; see the head of this file. Nothing for a
 * target an earlier torrent reaches.
 */
export function drawReach(
  drawn: Staged,
  stage: Stage,
  timing: GreatSwordTiming,
  first: StageTarget,
  target: StageTarget,
  ends: number
): void {
  if (!reachedApart(stage, first, stage.targets).some((apart) => apart.index === target.index)) return;
  const t = stage.seconds;
  const since = t - timing.releasesAt;
  const pose = reachPoseOf(stage, target);
  const { preset, seed } = stage;
  const paint = swordPaintOf(preset.impactEffectKind, preset.colorPrimary, preset.colorSecondary);
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const torrent = torrentAt(pose, timing, t, seed);
  const reached = since < 0 ? 0 : (torrent?.head ?? pose.runs);
  const pieces = [target, ...(stage.bystanders ?? [])];
  layTorrentFloor(drawn, pose, paint, torrent, reached, 1 - within(since, 0.2, COOLS_S), clearing, seed);
  if (torrent) {
    drawTorrent(drawn, pose, plainOf(paint), torrent, 1 - within(since, 0, WHITE_S));
    if (paint.element !== 'wind') drawTorrentElement(drawn, pose, paint, torrent);
    drawBroken(drawn, pose, paint, torrent, pieces);
  }
  drawWake(drawn, pose, paint, { timing, seconds: t, clearing, seed, pieces });
}

/**
 * The way the sword lies over the floor `since` seconds after it is let go: along the line to the
 * first target, then swept round on to each later target that takes a torrent of its own, reaching
 * it as that torrent erupts.
 */
export function sweptWay(
  pose: SwordPose,
  stage: Stage,
  first: StageTarget,
  apart: readonly StageTarget[],
  since: number
): { readonly x: number; readonly y: number } {
  let turn = Math.atan2(pose.way.y, pose.way.x);
  for (const target of apart) {
    const erupts = (stage.preset.stagger * (target.index - first.index)) / 1000;
    const swept = smooth(erupts - SWEEPS_S, erupts, since);
    if (swept <= 0) break;
    const way = Math.atan2(target.y - pose.foot.y, target.x - pose.foot.x);
    const round = Math.atan2(Math.sin(way - turn), Math.cos(way - turn));
    turn += round * swept;
  }
  return { x: Math.cos(turn), y: Math.sin(turn) };
}
