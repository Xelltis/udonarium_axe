/**
 * Where a moment falls along the timeline, and what the pointer lands on.
 *
 * Measurements come in as numbers and answers go out as numbers, so none of this needs
 * a browser to be checked.
 */

export interface TimelineTick {
  ms: number;
  /** Whether the tick carries a reading, rather than being one of the small ones between. */
  major: boolean;
}

/** How near a key has to be to count as the one grabbed, and what the clock is rounded to. */
export const KEY_GRAB_PX = 6;

/**
 * How tall each band of the timeline stands.
 *
 * The layer heads sit beside the bands rather than off in a column of their own, so that a
 * row of keyframes can be read off against the name of the layer it belongs to. Both are
 * measured from here, which is what keeps them level with one another.
 */
export const TIMELINE_RULER_H_PX = 20;
export const TIMELINE_SOUND_H_PX = 20;
export const TIMELINE_ROW_H_PX = 24;
/** How far down the first layer band begins: the ruler and the sound row above it. */
export const TIMELINE_HEAD_OFFSET_PX = TIMELINE_RULER_H_PX + TIMELINE_SOUND_H_PX;
/** How wide the heads stand. The bands have whatever is left of the room. */
export const TIMELINE_HEAD_W_PX = 160;
export const SNAP_MS = 10;

/**
 * How far in the timeline may be drawn out.
 *
 * At rest the whole scene is fitted to the room there is, which is fine for reading it and
 * hopeless for working on it: a tenth of a second comes to a few pixels, and a key cannot
 * be put where it is meant to go. Drawing it out past the room it has is what lets a moment
 * be aimed at, and the track scrolls sideways to reach the rest of the scene.
 */
export const MIN_TIMELINE_ZOOM = 1;
export const MAX_TIMELINE_ZOOM = 32;
export const TIMELINE_ZOOM_STEP = 1.5;

/** Holds a timeline zoom between fitting and 32 times that; anything not a number goes back to fitting. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TIMELINE_ZOOM;
  return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, zoom));
}

/** How wide the track stands once drawn out. Never narrower than the room it has. */
export function trackWidthFor(viewportPx: number, zoom: number): number {
  return Math.max(1, Math.round(viewportPx * clampZoom(zoom)));
}

/**
 * The moment that stays put while the scale changes.
 *
 * Drawing the timeline out from the left edge sends whatever is being worked on off the
 * side of the track. Keeping a moment where it was on screen is what makes zooming feel
 * like leaning in rather than like being moved.
 */
export function scrollToHold(
  atMs: number,
  durationMs: number,
  viewportPx: number,
  zoom: number,
  holdPx: number
): number {
  const width = trackWidthFor(viewportPx, zoom);
  const pxPerSec = pxPerSecFor(durationMs, width);
  return Math.max(0, Math.min(width - viewportPx, msToX(atMs, pxPerSec) - holdPx));
}

/**
 * The moment a drag lands on, drawn towards anything worth landing on that is near enough.
 *
 * A grid alone lands on round numbers, which are rarely what is wanted: what is wanted is
 * the moment another key already sits at, or where the playhead is, or an end of the scene.
 * Near enough is measured on screen rather than in time, so it holds however far the
 * timeline is drawn out.
 */
export const MAGNET_PX = 7;

/**
 * Where a dragged moment lands, held inside the scene.
 *
 * The nearest of `nearby` within the magnet's reach on screen wins; with none that close the moment
 * is rounded to the grid instead.
 */
