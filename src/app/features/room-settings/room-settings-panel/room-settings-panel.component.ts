import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import {
  asHoverDetailPlacement,
  HOVER_DETAIL_PLACEMENTS,
  HoverDetailPlacement,
} from '@axe/domain/tabletop/hover-detail-placement';
import { DEFAULT_CELL_DISTANCE_UNIT } from '@axe/domain/tabletop/move/move-cells';
import { MOVE_UNITS, MoveUnit, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { asZocMode, ZOC_MODES, ZocMode } from '@axe/domain/tabletop/move/zone-of-control';
import { DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS, MultiAngleMotionMode } from '@axe/domain/tabletop/multi-angle';
import {
  asMultiAngleFontScale,
  MULTI_ANGLE_FONT_SCALES,
  MultiAngleFontScale,
} from '@axe/domain/tabletop/multi-angle-font-scale';
import { cellWidthInches, clampCellMm } from '@axe/domain/tabletop/physical-scale';
import { isGroupAnswered, resolveRoomRules, RoomRuleGroup, RoomRules } from '@axe/domain/tabletop/room-rules';
import { asTableFacingMark, TABLE_FACING_MARKS, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { asMultiAngleMotionMode, TabletopDisplaySettings } from '@axe/domain/tabletop/tabletop-display';
import {
  FACTION_PHASE_MODES,
  FactionPhaseMode,
  TURN_ORDER_MODES,
  TurnOrderMode,
} from '@axe/domain/tabletop/turn-order-mode';
import { describeSide, encodeFactionOrder, normalizeFactionOrder } from '@axe/domain/tabletop/turn-side';
import { ROOM_SETTINGS_TABS, RoomSettingsTab } from '@axe/domain/ui/room-settings-tab';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { RoomSnapshotPanelComponent } from '@axe/features/room-archive/room-snapshot-panel/room-snapshot-panel.component';
import { DisplayCalibrationComponent } from '@axe/ui/components/display-calibration/display-calibration.component';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

/** A count of cells written into a box, taken as none where it is not a whole one above zero. */
function wholeCells(value: number): number {
  const cells = Math.floor(Number(value));
  return Number.isFinite(cells) && cells > 0 ? cells : 0;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-settings-panel',
  templateUrl: './room-settings-panel.component.html',
  host: { class: 'block' },
  imports: [
    NgTemplateOutlet,
    FormsModule,
    NgSelectComponent,
    NgOptionComponent,
    RoomSnapshotPanelComponent,
    TranslocoModule,
  ],
})
export class RoomSettingsPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly diceBotCatalog = inject(DiceBotCatalogService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly roomSnapshot = inject(RoomSnapshotService);
  private readonly roomPanels = inject(RoomPanelService);

  readonly tabs = ROOM_SETTINGS_TABS;
  readonly tab = signal<RoomSettingsTab>('general');

  readonly isKeeping = this.roomSnapshot.isKeeping;

  openCharacterImport(): void {
    this.roomPanels.open('characterImport');
  }

  setKeeping(event: Event): void {
    this.roomSnapshot.setKeeping((event.target as HTMLInputElement).checked);
  }

  readonly turnOrderModes = TURN_ORDER_MODES;
  readonly factionPhaseModes = FACTION_PHASE_MODES;
  readonly moveUnits = MOVE_UNITS;
  readonly facingMarks = TABLE_FACING_MARKS;
  readonly zocModes = ZOC_MODES;

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.roomSettings.title')));
  }

  /**
   * How a table seen from straight above is drawn and reached.
   *
   * It describes the screen this room is played around rather than any one map, so the room
   * answers for it. A reader may take a feature over for their own glass, and doing so needs no
   * permission: what they take over reaches nobody else.
   */
  protected readonly display = inject(TabletopDisplayService);

  private get displaySettings(): TabletopDisplaySettings {
    this.objectChange.versionOf('Config')();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return this.display.settingsNow();
  }
  protected readonly hoverDetailPlacements = HOVER_DETAIL_PLACEMENTS;
  protected readonly multiAngleFontScales = MULTI_ANGLE_FONT_SCALES;

  private displaySet(patch: Partial<TabletopDisplaySettings>): void {
    this.display.set(patch);
  }

  /** Back to the table for everything this screen was told about a table seen from above. */
  forgetOwnDisplay(): void {
    this.display.forget();
  }

  /** Whether a piece keeps its face to the reader, which is the table's own decision. */
  get imageBillboard(): boolean {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table?.imageBillboard ?? false;
  }
  set imageBillboard(value: boolean) {
    const table = this.tableSelecter.viewTable;
    if (!this.isEditable || !table) return;
    table.imageBillboard = value;
    triggerUpdateGameObject(table.toContext());
  }

  get tickerEnabled(): boolean {
    return this.displaySettings.multiAngleTickerEnabled;
  }
  set tickerEnabled(value: boolean) {
    this.displaySet({ multiAngleTickerEnabled: value });
  }

  get tickerPixelsPerSecond(): number {
    return this.displaySettings.multiAngleTickerPixelsPerSecond;
  }
  set tickerPixelsPerSecond(value: number) {
    this.displaySet({ multiAngleTickerPixelsPerSecond: Number(value) });
  }

  get cellMm(): number {
    return this.displaySettings.cellMm;
  }
  set cellMm(value: number) {
    this.displaySet({ cellMm: clampCellMm(Number(value)) });
  }

  /** What a square comes to on this screen, read at a glance rather than worked out. */
  readonly cellSummary = computed(() => {
    const mm = this.cellMm;
    const rules = this.rules;
    return {
      mm: Math.round(mm * 10) / 10,
      inches: Math.round(cellWidthInches(mm) * 100) / 100,
      distance: rules.cellDistance,
      unit: parseMoveUnit(rules.cellDistanceUnit) ?? DEFAULT_CELL_DISTANCE_UNIT,
    };
  });

  get orthographicProjection(): boolean {
    return this.displaySettings.orthographicProjection;
  }
  set orthographicProjection(value: boolean) {
    this.displaySet({ orthographicProjection: value });
  }

  get hoverDetailPlacement(): HoverDetailPlacement {
    return this.displaySettings.hoverDetailPlacement;
  }
  set hoverDetailPlacement(value: HoverDetailPlacement) {
    this.displaySet({ hoverDetailPlacement: asHoverDetailPlacement(value) });
  }

  get radialMenuEnabled(): boolean {
    return this.displaySettings.radialMenuEnabled;
  }
  set radialMenuEnabled(value: boolean) {
    this.displaySet({ radialMenuEnabled: value });
  }

  get radialMenuRotationSpeed(): number {
    return this.displaySettings.radialMenuRotationSpeed;
  }
  set radialMenuRotationSpeed(value: number) {
    this.displaySet({ radialMenuRotationSpeed: Number(value) });
  }

  get multiAngleEnabled(): boolean {
    return this.displaySettings.multiAngleEnabled;
  }
  set multiAngleEnabled(value: boolean) {
    this.displaySet({ multiAngleEnabled: value });
  }

  get multiAngleResourceBuffEnabled(): boolean {
    return this.displaySettings.multiAngleResourceBuffEnabled;
  }
  set multiAngleResourceBuffEnabled(value: boolean) {
    this.displaySet({ multiAngleResourceBuffEnabled: value });
  }

  get multiAngleFontScale(): MultiAngleFontScale {
    return this.displaySettings.multiAngleFontScale;
  }
  set multiAngleFontScale(value: MultiAngleFontScale) {
    this.displaySet({ multiAngleFontScale: asMultiAngleFontScale(value) });
  }

  get multiAngleMotionMode(): MultiAngleMotionMode {
    return this.displaySettings.multiAngleMotionMode;
  }
  set multiAngleMotionMode(value: MultiAngleMotionMode) {
    const motionMode = asMultiAngleMotionMode(value);
    this.displaySet({
      multiAngleMotionMode: motionMode,
      multiAnglePieceRevolutionSeconds: motionMode === 'continuous' ? DEFAULT_MULTI_ANGLE_PIECE_REVOLUTION_SECONDS : 5,
    });
  }

  get multiAngleRevolutionSeconds(): number {
    return this.displaySettings.multiAngleRevolutionSeconds;
  }
  set multiAngleRevolutionSeconds(value: number) {
    this.displaySet({ multiAngleRevolutionSeconds: Number(value) });
  }

  get multiAnglePauseSeconds(): number {
    return this.displaySettings.multiAnglePauseSeconds;
  }
  set multiAnglePauseSeconds(value: number) {
    this.displaySet({ multiAnglePauseSeconds: Number(value) });
  }

  get multiAnglePieceRevolutionSeconds(): number {
    return this.displaySettings.multiAnglePieceRevolutionSeconds;
  }
  set multiAnglePieceRevolutionSeconds(value: number) {
    this.displaySet({ multiAnglePieceRevolutionSeconds: Number(value) });
  }

  /** The screen measurement and the lock describe this glass alone, and are never written down. */
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);
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

  private get config(): Config {
    return this.objectStore.get<Config>('Config') ?? Config.instance;
  }

  private get isEditable(): boolean {
    return !this.isReadOnly();
  }

  /**
   * What the rules come to as they stand, whoever it is that rules them.
   *
   * The panel shows the answer that is in force rather than only what the room has said,
   * so a rule still left to the table reads as the table has it and editing it here is
   * what hands it to the room.
   */
  private get rules(): RoomRules {
    this.objectChange.versionOf('Config')();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return resolveRoomRules(this.config.roomRuleAnswers, table);
  }

  /** Whether the room has taken the group over from the table. */
  answersFor(group: RoomRuleGroup): boolean {
    this.objectChange.versionOf('Config')();
    return isGroupAnswered(this.config.roomRuleAnswers, group);
  }

  /** A hex board has no corners to cut, so the question is only put on squares. */
  get showsDiagonalOption(): boolean {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return !isHexGrid(table?.gridType ?? 0);
  }

  get showsCellDistance(): boolean {
    return this.cellDistanceUnit !== 'cell';
  }

  /** A table where an enemy holds no ground is asked nothing about how much of it. */
  get showsZocOptions(): boolean {
    return this.zocMode !== 'none';
  }

  /** What it costs on top is a question only for a room that charges for the ground. */
  get showsZocExtraCost(): boolean {
    return this.zocMode === 'cost';
  }

  get turnOrderMode(): TurnOrderMode {
    this.objectChange.versionOf('Config')();
    return this.config.turnOrderMode;
  }
  set turnOrderMode(mode: TurnOrderMode) {
    if (this.isEditable) this.config.turnOrderMode = mode;
  }

  get takesRoundBySides(): boolean {
    return this.turnOrderMode === 'faction';
  }

  get factionPhaseMode(): FactionPhaseMode {
    this.objectChange.versionOf('Config')();
    return this.config.factionPhaseMode;
  }
  set factionPhaseMode(mode: FactionPhaseMode) {
    if (this.isEditable) this.config.factionPhaseMode = mode;
  }

  get factionSkipUnassigned(): boolean {
    this.objectChange.versionOf('Config')();
    return this.config.factionSkipUnassigned;
  }
  set factionSkipUnassigned(skips: boolean) {
    if (this.isEditable) this.config.factionSkipUnassigned = skips;
  }

  /** The sides in the order the round takes them, named and coloured as the parties are. */
  get factionOrder(): { side: string; name: string; color: string }[] {
    this.objectChange.versionOf('Config')();
    this.objectChange.collectionOf(Party.aliasName)();
    const parties = this.parties();
    return normalizeFactionOrder(this.config.factionOrder, parties, {
      skipUnassigned: this.config.factionSkipUnassigned,
    }).map((side) => ({ side, ...describeSide(side, parties, this.t('feature.turnOrder.unassignedSide')) }));
  }

  /** Moves one side up or down the order, which is the only time the order is written down. */
  moveSide(side: string, by: number): void {
    if (!this.isEditable) return;
    const order = this.factionOrder.map((entry) => entry.side);
    const from = order.indexOf(side);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    this.config.factionOrder = encodeFactionOrder(order);
  }

  get buffDecay(): boolean {
    this.objectChange.versionOf('TurnState')();
    return this.turnOrder.buffDecay;
  }
  set buffDecay(decays: boolean) {
    if (this.isEditable) this.turnOrder.setBuffDecay(decays);
  }

  private parties(): Party[] {
    return this.objectStore.getObjects<Party>(Party);
  }

  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  get defaultDiceBot(): string {
    this.objectChange.versionOf('Config')();
    return this.config.defaultDiceBot;
  }
  set defaultDiceBot(gameType: string) {
    if (this.isEditable) this.config.defaultDiceBot = gameType;
  }

  loadDiceBot(gameType: string): void {
    DiceBot.getHelpMessage(gameType).then(() => {});
  }

  get facingMark(): TableFacingMark {
    return asTableFacingMark(this.rules.facingMark);
  }
  set facingMark(value: TableFacingMark) {
    if (this.isEditable) this.config.facingMark = asTableFacingMark(value);
  }

  get moveRangeEnabled(): boolean {
    return this.rules.moveRangeEnabled;
  }
  set moveRangeEnabled(value: boolean) {
    if (this.isEditable) this.config.moveRangeEnabled = value;
  }

  get moveRangeAlways(): boolean {
    return this.rules.moveRangeAlways;
  }
  set moveRangeAlways(value: boolean) {
    if (this.isEditable) this.config.moveRangeAlways = value;
  }

  get moveDiagonally(): boolean {
    return this.rules.moveDiagonally;
  }
  set moveDiagonally(value: boolean) {
    if (this.isEditable) this.config.moveDiagonally = value;
  }

  get piecesShareCells(): boolean {
    return this.rules.piecesShareCells;
  }
  set piecesShareCells(value: boolean) {
    if (this.isEditable) this.config.piecesShareCells = value;
  }

  get moveStrict(): boolean {
    this.objectChange.versionOf('Config')();
    return this.config.moveStrict;
  }
  set moveStrict(value: boolean) {
    if (this.isEditable) this.config.moveStrict = value;
  }

  get moveStrictPath(): boolean {
    this.objectChange.versionOf('Config')();
    return this.config.moveStrictPath;
  }
  set moveStrictPath(value: boolean) {
    if (this.isEditable) this.config.moveStrictPath = value;
  }

  get moveRangeElementNames(): string {
    return this.rules.moveRangeElementNames;
  }
  set moveRangeElementNames(value: string) {
    if (this.isEditable) this.config.moveRangeElementNames = value;
  }

  get cellDistance(): number {
    return this.rules.cellDistance;
  }
  set cellDistance(value: number) {
    if (!this.isEditable) return;
    const distance = Number(value);
    this.config.cellDistance = Number.isFinite(distance) && distance > 0 ? distance : 0;
  }

  get cellDistanceUnit(): MoveUnit {
    return parseMoveUnit(this.rules.cellDistanceUnit) ?? DEFAULT_CELL_DISTANCE_UNIT;
  }
  set cellDistanceUnit(value: MoveUnit) {
    if (this.isEditable) this.config.cellDistanceUnit = value;
  }

  get zocMode(): ZocMode {
    return this.rules.zocMode;
  }
  set zocMode(value: ZocMode) {
    if (this.isEditable) this.config.zocMode = asZocMode(value);
  }

  get zocRange(): number {
    return this.rules.zocRange;
  }
  set zocRange(value: number) {
    if (this.isEditable) this.config.zocRange = wholeCells(value);
  }

  get zocAlways(): boolean {
    return this.rules.zocAlways;
  }
  set zocAlways(value: boolean) {
    if (this.isEditable) this.config.zocAlways = value;
  }

  get zocExtraCost(): number {
    return this.rules.zocExtraCost;
  }
  set zocExtraCost(value: number) {
    if (this.isEditable) this.config.zocExtraCost = wholeCells(value);
  }
}
