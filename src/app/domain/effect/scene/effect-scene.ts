import type { EffectLight } from '@axe/domain/effect/effect-light';

/**
 * What an effect draws at a moment, in the table's own space: points in table pixels, x to the
 * east, y to the south and z up, so the scene draws it among the pieces and the walls, the far half of
 * a ring on the floor behind a piece and its near half in front.
 *
 * Every part is either light, added over what is behind it and spilling into a glow, or colour, laid
 * over it: hot things are light, and smoke, dust, debris and the body of a flame are colour. White is
 * kept for the hottest heart and edge alone; the middles are tinted, and deep colour is shadow.
 */
export interface EffectFrame {
  readonly motes: readonly EffectMote[];
  readonly ribbons: readonly EffectRibbon[];
  readonly floor: readonly EffectFloorMark[];
  readonly lights: readonly EffectLight[];
}

/** Whether a part is added as light or laid as colour. */
export type EffectBlend = 'light' | 'color';

/**
 * The kinds of particle: a soft round glow; a spark, drawn out along the way it flies by how fast it
 * goes; a ball of flame, hard-edged and wavering, lit on its cap; a cloud of smoke, soft and lit on
 * top; a chunk of debris, hard-edged, outlined and lit on one face, which tumbles; a flake or a shard,
 * which glints; a star, a cross that twinkles; a tongue of flame, drawn up from its root along the way
 * it is given to lean, as long as that way is fast, round at the root and pointed at the tip; a flare,
 * a streak of light drawn out across the screen as many times its size as its trail says; a comet, a
 * tongue the other way about, round at its head and pointed behind; a plume of smoke, soft and drawn
 * out the way it rises.
 *
 * A crag is rock, drawn out from its root along the way it is given as a tongue is, wide at its root
 * and drawn to a point: two faces meeting in a ridge, one lit and one in shadow, beds of stone across
 * them, chips out of its edges and an outline. Its spin holds two things: in whole numbers, how many
 * hundredths of its length are broken off its top, leaving a stump or a slab; and in what is over,
 * how far up it veins of its core's colour have climbed, from 0 for none towards 1 for its tip.
 *
 * Four more are drawn out along the way they are given as a tongue is, and flow: a pattern runs down
 * each from its root to its tip, as far as its spin says, eating into its edge, and its middle is
 * taken to its core's colour in two steps. A lick, a hard-edged tongue of flame, round at its root
 * and torn into shreds towards its tip; a wisp, the same gone soft, a shred of fog or smoke; a jet, a
 * hard-edged cone, narrow at its root and widening to an end that breaks up into licks; and a gust,
 * a jet gone soft.
 *
 * And there are the signs, each a flat figure of its colour with a dark outline, turned by its spin: a
 * heart; a zed, the letter of sleep; a query, a question mark; a cross, two strokes crossed; a skull,
 * whose sockets are of its core's colour where it has one; a pentagram, a star of five points; a swirl,
 * a spiral wound out from its middle; a dial, the face of a clock with one hand pointing up it, or with
 * a variant of one the shorter hand alone; a pair of eyes, slanted and narrowed; a bubble, a thin skin
 * with a glint on it; a hoop, a ring and nothing more; a bar, a band laid level across it; and a
 * feather, a curved vane notched along its edges about a quill.
 *
 * Two more flow and are round: as wide as they are and as long as they are drawn out along the way
 * they are given, their edge eaten into lobes by the pattern, which rolls along them as far as their
 * spin says. A blaze, a hard-edged ball of fire, its middle taken to its core's colour in two steps;
 * and a billow, the same gone soft, a cloud of smoke lit on the side it is drawn out towards.
 *
 * A crystal is ice, drawn out from its root along the way it is given as a crag is: a straight-sided
 * column cut to a point from its shoulder up, in flat faces that meet in a ridge, the one lit and the
 * rest taken towards its core's colour, which is its shadow; a hard white glint down its ridge and on
 * its shoulder, pale streaks frozen into it, rime about its foot and an outline of its shadow. It is
 * a little clear but for its edges. Its spin holds what a crag's does: in whole numbers, how many
 * hundredths of its length are broken off its top; and in what is over, how far up it white cracks
 * have run.
 */
