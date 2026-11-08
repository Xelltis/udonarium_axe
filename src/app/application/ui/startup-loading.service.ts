import { inject, Injectable, InjectionToken } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { dismissLoadingScreen, showLoadingStage } from '@axe/infrastructure/ui/loading-screen';

/** The stages the start goes through after the page itself has loaded: the table, then what is on it. */
export type StartupStage = 'table' | 'pieces';

/** How far along the bar each stage stands, the page having loaded taking it to the first. */
const STAGE_SHARES: Record<StartupStage, number> = { table: 0.35, pieces: 0.7 };

/** How long the loading screen is kept at most, so a table that never settles is not hidden for ever. */
const LONGEST_MS = 20_000;

/** How often the pictures of pieces still being taken are looked at again, while the screen waits on them. */
const PICTURE_POLL_MS = 100;

/** Whether automation drives the browser, which is shown the page at once; see {@link StartupLoadingService.begin}. */
export const DRIVEN_BY_AUTOMATION = new InjectionToken<boolean>('DRIVEN_BY_AUTOMATION', {
  providedIn: 'root',
  factory: () => typeof navigator !== 'undefined' && navigator.webdriver === true,
});

/**
 * Keeps the loading screen the page opens with up until the table is drawn: its bar moved on as the
 * app reaches each stage, and the screen taken away once the table has drawn what it was told, the
 * pictures of its pieces are taken and the work held for the start is done, or after
 * {@link LONGEST_MS} whatever is left.
 */
@Injectable({ providedIn: 'root' })
export class StartupLoadingService {
  private readonly t = inject(TRANSLATE_FN);
  private readonly pictures = inject(PiecePicturesService);
  private readonly automated = inject(DRIVEN_BY_AUTOMATION);
  private readonly held = new Set<Promise<unknown>>();
  private reached = 0;
  private done = false;
  private giveUp: ReturnType<typeof setTimeout> | null = null;

  /** Whether the loading screen has been taken away. */
  get finished(): boolean {
    return this.done;
  }

  /**
   * Starts counting the longest the screen is kept, once the app is up; the table is the next stage.
   * A browser driven by automation is shown the page at once, as before the screen waited on the
   * table: what drives it reads the page for itself and takes pictures of it as it stands.
   */
  begin(): void {
    if (this.done || this.giveUp !== null) return;
    if (this.automated) {
      this.finish();
      return;
    }
    this.giveUp = setTimeout(() => this.finish(), LONGEST_MS);
    this.reach('table');
  }

  /** Moves the bar on to a stage and says what is being done, never back to an earlier one. */
  reach(stage: StartupStage): void {
    const share = STAGE_SHARES[stage];
    if (this.done || share <= this.reached) return;
    this.reached = share;
    showLoadingStage(share, this.t(`app.loading.${stage}`));
  }

  /** Keeps the screen up until a piece of work the start does is over, however it ends. */
  hold(work: Promise<unknown>): void {
    if (this.done) return;
    const kept = work.then(
      () => undefined,
      () => undefined
    );
    this.held.add(kept);
    void kept.then(() => this.held.delete(kept));
  }

  /**
   * Takes the screen away once the table has settled, as the promise given says, the work held is
   * over and no picture of a piece is still being taken; then once the table has settled again, as
   * the pictures that came are drawn.
   */
  async finishAfter(settled: () => Promise<void>): Promise<void> {
    if (this.done) return;
    await settled();
    await Promise.all([...this.held]);
    await this.picturesTaken();
    await settled();
    this.finish();
  }

  /** Takes the screen away now. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    if (this.giveUp !== null) clearTimeout(this.giveUp);
    this.giveUp = null;
    this.held.clear();
    dismissLoadingScreen();
  }

  private picturesTaken(): Promise<void> {
    return new Promise((resolve) => {
      const look = () => {
        if (this.done || this.pictures.taking() === 0) resolve();
        else setTimeout(look, PICTURE_POLL_MS);
      };
      look();
    });
  }
}
