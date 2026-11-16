import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * The great sword: its wielder raises a sword, light gathers on it into a towering blade, and it is
 * brought down, loosing a torrent along the line from the wielder through the target and on. What
 * both the scene that draws it and the pieces it moves are told by is kept here: when each of its
 * beats comes, and where it is swung from when no one wields it.
 */

/** Where through its playback a great sword is let go, where nothing tells it when its blow lands. */
const RELEASES_AT = 0.62;
/** How long the swing takes, and the stillness before it, in seconds, and the most of the time before the blow each may take. */
const SWING_S = 0.24;
const SWING_SHARE = 0.16;
const HELD_S = 0.26;
const HELD_SHARE = 0.16;
/** How much of what is left after the blow the torrent flows whole for, and by when the last of it has passed. */
const FLOWS_SHARE = 0.55;
const SPENT_SHARE = 0.92;

/** When each beat of a great sword comes, in seconds of its playback. */
export interface GreatSwordTiming {
  /** When the light is all gathered and the blade stands whole. */
  readonly gatheredAt: number;
  /** When it starts down. */
  readonly swingsAt: number;
  /** When it comes level and the torrent is let go: the blow. */
  readonly releasesAt: number;
  /** When the torrent starts to thin from its wielder's end, and when the last of it has passed on. */
  readonly thinsAt: number;
  readonly spentAt: number;
}

/** The beats of a great sword that plays for `durationS` and lands its blow at `releasesAt`, both in seconds. */
export function greatSwordTimingOf(durationS: number, releasesAt = durationS * RELEASES_AT): GreatSwordTiming {
  const swingsAt = releasesAt - Math.min(SWING_S, releasesAt * SWING_SHARE);
  const gatheredAt = swingsAt - Math.min(HELD_S, releasesAt * HELD_SHARE);
  const left = Math.max(0.3, durationS - releasesAt);
  return {
    gatheredAt,
    swingsAt,
    releasesAt,
    thinsAt: releasesAt + left * FLOWS_SHARE,
    spentAt: releasesAt + left * SPENT_SHARE,
  };
}

/**
 * The way a great sword that no one wields is swung along, over the floor and of length one: from a
 * place to the south-west of its target, towards the north-east.
 */
export const UNWIELDED_WAY = { x: Math.SQRT1_2, y: -Math.SQRT1_2 } as const;

/** Whether an effect is a great sword on its own, rather than a run with one among its stages. */
export function swingsGreatSword(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && preset.effectKind === 'skyblade';
}

/** How far the torrent throws a piece as it reaches it, and how far it holds it for as long as it flows, as shares of a cell. */
const THROWN_CELLS = 0.24;
const HELD_BACK_CELLS = 0.13;
/** How far a piece in the torrent trembles each way, as a share of a cell. */
const TREMBLE_CELLS = 0.02;
/** How long a piece takes to be thrown as far as it goes, and to stand back once the torrent has passed, in milliseconds. */
const THROWN_IN_MS = 50;
const SETTLES_MS = 260;
const STANDS_BACK_MS = 380;
/** How far the wielder draws back before the swing, and is carried forward by it, as shares of a cell. */
const DRAWS_BACK_CELLS = 0.1;
const CARRIED_CELLS = 0.16;
/** How long before the swing the wielder starts to draw back, in milliseconds. */
const DRAWS_BACK_MS = 160;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/**
 * Adds how a great sword moves the pieces at a moment, through `add`. Its wielder draws back before
 * the swing, is carried forward as the blade comes down and braces there, trembling, for as long as
 * the torrent flows. Each piece it strikes is thrown along the torrent, away from the wielder, as
 * the blow lands, is held back there trembling while the torrent washes over it, and stands back
 * once it has passed.
 */
