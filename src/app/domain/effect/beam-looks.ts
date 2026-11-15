import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of a beam are told apart by, and when each of them fires. A great beam is written
 * one way and drawn two: a single colossal body of its colour, or, where the particles it names say
 * so, a braid of strands of many hues about a white core. Like the states of a curse the braid is
 * told by its particles and not by a kind of its own: a room shared with a version of the tool that
 * has never heard of it reads the name as no choice at all and draws the plain beam.
 *
 * A laser is a third thing: a thin line that cuts its way along the floor to its target, takes hold
 * of it and burns there until it is cut off.
 */

/** The looks of a great beam that are chosen by the particles it names, by the name each is stored under. */
export const BEAM_LOOKS = ['prism'] as const;

/** A look of a great beam chosen by its particles. */
export type BeamLook = (typeof BEAM_LOOKS)[number];

/** Whether a stored choice of particles names a look of a great beam. */
export function isBeamLook(value: unknown): value is BeamLook {
  return BEAM_LOOKS.includes(value as BeamLook);
}

/** What a great beam is drawn as: the braid of many hues where its particles name it, and the one great body otherwise. */
export function beamLookOf(preset: Pick<EffectPreset, 'moteStyle'>): BeamLook | 'great' {
  return isBeamLook(preset.moteStyle) ? preset.moteStyle : 'great';
}

/** Whether an effect is a great beam on its own, rather than a run with one among its stages. */
export function isGreatBeam(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && preset.effectKind === 'beam';
}

/** Whether an effect is a laser on its own, rather than a run with one among its stages. */
export function isLaser(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && preset.effectKind === 'raybeam';
}

/** How long before it fires a great beam shows the line it will take, in seconds. */
const LANCE_S = 0.07;
/** How long the body of a great beam takes to settle from the white of its release into its colour, in seconds. */
const SETTLES_S = 0.28;
/** How long a great beam is fired for at the least, and how long before the end of its playback it starts to fail, in seconds. */
const FIRES_FOR_AT_LEAST_S = 0.3;
const FAILS_BEFORE_END_S = 0.05;
/** How long a failing great beam takes to thin away from its muzzle, in seconds. */
const THINS_S = 0.45;

/**
 * The moments of a great beam on its own clock, in seconds: it gathers until it fires, a thin lance
 * showing its line just before; its body settles out of the white of its release; it pours until it
 * fails, and has thinned away from its muzzle once it is gone, leaving embers of light to drift.
 */
export interface BeamTiming {
  readonly lanceAt: number;
  readonly firesAt: number;
  readonly settledAt: number;
  readonly failsAt: number;
  readonly goneAt: number;
}

/** The moments of a great beam that plays for a length and lands its blow at a moment, in seconds. */
export function beamTimingOf(durationS: number, firesAt: number): BeamTiming {
  const failsAt = Math.max(firesAt + FIRES_FOR_AT_LEAST_S, durationS - FAILS_BEFORE_END_S);
  return {
    lanceAt: Math.max(0, firesAt - LANCE_S),
    firesAt,
    settledAt: firesAt + SETTLES_S,
    failsAt,
    goneAt: failsAt + THINS_S,
  };
}

/** How long a laser is aimed for before it lights, in seconds, and at the most as a share of the time before it takes hold. */
const AIMS_S = 0.16;
const AIMS_AT_MOST = 0.3;
/** Where through its playback a laser lets go of its target, as a share of it, and how long it takes to be cut off, in seconds. */
const LASER_BREAKS_AT = 0.86;
const CUT_OFF_S = 0.14;

/**
 * The moments of a laser on its own clock, in seconds: a hairline is aimed until the beam lights, the
 * beam cuts its way along the floor until it takes hold of its target, burns there until it breaks,
 * and is cut off.
 */
export interface LaserTiming {
  readonly lightsAt: number;
  readonly holdsAt: number;
  readonly breaksAt: number;
  readonly cutAt: number;
}

/** The moments of a laser that plays for a length and lands its blow at a moment, in seconds. */
export function laserTimingOf(durationS: number, holdsAt: number): LaserTiming {
  const breaksAt = Math.max(holdsAt + 0.2, durationS * LASER_BREAKS_AT);
  return { lightsAt: Math.min(AIMS_S, holdsAt * AIMS_AT_MOST), holdsAt, breaksAt, cutAt: breaksAt + CUT_OFF_S };
}

/** Where through its playback a great beam fires and a laser takes hold of its target, as shares of it. */
export const BEAM_FIRES_AT = 0.28;
export const LASER_HOLDS_AT = 0.5;
