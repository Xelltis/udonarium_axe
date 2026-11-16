import { isGentleBreath } from '@axe/domain/effect/breath-timing';
import { effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { type GoutKind } from '@axe/domain/effect/scene/breath/breath-stream';
import { isFiery } from '@axe/domain/effect/scene/effect-ramp';

/*
 * What a breath is a breath of, and how each element blows: how hard, how thick, whether it rises or
 * sinks, and what it is made of, a kind of gout for each layer of it. A preset says which by what it
 * carries along its way, as its family or its own choice of particle has it, and a breath of the
 * family that heals or of the holy one is the gentle one whatever it carries.
 */

/** The elements a breath is drawn as. */
export type BreathElement = 'fire' | 'ice' | 'poison' | 'thunder' | 'wind' | 'dark' | 'holy' | 'sand';

/** The family whose haze is a poison rather than a darkness. */
const AILMENT_TAG = '状態異常';
/** The family whose breath is a torrent of sand, where it names no particle of its own. */
const EARTH_TAG = '土';

/** How one element blows. Rates are a second at the middle grade, sizes in cells. */
export interface BreathLook {
  readonly element: BreathElement;
  /** Whether it carries its element's own things along its way: embers, crystals, leaves; a preset may ask for none. */
  readonly carries: boolean;
  /** Whether it burns as fire does, leaving smoke. */
  readonly fiery: boolean;
  /** How fast it runs, as a share of a breath of fire's pace. */
  readonly force: number;
  /** How far it rises by the end of its cone, in cells; below nothing it sinks. */
  readonly buoyancy: number;
  /** The body of the stream, the bright heart down its axis, the streaks that show its speed, what curls off its edge, and what it carries. */
  readonly body: GoutKind;
  readonly core: GoutKind | null;
  readonly streaks: GoutKind;
  readonly curls: GoutKind | null;
  readonly carried: GoutKind | null;
  /** How strong the light it throws over the table is; nothing for one that throws none. */
  readonly light: number;
}

const FIRE: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'fire',
  force: 1,
  buoyancy: 0.25,
  body: { rate: 100, pace: [0.85, 1.1], edge: [0.15, 1], size: [0.3, 0.44], rolls: 1.2, breaks: true, leaks: 0.1 },
  core: { rate: 40, pace: [1.1, 1.3], edge: [0, 0.3], size: [0.16, 0.24], rolls: 0.4, breaks: true },
  streaks: { rate: 40, pace: [1.6, 2.1], edge: [0, 0.55], size: [0.05, 0.08], rolls: 0, breaks: true },
  curls: { rate: 12, pace: [0.6, 0.8], edge: [0.95, 1.1], size: [0.3, 0.45], rolls: 0.6, breaks: false, upper: true },
  carried: {
    rate: 34,
    pace: [0.6, 1],
    edge: [0.3, 1.15],
    size: [0.06, 0.1],
    rolls: 1,
    breaks: false,
    leaks: 1,
    leaksCells: [0.3, 1.2],
  },
  light: 1.2,
};

const ICE: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'ice',
  force: 0.9,
  buoyancy: -0.35,
  body: { rate: 70, pace: [0.8, 1.05], edge: [0.1, 1], size: [0.38, 0.55], rolls: 0.8, breaks: true, leaks: 0.12 },
  core: { rate: 24, pace: [1.05, 1.25], edge: [0, 0.3], size: [0.2, 0.3], rolls: 0.3, breaks: true },
  streaks: { rate: 56, pace: [1.5, 2.1], edge: [0, 0.9], size: [0.05, 0.08], rolls: 0, breaks: true },
  curls: { rate: 8, pace: [0.6, 0.8], edge: [0.95, 1.1], size: [0.35, 0.5], rolls: 0.5, breaks: false, upper: true },
  carried: { rate: 30, pace: [0.7, 1.1], edge: [0.2, 1.05], size: [0.13, 0.24], rolls: 1.5, breaks: false, leaks: 0.6 },
  light: 0.6,
};

const POISON: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'poison',
  force: 0.75,
  buoyancy: 0.05,
  body: { rate: 80, pace: [0.75, 1.05], edge: [0.1, 1], size: [0.4, 0.6], rolls: 1.6, breaks: true, leaks: 0.1 },
  core: { rate: 16, pace: [1.05, 1.2], edge: [0, 0.3], size: [0.18, 0.26], rolls: 0.3, breaks: true },
  streaks: { rate: 12, pace: [1.4, 1.8], edge: [0, 0.6], size: [0.07, 0.1], rolls: 0, breaks: true },
  curls: { rate: 10, pace: [0.6, 0.8], edge: [0.9, 1.1], size: [0.4, 0.6], rolls: 0.8, breaks: false, upper: true },
  carried: { rate: 30, pace: [0.6, 1], edge: [0.2, 1.05], size: [0.1, 0.22], rolls: 1, breaks: false, leaks: 0.3 },
  light: 0.35,
};

const THUNDER: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'thunder',
  force: 1.25,
  buoyancy: 0,
  body: { rate: 45, pace: [0.85, 1.1], edge: [0.1, 0.9], size: [0.35, 0.5], rolls: 0.6, breaks: true, leaks: 0.08 },
  core: null,
  streaks: { rate: 50, pace: [1.6, 2.2], edge: [0, 0.85], size: [0.04, 0.07], rolls: 0, breaks: true },
  curls: null,
  carried: { rate: 14, pace: [0.6, 1], edge: [0.5, 1.1], size: [0.12, 0.2], rolls: 0.5, breaks: false, leaks: 0.3 },
  light: 1.3,
};

