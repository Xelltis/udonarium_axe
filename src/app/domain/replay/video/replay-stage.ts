import { containRect, type ReplayFrameSize } from '@axe/domain/replay/replay-picture-fit';
import { easeInOut } from '@axe/domain/replay/replay-route';
import type { ReplayStageFigure } from '@axe/domain/replay/video/replay-video-timeline';

/** How long the figures take to settle into a segment's stage from the one before. */
export const REPLAY_STAGE_FADE_MS = 350;
/** How far a portrait is ever blown up past its own size, so a small picture stays sharp enough to look at. */
const PORTRAIT_MAX_GROWTH = 2.4;
/** How much of the frame's width a portrait may take. */
const PORTRAIT_WIDTH_SHARE = 0.36;
/** How much larger the one speaking stands than the others. */
const ACTIVE_GROWTH = 0.05;
/** How far a figure's feet stand below the bottom of the frame, as a share of its height. */
const FEET_BELOW = 0.02;
/** How far down a figure starts as it comes on, as a share of the frame's height. */
const RISE_SHARE = 0.04;
/** The part of a segment a leaving figure fades through: from this far in to its end. */
const LEAVE_FROM = 0.4;

/** A figure as it stands on the stage at a moment, in the order the figures are drawn. */
export interface ReplayStageStanding {
  readonly figure: ReplayStageFigure;
  /** Where it stands across the stage, as a percentage of its width. */
  readonly left: number;
  /** How much of it shows, from 0 to 1. */
  readonly alpha: number;
  /** How far it is the one speaking, from 0 to 1. */
  readonly active: number;
  /** How far it has yet to rise into place: 1 as it comes on, 0 once it stands. */
  readonly rise: number;
}

/**
 * The figures on the stage `localMs` into a segment, each on its way from where the segment before
 * left it: one that stays glides to its new place and its new prominence, one that is new rises in,
 * one that is gone fades out, and one that is leaving fades through the end of the segment.
 *
 * The figures of the segment before that have gone come first, then the segment's own with the one
 * speaking last, which is the order they are drawn in so the one speaking stands in front.
 */
export function stageFiguresAt(
  now: readonly ReplayStageFigure[],
  before: readonly ReplayStageFigure[],
  localMs: number,
  durationMs: number
): ReplayStageStanding[] {
  const beforeById = new Map(before.map((figure) => [figure.id, figure]));
  const nowIds = new Set(now.map((figure) => figure.id));
  const settle = easeInOut(localMs / REPLAY_STAGE_FADE_MS);
  const standings: ReplayStageStanding[] = [];

  for (const figure of before) {
    if (nowIds.has(figure.id) || figure.isLeaving) continue;
    standings.push({ figure, left: figure.left, alpha: 1 - settle, active: figure.isActive ? 1 : 0, rise: 0 });
  }
  const ordered = [...now].sort((a, b) => Number(a.isActive) - Number(b.isActive));
  for (const figure of ordered) {
    const earlier = beforeById.get(figure.id);
    const left = earlier ? earlier.left + (figure.left - earlier.left) * settle : figure.left;
    const wasActive = earlier ? (earlier.isActive ? 1 : 0) : figure.isActive ? 1 : 0;
    const active = wasActive + ((figure.isActive ? 1 : 0) - wasActive) * settle;
    let alpha = earlier ? 1 : settle;
    if (figure.isLeaving) {
      const through = durationMs > 0 ? localMs / durationMs : 1;
      alpha *= 1 - easeInOut((through - LEAVE_FROM) / (1 - LEAVE_FROM));
    }
    standings.push({ figure, left, alpha, active, rise: earlier ? 0 : 1 - settle });
  }
  return standings;
}

/** The frame a stage is drawn in: its size and how tall the tallest portrait stands. */
export interface ReplayStageFrame {
  readonly width: number;
  readonly height: number;
  readonly portraitHeight: number;
}

/** Where a figure's portrait is drawn: about its middle, from its top, at its size. */
export interface ReplayStageFigureRect {
  readonly centreX: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a portrait stands in the frame: fitted to the stage's height and a share of its width, never
 * blown up far past its own size, a little larger for the one speaking, its feet just under the
 * bottom edge and lower still while it is rising in.
 */
export function stageFigureRect(
  picture: ReplayFrameSize,
  frame: ReplayStageFrame,
  leftPercent: number,
  active: number,
  rise: number
): ReplayStageFigureRect {
  const most = Math.min(frame.portraitHeight, picture.height * PORTRAIT_MAX_GROWTH);
  const size = containRect(picture, frame.width * PORTRAIT_WIDTH_SHARE, most, true);
  const grow = 1 - ACTIVE_GROWTH + ACTIVE_GROWTH * active;
  const width = size.width * grow;
  const height = size.height * grow;
  const centreX = (leftPercent / 100) * frame.width;
  const bottom = frame.height + height * FEET_BELOW + rise * frame.height * RISE_SHARE;
  return { centreX, top: bottom - height, width, height };
}