export type EffectMoteShape =
  | 'glow'
  | 'spark'
  | 'puff'
  | 'smoke'
  | 'chunk'
  | 'flake'
  | 'star'
  | 'tongue'
  | 'flare'
  | 'comet'
  | 'plume'
  | 'heart'
  | 'zed'
  | 'query'
  | 'cross'
  | 'skull'
  | 'pentagram'
  | 'swirl'
  | 'dial'
  | 'eyes'
  | 'bubble'
  | 'hoop'
  | 'bar'
  | 'feather'
  | 'crag'
  | 'lick'
  | 'wisp'
  | 'jet'
  | 'gust'
  | 'blaze'
  | 'billow'
  | 'crystal';

/** One particle of an effect at a moment. */
export interface EffectMote {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How wide it is, in table pixels. */
  readonly size: number;
  readonly color: string;
  readonly alpha: number;
  readonly blend: EffectBlend;
  readonly shape: EffectMoteShape;
  /** Which way it flies, in table pixels a second: a spark is drawn out along it. */
  readonly velocity?: { readonly x: number; readonly y: number; readonly z: number };
  /** How far a spark is drawn out for its speed, in seconds of its flight. */
  readonly trail?: number;
  /** How far it is turned, in radians, for a chunk or a flake that tumbles; for a shape that flows, how far its pattern has run down it. */
  readonly spin?: number;
  /** The colour of the middle of a shape that flows, hotter than its edge; without it the shape is of one colour. */
  readonly core?: string;
  /** Picks among looks of the same shape, as the wavering edge of a ball of flame or of a chunk. */
  readonly variant?: number;
  /**
   * How far it is drawn towards the eye, in table pixels, so what goes off about a piece is drawn
   * before the piece rather than cut by the picture of it standing through its middle.
   */
  readonly forward?: number;
  /**
   * Whether it is drawn towards the eye by `forward` and no further, however large it is, so that a
   * piece standing before it hides it as far as it stands before it, as the stream of a breath is
   * hidden by what it passes behind; and whether it thins away as it comes close enough to the eye to
   * fill the view, as it does seen from within. Left out, a large particle is drawn nearer the eye by
   * a share of its size, clear of the piece it goes off about.
   */
  readonly exactDepth?: boolean;
  /**
   * How far it is set off from where it is across the screen, in table pixels: to the right of it and
   * up from it as the eye sees them, whichever way the eye looks from, as a sign hung beside a head
   * is beside it from every side.
   */
  readonly aside?: { readonly right: number; readonly up: number };
}

/**
 * A band drawn through points, as a blade's arc, a bolt of lightning, a beam or the trail of a shot,
 * turned about its line to face the eye: hard-edged, its colour taken to its core's in its middle.
 *
 * A band of wind may be more: its edges eaten by a pattern of soft noise that runs down it, thinning
 * softly to them rather than ending hard, its middle set to one side as a column lit from one side
 * is; and one that winds about something may be drawn only where it passes before it, or only where
 * it passes behind, so that the two halves can be laid either side of what it winds about.
 */
