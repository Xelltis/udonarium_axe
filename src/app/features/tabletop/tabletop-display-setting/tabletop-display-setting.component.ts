import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { CUT_IN_MULTI_DIRECTION_MODES, CutInMultiDirectionMode } from '@axe/domain/tabletop/cut-in-multi-direction';
import { HOVER_DETAIL_PLACEMENTS, HoverDetailPlacement } from '@axe/domain/tabletop/hover-detail-placement';
import { DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS, MultiAngleMotionMode } from '@axe/domain/tabletop/multi-angle';
import { MULTI_ANGLE_FONT_SCALES, MultiAngleFontScale } from '@axe/domain/tabletop/multi-angle-font-scale';
import { DisplayCalibrationComponent } from '@axe/features/tabletop/display-calibration/display-calibration.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tabletop-display-setting',
  templateUrl: './tabletop-display-setting.component.html',
  imports: [FormsModule, TranslocoModule],
})
export class TabletopDisplaySettingComponent {
  protected readonly settings = inject(TabletopDisplaySettingsService);
  private readonly modalService = inject(ModalService);
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);
  protected readonly cutInMultiDirectionModes = CUT_IN_MULTI_DIRECTION_MODES;
  protected readonly hoverDetailPlacements = HOVER_DETAIL_PLACEMENTS;
  protected readonly multiAngleFontScales = MULTI_ANGLE_FONT_SCALES;

  get enabled(): boolean {
    return this.settings.enabled();
  }
  set enabled(value: boolean) {
    this.settings.patch({ enabled: value });
  }

  get cutInMultiDirectionMode(): CutInMultiDirectionMode {
    return this.settings.cutInMultiDirectionMode();
  }
  set cutInMultiDirectionMode(value: CutInMultiDirectionMode) {
    this.settings.patch({ cutInMultiDirectionMode: value });
  }

  get hoverDetailPlacement(): HoverDetailPlacement {
    return this.settings.hoverDetailPlacement();
  }
  set hoverDetailPlacement(value: HoverDetailPlacement) {
    this.settings.patch({ hoverDetailPlacement: value });
  }

  get multiAngleFontScale(): MultiAngleFontScale {
    return this.settings.multiAngleFontScale();
  }
  set multiAngleFontScale(value: MultiAngleFontScale) {
    this.settings.patch({ multiAngleFontScale: value });
  }

  get radialMenuEnabled(): boolean {
    return this.settings.radialMenuEnabled();
  }
  set radialMenuEnabled(value: boolean) {
    this.settings.patch({ radialMenuEnabled: value });
  }

  get radialMenuRotationSpeed(): number {
    return this.settings.radialMenuRotationSpeed();
  }
  set radialMenuRotationSpeed(value: number) {
    this.settings.patch({ radialMenuRotationSpeed: value });
  }

  get multiAngleEnabled(): boolean {
    return this.settings.multiAngleEnabled();
  }
  set multiAngleEnabled(value: boolean) {
    this.settings.patch({ multiAngleEnabled: value });
  }

  get multiAngleResourceBuffEnabled(): boolean {
    return this.settings.multiAngleResourceBuffEnabled();
  }
  set multiAngleResourceBuffEnabled(value: boolean) {
    this.settings.patch({ multiAngleResourceBuffEnabled: value });
  }

  get multiAngleMotionMode(): MultiAngleMotionMode {
    return this.settings.multiAngleMotionMode();
  }
  set multiAngleMotionMode(value: MultiAngleMotionMode) {
    const motionMode = value === 'quarter-turn' || value === 'piece-quarter-turn' ? value : 'continuous';
    this.settings.patch({
      multiAngleMotionMode: motionMode,
      multiAnglePieceRevolutionSeconds: motionMode === 'continuous' ? DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS : 5,
    });
  }

  get multiAngleRevolutionSeconds(): number {
    return this.settings.multiAngleRevolutionSeconds();
  }
  set multiAngleRevolutionSeconds(value: number) {
    this.settings.patch({ multiAngleRevolutionSeconds: value });
  }

  get multiAnglePauseSeconds(): number {
    return this.settings.multiAnglePauseSeconds();
  }
  set multiAnglePauseSeconds(value: number) {
    this.settings.patch({ multiAnglePauseSeconds: value });
  }

  get multiAnglePieceRevolutionSeconds(): number {
    return this.settings.multiAnglePieceRevolutionSeconds();
  }
  set multiAnglePieceRevolutionSeconds(value: number) {
    this.settings.patch({ multiAnglePieceRevolutionSeconds: value });
  }

  get multiAngleTickerEnabled(): boolean {
    return this.settings.multiAngleTickerEnabled();
  }
  set multiAngleTickerEnabled(value: boolean) {
    this.settings.patch({ multiAngleTickerEnabled: value });
  }

  get multiAngleTickerPixelsPerSecond(): number {
    return this.settings.multiAngleTickerPixelsPerSecond();
  }
  set multiAngleTickerPixelsPerSecond(value: number) {
    this.settings.patch({ multiAngleTickerPixelsPerSecond: value });
  }
  /**
   * The screen measurement and the lock belong to this browser, not to the table, so they are
   * read straight from their services rather than through the stored display settings.
   */
  protected readonly isCalibrated = this.displayCalibration.isCalibrated;
  protected readonly calibrationDpi = this.displayCalibration.dpi;
  protected readonly needsRecalibration = this.displayCalibration.needsRecalibration;

  get viewLocked(): boolean {
    return this.viewLock.locked();
  }
  set viewLocked(value: boolean) {
    this.viewLock.set(value);
  }

  get realSizeEnabled(): boolean {
    return this.displayCalibration.realSizeEnabled();
  }
  set realSizeEnabled(value: boolean) {
    // Real size means nothing until the screen has been measured, so asking for it asks for that.
    if (value && !this.displayCalibration.isCalibrated()) {
      this.openCalibration();
      return;
    }
    this.displayCalibration.setRealSizeEnabled(value);
  }

  openCalibration(): void {
    // Without this the shell holds a fixed 800px and clips the frame the card is matched against.
    void this.modalService.open(DisplayCalibrationComponent, { fitWidth: true });
  }

  nudgeScale(steps: number): void {
    this.displayCalibration.nudge(steps);
  }

  /** Back to an unmeasured screen. The width of a square stays, since the map still asks for it. */
  resetCalibration(): void {
    this.displayCalibration.reset();
  }
}
