import type { EffectBlow } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { crushLetsGoAt, gravityLookOf, movesAsSpace, spaceBeatAt, warpLookOf } from '@axe/domain/effect/space-looks';

/*
 * How the pieces bear a look of space and time, drawn off where they stand. One that blinks shivers as
 * space folds on it, is drawn up off the floor as the seam snaps shut on it and drops back where it
 * stood. One called by a summoning is borne up in the light of its circle as it arrives and set down
 * again. One crushed is drawn up a little towards the lens, then pressed down hard as it comes down
 * and held there trembling, and springs back as it lets go. One a singularity takes in is dragged in
 * towards it, trembling harder and harder, the one under it lifted towards it, until it falls in on
 * itself: then each is thrown out away from it and the one under it slammed down. The pieces
 * themselves stay where they are.
 */

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/** How far a piece is drawn up as a blink snaps shut on it, and how far it shivers as space folds, as shares of a cell. */
const BLINK_DRAWN_UP = 0.2;
const BLINK_SHIVERS = 0.018;
/** How long a blinked piece takes to drop back and stand still, in milliseconds. */
const BLINK_DROPS_MS = 360;
/** How far a summoned piece is borne up as it arrives, as a share of a cell, and how long it takes to rise, stay and come down, in milliseconds. */
const SUMMON_BORNE_UP = 0.22;
const SUMMON_RISES_MS = 260;
const SUMMON_STAYS_MS = 420;
const SUMMON_SETS_DOWN_MS = 480;
/** How far a crushed piece is drawn up before it is pressed down, and how far it is pressed, as shares of a cell, by grade. */
const CRUSH_DRAWN_UP = 0.035;
const CRUSH_PRESSED: Record<1 | 2 | 3, number> = { 1: 0.09, 2: 0.13, 3: 0.16 };
/** How far a crushed piece trembles each way while it is held down, as a share of a cell. */
const CRUSH_TREMBLES = 0.016;
/** How long a crushed piece takes to be pressed down, and to spring back once it is let go, in milliseconds. */
const CRUSH_PRESSED_IN_MS = 55;
const CRUSH_SPRINGS_BACK_MS = 380;
/** How far a piece a singularity takes in is dragged towards it, and the one under it lifted, as shares of a cell. */
const DRAGGED_IN = 0.2;
const LIFTED_UNDER = 0.16;
/** How far each piece trembles at the last before a singularity falls in, as a share of a cell. */
const TREMBLES_AT_LAST = 0.03;
/** How far a piece is thrown out as a singularity falls in, and the one under it slammed down, as shares of a cell. */
const THROWN_OUT = 0.3;
const SLAMMED_DOWN = 0.14;
/** How long a piece thrown out by a singularity takes to be furthest out, and to stand again, in milliseconds. */
const THROWN_FURTHEST_MS = 70;
const THROWN_FOR_MS = 620;
/** When a singularity starts to drag at what it takes in, as a share of the time before it falls in. */
const DRAGS_FROM = 0.2;

function wayOf(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const far = Math.hypot(dx, dy);
  return far < 1 ? null : { x: dx / far, y: dy / far };
}

/** How far a struck piece is thrown some time after it is struck, as a share of the throw: out fast, then back slower. */
function throwAt(sinceMs: number, furthestMs: number, forMs: number): number {
  if (sinceMs <= 0 || sinceMs >= forMs) return 0;
  const share = sinceMs / furthestMs;
  return share * Math.exp(1 - share) * (1 - sinceMs / forMs);
}

/** How a blinked piece is moved some time into its own playback, in shares of a cell: see the header. */
function blinkAt(local: number, beat: number, index: number): { x: number; y: number; z: number } {
  const folds = Math.max(0, Math.min(1, (local - beat * 0.35) / (beat * 0.65)));
  const since = local - beat;
  const shiver = since < 0 ? BLINK_SHIVERS * folds * folds : 0;
  const s = local / 1000;
  const up =
    since < 0
      ? BLINK_DRAWN_UP * 0.3 * folds * folds
      : since < 50
        ? BLINK_DRAWN_UP * (0.3 + 0.7 * (since / 50))
        : BLINK_DRAWN_UP * Math.max(0, 1 - (since - 50) / (BLINK_DROPS_MS - 50)) ** 2 -
          0.03 * Math.sin(Math.PI * Math.min(1, Math.max(0, (since - 200) / 160)));
  return {
    x: shiver * Math.sin(s * 131 + index * 2.1),
    y: shiver * Math.sin(s * 157 + index * 4.3),
    z: up,
  };
}

/** How far a summoned piece is borne up some time into its own playback, as a share of a cell. */
function summonAt(local: number, beat: number): number {
  const since = local - beat + SUMMON_RISES_MS * 0.6;
  if (since <= 0) return 0;
  if (since < SUMMON_RISES_MS) return SUMMON_BORNE_UP * Math.sin(((since / SUMMON_RISES_MS) * Math.PI) / 2);
  const stays = since - SUMMON_RISES_MS;
  if (stays < SUMMON_STAYS_MS) return SUMMON_BORNE_UP * (1 + 0.08 * Math.sin(stays * 0.012));
  const down = (stays - SUMMON_STAYS_MS) / SUMMON_SETS_DOWN_MS;
  return down >= 1 ? 0 : SUMMON_BORNE_UP * (1 - down * down * (3 - 2 * down));
}

