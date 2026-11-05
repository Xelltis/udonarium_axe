import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ALTITUDE_STEP_CELLS, altitudeRungs } from '@axe/domain/tabletop/altitude-step';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

/** A point of the floor a guide over a canvas is drawn through, lifted some way off it. */
interface GuidePoint {
  readonly surface: 'floor';
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

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
  imports: [HudPlaceDirective],
})
export class TableAltitudeGuideOverlayComponent {
  private readonly heldPiece = inject(HeldPieceService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objects = inject(ObjectStore);

  /**
   * Whether the guide is drawn over a table drawn on a canvas, on the screen where the canvas draws
   * the piece held, rather than among the page's own pieces.
   */
  readonly overCanvas = input(false);

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

  /**
   * The guide as it is laid over a canvas: from the height the piece is held at down to the face it
   * stands on, the rungs a cell apart from the face, and the piece it goes with. Null off a canvas,
   * and for a piece no longer on the table.
   */
  protected readonly onCanvas = computed(() => {
    const guide = this.guide();
    if (!guide || !this.overCanvas()) return null;
    this.objectChange.versionOf(guide.identifier)();
    const piece = this.objects.get<TabletopObject>(guide.identifier);
    if (!piece) return null;
    const foot = piece.posZ;
    const way = Math.sign(guide.altitude);
    const point = (height: number): GuidePoint => ({
      surface: 'floor',
      x: guide.x + guide.widthPx / 2,
      y: guide.y + guide.heightPx / 2,
      height,
    });
    return {
      owner: guide.identifier,
      lifted: point(foot + guide.altitude * guide.gridSize),
      ground: point(foot),
      rungs: altitudeRungs(guide.altitude).map((at) => point(foot + way * at * guide.gridSize)),
    };
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
