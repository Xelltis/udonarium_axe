/**
 * The kinds of effect laid over the board and left there.
 *
 * Unlike an effect that fires, it never ends, so only its strength and its colour are set from outside.
 * One kind serves both the whole map and a marked-off area, but the sky and the ground are drawn apart.
 */
export type AmbienceKind =
  | 'fog'
  | 'rain'
  | 'snow'
  | 'ash'
  | 'ember'
  | 'sand'
  | 'storm'
  | 'miasma'
  | 'bloom'
  | 'swamp'
  | 'vent'
  | 'lava'
  | 'blaze'
  | 'frost';

/** The kinds over the whole map: what falls from the sky and what fills the air. */
export const SKY_AMBIENCE_KINDS: readonly AmbienceKind[] = [
  'fog',
  'rain',
  'storm',
  'snow',
  'ash',
  'ember',
  'sand',
  'miasma',
  'bloom',
];

/** The kinds laid over a marked-off area, which cling to the ground. */
export const GROUND_AMBIENCE_KINDS: readonly AmbienceKind[] = [
  'swamp',
  'blaze',
  'vent',
  'fog',
  'miasma',
  'lava',
  'frost',
  'bloom',
];

export interface AmbiencePalette {
  /** The colour of the particles and the light. */
  primary: string;
  /** The colour of the shadow it casts on the ground. */
  secondary: string;
}

const PALETTES: Record<AmbienceKind, AmbiencePalette> = {
  fog: { primary: '#dce6f0', secondary: '#8c9bad' },
  rain: { primary: '#bcd8f0', secondary: '#3d5a78' },
  storm: { primary: '#cfe2f5', secondary: '#1d2a3a' },
  snow: { primary: '#ffffff', secondary: '#b9cfe4' },
  ash: { primary: '#b9b3ab', secondary: '#4a453f' },
  ember: { primary: '#ffb457', secondary: '#ff5a24' },
  sand: { primary: '#e2c48c', secondary: '#8a6a3c' },
  miasma: { primary: '#a86ecf', secondary: '#3d1f52' },
  bloom: { primary: '#9ff0d0', secondary: '#2f7d63' },
  swamp: { primary: '#8fd14f', secondary: '#2f4a1e' },
  vent: { primary: '#e8f0f4', secondary: '#7d8f99' },
  lava: { primary: '#ff8a33', secondary: '#8a1f08' },
  blaze: { primary: '#ffb02e', secondary: '#5c1a00' },
  frost: { primary: '#cfeaff', secondary: '#4b7fa8' },
};

const AMBIENCE_KIND_SET = new Set<string>(Object.keys(PALETTES));

export const DEFAULT_AMBIENCE_DENSITY = 0.6;

/** Whether a value names one of the known ambience kinds. */
export function isAmbienceKind(value: unknown): value is AmbienceKind {
  return typeof value === 'string' && AMBIENCE_KIND_SET.has(value);
}

/** The value as an ambience kind, or the fallback (fog unless given) for anything unknown, such as saved data. */
export function ambienceKindOf(value: unknown, fallback: AmbienceKind = 'fog'): AmbienceKind {
  return isAmbienceKind(value) ? value : fallback;
}

/** The kind's own particle and shadow colours, used wherever no colour has been chosen. */
export function ambiencePalette(kind: AmbienceKind): AmbiencePalette {
  return PALETTES[kind];
}

/** The colour given. Empty for the colour of the kind. */
export function ambienceColorOf(kind: AmbienceKind, color: string): string {
  const trimmed = typeof color === 'string' ? color.trim() : '';
  return trimmed.length > 0 ? trimmed : PALETTES[kind].primary;
}

/** The density kept between 0 and 1; a value that is not a number reads as the default density. */
export function ambienceDensityOf(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AMBIENCE_DENSITY;
  return Math.min(Math.max(numeric, 0), 1);
}
