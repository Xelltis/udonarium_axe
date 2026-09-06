import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import {
  dotsPerInch,
  isPxPerMm,
  nudgePxPerMm,
  pxPerMmFromCardRun,
  realSizeZoom,
} from '@axe/domain/tabletop/physical-scale';

/**
 * What this particular screen measures, and whether it is being used as a tabletop right now.
 *
 * None of it is written down. The measurement describes the glass in front of this browser, and
 * nothing identifies a screen well enough to know it is the same one next time - carrying it to
 * an external display would make it a lie. Real size and the lock are states rather than
 * settings, and a state that outlives the session comes back in a room where it makes no sense.
 * How wide a square is meant to be belongs to the map, so the table carries that instead.
 */
@Injectable({ providedIn: 'root' })
export class DisplayCalibrationService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewLock = inject(ViewLockService);

  private readonly _pxPerMm = signal<number | null>(null);
  private readonly _realSize = signal<boolean>(false);

  /** Pixels per millimetre, or null while the screen has never been measured. */
  readonly pxPerMm = this._pxPerMm.asReadonly();
  readonly realSizeEnabled = this._realSize.asReadonly();
  readonly isCalibrated = computed<boolean>(() => this.pxPerMm() !== null);

  /** Shown back after a measurement, since panels are described by dpi rather than by px/mm. */
  readonly dpi = computed<number | null>(() => {
    const pxPerMm = this.pxPerMm();
    return pxPerMm === null ? null : Math.round(dotsPerInch(pxPerMm));
  });

  /** What the browser was scaling by when the card was measured. */
  private readonly measuredAtScale = signal<number | null>(null);
  private readonly screenScale = signal<number>(readScreenScale());

  /**
   * Whether the screen has changed under a measurement that was taken on it.
   *
   * Moving a window to another monitor or pinching the page out changes what a pixel is worth,
   * and correcting for it silently would hide a measurement that is simply no longer true.
   */
  readonly needsRecalibration = computed<boolean>(() => {
    const measured = this.measuredAtScale();
    if (measured === null) return false;
    return Math.abs(measured - this.screenScale()) > 0.001;
  });

  constructor() {
    this.watchPixelRatio();
  }

  /** Called when the window is resized, so the warning above can appear. */
  refreshScreenScale(): void {
    this.screenScale.set(readScreenScale());
  }

  /**
   * Watching for the moment a pixel stops being the size it was measured at.
   *
   * A resize is not enough on its own. Moving a window from a laptop's own screen to the display
   * lying on the table changes the pixel ratio while the window keeps its size in CSS pixels, so
   * no resize is reported and the measurement would quietly go on being wrong. A media query on
   * the current ratio catches it; since the query names one ratio, it is laid again after each
   * change to watch for the next.
   */
  private watchPixelRatio(): void {
    const query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    if (!query) return;

    const listener = () => {
      query.removeEventListener('change', listener);
      this.refreshScreenScale();
      this.watchPixelRatio();
    };
    query.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
  }

  /** The zoom at which one square measures the width the table asks for. */
  zoomFor(cellMm: number, gridSize: number): number | null {
    const pxPerMm = this.pxPerMm();
    return pxPerMm === null ? null : realSizeZoom(cellMm, pxPerMm, gridSize);
  }

  /** The frame was matched against a run of cards laid edge to edge. */
  calibrateFromCardRun(framePx: number, cards: number): void {
    this.measure(pxPerMmFromCardRun(framePx, cards));
  }

  /** The last of the accuracy, settled by eye against a base sitting on a square. */
  nudge(steps: number): void {
    const pxPerMm = this.pxPerMm();
    if (pxPerMm === null) return;
    this.measure(nudgePxPerMm(pxPerMm, steps));
  }

  /**
   * Real size takes the lock with it.
   *
   * Nothing holds the view at real size on its own: the gestures stop at life size, so the first
   * touch on the board would pull the scale back. Every way in - the settings panel, the
   * calibration modal, the table menu - passes through here, so the rule is settled in one place.
   */
  setRealSizeEnabled(realSize: boolean): void {
    this._realSize.set(realSize);
    if (realSize) this.viewLock.set(true);
  }

  /** Back to a screen that has never been measured, and a board that is nobody's tabletop. */
  reset(): void {
    this._pxPerMm.set(null);
    this._realSize.set(false);
    this.measuredAtScale.set(null);
    this.viewLock.set(false);
  }

  /** A measurement is only ever taken on the screen in front of us, so it is stamped now. */
  private measure(pxPerMm: number): void {
    if (!isPxPerMm(pxPerMm)) return;
    const scale = readScreenScale();
    this._pxPerMm.set(pxPerMm);
    this.measuredAtScale.set(scale);
    this.screenScale.set(scale);
  }
}

/** How much the browser is scaling the page by, on top of whatever the panel does. */
function readScreenScale(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const pageZoom = window.visualViewport?.scale;
  return dpr * (Number.isFinite(pageZoom) ? (pageZoom as number) : 1);
}
