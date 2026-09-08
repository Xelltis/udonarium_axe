import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import {
  asCutInMultiDirectionMode,
  CUT_IN_MULTI_DIRECTION_MODES,
  CutInMultiDirectionMode,
} from '@axe/domain/tabletop/cut-in-multi-direction';
import {
  asHoverDetailPlacement,
  HOVER_DETAIL_PLACEMENTS,
  HoverDetailPlacement,
} from '@axe/domain/tabletop/hover-detail-placement';
import { DEFAULT_CELL_DISTANCE_UNIT } from '@axe/domain/tabletop/move/move-cells';
import { parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS, MultiAngleMotionMode } from '@axe/domain/tabletop/multi-angle';
import {
  asMultiAngleFontScale,
  MULTI_ANGLE_FONT_SCALES,
  MultiAngleFontScale,
} from '@axe/domain/tabletop/multi-angle-font-scale';
import { cellWidthInches, clampCellMm } from '@axe/domain/tabletop/physical-scale';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { asTableFacingMark, TABLE_FACING_MARKS, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  asMultiAngleMotionMode,
  TABLETOP_MODE_SETTINGS,
  TabletopDisplaySettings,
} from '@axe/domain/tabletop/tabletop-display';
import { VIEW_MODES, ViewMode } from '@axe/domain/ui/view-mode';
import { DisplayCalibrationComponent } from '@axe/ui/components/display-calibration/display-calibration.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Everything about looking at the table in one place.
 *
 * The settings gathered here were reached through three menus that each said something about
 * two dimensions: the view this seat is taking, the view the table recommends, and how a table
 * seen from above is drawn. Which of them a reader wanted was never obvious from any one of
 * them, so they are put side by side in the order they take effect, and each is still where it
 * was for anyone who knows the way there.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'tabletop-display-setting',
  templateUrl: './tabletop-display-setting.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
})
export class TabletopDisplaySettingComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly display = inject(TabletopDisplayService);
  private readonly tabletop = inject(TabletopService);
  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly viewModes = VIEW_MODES;
  protected readonly facingMarks = TABLE_FACING_MARKS;
  protected readonly cutInMultiDirectionModes = CUT_IN_MULTI_DIRECTION_MODES;
  protected readonly hoverDetailPlacements = HOVER_DETAIL_PLACEMENTS;
  protected readonly multiAngleFontScales = MULTI_ANGLE_FONT_SCALES;
  protected readonly isCalibrated = this.displayCalibration.isCalibrated;
  protected readonly calibrationDpi = this.displayCalibration.dpi;
  protected readonly needsRecalibration = this.displayCalibration.needsRecalibration;

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.tabletop.displaySetting.title')));
  }

  /** Whether this reader may speak for the table, which only the recommended view asks. */
  protected readonly isEditable = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** What this seat asked for: the table's own recommendation, or a view of its own. */
  readonly seatViewMode = this.tabletop.seatViewMode;
  /** What that comes to on this screen right now, which is what 'auto' has to be read by. */
  protected readonly laysFlat = this.tabletop.mode2d;
  protected readonly recommendsFlat = this.tabletop.recommendsFlat;

  chooseViewMode(mode: ViewMode): void {
    this.viewMode.choose(mode);
  }

  /**
   * Whether this screen is set up as the table itself: laid flat, and dressed for it.
   *
   * Looking straight down is the whole of what the rest of this panel is for, so the mode is
   * read from the view rather than written down beside it. Turning it on lays the screen flat
   * and puts in what a flat screen wants; turning it off only stands the view back up, since
   * everything it put in is dead in that view anyway and is a reader's to keep.
   */
  get tabletopMode(): boolean {
    return this.laysFlat();
  }
  set tabletopMode(wanted: boolean) {
    if (!wanted) {
      this.viewMode.choose('perspective');
      return;
    }
    this.viewMode.choose('flat');
    this.set(TABLETOP_MODE_SETTINGS);
  }

  /** The view the table asks for, which is the table's to set and so the master's to change. */
  get tableRecommendsFlat(): boolean {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table?.mode2d ?? false;
  }
  set tableRecommendsFlat(value: boolean) {
    const table = this.tableSelecter.viewTable;
    if (!this.isEditable() || !table) return;
    table.mode2d = value;
    triggerUpdateGameObject(table.toContext());
  }

  /** Whether a piece keeps its face to the reader, which the table answers for everyone. */
  get imageBillboard(): boolean {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table?.imageBillboard ?? false;
  }
  set imageBillboard(value: boolean) {
    const table = this.tableSelecter.viewTable;
    if (!this.isEditable() || !table) return;
    table.imageBillboard = value;
    triggerUpdateGameObject(table.toContext());
  }

  /**
   * How a piece says which way it is facing, which the room rules and the room answers for.
   *
   * Straight down on a table the art gives nothing away, so it belongs beside the rest of what
   * a flat table is read by even though it is the room's to set rather than this screen's.
   */
  get facingMark(): TableFacingMark {
    this.objectChange.versionOf('Config')();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    const config = this.objectStore.get<Config>('Config');
    return asTableFacingMark(resolveRoomRules(config?.roomRuleAnswers ?? null, table).facingMark);
  }
  set facingMark(value: TableFacingMark) {
    if (!this.isEditable()) return;
    const config = this.objectStore.get<Config>('Config') ?? Config.instance;
    config.facingMark = asTableFacingMark(value);
  }

  get cutInMultiDirectionMode(): CutInMultiDirectionMode {
    return this.settings.cutInMultiDirectionMode;
  }
  set cutInMultiDirectionMode(value: CutInMultiDirectionMode) {
    this.set({ cutInMultiDirectionMode: asCutInMultiDirectionMode(value) });
  }

  private get settings(): TabletopDisplaySettings {
    this.objectChange.versionOf('Config')();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return this.display.settingsNow();
  }

  private set(patch: Partial<TabletopDisplaySettings>): void {
    this.display.set(patch);
  }

  /** Back to the table for everything this screen was told about a table seen from above. */
  forgetOwnDisplay(): void {
    this.display.forget();
  }

  get orthographicProjection(): boolean {
    return this.settings.orthographicProjection;
  }
  set orthographicProjection(value: boolean) {
    this.set({ orthographicProjection: value });
  }

  get hoverDetailPlacement(): HoverDetailPlacement {
    return this.settings.hoverDetailPlacement;
  }
  set hoverDetailPlacement(value: HoverDetailPlacement) {
    this.set({ hoverDetailPlacement: asHoverDetailPlacement(value) });
  }

  get pieceImageInCell(): boolean {
    return this.settings.pieceImageInCell;
  }
  set pieceImageInCell(value: boolean) {
    this.set({ pieceImageInCell: value });
  }

  get panelRotationEnabled(): boolean {
    return this.settings.panelRotationEnabled;
  }
  set panelRotationEnabled(value: boolean) {
    this.set({ panelRotationEnabled: value });
  }

  get radialMenuEnabled(): boolean {
    return this.settings.radialMenuEnabled;
  }
  set radialMenuEnabled(value: boolean) {
    this.set({ radialMenuEnabled: value });
  }

  get radialMenuRotationSpeed(): number {
    return this.settings.radialMenuRotationSpeed;
  }
  set radialMenuRotationSpeed(value: number) {
    this.set({ radialMenuRotationSpeed: Number(value) });
  }

  get multiAngleEnabled(): boolean {
    return this.settings.multiAngleEnabled;
  }
  set multiAngleEnabled(value: boolean) {
    this.set({ multiAngleEnabled: value });
  }

  get multiAngleResourceBuffEnabled(): boolean {
    return this.settings.multiAngleResourceBuffEnabled;
  }
  set multiAngleResourceBuffEnabled(value: boolean) {
    this.set({ multiAngleResourceBuffEnabled: value });
  }

  get multiAngleFontScale(): MultiAngleFontScale {
    return this.settings.multiAngleFontScale;
  }
  set multiAngleFontScale(value: MultiAngleFontScale) {
    this.set({ multiAngleFontScale: asMultiAngleFontScale(value) });
  }

  get multiAngleMotionMode(): MultiAngleMotionMode {
    return this.settings.multiAngleMotionMode;
  }
  set multiAngleMotionMode(value: MultiAngleMotionMode) {
    const motionMode = asMultiAngleMotionMode(value);
    this.set({
      multiAngleMotionMode: motionMode,
      multiAnglePieceRevolutionSeconds: motionMode === 'continuous' ? DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS : 5,
    });
  }

  get multiAngleRevolutionSeconds(): number {
    return this.settings.multiAngleRevolutionSeconds;
  }
  set multiAngleRevolutionSeconds(value: number) {
    this.set({ multiAngleRevolutionSeconds: Number(value) });
  }

  get multiAnglePauseSeconds(): number {
    return this.settings.multiAnglePauseSeconds;
  }
  set multiAnglePauseSeconds(value: number) {
    this.set({ multiAnglePauseSeconds: Number(value) });
  }

  get multiAnglePieceRevolutionSeconds(): number {
    return this.settings.multiAnglePieceRevolutionSeconds;
  }
  set multiAnglePieceRevolutionSeconds(value: number) {
    this.set({ multiAnglePieceRevolutionSeconds: Number(value) });
  }

  get tickerEnabled(): boolean {
    return this.settings.multiAngleTickerEnabled;
  }
  set tickerEnabled(value: boolean) {
    this.set({ multiAngleTickerEnabled: value });
  }

  get tickerPixelsPerSecond(): number {
    return this.settings.multiAngleTickerPixelsPerSecond;
  }
  set tickerPixelsPerSecond(value: number) {
    this.set({ multiAngleTickerPixelsPerSecond: Number(value) });
  }

  get cellMm(): number {
    return this.settings.cellMm;
  }
  set cellMm(value: number) {
    this.set({ cellMm: clampCellMm(Number(value)) });
  }

  /** What a square comes to on this screen, read at a glance rather than worked out. */
  readonly cellSummary = computed(() => {
    const mm = this.cellMm;
    const table = this.tableSelecter.viewTable;
    const rules = resolveRoomRules(null, table);
    return {
      mm: Math.round(mm * 10) / 10,
      inches: Math.round(cellWidthInches(mm) * 100) / 100,
      distance: rules.cellDistance,
      unit: parseMoveUnit(rules.cellDistanceUnit) ?? DEFAULT_CELL_DISTANCE_UNIT,
    };
  });

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

  get viewLocked(): boolean {
    return this.viewLock.locked();
  }
  set viewLocked(value: boolean) {
    this.viewLock.set(value);
  }

  openCalibration(): void {
    // Without this the shell holds a fixed 800px and clips the frame the card is matched against.
    void this.modalService.open(DisplayCalibrationComponent, { fitWidth: true });
  }

  nudgeScale(steps: number): void {
    this.displayCalibration.nudge(steps);
  }

  resetCalibration(): void {
    this.displayCalibration.reset();
  }
}