export interface EffectRibbon {
  readonly points: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  /** How wide it is at each point, or all along, in table pixels. */
  readonly widths: readonly number[] | number;
  readonly color: string;
  /** The colour of its middle, hotter than its edge, where it has one. */
  readonly core?: string;
  readonly alpha: number;
  /** How much of its alpha it has at each point, as a tail fades; whole all along without them. */
  readonly alphas?: readonly number[];
  readonly blend: EffectBlend;
  /** How deep the pattern eats into each of its edges, as a share of half its width; nothing for an edge left whole. */
  readonly torn?: number;
  /** How far in from each edge it thins to nothing, as a share of half its width; nothing for a hard edge. */
  readonly soft?: number;
  /** How far its pattern has run down it, in widths of the band. */
  readonly flowed?: number;
  /** Where across it its middle lies, from -1 at one edge to 1 at the other; in its middle without it. */
  readonly leans?: number;
  /** What each of its points winds about, for a band drawn by halves; see `half`. */
  readonly about?: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  /**
   * Which half of a band that winds is drawn: where it passes on the side of what it winds about that
   * is nearer the eye, or on the far side. The whole of it without.
   */
  readonly half?: 'near' | 'far';
  /**
   * Whether it thins away where it comes close enough to the eye to fill the view, as the body of a
   * great beam does seen from where it is fired: nearer the eye than a share of its width there it is
   * not drawn at all. Left out, it is drawn however near it comes.
   */
  readonly thins?: boolean;
}

/**
 * The kinds of mark laid on the floor. A crest is a seal of light: a doubled rim with ticks between
 * its rings, two squares crossed into a star of eight points, and a ring about a cross at its heart.
 * A rime is hoar frost: a patch grown out into needles of uneven length at its edge and mottled
 * within, as thick as its width says, from 1 for a whole sheet down towards 0 for the last patches
 * of it about its middle. A seal is the circle a summoning is written in, its lines as heavy as its
 * width says: with an even seed a band of glyphs written round between rims, picked by the seed, and
 * with an odd one a star of five points within a ring, with rings about its points and its heart. It
 * is written round from where it is turned, as far as the fraction of its seed leaves unwritten: all of
 * it for a whole seed; see {@link sealSeedOf}.
 */
export type EffectFloorShape = 'ring' | 'disc' | 'sigil' | 'cracks' | 'scorch' | 'fissure' | 'crest' | 'rime' | 'seal';

/** What makes a seal: its band of glyphs, or its star. */
export type SealPart = 'glyphs' | 'star';

/**
 * The seed of a seal: its part and its glyphs, picked by `pattern`, written round as far as `written`
 * says, from nothing at 0 to all of it at 1.
 */
export function sealSeedOf(part: SealPart, pattern: number, written: number): number {
  const whole = Math.floor(Math.abs(pattern) % 500) * 2 + (part === 'star' ? 1 : 0);
  const unwritten = Math.min(0.999, Math.max(0, 1 - written));
  return whole + unwritten;
}

/** A mark laid flat on the floor, under and round what it is laid at. */
export interface EffectFloorMark {
  readonly shape: EffectFloorShape;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How far it reaches from its middle, in table pixels. */
  readonly radius: number;
  /** How wide its line is, as a share of its radius, for a ring, a sigil or a fissure; how thick a rime lies. */
  readonly width: number;
  readonly color: string;
  readonly alpha: number;
  readonly blend: EffectBlend;
  /** How far it is turned about its middle, in radians; a fissure runs the way it is turned, from the east towards the north. */
  readonly turn: number;
  /** Picks among looks of the same shape, as the spokes of cracks. */
  readonly seed: number;
}

export const EMPTY_EFFECT_FRAME: EffectFrame = { motes: [], ribbons: [], floor: [], lights: [] };

/**
 * How much the effects may draw in the scene in a frame, of each kind of blend: as many particles, as
 * many marks on the floor, and as many points along their bands. What is drawn is laid out to keep
 * within it, and what goes past it is not drawn.
 */
export const EFFECT_FRAME_BUDGET = { motes: 4096, marks: 256, ribbonPoints: 4096 } as const;

/**
 * The height of the ground the board lies over, sampled on a grid from the board's corner, for the
 * marks of effects to lie over it rather than sink into it or float off it: how far apart the samples
 * are, in table pixels, how many there are across and down, and each height, in table pixels, row by
 * row from the north.
 */
export interface EffectGround {
  readonly stepPx: number;
  readonly across: number;
  readonly down: number;
  readonly heights: Float32Array;
}
