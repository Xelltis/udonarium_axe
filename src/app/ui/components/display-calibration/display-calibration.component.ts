import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ModalService } from '@axe/application/ui/modal.service';
import {
  cardRunWidthMm,
  cellWidthInches,
  cellWidthPx,
  clampCellMm,
  dotsPerInch,
  ID1_CARD_HEIGHT_MM,
  pxPerMmFromCardRun,
} from '@axe/domain/tabletop/physical-scale';
import { TranslocoModule } from '@jsverse/transloco';

/** Where the frame starts before anybody has held a card against it. */
const ASSUMED_PX_PER_MM = 3.8;
const MIN_FRAME_PX = 40;
const MAX_FRAME_PX = 4000;

/**
 * Measuring the screen with a card.
 *
 * Nothing in the browser reports how large a pixel is, so the reader supplies the missing
 * fact: a frame is drawn on the glass and stretched until a real card laid on it matches.
 * A credit card is the ruler because everybody has one and every one of them is cut to the
 * same width.
 */
@Component({
  selector: 'app-display-calibration',
  templateUrl: './display-calibration.component.html',
  host: { class: 'block text-ui-text' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class DisplayCalibrationComponent {
  private readonly modalService = inject(ModalService);
  private readonly calibration = inject(DisplayCalibrationService);
  private readonly tabletop = inject(TabletopService);
  private readonly tabletopDisplay = inject(TabletopDisplayService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.modalService.title = this.t('feature.tabletop.displayCalibration.title');

    afterNextRender(() => {
      const area = this.frameAreaRef().nativeElement;
      this.measureFrameArea(area);
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.measureFrameArea(area));
      observer.observe(area);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private measureFrameArea(area: HTMLElement): void {
    // The padding is the frame's own margin of error, so it is taken off the room available.
    const style = getComputedStyle(area);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    this.frameAreaPx.set(Math.max(0, area.clientWidth - padding));
  }

  readonly cards = signal<number>(1);
  readonly framePx = signal<number>(startingFramePx(this.calibration.pxPerMm(), 1));

  private readonly frameAreaRef = viewChild.required<ElementRef<HTMLElement>>('frameArea');
  /** How much room the frame has to be shown in. Zero until the panel has been laid out. */
  private readonly frameAreaPx = signal<number>(0);

  /**
   * Whether a two card run would still be visible whole.
   *
   * A frame that has to be scrolled cannot be matched against a card lying on the glass, so on
   * a screen too narrow to show one the choice is withheld rather than left to fail quietly.
   */
  readonly twoCardsFit = computed<boolean>(() => {
    const area = this.frameAreaPx();
    if (area === 0) return true;
    return this.pxPerMm() * cardRunWidthMm(2) <= area;
  });

  /** The frame keeps a card's proportions, so both edges can be checked against it at once. */
  readonly frameHeightPx = computed(() => (this.framePx() / cardRunWidthMm(this.cards())) * ID1_CARD_HEIGHT_MM);

  readonly runWidthMm = computed(() => cardRunWidthMm(this.cards()).toFixed(1));
  readonly pxPerMm = computed(() => pxPerMmFromCardRun(this.framePx(), this.cards()));
  readonly pxPerMmLabel = computed(() => this.pxPerMm().toFixed(2));
  readonly dpi = computed(() => Math.round(dotsPerInch(this.pxPerMm())));

  readonly cellMm = signal<number>(clampCellMm(this.tabletop.cellMm()));
  readonly cellPx = computed(() => Math.round(cellWidthPx(this.cellMm(), this.pxPerMm())));
  /** An inch is the unit a miniature's base is sold in, so it is the one worth reading back. */
  readonly cellInchesLabel = computed(() => cellWidthInches(this.cellMm()).toFixed(2));

  private dragFromPx = 0;
  private dragFromClientX = 0;

  /** Dragging the corner is the directest way to match the frame to a card lying on it. */
  onHandleDown(event: PointerEvent): void {
    this.dragFromPx = this.framePx();
    this.dragFromClientX = event.clientX;
    (event.target as Element).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /**
   * Called as the corner handle is dragged: widens or narrows the frame by how far the pointer
   * has travelled sideways since it was pressed. Moves without a held handle are ignored.
   */
  onHandleMove(event: PointerEvent): void {
    const handle = event.target as Element;
    if (!handle.hasPointerCapture(event.pointerId)) return;
    this.framePx.set(clampFrame(this.dragFromPx + (event.clientX - this.dragFromClientX)));
    event.preventDefault();
  }

  /** Called when the corner handle is let go or the pointer is lost; ends the drag. */
  onHandleUp(event: PointerEvent): void {
    const handle = event.target as Element;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  /**
   * Switches between matching one card and two side by side.
   *
   * The scale matched so far is kept, so the frame is resized to the new run rather than reset.
   * Two cards are refused where their run would not fit on screen.
   */
  setCards(cards: number): void {
    if (cards === 2 && !this.twoCardsFit()) return;
    const before = this.pxPerMm();
    this.cards.set(cards);
    // The measurement so far is kept, so switching to two cards widens the frame rather than
    // throwing away what was already matched.
    this.framePx.set(clampFrame(before * cardRunWidthMm(cards)));
  }

  /** Widens or narrows the frame by a few pixels from the step buttons, within its limits. */
  nudgeFrame(deltaPx: number): void {
    this.framePx.set(clampFrame(this.framePx() + deltaPx));
  }

  /** Sets the frame width from the slider or the number field; anything that is not a number is ignored. */
  onFrameInput(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) this.framePx.set(clampFrame(parsed));
  }

  /**
   * Sets how wide a table cell should be in millimetres; anything that is not a positive number
   * is ignored. Nothing is saved until the calibration is confirmed.
   */
  onCellMmInput(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) this.cellMm.set(parsed);
  }

  /** The reader says the card matches; this is the whole result of the exercise. */
  confirm(): void {
    this.calibration.calibrateFromCardRun(this.framePx(), this.cards());
    this.tabletopDisplay.set({ cellMm: clampCellMm(this.cellMm()) });
    this.calibration.setRealSizeEnabled(true);
    this.modalService.resolve(true);
  }

  /** Closes the calibration without saving anything. */
  cancel(): void {
    this.modalService.resolve(false);
  }
}

function clampFrame(value: number): number {
  return Math.round(Math.min(Math.max(value, MIN_FRAME_PX), MAX_FRAME_PX));
}

function startingFramePx(pxPerMm: number | null, cards: number): number {
  return clampFrame((pxPerMm ?? ASSUMED_PX_PER_MM) * cardRunWidthMm(cards));
}
