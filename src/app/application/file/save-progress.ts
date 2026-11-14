import { signal } from '@angular/core';
import { delay } from '@axe/core/util/delay';

/** How long the finished progress stays on the save button after a save, in milliseconds. */
export const SAVE_PROGRESS_LINGER_MS = 500;

/**
 * The progress a panel's save button shows: whether a save is running and how far it has come.
 *
 * The button stays busy until shortly after the save finishes, so a quick save is still seen.
 */
export class SaveProgress {
  /** Whether a save is running or has only just finished. */
  readonly isSaving = signal(false);
  /** How far the running save has come, from 0 to 100. */
  readonly percent = signal(0);

  /**
   * Runs a save, feeding it the callback its progress is reported through. Does nothing while
   * another save is running; resolves as the save finishes, before the button is given back.
   */
  async run(save: (onProgress: (percent: number) => void) => Promise<void>): Promise<void> {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.percent.set(0);
    await save((percent) => this.percent.set(percent));
    void delay(SAVE_PROGRESS_LINGER_MS).then(() => {
      this.isSaving.set(false);
      this.percent.set(0);
    });
  }
}
