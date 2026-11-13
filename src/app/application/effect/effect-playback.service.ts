import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { MotionService } from '@axe/application/ui/motion.service';
import { effectCast$ } from '@axe/core/event/domain-events';
import { VolumeType } from '@axe/core/storage/audio-output';
import { ObjectStore } from '@axe/core/sync/object-store';
import { debounce } from '@axe/core/util/debounce';
import { PERF_EFFECT_FRAME, perfCounters } from '@axe/core/util/perf-counters';
import { type EffectBlow, effectBlowsOf, heldEffectClock, wallClockOf } from '@axe/domain/effect/effect-blows';
import { EffectCast, normalizeEffectCast } from '@axe/domain/effect/effect-cast';
import { DefeatReaction, defeatReactionOf } from '@axe/domain/effect/effect-defeat';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectShake } from '@axe/domain/effect/effect-shake';
import { impactSoundTimes, isEffectFinished, launchSoundTimes } from '@axe/domain/effect/effect-sound-times';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/scene-kinds';
import { SoundEffect } from '@axe/domain/media/sound-effect';

export interface ActiveEffectCast {
  key: number;
  cast: EffectCast;
  preset: EffectPreset;
  startedAt: number;
  /** The blows it lands, which hold its own clock still as each lands. */
  blows: readonly EffectBlow[];
}

/**
 * How far through its own clock an effect being played is at a moment: with the wall clock from its
 * start, held still through the hold of each blow it lands.
 */
export function effectElapsedOf(active: ActiveEffectCast, now: number): number {
  return heldEffectClock(active.blows, now - active.startedAt);
}

const MAX_ACTIVE_CASTS = 12;
/** How long the shake lasts. Separate from the effect's own length, and kept short or the screen turns queasy. */
const SHAKE_MS = 340;

@Injectable({ providedIn: 'root' })
export class EffectPlaybackService {
  private readonly objectStore = inject(ObjectStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly motion = inject(MotionService);

  private readonly _activeCasts = signal<ActiveEffectCast[]>([]);
  readonly activeCasts = this._activeCasts.asReadonly();

  readonly now = signal(0);

  /**
   * What happens to the piece that fell, keyed by identifier.
   * An effect around it does not read as falling, so the piece is told as well.
   */
  readonly tokenReactions = computed<ReadonlyMap<string, DefeatReaction>>(() => {
    const reactions = new Map<string, DefeatReaction>();
    for (const active of this._activeCasts()) {
      const reaction = defeatReactionOf(active.preset.effectKind);
      if (reaction.length < 1) continue;
      for (const target of active.cast.targets) reactions.set(target.identifier, reaction);
    }
    return reactions;
  });

  /** How hard the screen shakes. Empty means not at all. */
  private readonly _shake = signal<EffectShake>('');
  readonly shake = this._shake.asReadonly();
  /**
   * Who is holding a standing effect. One is enough to keep the draw loop running.
   * Fields and ambience come and go separately, so a single flag would let the later one cancel the earlier.
   */
  private readonly _persistentSources = signal<ReadonlySet<string>>(new Set());
  private readonly settleShake = debounce(() => {
    this._shake.set('');
  }, SHAKE_MS);

  /**
   * Keeps the effect draw loop running on behalf of a named source, or lets that source go.
   *
   * Standing effects and table ambience each hold the loop under their own name, so one letting go
   * does not stop it for the other.
   */
  setPersistent(source: string, persistent: boolean): void {
    this._persistentSources.update((current) => {
      if (current.has(source) === persistent) return current;
      const next = new Set(current);
      if (persistent) next.add(source);
      else next.delete(source);
      return next;
    });
    if (persistent) this.startLoop();
  }

  private nextKey = 0;
  private frameHandle: number | null = null;
  private readonly impactTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    effectCast$.subscribe((event) => this.play(event.cast), this.destroyRef);
    this.destroyRef.onDestroy(() => {
      this.stopLoop();
      this.settleShake.cancel();
      for (const timer of this.impactTimers) clearTimeout(timer);
      this.impactTimers.clear();
    });
  }

