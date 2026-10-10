import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { CompassFaceService } from '@axe/application/ui/compass-face.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { WIDGET_COMPASS } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import {
  compassPointOf,
  nearestTurnTo,
  NeedleSwing,
  northNeedleAngle,
  screenBearingOf,
  swingNeedle,
} from '@axe/domain/ui/compass';
import { COMPASS_FACES } from '@axe/domain/ui/compass-face';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** How often the needle is shoved again while the field has it, in seconds. */
const SWING_SECONDS = 0.06;

/**
 * Which way the table is facing, drawn as a compass.
 *
 * The table is turned about the vertical far more often than anybody keeps track of, and a room
 * described as "the door is on the north wall" is no use once the view has been dragged round.
 * The rose turns with the table, so north on the table is north on the compass.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-compass',
  templateUrl: './compass.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, TranslocoModule],
})
export class CompassComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly tabletop = inject(TabletopService);
  private readonly motion = inject(MotionService);
  private readonly faces = inject(CompassFaceService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly pointers = inject(PointerDeviceService);
  private readonly t = inject(TRANSLATE_FN);

  /** Which face this screen draws it with, which is a matter of taste rather than of the table. */
  protected readonly face = this.faces.face;

  protected readonly widgetName = WIDGET_COMPASS;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, window.innerWidth - el.offsetWidth - 8),
    top: 96,
  });

  private drawnAngle = northNeedleAngle(this.uiSignal.tableViewRotationZ());

  /**
   * How far round the rose is drawn, which is how far the table has been turned.
   *
   * Written so as to lie nearest whatever was drawn before it, rather than kept within one turn:
   * a rose that jumped from five degrees to three hundred and fifty-five would be eased the long
   * way round, and the table crossing north would whip it most of a turn.
   */
  protected readonly roseAngle = signal(this.drawnAngle);

  /** Whether the table this seat is looking at has a field the needle cannot read. */
  protected readonly anomalous = computed(() => this.tabletop.currentTableVersion().magneticAnomaly);

  /** Which way the top of the screen looks, in whole degrees. */
  protected readonly bearing = computed(() => Math.round(screenBearingOf(this.uiSignal.tableViewRotationZ())) % 360);

  /** What that bearing is called. */
  protected readonly pointKey = computed(() => `feature.compass.point.${compassPointOf(this.bearing())}`);

  private swing: NeedleSwing = { angle: this.drawnAngle, rate: 0 };

  /**
   * Whether the needle is swinging under the field just now.
   *
   * Only while the compass is out: nothing is drawn while it is put away, so there is nothing for
   * the needle to be shoved round for. A needle that never settles is exactly the sort of thing
   * somebody asking for less movement wants none of, so for them it is told where north is and
   * left there.
   */
  private readonly swinging = computed(() => this.widgets.compass() && this.anomalous() && this.motion.enabled());

  constructor() {
    effect(() => {
      // Under an anomaly the needle answers to the field rather than to the table, and comes back
      // round to north by the short way the moment the table is left behind.
      if (this.swinging()) return;
      this.drawnAngle = nearestTurnTo(northNeedleAngle(this.uiSignal.tableViewRotationZ()), this.drawnAngle);
      this.roseAngle.set(this.drawnAngle);
    });

    effect((onCleanup) => {
      if (!this.swinging()) return;
      this.swing = { angle: this.drawnAngle, rate: 0 };
      const timer = setInterval(() => {
        this.swing = swingNeedle(this.swing, SWING_SECONDS, Math.random() * 2 - 1);
        this.drawnAngle = this.swing.angle;
        this.roseAngle.set(this.drawnAngle);
      }, SWING_SECONDS * 1000);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** Offers the faces from a right click or a press held on the compass. */
  protected onContextMenu(event: MouseEvent): void {
    if (!this.pointers.isAllowedToOpenContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.open(
      this.pointers.pointers[0],
      COMPASS_FACES.map((face) => ({
        name: this.t(`feature.compass.face.${face}`),
        action: () => this.faces.choose(face),
      })),
      this.t('app.fab.compass')
    );
  }

  protected close(): void {
    this.widgets.compass.set(false);
  }
}
