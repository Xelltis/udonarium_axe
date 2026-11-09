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
 * which glints; a star, a cross that twinkles.
 */
export type EffectMoteShape = 'glow' | 'spark' | 'puff' | 'smoke' | 'chunk' | 'flake' | 'star';

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
  /** How far it is turned, in radians, for a chunk or a flake that tumbles. */
  readonly spin?: number;
  /** Picks among looks of the same shape, as the wavering edge of a ball of flame or of a chunk. */
  readonly variant?: number;
  /**
   * How far it is drawn towards the eye, in table pixels, so what goes off about a piece is drawn
   * before the piece rather than cut by the picture of it standing through its middle.
   */
  readonly forward?: number;
}

/** A band drawn through points, as a blade's arc, a bolt of lightning, a beam or the trail of a shot. */
export interface EffectRibbon {
  readonly points: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  /** How wide it is at each point, or all along, in table pixels. */
  readonly widths: readonly number[] | number;
  readonly color: string;
  /** The colour of its middle, hotter than its edge, where it has one. */
  readonly core?: string;
  readonly alpha: number;
  readonly blend: EffectBlend;
  /** Whether it turns to face the eye, as a bolt does, or lies as drawn, as a cut through the air does. */
  readonly facing: 'eye' | 'as-drawn';
}

/** The kinds of mark laid on the floor. */
export type EffectFloorShape = 'ring' | 'disc' | 'sigil' | 'cracks' | 'scorch';

/** A mark laid flat on the floor, under and round what it is laid at. */
export interface EffectFloorMark {
  readonly shape: EffectFloorShape;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How far it reaches from its middle, in table pixels. */
  readonly radius: number;
  /** How wide its line is, as a share of its radius, for a ring or a sigil. */
  readonly width: number;
  readonly color: string;
  readonly alpha: number;
  readonly blend: EffectBlend;
  /** How far it is turned about its middle, in radians. */
  readonly turn: number;
  /** Picks among looks of the same shape, as the spokes of cracks. */
  readonly seed: number;
}

export const EMPTY_EFFECT_FRAME: EffectFrame = { motes: [], ribbons: [], floor: [], lights: [] };