  /**
   * Plays a cast on this screen, from the broadcast or from a local preview.
   *
   * A cast that cannot be read, or names no preset in the room, plays nothing and answers null. Its
   * sounds play even with motion turned off, but nothing is drawn and the answer is null. At most
   * 12 casts run at once; the oldest is dropped.
   */
  play(raw: unknown): ActiveEffectCast | null {
    const cast = normalizeEffectCast(raw);
    if (!cast) return null;

    const preset = this.objectStore.get<EffectPreset>(cast.presetIdentifier);
    if (!(preset instanceof EffectPreset)) return null;

    // Without motion nothing holds still, so the sounds keep to the effect's own clock.
    const blows = this.motion.enabled() ? effectBlowsOf(preset) : [];
    this.scheduleLaunchSound(preset, blows);
    this.scheduleImpactSound(preset, blows);
    if (!this.motion.enabled()) return null;

    this.startScreenShake(blows);

    const active: ActiveEffectCast = { key: ++this.nextKey, cast, preset, startedAt: clock(), blows };
    this._activeCasts.update((casts) => [...casts, active].slice(-MAX_ACTIVE_CASTS));
    this.now.set(active.startedAt);
    this.startLoop();
    return active;
  }

  /**
   * Shakes the screen as each blow that holds lands. Two in a row take the stronger and only extend
   * the time; restarting would read as a stall. Shaking anywhere but the moment of a blow makes the
   * one who fired look struck.
   */
  private startScreenShake(blows: readonly EffectBlow[]): void {
    for (const blow of blows) {
      if (blow.holdMs <= 0 || blow.shake.length < 1) continue;
      const shake = blow.shake;
      this.after(wallClockOf(blows, blow.atMs), () => this.shakeNow(shake));
    }
  }

  /** Does something after a while, at once for no while at all, and not at all once the service is gone. */
  private after(delayMs: number, then: () => void): void {
    if (delayMs <= 0) {
      then();
      return;
    }
    const timer = setTimeout(() => {
      this.impactTimers.delete(timer);
      then();
    }, delayMs);
    this.impactTimers.add(timer);
  }

  private shakeNow(shake: EffectShake): void {
    this._shake.update((current) => (current === 'hard' || shake === 'hard' ? 'hard' : shake || current));
    this.settleShake();
  }

  /** Every shot sounds. One sound for a burst would hide how many there were. */
  private scheduleLaunchSound(preset: EffectPreset, blows: readonly EffectBlow[]): void {
    for (const at of launchSoundTimes(preset)) {
      this.after(wallClockOf(blows, at), () => SoundEffect.playLocal(preset.soundIdentifier, VolumeType.EFFECT));
    }
  }

  /** The impact sounds when it lands; sounding at the shot would not read as a hit. */
  private scheduleImpactSound(preset: EffectPreset, blows: readonly EffectBlow[]): void {
    for (const at of impactSoundTimes(preset)) {
      this.after(wallClockOf(blows, at), () => SoundEffect.playLocal(preset.impactSoundIdentifier, VolumeType.EFFECT));
    }
  }

  private startLoop(): void {
    if (this.frameHandle !== null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    this.frameHandle = requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    this.frameHandle = null;
    const now = clock();
    perfCounters.bump(PERF_EFFECT_FRAME);
    this.now.set(now);

    const remaining = this._activeCasts().filter(
      (active) =>
        !isEffectFinished(active.preset, active.cast, effectElapsedOf(active, now) - sceneLingerMsOf(active.preset))
    );
    if (remaining.length !== this._activeCasts().length) this._activeCasts.set(remaining);
    if (remaining.length > 0 || this._persistentSources().size > 0) this.startLoop();
  }

  private stopLoop(): void {
    if (this.frameHandle === null) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }
}

function clock(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}
