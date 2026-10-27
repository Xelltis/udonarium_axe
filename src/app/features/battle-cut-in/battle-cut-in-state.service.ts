import { computed, Injectable, signal } from '@angular/core';
import { BattleScene } from '@axe/domain/battle/battle-scene';

/** One scene on the stage, numbered so that the same scene played twice starts over. */
export interface BattlePlaying {
  scene: BattleScene;
  serial: number;
}

/** As many scenes as wait their turn behind the one playing; any more are dropped. */
const MAX_WAITING = 4;
/** As many scenes as are remembered for having played, so one heard twice plays once. */
const MAX_REMEMBERED = 32;

/**
 * The scenes this screen plays on the battle stage, one after another.
 *
 * Two exchanges in quick succession are both seen rather than the second cutting the first off,
 * up to a few waiting; skipping one moves on to the next.
 */
@Injectable({ providedIn: 'root' })
export class BattleCutInStateService {
  private readonly _current = signal<BattlePlaying | null>(null);
  readonly current = this._current.asReadonly();
  readonly active = computed(() => this._current() !== null);

  private readonly waiting: BattleScene[] = [];
  private readonly played: string[] = [];
  private serial = 0;

  /** Puts a scene on the stage, or behind the one playing. A scene already played is passed over. */
  show(scene: BattleScene): void {
    if (scene.key.length > 0) {
      if (this.played.includes(scene.key)) return;
      this.played.push(scene.key);
      if (this.played.length > MAX_REMEMBERED) this.played.shift();
    }
    if (this._current()) {
      if (this.waiting.length < MAX_WAITING) this.waiting.push(scene);
      return;
    }
    this._current.set({ scene, serial: ++this.serial });
  }

  /** Ends the scene playing, finished or skipped, and puts the next one on. */
  next(): void {
    const scene = this.waiting.shift();
    this._current.set(scene ? { scene, serial: ++this.serial } : null);
  }

  /** Takes everything off the stage, the scenes waiting included. */
  clear(): void {
    this.waiting.length = 0;
    this._current.set(null);
  }
}