export function snapToNearby(
  ms: number,
  nearby: readonly number[],
  durationMs: number,
  pxPerSec: number,
  magnetPx = MAGNET_PX
): number {
  const held = Math.min(durationMs, Math.max(0, ms));
  let best: number | null = null;
  let bestGap = Infinity;

  for (const candidate of nearby) {
    const gap = Math.abs(msToX(candidate, pxPerSec) - msToX(held, pxPerSec));
    if (gap <= magnetPx && gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best ?? snapMs(held, durationMs);
}

/** Which end of a band the pointer has hold of, if either. */
export type BandEdge = 'start' | 'end';

/** How near an edge the pointer has to be to take hold of it rather than of the band. */
export const EDGE_GRAB_PX = 5;

/**
 * The end of a band the pointer is on, where it is on one.
 *
 * A band is how long a layer is on screen for. Dragging its ends is how every editor sets that,
 * rather than typing the two numbers into a form.
 */
export function bandEdgeAt(bar: { left: number; width: number }, x: number, grabPx = EDGE_GRAB_PX): BandEdge | null {
  if (Math.abs(x - bar.left) <= grabPx) return 'start';
  if (Math.abs(x - (bar.left + bar.width)) <= grabPx) return 'end';
  return null;
}

/**
 * Where a band's ends land once one of them is dragged to a moment.
 *
 * They may not cross, and a band must keep some length or it would be impossible to take
 * hold of again. An end at the close of the scene is kept as nought, which is what the
 * layer means by running to the end however long the scene later becomes.
 */
export function bandDraggedTo(
  layer: { startMs: number; endMs: number },
  edge: BandEdge,
  ms: number,
  durationMs: number,
  leastMs = SNAP_MS
): { startMs: number; endMs: number } {
  const endMs = layer.endMs > 0 ? Math.min(layer.endMs, durationMs) : durationMs;
  const startMs = Math.max(0, Math.min(layer.startMs, durationMs));

  if (edge === 'start') {
    const moved = Math.max(0, Math.min(ms, endMs - leastMs));
    return { startMs: moved, endMs: layer.endMs };
  }

  const moved = Math.min(durationMs, Math.max(ms, startMs + leastMs));
  return { startMs: layer.startMs, endMs: moved >= durationMs ? 0 : moved };
}

/** The key nearest to a moment, on one side of it or the other. Nothing where there is none. */
export function keyBeyond(times: readonly number[], ms: number, forward: boolean): number | null {
  const beyond = times.filter((time) => (forward ? time > ms + 0.5 : time < ms - 0.5));
  if (beyond.length < 1) return null;
  return forward ? Math.min(...beyond) : Math.max(...beyond);
}

/** The scale that fits the whole scene into the room the track has. */
export function pxPerSecFor(durationMs: number, width: number): number {
  if (durationMs < 1 || width < 1) return 100;
  return (width * 1000) / durationMs;
}

/** How far along the track, in pixels, a moment falls at a scale. */
export function msToX(ms: number, pxPerSec: number): number {
  return (ms * pxPerSec) / 1000;
}

/** The moment at a distance along the track; a scale of zero or less gives 0. */
export function xToMs(x: number, pxPerSec: number): number {
  if (pxPerSec <= 0) return 0;
  return (x * 1000) / pxPerSec;
}

/** A moment rounded to the grid and held inside the scene. */
export function snapMs(ms: number, durationMs: number, gridMs = SNAP_MS): number {
  const grid = gridMs > 0 ? gridMs : 1;
  const snapped = Math.round(ms / grid) * grid;
  return Math.min(durationMs, Math.max(0, snapped));
}

/** Where a layer's time on screen falls along the track. */
export function barRect(
  layer: { startMs: number; endMs: number },
  durationMs: number,
  pxPerSec: number
): { left: number; width: number } {
  const startMs = Math.min(Math.max(0, layer.startMs), durationMs);
  const endMs = layer.endMs > 0 ? Math.min(Math.max(startMs, layer.endMs), durationMs) : durationMs;
  return { left: msToX(startMs, pxPerSec), width: Math.max(1, msToX(endMs - startMs, pxPerSec)) };
}

/**
 * The readings along the ruler.
 *
 * The step is chosen so the readings stay far enough apart to read, whatever the scene's
 * length, and every fifth one is a major.
 */
export function visibleTicks(durationMs: number, pxPerSec: number): TimelineTick[] {
  if (durationMs < 1 || pxPerSec <= 0) return [];

  const step = tickStepMs(pxPerSec);
  const ticks: TimelineTick[] = [];
  for (let ms = 0; ms <= durationMs + 0.5; ms += step) {
    const rounded = Math.round(ms);
    ticks.push({ ms: rounded, major: Math.round(ms / step) % 5 === 0 });
  }
  return ticks;
}

const TICK_STEPS_MS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000];
const MIN_TICK_GAP_PX = 8;

function tickStepMs(pxPerSec: number): number {
  for (const step of TICK_STEPS_MS) {
    if (msToX(step, pxPerSec) >= MIN_TICK_GAP_PX) return step;
  }
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** The moment a pointer has hold of, or none where it is not near one. */
export function keyAtX(
  moments: readonly number[],
  x: number,
  pxPerSec: number,
  tolerancePx = KEY_GRAB_PX
): number | null {
  let nearest: number | null = null;
  let closest = Number.POSITIVE_INFINITY;

  for (const ms of moments) {
    const away = Math.abs(msToX(ms, pxPerSec) - x);
    if (away <= tolerancePx && away < closest) {
      nearest = ms;
      closest = away;
    }
  }
  return nearest;
}

/** The clock written the way an editor shows it. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${`${seconds}`.padStart(2, '0')}.${`${hundredths}`.padStart(2, '0')}`;
}
