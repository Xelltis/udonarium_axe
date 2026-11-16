import type { Solid } from '@axe/domain/tabletop/solid/solid';
import type { WireSegment } from '@axe/domain/tabletop/solid/solid-wire';

/** What a range standing up off the table is known by in the scene, as its flat picture is. */
export const SOLID_RANGE_KIND = 'range';

/**
 * The most a solid's faces are filled in, from 0 to 1, so that even a range at its fullest leaves the
 * pieces within it to be seen through it.
 */
export const MOST_SOLID_FILL = 0.35;

/** How much stronger than its faces a solid's edges are drawn, up to fully. */
const EDGE_OVER_FILL = 2.6;

/** A range standing up off the table, as the scene draws it. */
export interface TableWorldSolid {
  readonly id: string;
  /** The range it is. */
  readonly owner: string;
  readonly solid: Solid;
  /** The colour its faces are filled with and its edges drawn in, as CSS colours. */
  readonly fill: string;
  readonly edge: string;
  /** How opaque its faces and its edges are drawn, each from 0 to 1. */
  readonly fillOpacity: number;
  readonly edgeOpacity: number;
}

/**
 * How opaque a solid's faces and edges are drawn, from how opaque its range is drawn flat, from 0
 * to 1: its faces no more than {@link MOST_SOLID_FILL}, so the pieces in it are seen through it.
 */
export function solidOpacityOf(rangeOpacity: number): { fill: number; edge: number } {
  const share = Number.isFinite(rangeOpacity) ? Math.max(0, Math.min(1, rangeOpacity)) : 1;
  const fill = share * MOST_SOLID_FILL;
  return { fill, edge: Math.min(1, fill * EDGE_OVER_FILL) };
}

/**
 * Lines drawn in the scene for this seat alone while it moves or points a solid range, as the room
 * round the caster the range may be put in: never filled, and drawn over the pieces as the solids are.
 */
export interface TableWorldGuide {
  readonly id: string;
  readonly segments: readonly WireSegment[];
  /** The colour the lines are drawn in, as a CSS colour, and how opaque, from 0 to 1. */
  readonly colour: string;
  readonly opacity: number;
  /** How wide the lines are drawn, in screen pixels; the width the solids' lines are drawn at where none is given. */
  readonly widthPx?: number;
  /** A darker line drawn wider under them, so they read over a board of any colour; none where not given. */
  readonly outline?: { readonly colour: string; readonly opacity: number; readonly widthPx: number };
}

/** The colour the room round a caster is drawn in: the yellow every guide over the table is drawn in. */
export const REACH_GUIDE_COLOUR = '#ffec8c';
