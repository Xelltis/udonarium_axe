import { beamTimingOf, isGreatBeam, isLaser, laserTimingOf } from '@axe/domain/effect/beam-looks';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * How the pieces bear a beam, drawn off where they stand for as long as it is on them. The one who
 * fires a great beam leans back from its target as the beam gathers, is thrown back as it is let go
 * and stands braced against it, shaking, until it fails; every piece it is fired at is pressed back
 * along its line and shakes for as long as it pours. A piece a laser has hold of shakes where it
 * stands until the laser is cut off. The pieces themselves stay where they are.
 */

/** How far the one who fires leans back as a great beam gathers, how far it is thrown back as it fires, and how far it stands braced, as shares of a cell. */
const LEANS_BACK = 0.1;
const KICKED_BACK = 0.2;
const BRACED = 0.07;
/** How long the kick of the release takes to settle into the brace, and how long a piece takes to stand again once the beam fails, in milliseconds. */
const KICK_SETTLES_MS = 260;
const STANDS_AGAIN_MS = 380;
/** How far a piece a great beam pours over is pressed back, and how far it and the one who fires shake each way, as shares of a cell. */
const PRESSED_BACK = 0.13;
const SHAKES = 0.022;
/** How long a piece takes to be pressed back as far as it goes, in milliseconds. */
const PRESSED_IN_MS = 140;
/** How far a piece a laser has hold of shakes each way, as a share of a cell. */
const BURNT_SHAKES = 0.03;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/** The way across the table from one point to another, of length one, or null where there is none. */
function wayOf(from: { x: number; y: number } | null, to: { x: number; y: number }): { x: number; y: number } | null {
  if (!from) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const far = Math.hypot(dx, dy);
  return far < 1 ? null : { x: dx / far, y: dy / far };
}

/** When a beam on its own lets go of the pieces, on the first target's clock, in milliseconds; nothing for any other effect. */
export function beamLetsGoAt(preset: EffectPreset, firstBlowMs: number | undefined): number {
  const durationS = preset.duration / 1000;
  if (isGreatBeam(preset)) {
    return beamTimingOf(durationS, (firstBlowMs ?? 0) / 1000).failsAt * 1000 + STANDS_AGAIN_MS;
  }
  if (isLaser(preset)) return laserTimingOf(durationS, (firstBlowMs ?? 0) / 1000).cutAt * 1000 + STANDS_AGAIN_MS;
  return 0;
}

/**
 * Adds how a beam on its own moves the pieces at a moment of its own clock, over the blow it lands:
 * see the header. Any other effect adds nothing.
 */
export function addBeamJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  firstBlowMs: number | undefined,
  add: Add
): void {
  if (firstBlowMs === undefined) return;
  const durationS = preset.duration / 1000;
  const seconds = elapsedMs / 1000;
  if (isLaser(preset)) {
    const timing = laserTimingOf(durationS, firstBlowMs / 1000);
    cast.targets.forEach((target, index) => {
      const local = elapsedMs - preset.stagger * index;
      const held = heldAt(local, firstBlowMs, timing.breaksAt * 1000, 60);
      if (held <= 0) return;
      const far = BURNT_SHAKES * held * cellPx;
      add(target.identifier, {
        x: far * Math.sin((local / 1000) * 113 + index * 2.1),
        y: far * Math.sin((local / 1000) * 139 + index * 4.3),
        z: 0,
      });
    });
    return;
  }
  if (!isGreatBeam(preset)) return;
  const timing = beamTimingOf(durationS, firstBlowMs / 1000);
  const failsMs = timing.failsAt * 1000;
  const first = cast.targets[0];
  const towards = first ? wayOf(cast.origin, first) : null;
  if (towards) {
    const back = bracedAt(elapsedMs, firstBlowMs, failsMs);
    const shaken = elapsedMs > firstBlowMs && elapsedMs < failsMs ? SHAKES * 0.7 * Math.sin(seconds * 127) : 0;
    const along = -(back + shaken) * cellPx;
    if (along !== 0) add(cast.casterIdentifier, { x: towards.x * along, y: towards.y * along, z: 0 });
  }
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    const held = heldAt(local, firstBlowMs, failsMs, PRESSED_IN_MS);
    const away = wayOf(cast.origin, target);
    if (held <= 0 || !away) return;
    const s = local / 1000;
    const along = (PRESSED_BACK * (0.85 + 0.15 * Math.sin(s * 9)) + SHAKES * Math.sin(s * 119 + index * 2.1)) * held;
    const across = SHAKES * Math.sin(s * 143 + index * 4.3) * held;
    add(target.identifier, {
      x: (away.x * along - away.y * across) * cellPx,
      y: (away.y * along + away.x * across) * cellPx,
      z: 0,
    });
  });
}

/** How much a beam has hold of a piece at a moment, from 0 to 1: taking hold over `inMs` from `from`, and letting go after `until`. */
function heldAt(localMs: number, from: number, until: number, inMs: number): number {
  if (localMs <= from || localMs >= until + STANDS_AGAIN_MS) return 0;
  return Math.min(1, (localMs - from) / inMs) * (1 - Math.max(0, (localMs - until) / STANDS_AGAIN_MS));
}

/** How far back the one who fires a great beam is drawn at a moment, as a share of a cell: leaning, kicked, braced, and standing again. */
function bracedAt(elapsedMs: number, firesMs: number, failsMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= failsMs + STANDS_AGAIN_MS) return 0;
  if (elapsedMs < firesMs) return LEANS_BACK * Math.sin(((elapsedMs / firesMs) * Math.PI) / 2);
  if (elapsedMs >= failsMs) return BRACED * (1 - (elapsedMs - failsMs) / STANDS_AGAIN_MS);
  const settled = Math.min(1, (elapsedMs - firesMs) / KICK_SETTLES_MS);
  return KICKED_BACK + (BRACED - KICKED_BACK) * settled;
}
