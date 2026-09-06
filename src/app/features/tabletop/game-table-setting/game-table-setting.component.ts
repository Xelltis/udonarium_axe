import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { emitSelectGameTable, triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  ambienceColorOf,
  ambienceDensityOf,
  type AmbienceKind,
  ambienceKindOf,
  ambiencePalette,
  DEFAULT_AMBIENCE_DENSITY,
  SKY_AMBIENCE_KINDS,
} from '@axe/domain/effect/ambience/ambience-kind';
import { CutIn } from '@axe/domain/media/cut-in';
import { encodeCutInIdentifiers, parseCutInIdentifiers } from '@axe/domain/media/table-cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  MAX_BACKGROUND_LAYER_SCALE,
  MAX_BACKGROUND_SCROLL_SPEED,
  MIN_BACKGROUND_LAYER_SCALE,
} from '@axe/domain/tabletop/background-scroll';
import { ensureFogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { asFogMode, DEFAULT_FOG_COLOR, FOG_MODES, FogMode } from '@axe/domain/tabletop/fog/fog-mode';
import { FilterType, GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import {
  asTableLayerPlacement,
  MAX_TABLE_BACKGROUND_LAYERS,
  moveBackgroundLayer as movedLayerRun,
  TABLE_LAYER_PLACEMENTS,
  TableBackgroundLayer,
  TableLayerPlacement,
} from '@axe/domain/tabletop/table-background-layer';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import {
  MapImageGridAdjusterComponent,
  MapImageGridAdjusterResult,
} from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-adjuster.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-table-setting',
  templateUrl: './game-table-setting.component.html',
  host: { class: 'block', '[attr.inert]': "isReadOnly() ? '' : null" },
  imports: [NgClass, FormsModule, NgSelectComponent, NgOptionComponent, SafePipe, TranslocoModule],
})
export class GameTableSettingComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });
  private readonly saveDataService = inject(SaveDataService);
  private readonly imageService = inject(ImageService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly cutInService = inject(CutInService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly roomPanels = inject(RoomPanelService);

  /** The room holds the rules of play and the dice bot it starts everyone on. */
  openRoomSettings(): void {
    this.roomPanels.open('roomSettings');
  }

  minSize: number = 1;
  maxSize: number = 100;

  get tableBackgroundImage(): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(this.selectedTable ? this.selectedTable.imageIdentifier : '');
  }

  get tableDistanceviewImage(): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(this.selectedTable ? this.selectedTable.backgroundImageIdentifier : '');
  }

  get tableName(): string {
    return this.selectedTable?.name ?? '';
  }
  set tableName(tableName: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.name = tableName;
  }

  get tableWidth(): number {
    return this.selectedTable?.width ?? 10;
  }
  set tableWidth(tableWidth: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.width = tableWidth;
  }

  get tableHeight(): number {
    return this.selectedTable?.height ?? 10;
  }
  set tableHeight(tableHeight: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.height = tableHeight;
  }

  get tableGridColor(): string {
    return this.selectedTable?.gridColor.substring(0, 7) ?? '#000000';
  }
  set tableGridColor(tableGridColor: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridColor = tableGridColor + 'e6';
  }

  get tableGridFontColor(): string {
    return this.selectedTable?.gridFontColor.substring(0, 7) ?? '#000000';
  }
  set tableGridFontColor(tableGridFontColor: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridFontColor = tableGridFontColor + 'e6';
  }

  get tableGridShow(): boolean {
    return this.selectedTable?.gridShow ?? false;
  }
  set tableGridShow(tableGridShow: boolean) {
    if (!this.selectedTable) return;
    this.selectedTable.gridShow = tableGridShow;
    if (tableGridShow) this.selectedTable.gridClipRect = null;
    triggerUpdateGameObject(this.selectedTable.toContext()); // 自分にだけイベントを発行してグリッド更新を誘発
  }

  get tableGridSnap(): boolean {
    return this.selectedTable?.gridSnap ?? true;
  }
  set tableGridSnap(tableGridSnap: boolean) {
    if (!this.selectedTable) return;
    this.selectedTable.gridSnap = tableGridSnap;
  }

  /**
   * The view this table is best read in, which a reader following the table is given.
   *
   * It recommends rather than decides: a reader who has picked a view of their own keeps it.
   */
  get tableRecommendedView(): 'perspective' | 'flat' {
    return this.selectedTable?.mode2d ? 'flat' : 'perspective';
  }
  set tableRecommendedView(value: 'perspective' | 'flat') {
    if (!this.selectedTable) return;
    this.selectedTable.mode2d = value === 'flat';
    triggerUpdateGameObject(this.selectedTable.toContext());
  }

  get tableDarknessEnabled(): boolean {
    return this.selectedTable?.darknessEnabled ?? false;
  }
  set tableDarknessEnabled(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.darknessEnabled = value;
  }

  get tableLightSnapToGrid(): boolean {
    return this.selectedTable?.lightSnapToGrid ?? false;
  }
  set tableLightSnapToGrid(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.lightSnapToGrid = value;
  }

  get tableDarknessLevelPercent(): number {
    return Math.round((this.selectedTable?.darknessLevel ?? 0) * 100);
  }
  set tableDarknessLevelPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.darknessLevel = Number(value) / 100;
  }

  get tableGlobalIlluminationPercent(): number {
    return Math.round((this.selectedTable?.globalIllumination ?? 0) * 100);
  }
  set tableGlobalIlluminationPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.globalIllumination = Number(value) / 100;
  }

  get tableAmbientColor(): string {
    return this.selectedTable?.ambientColor ?? '#05060a';
  }
  set tableAmbientColor(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.ambientColor = value;
  }

  get tableFogEnabled(): boolean {
    return this.selectedTable?.fogEnabled ?? false;
  }
  set tableFogEnabled(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.fogEnabled = value;
  }

  get tableFogMode(): FogMode {
    return asFogMode(this.selectedTable?.fogMode);
  }
  set tableFogMode(value: FogMode) {
    if (this.isEditable && this.selectedTable) this.selectedTable.fogMode = asFogMode(value);
  }

  get tableFogColor(): string {
    return this.selectedTable?.fogColor ?? DEFAULT_FOG_COLOR;
  }
  set tableFogColor(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.fogColor = value;
  }

  protected readonly fogModes = FOG_MODES;

  private readonly fogModeLabelKeys: Record<FogMode, string> = {
    easy: 'feature.tabletop.tableSetting.fogModeEasy',
    normal: 'feature.tabletop.tableSetting.fogModeNormal',
    hard: 'feature.tabletop.tableSetting.fogModeHard',
  };

  fogModeLabel(mode: FogMode): string {
    return this.t(this.fogModeLabelKeys[mode]);
  }

  resetFog(): void {
    const table = this.selectedTable;
    if (!this.isEditable || !table) return;
    ensureFogMemoryOn(table).reset();
  }

  protected readonly weatherKinds = SKY_AMBIENCE_KINDS;

  weatherKindLabel(kind: AmbienceKind): string {
    return this.t(`feature.ambience.kind.${kind}`);
  }

  get tableWeatherKind(): string {
    return this.selectedTable?.weatherKind ?? '';
  }
  set tableWeatherKind(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherKind = value;
  }

  get tableWeatherDensityPercent(): number {
    return Math.round(ambienceDensityOf(this.selectedTable?.weatherDensity ?? DEFAULT_AMBIENCE_DENSITY) * 100);
  }
  set tableWeatherDensityPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherDensity = Number(value) / 100;
  }

  get tableWeatherColor(): string {
    const table = this.selectedTable;
    if (!table) return ambiencePalette('fog').primary;
    return ambienceColorOf(ambienceKindOf(table.weatherKind), table.weatherColor);
  }
  set tableWeatherColor(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherColor = value;
  }

  get isWeatherDefaultColor(): boolean {
    return (this.selectedTable?.weatherColor ?? '').trim().length < 1;
  }

  resetWeatherColor(): void {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherColor = '';
  }

  get isGameMaster(): boolean {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  }

  get previewAsUserId(): string {
    return this.visionService.previewAsUserId() ?? '';
  }
  set previewAsUserId(value: string) {
    this.visionService.previewAsUserId.set(value ? value : null);
  }

  getNonGmCursors(): PeerCursor[] {
    this.objectChange.collectionOf('PeerCursor')();
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).filter((cursor) => !cursor.isGameMaster);
  }

  minWallHeight: number = 1;
  maxWallHeight: number = 20;

  readonly wallFields = [
    {
      key: 'north',
      label: 'feature.tabletop.tableSetting.imageNorthWall',
      alt: 'feature.tabletop.tableSetting.imageNorthWallAlt',
      add: 'feature.tabletop.tableSetting.addImageNorthWall',
      image: () => this.tableNorthWallImage,
      show: () => this.tableShowNorthWall,
      setShow: (value: boolean) => (this.tableShowNorthWall = value),
      open: () => this.openNorthWallImageModal(),
    },
    {
      key: 'east',
      label: 'feature.tabletop.tableSetting.imageEastWall',
      alt: 'feature.tabletop.tableSetting.imageEastWallAlt',
      add: 'feature.tabletop.tableSetting.addImageEastWall',
      image: () => this.tableEastWallImage,
      show: () => this.tableShowEastWall,
      setShow: (value: boolean) => (this.tableShowEastWall = value),
      open: () => this.openEastWallImageModal(),
    },
    {
      key: 'south',
      label: 'feature.tabletop.tableSetting.imageSouthWall',
      alt: 'feature.tabletop.tableSetting.imageSouthWallAlt',
      add: 'feature.tabletop.tableSetting.addImageSouthWall',
      image: () => this.tableSouthWallImage,
      show: () => this.tableShowSouthWall,
      setShow: (value: boolean) => (this.tableShowSouthWall = value),
      open: () => this.openSouthWallImageModal(),
    },
    {
      key: 'west',
      label: 'feature.tabletop.tableSetting.imageWestWall',
      alt: 'feature.tabletop.tableSetting.imageWestWallAlt',
      add: 'feature.tabletop.tableSetting.addImageWestWall',
      image: () => this.tableWestWallImage,
      show: () => this.tableShowWestWall,
      setShow: (value: boolean) => (this.tableShowWestWall = value),
      open: () => this.openWestWallImageModal(),
    },
  ];

  get tableWallHeight(): number {
    return this.selectedTable?.wallHeight ?? 10;
  }
  set tableWallHeight(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.wallHeight = Number(value);
  }

  private wallImage(identifier: string | undefined): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(identifier ?? '');
  }

  get tableNorthWallImage(): ImageFile {
    return this.wallImage(this.selectedTable?.northWallImageIdentifier);
  }
  get tableEastWallImage(): ImageFile {
    return this.wallImage(this.selectedTable?.eastWallImageIdentifier);
  }
  get tableSouthWallImage(): ImageFile {
    return this.wallImage(this.selectedTable?.southWallImageIdentifier);
  }
  get tableWestWallImage(): ImageFile {
    return this.wallImage(this.selectedTable?.westWallImageIdentifier);
  }

  get tableShowNorthWall(): boolean {
    return this.selectedTable?.showNorthWall ?? false;
  }
  set tableShowNorthWall(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.showNorthWall = value;
  }
  get tableShowEastWall(): boolean {
    return this.selectedTable?.showEastWall ?? false;
  }
  set tableShowEastWall(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.showEastWall = value;
  }
  get tableShowSouthWall(): boolean {
    return this.selectedTable?.showSouthWall ?? false;
  }
  set tableShowSouthWall(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.showSouthWall = value;
  }
  get tableShowWestWall(): boolean {
    return this.selectedTable?.showWestWall ?? false;
  }
  set tableShowWestWall(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.showWestWall = value;
  }

  get tableGridSnapStyle(): GridSnapStyle {
    return this.selectedTable?.gridSnapStyle ?? GridSnapStyle.CENTER;
  }
  set tableGridSnapStyle(snapStyle: GridSnapStyle) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridSnapStyle = Number(snapStyle);
  }

  get tableSnapMode(): string {
    if (!this.tableGridSnap) return 'off';
    switch (this.tableGridSnapStyle) {
      case GridSnapStyle.VERTEX:
        return 'vertex';
      case GridSnapStyle.BOTH:
        return 'both';
      case GridSnapStyle.ALL:
        return 'all';
      default:
        return 'center';
    }
  }
  set tableSnapMode(mode: string) {
    if (!this.selectedTable) return;
    if (mode === 'off') {
      this.selectedTable.gridSnap = false;
    } else {
      this.selectedTable.gridSnap = true;
      this.selectedTable.gridSnapStyle =
        mode === 'vertex'
          ? GridSnapStyle.VERTEX
          : mode === 'both'
            ? GridSnapStyle.BOTH
            : mode === 'all'
              ? GridSnapStyle.ALL
              : GridSnapStyle.CENTER;
    }
  }

  get tableGridType(): GridType {
    return this.selectedTable?.gridType ?? 0;
  }
  set tableGridType(gridType: GridType) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridType = Number(gridType);
  }

  get tableDistanceviewFilter(): FilterType {
    return this.selectedTable?.backgroundFilterType ?? FilterType.NONE;
  }
  set tableDistanceviewFilter(filterType: FilterType) {
    if (this.isEditable && this.selectedTable) this.selectedTable.backgroundFilterType = filterType;
  }

  selectedTable: GameTable | null = null;
  selectedTableXml: string = '';

  get isEmpty(): boolean {
    return this.tableSelecter ? (this.tableSelecter.viewTable ? false : true) : true;
  }
  get isDeleted(): boolean {
    this.objectChange.collectionOf('game-table')();
    if (!this.selectedTable) return true;
    return this.objectStore.get<GameTable>(this.selectedTable.identifier) == null;
  }
  get isEditable(): boolean {
    return !this.isEmpty && !this.isDeleted;
  }

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.tabletop.tableSetting.title'))
    );
    this.selectedTable = this.tableSelecter.viewTable;
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (!this.selectedTable || e.identifier !== this.selectedTable.identifier) return;
      const object = this.objectStore.get(e.identifier);
      if (object !== null) {
        this.selectedTableXml = object.toXml();
      }
    }, this.destroyRef);
  }

  /**
   * Chosen from the list, which is the one moment a cut-in belongs.
   * Creating, restoring and loading a room go through selectGameTable() and stay quiet.
   */
  chooseGameTable(identifier: string): void {
    const wasShowing = this.tableSelecter.viewTableIdentifier;
    this.selectGameTable(identifier);
    if (identifier === wasShowing) return;

    const table = this.objectStore.get<GameTable>(identifier);
    if (table) this.cutInService.launchForTable(table);
  }

  selectGameTable(identifier: string) {
    emitSelectGameTable({ identifier });
    this.selectedTable = this.objectStore.get<GameTable>(identifier);
    this.selectedTableXml = '';
  }

  getCutIns(): CutIn[] {
    this.objectChange.collectionOf(CutIn.aliasName)();
    return this.objectStore.getObjects(CutIn);
  }

  private cutInIdentifiersRaw = '';
  private cutInIdentifiers: string[] = [];

  get tableCutIns(): string[] {
    const raw = this.selectedTable?.cutInIdentifiers ?? '';
    if (raw !== this.cutInIdentifiersRaw) {
      this.cutInIdentifiersRaw = raw;
      this.cutInIdentifiers = parseCutInIdentifiers(raw);
    }
    return this.cutInIdentifiers;
  }
  set tableCutIns(identifiers: string[]) {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.cutInIdentifiers = encodeCutInIdentifiers(identifiers ?? []);
  }

  getGameTables(): GameTable[] {
    return this.objectStore.getObjects(GameTable);
  }

  createGameTable() {
    if (!this.rolePermission.canEditTabletop) return;
    const gameTable = new GameTable();
    gameTable.name = this.t('feature.tabletop.tableSetting.defaultName');
    gameTable.imageIdentifier = ImageFile.Empty.identifier;
    gameTable.gridShow = true;
    gameTable.initialize();
    this.selectGameTable(gameTable.identifier);
  }

  async save() {
    if (!this.selectedTable || this.isSaving()) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);

    this.selectedTable.selected = true;
    await this.saveDataService.saveGameObjectAsync(this.selectedTable, 'map_' + this.selectedTable.name, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }

  delete() {
    if (!this.rolePermission.canEditTabletop) return;
    if (!this.isEmpty && this.selectedTable) {
      this.selectedTableXml = this.selectedTable.toXml();
      this.selectedTable.destroy();
    }
  }

  restore() {
    if (!this.rolePermission.canEditTabletop) return;
    if (this.selectedTable && this.selectedTableXml) {
      const restoreTable = this.objectSerializer.parseXml(this.selectedTableXml)!;
      this.selectGameTable(restoreTable.identifier);
      this.selectedTableXml = '';
    }
  }

  readonly maxBackgroundScrollSpeed = MAX_BACKGROUND_SCROLL_SPEED;
  readonly minBackgroundLayerScale = MIN_BACKGROUND_LAYER_SCALE;
  readonly maxBackgroundLayerScale = MAX_BACKGROUND_LAYER_SCALE;
  readonly tableLayerPlacements = TABLE_LAYER_PLACEMENTS;

  /** The layers grouped the way they are drawn: everything under the board, then everything over. */
  get backgroundLayers(): TableBackgroundLayer[] {
    this.objectChange.versionOf(this.selectedTable?.identifier ?? '')();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    const laid = this.selectedTable?.backgroundLayers ?? [];
    return [...laid.filter((layer) => !layer.placedOver), ...laid.filter((layer) => layer.placedOver)];
  }

  /** The run one layer belongs to, which is what moving it up and down happens within. */
  private backgroundLayerRun(layer: TableBackgroundLayer): TableBackgroundLayer[] {
    return this.backgroundLayers.filter((laid) => laid.placedOver === layer.placedOver);
  }

  /** Its place in that run, counted from one, which is what the heading says. */
  backgroundLayerNumber(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return this.backgroundLayerRun(layer).indexOf(layer) + 1;
  }

  canMoveBackgroundLayer(layer: TableBackgroundLayer, offset: number): boolean {
    if (!this.isEditable) return false;
    const run = this.backgroundLayerRun(layer);
    const to = run.indexOf(layer) + offset;
    return 0 <= to && to < run.length;
  }

  /**
   * Moves one layer a step through its run.
   *
   * The whole run is numbered again afterwards, so an order never drifts into a gap and the two
   * runs stay tidy however often they are shuffled.
   */
  moveBackgroundLayer(layer: TableBackgroundLayer, offset: number): void {
    if (!this.isEditable) return;
    const run = this.backgroundLayerRun(layer);
    const moved = movedLayerRun(run, run.indexOf(layer), offset);
    moved.forEach((laid, order) => {
      if (laid.order === order) return;
      laid.order = order;
      laid.update();
    });
  }

  get canAddBackgroundLayer(): boolean {
    return this.isEditable && this.backgroundLayers.length < MAX_TABLE_BACKGROUND_LAYERS;
  }

  /** A new layer goes in front of the ones already laid, which is where the eye expects it. */
  addBackgroundLayer(): void {
    if (!this.canAddBackgroundLayer || !this.selectedTable) return;
    const layer = new TableBackgroundLayer();
    layer.initialize();
    layer.order = this.backgroundLayers.reduce((highest, laid) => Math.max(highest, laid.order + 1), 0);
    this.selectedTable.appendChild(layer);
  }

  removeBackgroundLayer(layer: TableBackgroundLayer): void {
    if (!this.isEditable) return;
    layer.destroy();
  }

  openBackgroundLayerImage(layer: TableBackgroundLayer): void {
    if (!this.isEditable) return;
    void this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!value) return;
      layer.imageIdentifier = value;
      layer.update();
    });
  }

  backgroundLayerImage(layer: TableBackgroundLayer): ImageFile {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(layer.identifier)();
    return this.imageService.getEmptyOr(layer.imageIdentifier);
  }

  backgroundLayerEnabled(layer: TableBackgroundLayer): boolean {
    this.objectChange.versionOf(layer.identifier)();
    return layer.enabled;
  }
  setBackgroundLayerEnabled(layer: TableBackgroundLayer, value: boolean): void {
    this.writeBackgroundLayer(layer, () => (layer.enabled = value));
  }

  backgroundLayerSpeedX(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.speedX;
  }
  setBackgroundLayerSpeedX(layer: TableBackgroundLayer, value: number): void {
    this.writeBackgroundLayer(layer, () => (layer.speedX = clampScrollSpeed(value)));
  }

  backgroundLayerSpeedY(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.speedY;
  }
  setBackgroundLayerSpeedY(layer: TableBackgroundLayer, value: number): void {
    this.writeBackgroundLayer(layer, () => (layer.speedY = clampScrollSpeed(value)));
  }

  backgroundLayerOpacityPercent(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return Math.round(layer.opacity * 100);
  }
  setBackgroundLayerOpacityPercent(layer: TableBackgroundLayer, value: number): void {
    const percent = Number(value);
    const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 100;
    this.writeBackgroundLayer(layer, () => (layer.opacity = clamped / 100));
  }

  backgroundLayerScale(layer: TableBackgroundLayer): number {
    this.objectChange.versionOf(layer.identifier)();
    return layer.scale;
  }
  setBackgroundLayerScale(layer: TableBackgroundLayer, value: number): void {
    const scale = Number(value);
    const clamped = Number.isFinite(scale)
      ? Math.min(MAX_BACKGROUND_LAYER_SCALE, Math.max(MIN_BACKGROUND_LAYER_SCALE, scale))
      : 1;
    this.writeBackgroundLayer(layer, () => (layer.scale = clamped));
  }

  /** Writing is announced, so the board redraws without waiting for something else to happen. */
  backgroundLayerPlacement(layer: TableBackgroundLayer): TableLayerPlacement {
    this.objectChange.versionOf(layer.identifier)();
    return asTableLayerPlacement(layer.placement);
  }
  /** Changing sides puts it at the front of the run it lands in, where the eye expects it. */
  setBackgroundLayerPlacement(layer: TableBackgroundLayer, value: TableLayerPlacement): void {
    if (asTableLayerPlacement(layer.placement) === value) return;
    this.writeBackgroundLayer(layer, () => {
      layer.placement = value;
      layer.order = this.backgroundLayers.reduce((highest, laid) => Math.max(highest, laid.order + 1), 0);
    });
  }

  private writeBackgroundLayer(layer: TableBackgroundLayer, write: () => void): void {
    if (!this.isEditable) return;
    write();
    layer.update();
  }

  openBgImageModal() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable.imageIdentifier = value;
    });
  }

  openBgImageGridAdjust() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((imageIdentifier) => {
      if (!this.selectedTable || !imageIdentifier) return;
      const gridSize = this.selectedTable.gridSize;
      const gridColor = this.selectedTable.gridColor;
      this.modalService
        .open<MapImageGridAdjusterResult | null>(MapImageGridAdjusterComponent, {
          imageIdentifier,
          gridSize,
          gridColor,
          fitWidth: true,
          gridType: this.selectedTable.gridType,
        })
        .then((res) => {
          const table = this.selectedTable;
          if (!table || !res) return;
          table.imageIdentifier = res.imageIdentifier;
          table.width = res.width;
          table.height = res.height;
          table.gridType = res.gridType;
        });
    });
  }

  openDistanceViewImageModal() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable.backgroundImageIdentifier = value;
    });
  }

  private openWallImageModal(apply: (table: GameTable, value: string) => void) {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      apply(this.selectedTable, value);
    });
  }
  openNorthWallImageModal() {
    this.openWallImageModal((t, v) => (t.northWallImageIdentifier = v));
  }
  openEastWallImageModal() {
    this.openWallImageModal((t, v) => (t.eastWallImageIdentifier = v));
  }
  openSouthWallImageModal() {
    this.openWallImageModal((t, v) => (t.southWallImageIdentifier = v));
  }
  openWestWallImageModal() {
    this.openWallImageModal((t, v) => (t.westWallImageIdentifier = v));
  }

  onSelectGameTable(event: Event): void {
    this.chooseGameTable((event.target as HTMLInputElement).value);
  }
}

/** Held to a pace the eye can follow, whatever the box was typed into. */
function clampScrollSpeed(value: number): number {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return 0;
  return Math.min(MAX_BACKGROUND_SCROLL_SPEED, Math.max(-MAX_BACKGROUND_SCROLL_SPEED, speed));
}
