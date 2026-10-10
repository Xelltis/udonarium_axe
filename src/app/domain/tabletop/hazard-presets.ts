import { AmbienceKind } from '@axe/domain/effect/ambience/ambience-kind';
import { TriggerMoment } from '@axe/domain/tabletop/trigger-event';

/**
 * The dangerous ground a master can lay in one stroke.
 *
 * A bog is three things at once: something to look at, something that slows a piece down and
 * something that hurts whoever stands in it. Laid by hand they are three separate paintings
 * over the same cells, and keeping the three in step as the map is edited is work nobody
 * should have to do. Named here, one brush lays all three and the table keeps them together.
 */
export const HAZARD_KINDS = ['bog', 'lava', 'fog', 'ice', 'briar', 'vent'] as const;

export type HazardKind = (typeof HAZARD_KINDS)[number];

export const DEFAULT_HAZARD_KIND: HazardKind = 'bog';

/** What a resource is called where nobody has said otherwise, which most sheets agree on. */
export const DEFAULT_HAZARD_ELEMENT = 'HP';

export interface HazardPreset {
  /** The look laid over the ground, as one of GROUND_AMBIENCE_KINDS. */
  ambience: AmbienceKind;
  /** What crossing it costs over plain footing. Nought leaves the going as it was. */
  extraCost: number;
  /** Whether nobody sees through it, the far side of it being hidden rather than only dimmed. */
  blocksSight: boolean;
  /** What it takes from whoever it catches, as a number or a handful of dice. Empty takes nothing. */
  amount: string;
  /** When it takes it: as a walk ends on it, or as a turn spent in it opens. */
  moment: TriggerMoment;
  /** The state it leaves a piece in, by the name the room keeps it under. Empty leaves none. */
  ailment: string;
  /** The colour the ground is drawn in on the table. */
  color: string;
}

/**
 * What each kind of dangerous ground comes to.
 *
 * Adding one is a line here and a word in each of the three languages. The numbers are meant
 * to be read as a starting point rather than as any one game's rules: what a bog costs to
 * wade is a thing tables disagree about, and the three objects it lays can all be edited once
 * they are down.
 */
export const HAZARD_PRESETS: Record<HazardKind, HazardPreset> = {
  // Wading, not burning: it is slow rather than deadly, and holds a piece where it stands.
  bog: {
    ambience: 'swamp',
    extraCost: 1,
    blocksSight: false,
    amount: '',
    moment: 'stop',
    ailment: '',
    color: '#6d9b5a',
  },
  // Standing in it is what hurts, so it takes its due as a turn in it opens rather than as a
  // piece crosses: running through a fire is not the same as being caught in one.
  lava: {
    ambience: 'lava',
    extraCost: 2,
    blocksSight: false,
    amount: '2d6',
    moment: 'turnStart',
    ailment: '',
    color: '#c0392b',
  },
  fog: {
    ambience: 'fog',
    extraCost: 1,
    blocksSight: true,
    amount: '',
    moment: 'stop',
    ailment: '',
    color: '#8fa3ad',
  },
  // Ice is no harder to cross than a floor; what it does is put a piece off its feet.
  ice: {
    ambience: 'frost',
    extraCost: 0,
    blocksSight: false,
    amount: '',
    moment: 'enter',
    ailment: '転倒',
    color: '#7fc8e8',
  },
  briar: {
    ambience: 'swamp',
    extraCost: 1,
    blocksSight: false,
    amount: '1d6',
    moment: 'enter',
    ailment: '',
    color: '#7a5c3a',
  },
  vent: {
    ambience: 'vent',
    extraCost: 0,
    blocksSight: false,
    amount: '1d6',
    moment: 'turnStart',
    ailment: '',
    color: '#d98f3a',
  },
};

/** What one kind comes to, reading a kind it has never heard of as a bog. */
export function hazardPresetOf(kind: unknown): HazardPreset {
  const known = typeof kind === 'string' && (HAZARD_KINDS as readonly string[]).includes(kind);
  return HAZARD_PRESETS[known ? (kind as HazardKind) : DEFAULT_HAZARD_KIND];
}

/** Reads a stored kind of dangerous ground, falling back to a bog for anything unknown. */
export function asHazardKind(value: unknown): HazardKind {
  return typeof value === 'string' && (HAZARD_KINDS as readonly string[]).includes(value)
    ? (value as HazardKind)
    : DEFAULT_HAZARD_KIND;
}
