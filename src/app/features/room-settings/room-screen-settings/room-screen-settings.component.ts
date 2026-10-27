import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { asHoverDetailPlacement, HOVER_DETAIL_PLACEMENTS } from '@axe/domain/tabletop/hover-detail-placement';
import { DEFAULT_CELL_DISTANCE_UNIT } from '@axe/domain/tabletop/move/move-cells';
import { parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS, MultiAngleMotionMode } from '@axe/domain/tabletop/multi-angle';
import { asMultiAngleFontScale, MULTI_ANGLE_FONT_SCALES } from '@axe/domain/tabletop/multi-angle-font-scale';
import { cellWidthInches, clampCellMm } from '@axe/domain/tabletop/physical-scale';
import {
  asMultiAngleMotionMode,
  TABLETOP_MODE_KEYS,
  TABLETOP_MODE_SETTINGS,
  TabletopDisplayKey,
} from '@axe/domain/tabletop/tabletop-display';
import { TABLETOP_MENU_STYLES } from '@axe/domain/tabletop/tabletop-menu-style';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What this screen wants when it is laid on a table with seats around it: the shape of its menus,
 * names and resources orbiting the pieces, the edge ticker, the window turn button, and a square at
 * its real width.
 *
 * Every one of them is set for this screen alone and reaches nobody else, so a reader needs nobody's
 * leave to change them. Where this screen has said nothing, the table in view answers.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-screen-settings',
  templateUrl: './room-screen-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, NgTemplateOutlet, TranslocoModule],
})
export class RoomScreenSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly display = inject(TabletopDisplayService);
  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);

  protected readonly hoverDetailPlacements = HOVER_DETAIL_PLACEMENTS;
  protected readonly multiAngleFontScales = MULTI_ANGLE_FONT_SCALES;
  protected readonly menuStyles = TABLETOP_MENU_STYLES;
  protected readonly isCalibrated = this.displayCalibration.isCalibrated;

  /** Back to the table for everything this screen was told about a table seen from above. */
  forgetOwnDisplay(): void {
    this.display.forget();
  }

  /**
   * Whether this screen carries everything a table with seats around it asks for.
   *
   * The switch that lays the view flat as well is on the tabletop display panel; here the settings
   * alone are asked for, since this panel does not answer for the view.
   */
  readonly tabletopRecommended = this.access.field(
    () => {
      const now = this.access.displaySettings();
      return (Object.keys(TABLETOP_MODE_SETTINGS) as TabletopDisplayKey[]).every(
        (key) => now[key] === TABLETOP_MODE_SETTINGS[key]
      );
    },
    (wanted) => {
      if (wanted) this.display.set(TABLETOP_MODE_SETTINGS);
      // Letting go of them is not the same as pinning the defaults: a table that carries its own
      // value for one of these would never be heard again if this screen wrote over it.
      else this.display.forgetOnly(TABLETOP_MODE_KEYS);
      if (wanted) this.viewMode.choose('flat');
    }
  );

  /** Whether lines sent with the ticker button run round the edges of this screen. */
  readonly tickerEnabled = this.access.displayField('multiAngleTickerEnabled');

  /** How fast the edge ticker runs, in pixels per second. */
  readonly tickerPixelsPerSecond = this.access.displayField('multiAngleTickerPixelsPerSecond', Number);

  /** The real width of one square on this screen, in millimetres, clamped to the range allowed. */
  readonly cellMm = this.access.displayField('cellMm', (mm) => clampCellMm(Number(mm)));

  /** What a square comes to on this screen, read at a glance rather than worked out. */
  readonly cellSummary = computed(() => {
    const mm = this.cellMm.value;
    const rules = this.access.rules();
    return {
      mm: Math.round(mm * 10) / 10,
      inches: Math.round(cellWidthInches(mm) * 100) / 100,
      distance: rules.cellDistance,
      unit: parseMoveUnit(rules.cellDistanceUnit) ?? DEFAULT_CELL_DISTANCE_UNIT,
    };
  });

  /** Whether common windows carry a button that turns them a quarter at a time to face another side of the table. */
  readonly panelRotationEnabled = this.access.displayField('panelRotationEnabled');

  /** Whether the table is drawn without perspective, for a screen laid flat. */
  readonly orthographicProjection = this.access.displayField('orthographicProjection');

  /** Where the detail of a hovered piece appears; an unknown value is corrected on the way in. */
  readonly hoverDetailPlacement = this.access.displayField('hoverDetailPlacement', asHoverDetailPlacement);

  /** Which shape the right-click menu takes while the table is seen from above: a plain list, four-way or turning. */
  readonly tabletopMenuStyle = this.access.displayField('tabletopMenuStyle');

  /** How fast the turning right-click menu spins. */
  readonly radialMenuRotationSpeed = this.access.displayField('radialMenuRotationSpeed', Number);

  /** Whether piece names curve and orbit round the pieces. */
  readonly multiAngleEnabled = this.access.displayField('multiAngleEnabled');

  /** Whether up to four resources and buffs orbit a piece along with its name. */
  readonly multiAngleResourceBuffEnabled = this.access.displayField('multiAngleResourceBuffEnabled');

  /** How large the text in the menus and the ticker is drawn; an unknown value is corrected on the way in. */
  readonly multiAngleFontScale = this.access.displayField('multiAngleFontScale', asMultiAngleFontScale);

  /**
   * How orbiting names move: turning without stopping, or a quarter turn and a pause, for everything
   * or the piece alone.
   *
   * Choosing a mode also resets the time a piece takes for a lap, to the default for continuous
   * motion and to five seconds otherwise.
   */
  readonly multiAngleMotionMode = this.access.field<MultiAngleMotionMode>(
    () => this.access.displaySettings().multiAngleMotionMode,
    (value) => {
      const motionMode = asMultiAngleMotionMode(value);
      this.display.set({
        multiAngleMotionMode: motionMode,
        multiAnglePieceRevolutionSeconds:
          motionMode === 'continuous' ? DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS : 5,
      });
    }
  );

  /** How many seconds orbiting names take for one lap. */
  readonly multiAngleRevolutionSeconds = this.access.displayField('multiAngleRevolutionSeconds', Number);

  /** How many seconds orbiting names rest after each quarter turn. */
  readonly multiAnglePauseSeconds = this.access.displayField('multiAnglePauseSeconds', Number);

  /** How many seconds a piece takes for one lap when the piece turns on its own. */
  readonly multiAnglePieceRevolutionSeconds = this.access.displayField('multiAnglePieceRevolutionSeconds', Number);

  /** Whether the view is locked against panning, zooming and turning; it belongs to this browser alone. */
  readonly viewLocked = this.access.field(
    () => this.viewLock.locked(),
    (value) => this.viewLock.set(value)
  );

  /**
   * Whether one square is drawn at its real width on this screen.
   *
   * Asking for it before the screen has been measured opens the calibration dialog instead, and
   * leaves it off.
   */
  readonly realSizeEnabled = this.access.field(
    () => this.displayCalibration.realSizeEnabled(),
    (value) => {
      if (value && !this.displayCalibration.isCalibrated()) {
        this.access.openCalibration();
        return;
      }
      this.displayCalibration.setRealSizeEnabled(value);
    }
  );
}
