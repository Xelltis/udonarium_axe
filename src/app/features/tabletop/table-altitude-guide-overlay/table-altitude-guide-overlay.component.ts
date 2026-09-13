import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ALTITUDE_STEP_CELLS, altitudeRungs } from '@axe/domain/tabletop/altitude-step';
import { Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/** The same yellow the planned way is drawn in, so a guide reads as a guide wherever it is. */
export const ALTITUDE_GUIDE_STROKE = 'rgba(255, 236, 140, 0.95)';
export const ALTITUDE_GUIDE_SHADOW = 'rgba(0, 0, 0, 0.55)';

const RUNG_WIDTH_PX = 9;
const GROUND_MARK_INSET_PX = 2;

@Component({
  selector: 'table-altitude-guide-overlay',
  templateUrl: './table-altitude-guide-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableAltitudeGuideOverlayComponent {
  private readonly heldPiece = inject(HeldPieceService);
  private readonly uiSignal = inject(UiSignalService);

  protected readonly stroke = ALTITUDE_GUIDE_STROKE;
  protected readonly shadow = ALTITUDE_GUIDE_SHADOW;
  protected readonly rungWidthPx = RUNG_WIDTH_PX;
  protected readonly viewRotateZ = this.uiSignal.tableViewRotationZ;

  /** Drawn only once the piece is off the ground: on it, the ground itself says as much. */
  protected readonly guide = computed(() => {
    const held = this.heldPiece.held();
    if (!held?.liftable || Math.abs(held.altitude) < ALTITUDE_STEP_CELLS / 2) return null;
    return held;
  });

  protected readonly anchorCss = computed<string>(() => {
    const guide = this.guide();
    if (!guide) return '';
    return `translate3d(${guide.x}px, ${guide.y}px, ${Z_OFFSET_RANGE_PX}px)`;
  });

  protected readonly poleHeightPx = computed<number>(() => {
    const guide = this.guide();
    return guide ? Math.abs(guide.altitude * guide.gridSize) : 0;
  });

  protected readonly poleCss = computed<string>(() => {
    const guide = this.guide();
    if (!guide) return '';
    const lift = guide.altitude > 0 ? -guide.altitude * guide.gridSize : 0;
    return (
      `translateX(${guide.widthPx / 2}px) translateY(${-guide.heightPx / 2}px) ` +
      `rotateX(-90deg) translateY(${lift}px) rotateY(${this.viewRotateZ()}deg)`
    );
  });

  /**
   * How far down the pole each cell mark sits.
   *
   * The marks are counted from the ground rather than from the piece, so the one nearest the
   * ground stays put while the piece climbs and the height can be read off by counting.
   */
  protected readonly rungOffsetsPx = computed<number[]>(() => {
    const guide = this.guide();
    if (!guide) return [];
    const reach = Math.abs(guide.altitude);
    return altitudeRungs(guide.altitude).map((at) => (reach - at) * guide.gridSize);
  });

  /** The mark left on the ground under a piece being held above it, which is where it lands. */
  protected readonly groundMarkCss = computed<string>(() => {
    const guide = this.guide();
    if (!guide) return '';
    return `translate3d(${GROUND_MARK_INSET_PX}px, ${GROUND_MARK_INSET_PX}px, 0)`;
  });

  protected readonly groundMarkWidthPx = computed<number>(() => {
    const guide = this.guide();
    return guide ? Math.max(0, guide.widthPx - GROUND_MARK_INSET_PX * 2) : 0;
  });

  protected readonly groundMarkHeightPx = computed<number>(() => {
    const guide = this.guide();
    return guide ? Math.max(0, guide.heightPx - GROUND_MARK_INSET_PX * 2) : 0;
  });

  protected readonly reading = computed<string>(() => {
    const guide = this.guide();
    if (!guide) return '';
    const rounded = Math.round(guide.altitude * 10) / 10;
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  });
}
