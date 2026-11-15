import { GRACE_RISES_AT, GRACE_SETS_DOWN_AT, liftsAsGrace } from '@axe/domain/effect/blessing-looks';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { breaksOutAsAura } from '@axe/domain/effect/effect-shake';

/*
 * How the pieces bear a blessing, drawn off where they stand for as long as it holds them. Those a
 * grace is laid on are lifted off the floor as its dome is raised, hang there, and are set down as
 * it opens. The one the greatest aura is on trembles as its power gathers, is borne up off the floor
 * as it breaks out, and comes down as it is drawn in. The pieces themselves stay where they are.
 */

/** How far a grace lifts a piece, and how far it bobs there, as shares of a cell. */
const GRACE_LIFTS = 0.2;
const GRACE_BOBS = 0.025;
/** How long a grace takes to lift a piece and to set it down, in milliseconds. */
const GRACE_LIFTS_MS = 520;
const GRACE_SETS_DOWN_MS = 700;
/** How far the one the greatest aura is on trembles as it gathers, and how far it is borne up, as shares of a cell. */
const AURA_TREMBLES = 0.02;
const AURA_BORNE_UP = 0.13;
/** How long it takes to be borne up, and how long before the end of the playback it starts down, in milliseconds. */
const AURA_UP_MS = 160;
const AURA_DOWN_BEFORE_END_MS = 500;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/** When a blessing on its own lets go of the pieces, on the effect's clock, in milliseconds; nothing for any other effect. */
export function blessingLetsGoAt(preset: EffectPreset): number {
  if (liftsAsGrace(preset)) return preset.duration * GRACE_SETS_DOWN_AT + GRACE_SETS_DOWN_MS;
  return breaksOutAsAura(preset) ? preset.duration : 0;
}

/**
 * Adds how a blessing on its own moves the pieces at a moment of its own clock: see the header. Any
 * other effect adds nothing. Those under a grace all rise on the one clock, as its dome does.
 */
export function addBlessingJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  breaksOutMs: number | undefined,
  add: Add
): void {
  const seconds = elapsedMs / 1000;
  if (liftsAsGrace(preset)) {
    const rises = preset.duration * GRACE_RISES_AT;
    const setsDown = preset.duration * GRACE_SETS_DOWN_AT;
    if (elapsedMs <= rises || elapsedMs >= setsDown + GRACE_SETS_DOWN_MS) return;
    const up = eased(Math.min(1, (elapsedMs - rises) / GRACE_LIFTS_MS));
    const down = eased(Math.min(1, Math.max(0, (elapsedMs - setsDown) / GRACE_SETS_DOWN_MS)));
    const held = up * (1 - down);
    cast.targets.forEach((target, index) => {
      add(target.identifier, {
        x: 0,
        y: 0,
        z: (GRACE_LIFTS + GRACE_BOBS * Math.sin(seconds * 3.3 + index * 1.9)) * held * cellPx,
      });
    });
    return;
  }
  if (!breaksOutAsAura(preset) || breaksOutMs === undefined) return;
  if (elapsedMs <= 0 || elapsedMs >= preset.duration) return;
  const startsDown = Math.max(breaksOutMs + AURA_UP_MS, preset.duration - AURA_DOWN_BEFORE_END_MS);
  cast.targets.forEach((target, index) => {
    if (elapsedMs < breaksOutMs) {
      const far = AURA_TREMBLES * (elapsedMs / breaksOutMs) * cellPx;
      add(target.identifier, {
        x: far * Math.sin(seconds * 131 + index * 2.1),
        y: far * 0.6 * Math.sin(seconds * 157 + index * 4.3),
        z: 0,
      });
      return;
    }
    const up = eased(Math.min(1, (elapsedMs - breaksOutMs) / AURA_UP_MS));
    const down = eased(Math.min(1, Math.max(0, (elapsedMs - startsDown) / (preset.duration - startsDown))));
    add(target.identifier, {
      x: 0,
      y: 0,
      z: (AURA_BORNE_UP + 0.015 * Math.sin(seconds * 9 + index)) * up * (1 - down) * cellPx,
    });
  });
}

/** A share eased in and out. */
function eased(share: number): number {
  return share * share * (3 - 2 * share);
}