/** When a look of space and time on its own lets go of the pieces, on the first target's clock, in milliseconds. */
function letsGoOf(preset: EffectPreset, blows: readonly EffectBlow[]): number {
  const durationS = preset.duration / 1000;
  if (preset.effectKind === 'warp') {
    const look = warpLookOf(preset);
    const beat = spaceBeatAt(look, durationS) * 1000;
    return look === 'blink'
      ? beat + BLINK_DROPS_MS
      : beat + SUMMON_RISES_MS * 0.4 + SUMMON_STAYS_MS + SUMMON_SETS_DOWN_MS;
  }
  if (gravityLookOf(preset) === 'crush') return crushLetsGoAt(durationS) * 1000 + CRUSH_SPRINGS_BACK_MS;
  return (blows[0]?.atMs ?? spaceBeatAt('singularity', durationS) * 1000) + THROWN_FOR_MS;
}

/** When a look of space and time on its own has let go of the last piece it moves, on its own clock, in milliseconds. */
export function spaceJoltsEndOf(preset: EffectPreset, cast: EffectCast, blows: readonly EffectBlow[]): number {
  return letsGoOf(preset, blows) + preset.stagger * Math.max(0, cast.targets.length - 1);
}

/**
 * Adds how a look of space and time on its own moves the pieces it is cast on at a moment of its own
 * clock: see the header. Any other effect adds nothing.
 */
export function addSpaceJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  blows: readonly EffectBlow[],
  add: Add
): void {
  if (!movesAsSpace(preset)) return;
  const durationS = preset.duration / 1000;
  const centre = cast.targets[0];
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    if (local <= 0) return;
    const s = local / 1000;
    if (preset.effectKind === 'warp') {
      if (warpLookOf(preset) === 'summon') {
        const up = summonAt(local, spaceBeatAt('summon', durationS) * 1000);
        if (up > 0) add(target.identifier, { x: 0, y: 0, z: up * cellPx });
        return;
      }
      const moved = blinkAt(local, spaceBeatAt('blink', durationS) * 1000, index);
      add(target.identifier, { x: moved.x * cellPx, y: moved.y * cellPx, z: moved.z * cellPx });
      return;
    }
    const strikes = blows[0]?.atMs ?? spaceBeatAt(gravityLookOf(preset), durationS) * 1000;
    if (gravityLookOf(preset) === 'crush') {
      const letsGo = crushLetsGoAt(durationS) * 1000;
      if (local < strikes) {
        const drawn = Math.max(0, (local - strikes * 0.4) / (strikes * 0.6));
        add(target.identifier, {
          x: CRUSH_TREMBLES * 0.5 * drawn * Math.sin(s * 133 + index) * cellPx,
          y: 0,
          z: CRUSH_DRAWN_UP * drawn * drawn * cellPx,
        });
        return;
      }
      const pressed = Math.min(1, (local - strikes) / CRUSH_PRESSED_IN_MS);
      const freed = Math.max(0, (local - letsGo) / CRUSH_SPRINGS_BACK_MS);
      if (freed >= 1) return;
      const held = pressed * (1 - freed);
      const spring = freed > 0 ? 0.25 * Math.sin(Math.PI * freed) : 0;
      add(target.identifier, {
        x: CRUSH_TREMBLES * held * Math.sin(s * 119 + index * 2.1) * cellPx,
        y: CRUSH_TREMBLES * held * Math.sin(s * 143 + index * 4.3) * cellPx,
        z: (-CRUSH_PRESSED[preset.gradeLevel] * held * (1 - freed * freed) + spring * CRUSH_DRAWN_UP * 3) * cellPx,
      });
      return;
    }
    const towards = centre && index > 0 ? wayOf(target, centre) : null;
    if (local < strikes) {
      const dragged = Math.max(0, Math.min(1, (local - strikes * DRAGS_FROM) / (strikes * (1 - DRAGS_FROM))));
      const tug = dragged * dragged;
      const tremble = TREMBLES_AT_LAST * tug;
      const shaken = { x: tremble * Math.sin(s * 121 + index * 2.1), y: tremble * Math.sin(s * 147 + index * 4.3) };
      add(target.identifier, {
        x: (shaken.x + (towards?.x ?? 0) * DRAGGED_IN * tug) * cellPx,
        y: (shaken.y + (towards?.y ?? 0) * DRAGGED_IN * tug) * cellPx,
        z: (towards ? 0 : LIFTED_UNDER * tug * (0.85 + 0.15 * Math.sin(s * 9))) * cellPx,
      });
      return;
    }
    const thrown = throwAt(local - strikes, THROWN_FURTHEST_MS, THROWN_FOR_MS);
    if (thrown <= 0) return;
    add(
      target.identifier,
      towards
        ? { x: -towards.x * THROWN_OUT * thrown * cellPx, y: -towards.y * THROWN_OUT * thrown * cellPx, z: 0 }
        : { x: 0, y: 0, z: -SLAMMED_DOWN * thrown * cellPx }
    );
  });
}