const WIND: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'wind',
  force: 1.35,
  buoyancy: 0.1,
  body: { rate: 26, pace: [0.85, 1.1], edge: [0.1, 1], size: [0.4, 0.6], rolls: 1, breaks: true, leaks: 0.15 },
  core: null,
  streaks: { rate: 110, pace: [1.3, 1.9], edge: [0, 0.95], size: [0.05, 0.09], rolls: 0.4, breaks: true, leaks: 0.3 },
  curls: { rate: 10, pace: [0.6, 0.8], edge: [0.9, 1.1], size: [0.3, 0.45], rolls: 0.8, breaks: false, upper: true },
  carried: {
    rate: 18,
    pace: [0.7, 1.1],
    edge: [0.2, 1.05],
    size: [0.09, 0.16],
    rolls: 3,
    breaks: false,
    leaks: 1,
    leaksCells: [1, 2.5],
  },
  light: 0,
};

const DARK: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'dark',
  force: 0.85,
  buoyancy: -0.1,
  body: { rate: 85, pace: [0.8, 1.05], edge: [0.1, 1], size: [0.4, 0.58], rolls: 1.4, breaks: true, leaks: 0.1 },
  core: { rate: 24, pace: [1.05, 1.25], edge: [0, 0.3], size: [0.22, 0.32], rolls: 0.3, breaks: true },
  streaks: { rate: 34, pace: [1.5, 1.9], edge: [0.2, 1], size: [0.05, 0.08], rolls: 0, breaks: true },
  curls: { rate: 10, pace: [0.6, 0.8], edge: [0.95, 1.1], size: [0.3, 0.45], rolls: 0.6, breaks: false, upper: true },
  carried: { rate: 10, pace: [0.6, 1], edge: [0.3, 1.05], size: [0.1, 0.16], rolls: 1, breaks: false, leaks: 0.4 },
  light: 0,
};

const HOLY: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'holy',
  force: 0.5,
  buoyancy: 0.3,
  body: { rate: 55, pace: [0.85, 1.1], edge: [0.1, 1], size: [0.4, 0.56], rolls: 1, breaks: true, leaks: 0.2 },
  core: { rate: 16, pace: [1.05, 1.2], edge: [0, 0.3], size: [0.22, 0.3], rolls: 0.3, breaks: true },
  streaks: { rate: 12, pace: [1.2, 1.5], edge: [0, 0.7], size: [0.05, 0.07], rolls: 0, breaks: true },
  curls: null,
  carried: { rate: 34, pace: [0.6, 1], edge: [0.2, 1.1], size: [0.2, 0.38], rolls: 1.5, breaks: false, leaks: 0.5 },
  light: 0.8,
};

const SAND: Omit<BreathLook, 'carries' | 'fiery'> = {
  element: 'sand',
  force: 1.3,
  buoyancy: -0.3,
  body: { rate: 95, pace: [0.85, 1.1], edge: [0.12, 1], size: [0.42, 0.62], rolls: 1.4, breaks: true, leaks: 0.12 },
  core: { rate: 28, pace: [1.05, 1.25], edge: [0, 0.3], size: [0.2, 0.3], rolls: 0.4, breaks: true },
  streaks: { rate: 90, pace: [1.5, 2.1], edge: [0, 0.95], size: [0.05, 0.08], rolls: 0.3, breaks: true, leaks: 0.2 },
  curls: { rate: 14, pace: [0.6, 0.8], edge: [0.95, 1.1], size: [0.4, 0.6], rolls: 0.8, breaks: false, upper: true },
  carried: {
    rate: 44,
    pace: [0.75, 1.1],
    edge: [0.2, 1.05],
    size: [0.13, 0.27],
    rolls: 2.5,
    breaks: false,
    leaks: 0.8,
    leaksCells: [0.5, 1.8],
  },
  light: 0,
};

const LOOKS: Record<BreathElement, Omit<BreathLook, 'carries' | 'fiery'>> = {
  fire: FIRE,
  ice: ICE,
  poison: POISON,
  thunder: THUNDER,
  wind: WIND,
  dark: DARK,
  holy: HOLY,
  sand: SAND,
};

/**
 * The element a preset's breath is drawn as. One of the family that heals or of the holy one is the gentle breath of
 * light; otherwise what it carries along its way says: sparks a fire, frost an ice, a current a
 * thunder, leaves a wind, and a haze a poison for the family of ailments and a darkness for any
 * other. One told to carry nothing is a fire where its colour is a fire's, and a cold mist otherwise.
 * One of the family of earth that names no particle of its own is a torrent of sand.
 */
export function breathElementOf(preset: EffectPreset): BreathElement {
  if (isGentleBreath(preset)) return 'holy';
  if (preset.moteStyle.trim() === '' && preset.tagName.trim() === EARTH_TAG) return 'sand';
  switch (effectMoteOf(preset)) {
    case 'frost':
      return 'ice';
    case 'arc':
      return 'thunder';
    case 'leaf':
      return 'wind';
    case 'haze':
      return preset.tagName.trim() === AILMENT_TAG ? 'poison' : 'dark';
    case 'none':
      return isFiery(preset.colorSecondary) ? 'fire' : 'ice';
    default:
      return 'fire';
  }
}

/** How a preset's breath blows: its element's way, carrying nothing where the preset is told to carry none. */
export function breathLookOf(preset: EffectPreset): BreathLook {
  const look = LOOKS[breathElementOf(preset)];
  const carries = effectMoteOf(preset) !== 'none';
  return {
    ...look,
    carries,
    fiery: look.element === 'fire' && isFiery(preset.colorSecondary),
    carried: carries ? look.carried : null,
  };
}
