import { clamp01 } from '@axe/core/util/clamp';
import { AILMENT_BEAT_S } from '@axe/domain/effect/ailment-beats';
import { type CurseLook, curseLookOf, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * How a piece bears the state it is put in, drawn off where it stands for as long as the state's look
 * plays: one in fear shivers and cowers, one asleep nods with its breath, one confused reels, one
 * bound strains between the squeezes of what holds it. The pieces themselves stay where they are.
 */

/** How far a piece is drawn off where it stands, as shares of a cell: x to the east, y to the south and z up. */
interface Borne {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const STILL: Borne = { x: 0, y: 0, z: 0 };

/** How long a state's look takes to let a piece go at the end of its playback, in seconds. */
const LETS_GO_S = 0.45;
/** How long after the first thump of a heart its second comes, as a share of the beat. */
const SECOND_THUMP_AT = 0.25;

/** A moment of a state on one piece: how long it has played and for how long it does, since it took hold, and its beat. */
interface Moment {
  readonly s: number;
  readonly duration: number;
  /** How long ago it took hold, in seconds; below nothing before it. */
  readonly since: number;
  /** How far through the beat under way it is, and how hard that beat still rings; nothing before it takes hold. */
  readonly phase: number;
  readonly pulse: number;
  /** How long a beat is, in seconds. */
  readonly every: number;
  /** A turn that tells this piece's shaking from the next one's. */
  readonly own: number;
}

/** How hard a heart thumps at a moment of its beat: the first thump, and a lighter second. */
function thumpOf(moment: Moment): number {
  if (moment.since < 0) return 0;
  const second = moment.phase >= SECOND_THUMP_AT ? 0.7 * Math.exp(-(moment.phase - SECOND_THUMP_AT) * 7) : 0;
  return Math.max(moment.pulse, second);
}

/** How each state moves the piece it is on, at a moment of it. */
const BORNE_AS: Record<CurseLook, (moment: Moment) => Borne> = {
  poison: ({ s, pulse, own }) => ({
    x: 0.02 * Math.sin(s * 3 + own) + 0.02 * pulse * Math.sin(s * 60),
    y: 0,
    z: -0.02 * pulse,
  }),
  bleed: (moment) => ({ x: 0, y: 0, z: -0.035 * thumpOf(moment) }),
  burn: ({ s, since, own }) => {
    const alight = clamp01((since + 0.1) / 0.1);
    return { x: 0.022 * alight * Math.sin(s * 37 + own), y: 0.016 * alight * Math.sin(s * 43 + own), z: 0 };
  },
  sleep: ({ s, since }) => {
    const under = clamp01((since + 0.3) / 0.4);
    return {
      x: 0.03 * under * Math.sin((s / 4.4) * Math.PI * 2),
      y: 0,
      z: -0.06 * under * (0.5 - 0.5 * Math.cos((s / 2.2) * Math.PI * 2)),
    };
  },
  petrify: ({ s, since, duration, own }) => {
    if (since >= 0) return STILL;
    const strains = clamp01(-since / Math.max(0.1, duration * 0.5));
    return { x: 0.03 * strains * Math.sin(s * 71 + own), y: 0.02 * strains * Math.sin(s * 59 + own), z: 0 };
  },
  confuse: ({ s, since }) => {
    const reels = clamp01(since / 0.3);
    return { x: 0.07 * reels * Math.sin(s * 2.4), y: 0.035 * reels * Math.sin(s * 4.8), z: 0 };
  },
  charm: (moment) => ({ x: 0, y: 0, z: 0.05 * thumpOf(moment) }),
  fear: ({ s, since, pulse, own }) => {
    const afraid = clamp01((since + 0.2) / 0.3);
    return {
      x: 0.024 * afraid * Math.sin(s * 97 + own),
      y: 0.018 * afraid * Math.sin(s * 113 + own * 2),
      z: -0.03 * afraid - 0.03 * pulse,
    };
  },
  blind: ({ s, since }) => {
    if (since < 0) return STILL;
    return { x: 0.022 * Math.sin(s * 2.2), y: 0.012 * Math.sin(s * 3.1), z: -0.05 * Math.exp(-since * 8) };
  },
  silence: ({ since }) => {
    if (since < 0) return STILL;
    const struck = Math.exp(-since * 10);
    return { x: 0.03 * struck * Math.sin(since * 70), y: 0, z: -0.04 * struck };
  },
  slow: ({ pulse }) => ({ x: 0, y: 0, z: -0.06 * pulse }),
  bind: ({ s, since, pulse, own }) => {
    if (since < 0) return STILL;
    const strains = 1 - pulse;
    return {
      x: 0.02 * strains * Math.sin(s * 19 + own),
      y: 0.012 * strains * Math.sin(s * 23 + own),
      z: -0.025 * pulse,
    };
  },
  shock: ({ s, phase, every, own }) => {
    const jolting = phase * every < 0.09;
    return jolting ? { x: 0.03 * Math.sin(s * 190 + own), y: 0, z: 0.045 } : STILL;
  },
  curse: ({ since }) => {
    if (since < 0) return STILL;
    const shudder = Math.exp(-since * 6);
    return { x: 0.03 * shudder * Math.sin(since * 60), y: 0, z: -0.02 * shudder };
  },
};

/**
 * Adds how a curse on its own, or the state drawn in its place, moves each piece it is on at a
 * moment of the effect's own clock: each from the moment its own playback starts until it ends,
 * coming on with the look and let go as it fades.
 */
export function addAilmentJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  add: (identifier: string, jolt: { x: number; y: number; z: number }) => void
): void {
  const look = curseLookOf(preset);
  const duration = preset.duration / 1000;
  const holdAt = takesHoldAt(look, duration);
  const every = AILMENT_BEAT_S[look];
  cast.targets.forEach((target, index) => {
    const s = (elapsedMs - preset.stagger * index) / 1000;
    if (s <= 0 || s >= duration) return;
    const since = s - holdAt;
    const beats = since >= 0 ? since / every : 0;
    const phase = look === 'shock' && since < 0 ? (s % every) / every : beats - Math.floor(beats);
    const borne = BORNE_AS[look]({
      s,
      duration,
      since,
      phase,
      pulse: since >= 0 ? Math.exp(-phase * 5) : 0,
      every,
      own: index * 2.1,
    });
    const held = Math.min(1, s / 0.12, (duration - s) / LETS_GO_S) * cellPx;
    add(target.identifier, { x: borne.x * held, y: borne.y * held, z: borne.z * held });
  });
}

/** When, on an effect's own clock, a curse on its own has let go of the last piece it is on. */
export function ailmentJoltsEndOf(preset: EffectPreset, cast: EffectCast): number {
  return preset.duration + preset.stagger * Math.max(0, cast.targets.length - 1);
}
