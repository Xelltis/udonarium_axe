import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { ALTITUDE_STEP_CELLS, altitudeRungs } from '@axe/domain/tabletop/altitude-step';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';

/** A point of a face a guide is drawn through, lifted some way off it. */
interface GuidePoint {
  readonly surface: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** The same yellow the planned way is drawn in, so a guide reads as a guide wherever it is. */
export const ALTITUDE_GUIDE_STROKE = 'rgba(255, 236, 140, 0.95)';
export const ALTITUDE_GUIDE_SHADOW = 'rgba(0, 0, 0, 0.55)';

const RUNG_WIDTH_PX = 9;
const GROUND_MARK_INSET_PX = 2;

/**
 * The guide for a piece this seat holds off the ground while moving it, laid on the screen where the
 * table's canvas draws the piece.
 */
@Component({
  selector: 'table-altitude-guide-overlay',
  templateUrl: './table-altitude-guide-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [HudPlaceDirective],
})
export class TableAltitudeGuideOverlayComponent {
  private readonly heldPiece = inject(HeldPieceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objects = inject(ObjectStore);
  private readonly pieces = inject(TablePiecesService);
  private readonly screen = inject(TABLE_SCREEN);

  protected readonly stroke = ALTITUDE_GUIDE_STROKE;
  protected readonly shadow = ALTITUDE_GUIDE_SHADOW;
  protected readonly rungWidthPx = RUNG_WIDTH_PX;

  /** Drawn only once the piece is off the ground: on it, the ground itself says as much. */
  private readonly guide = computed(() => {
    const held = this.heldPiece.held();
    if (!held?.liftable || Math.abs(held.altitude) < ALTITUDE_STEP_CELLS / 2) return null;
    return held;
  });

  /**
   * The guide as it is laid: from the height the piece is held at down to the face it stands on
   * where the canvas stands it, the rungs a cell apart from the face, the mark on the ground under
   * it, and the piece it goes with. Null for a piece no longer on the table.
   */
  protected readonly laid = computed(() => {
    const guide = this.guide();
    if (!guide) return null;
    this.objectChange.versionOf(guide.identifier)();
    const piece = this.objects.get<TabletopObject>(guide.identifier);
    if (!piece) return null;
    const foot = this.pieces.footOf(piece);
    const way = Math.sign(guide.altitude);
    const point = (height: number): GuidePoint => ({
      surface: foot.surface,
      x: guide.x + guide.widthPx / 2,
      y: guide.y + guide.heightPx / 2,
      height,
    });
    return {
      owner: guide.identifier,
      lifted: point(foot.height + guide.altitude * guide.gridSize),
      ground: point(foot.height),
      rungs: altitudeRungs(guide.altitude).map((at) => point(foot.height + way * at * guide.gridSize)),
      groundAt: { x: guide.x + GROUND_MARK_INSET_PX, y: guide.y + GROUND_MARK_INSET_PX, z: foot.height },
      groundWidthPx: Math.max(0, guide.widthPx - GROUND_MARK_INSET_PX * 2),
      groundHeightPx: Math.max(0, guide.heightPx - GROUND_MARK_INSET_PX * 2),
    };
  });

  /** The transform that lays the mark on the ground under the piece where it lands, or null before the camera is set. */
  protected readonly groundOnScreen = computed<string | null>(() => {
    const laid = this.laid();
    const onScreen = this.screen.screenMatrixOf();
    if (!laid || !onScreen) return null;
    return onScreen(Matrix3D.makePosition({ ...laid.groundAt, w: 1 }));
  });

  protected readonly reading = computed<string>(() => {
    const guide = this.guide();
    if (!guide) return '';
    const rounded = Math.round(guide.altitude * 10) / 10;
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  });
}
