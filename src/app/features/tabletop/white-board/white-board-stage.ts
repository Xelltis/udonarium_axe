import { signal } from '@angular/core';
import {
  BOARD_ZOOMS,
  clampZoom,
  fitZoom,
  RULER_WIDTH,
  RulerTick,
  rulerTicks,
  scrollCentredOn,
  scrollKeepingPoint,
  ZOOM_STEP,
} from '@axe/features/tabletop/white-board/white-board-rulers';
import { BoardPoint, MarkBox } from '@axe/features/tabletop/white-board/white-board-scene';

/** The least a zoom has to differ from the one in use to count as a change. */
const ZOOM_CHANGE = 0.0001;

/** Where a pointer is on the page. */
interface PagePoint {
  readonly clientX: number;
  readonly clientY: number;
}

/** What the stage asks of the editor whose sheet it shows. */
export interface BoardStageHost {
  /** The element the sheet scrolls in, or null before it is drawn. */
  element(): HTMLElement | null;
  /** How wide the sheet is, in board pixels. */
  sheetWidth(): number;
  /** How tall the sheet is, in board pixels. */
  sheetHeight(): number;
  /** Calls back once the sheet has been drawn at the size just set. */
  afterDraw(then: () => void): void;
}

/**
 * How the board editor shows its sheet: how big, scrolled to where, under which rulers, and
 * whether it is being slid about rather than marked.
 */
export class BoardStage {
  readonly zooms = BOARD_ZOOMS;
  readonly rulerWidth = RULER_WIDTH;

  /**
   * How big the sheet is shown, against its own size.
   *
   * Squeezed into the width of the panel a sheet loses its ruling: a hairline drawn a pixel
   * wide and then shrunk by half is a pixel of nothing. Shown at its own size it is legible,
   * and the panel scrolls, which is what the map editor does and what a board must not do
   * worse than.
   */
  readonly zoom = signal(1);
  readonly showRulers = signal(true);
  /** Whether a press on the sheet slides it rather than marks it: the hand, or the space bar held. */
  readonly panning = signal(false);
  /** Whether the sheet is being slid this instant, which is what changes the hand's shape. */
  readonly sliding = signal(false);

  private slidFrom: { x: number; y: number } | null = null;

  constructor(private readonly host: BoardStageHost) {}

  /** The zoom as a whole percentage. */
  zoomPercent(): number {
    return Math.round(this.zoom() * 100);
  }

  /** Shows the sheet one step bigger, about the middle of the stage. */
  zoomIn(): void {
    this.zoomAbout(this.zoom() * ZOOM_STEP, null);
  }

  /** Shows the sheet one step smaller, about the middle of the stage. */
  zoomOut(): void {
    this.zoomAbout(this.zoom() / ZOOM_STEP, null);
  }

  /** Shows the sheet at the size given, held within the sizes allowed. */
  zoomTo(value: number | string): void {
    this.zoomAbout(Number(value), null);
  }

  /** Big enough to fill the panel and no bigger, which is what anyone means by fit. */
  zoomToFit(): void {
    const stage = this.host.element();
    if (!stage) return;
    this.zoomAbout(fitZoom(stage, this.host.sheetWidth(), this.host.sheetHeight()), null);
  }

  /** Fills the panel with one part of the sheet, brought to the middle. */
  zoomOnto(box: MarkBox): void {
    const stage = this.host.element();
    if (!stage) return;
    this.zoomAbout(fitZoom(stage, Math.max(1, box.w), Math.max(1, box.h)), null, {
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
    });
  }

  /** Zooms about the pointer while Ctrl or the command key is held; any other turn of the wheel scrolls. */
  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const by = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.zoomAbout(this.zoom() * by, { x: event.clientX, y: event.clientY });
  }

  /** The numbers written along a ruler, spaced so they stay apart at whatever size the sheet is. */
  ticks(axis: 'x' | 'y'): RulerTick[] {
    return rulerTicks(axis === 'x' ? this.host.sheetWidth() : this.host.sheetHeight(), this.zoom());
  }

  /** Takes hold of the sheet to slide it, from where the pointer is. */
  startSlide(at: PagePoint): void {
    this.slidFrom = { x: at.clientX, y: at.clientY };
    this.sliding.set(true);
  }

  /** Slides the sheet with the pointer while it is held; false when it is not held. */
  slide(at: PagePoint): boolean {
    if (!this.slidFrom) return false;
    const stage = this.host.element();
    if (stage) {
      stage.scrollLeft -= at.clientX - this.slidFrom.x;
      stage.scrollTop -= at.clientY - this.slidFrom.y;
    }
    this.slidFrom = { x: at.clientX, y: at.clientY };
    return true;
  }

  /** Lets go of the sheet; false when it was not held. */
  endSlide(): boolean {
    if (!this.slidFrom) return false;
    this.slidFrom = null;
    this.sliding.set(false);
    return true;
  }

  /**
   * Changes the size, keeping the point under the pointer under the pointer, or bringing a point
   * of the board to the middle of the stage when one is given.
   *
   * Zooming about the corner of the sheet walks whatever is being worked on off the screen,
   * so what is under the cursor is what stays put, the way it does in anything else. The stage
   * is scrolled once the sheet has been drawn at its new size, since a scroll written before
   * that is held to the old extent.
   */
  private zoomAbout(next: number, at: { x: number; y: number } | null, centre: BoardPoint | null = null): void {
    const stage = this.host.element();
    const was = this.zoom();
    const now = clampZoom(next);
    const changes = Math.abs(now - was) >= ZOOM_CHANGE;
    if (!stage) {
      if (changes) this.zoom.set(now);
      return;
    }
    if (!changes && !centre) return;
    const scroll = centre
      ? scrollCentredOn(stage, centre, now)
      : scrollKeepingPoint(stage, stage.getBoundingClientRect(), at, was, now);

    if (changes) this.zoom.set(now);
    this.host.afterDraw(() => {
      stage.scrollLeft = scroll.scrollLeft;
      stage.scrollTop = scroll.scrollTop;
    });
  }
}
