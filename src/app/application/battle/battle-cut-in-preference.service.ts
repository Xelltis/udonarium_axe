import { Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import {
  type BattleStageSize,
  type BattleStageWindow,
  nextBattleStageSize,
  readBattleStageWindow,
} from '@axe/domain/battle/battle-stage-window';

/**
 * Whether this screen shows the battle stage when an exchange is played.
 *
 * Each person decides for their own screen and the choice stays in their browser. It starts on,
 * since the stage is something the room plays for everybody; turning it off plays the blow on the
 * table instead.
 */
@Injectable({ providedIn: 'root' })
export class BattleCutInPreferenceService {
  private readonly _shown = signal(readLocal(STORAGE_KEYS.battleCutIn) !== 'off');
  readonly shown = this._shown.asReadonly();
  private readonly _stageWindow = signal<BattleStageWindow>(
    readBattleStageWindow(readLocal(STORAGE_KEYS.battleCutInWindow))
  );
  /** How large this screen draws the stage, and where it keeps the window when it is one. */
  readonly stageWindow = this._stageWindow.asReadonly();

  /** Shows or hides the battle stage on this screen, and remembers it in this browser. */
  setShown(shown: boolean): void {
    this._shown.set(shown);
    writeLocal(STORAGE_KEYS.battleCutIn, shown ? 'on' : 'off');
  }

  /** Flips whether this screen shows the battle stage, and remembers it. */
  toggle(): void {
    this.setShown(!this._shown());
  }

  /** Draws the stage at this size from now on, and remembers it in this browser. */
  setStageSize(size: BattleStageSize): void {
    this.keepStageWindow({ ...this._stageWindow(), size });
  }

  /** Moves the stage on to its next size, from the full screen down to the smallest window and round. */
  cycleStageSize(): void {
    this.setStageSize(nextBattleStageSize(this._stageWindow().size));
  }

  /** Keeps the window where it was dragged to, as shares of the room the screen leaves around it. */
  placeStageWindow(x: number, y: number): void {
    this.keepStageWindow({ ...this._stageWindow(), x, y });
  }

  private keepStageWindow(window: BattleStageWindow): void {
    this._stageWindow.set(window);
    writeLocal(STORAGE_KEYS.battleCutInWindow, JSON.stringify(window));
  }
}