export function addGreatSwordJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  releasesAtMs: number,
  add: Add
): void {
  const timing = greatSwordTimingOf(preset.duration / 1000, releasesAtMs / 1000);
  const thinsAt = timing.thinsAt * 1000;
  const first = cast.targets[0];
  const way = first ? wayOf(cast, first) : UNWIELDED_WAY;
  if (cast.origin && cast.casterIdentifier.length > 0) {
    const lean = wielderLeanAt(elapsedMs, timing.swingsAt * 1000, releasesAtMs, thinsAt) * cellPx;
    if (lean !== 0) add(cast.casterIdentifier, { x: way.x * lean, y: way.y * lean, z: 0 });
  }
  cast.targets.forEach((target, index) => {
    const since = elapsedMs - preset.stagger * index - releasesAtMs;
    const passed = thinsAt - releasesAtMs;
    if (since <= 0 || since >= passed + STANDS_BACK_MS) return;
    const away = wayOf(cast, target);
    const thrown = Math.min(1, since / THROWN_IN_MS);
    const settled = Math.min(1, Math.max(0, since - THROWN_IN_MS) / SETTLES_MS);
    const standing = 1 - Math.max(0, (since - passed) / STANDS_BACK_MS);
    const far = (THROWN_CELLS + (HELD_BACK_CELLS - THROWN_CELLS) * settled) * thrown * standing;
    const seconds = since / 1000;
    const along = (far + TREMBLE_CELLS * Math.sin(seconds * 127 + index * 2.1) * standing) * cellPx;
    const across = TREMBLE_CELLS * Math.sin(seconds * 151 + index * 4.3) * standing * cellPx;
    add(target.identifier, { x: away.x * along - away.y * across, y: away.y * along + away.x * across, z: 0 });
  });
}

/** When, on a great sword's own clock, the last piece it moves stands still again, in milliseconds. */
export function greatSwordJoltsEndOf(preset: EffectPreset, cast: EffectCast, releasesAtMs: number): number {
  const timing = greatSwordTimingOf(preset.duration / 1000, releasesAtMs / 1000);
  const lastTarget = preset.stagger * Math.max(0, cast.targets.length - 1);
  return timing.thinsAt * 1000 + lastTarget + STANDS_BACK_MS;
}

/** The way from where a cast's sword is swung to a piece, over the floor and of length one. */
function wayOf(cast: EffectCast, piece: { x: number; y: number }): { readonly x: number; readonly y: number } {
  if (!cast.origin) return UNWIELDED_WAY;
  const dx = piece.x - cast.origin.x;
  const dy = piece.y - cast.origin.y;
  const far = Math.hypot(dx, dy);
  return far < 1 ? UNWIELDED_WAY : { x: dx / far, y: dy / far };
}

/**
 * How far the wielder is drawn towards the target at a moment, as a share of a cell: back, below
 * nothing, before the swing; forward through it; braced and trembling while the torrent flows; and
 * standing again as it thins.
 */
function wielderLeanAt(elapsedMs: number, swingsAt: number, releasesAt: number, thinsAt: number): number {
  const drawsBackAt = swingsAt - DRAWS_BACK_MS;
  if (elapsedMs <= drawsBackAt || elapsedMs >= thinsAt + STANDS_BACK_MS) return 0;
  if (elapsedMs < swingsAt) {
    return -DRAWS_BACK_CELLS * Math.sin((((elapsedMs - drawsBackAt) / DRAWS_BACK_MS) * Math.PI) / 2);
  }
  if (elapsedMs < releasesAt) {
    const swung = (elapsedMs - swingsAt) / Math.max(1, releasesAt - swingsAt);
    return -DRAWS_BACK_CELLS + (DRAWS_BACK_CELLS + CARRIED_CELLS) * swung * swung;
  }
  const standing = 1 - Math.max(0, (elapsedMs - thinsAt) / STANDS_BACK_MS);
  return (CARRIED_CELLS + TREMBLE_CELLS * 0.6 * Math.sin((elapsedMs / 1000) * 113)) * standing;
}
