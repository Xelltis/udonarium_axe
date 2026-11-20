import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SaveProgress } from '@axe/application/file/save-progress';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameTableService } from '@axe/application/tabletop/game-table.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GUEST_PERSONA, VisionService } from '@axe/application/tabletop/vision.service';
import { ForegroundSeeThroughService } from '@axe/application/ui/foreground-see-through.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { emitSelectGameTable, triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameList } from '@axe/core/util/same-list';
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
import { soundFileName } from '@axe/domain/media/preset-sound-labels';
import { tableBgmModeOf } from '@axe/domain/media/table-bgm';
import { encodeCutInIdentifiers, parseCutInIdentifiers } from '@axe/domain/media/table-cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ensureFogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { asFogMode, DEFAULT_FOG_COLOR, FOG_MODES, FogMode } from '@axe/domain/tabletop/fog/fog-mode';
import { FilterType, GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { copyGameTable, freeTableName } from '@axe/domain/tabletop/game-table-copy';
import { MAX_SQUARE_SPAN, squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { MAX_CELL_PX, MIN_CELL_PX } from '@axe/domain/tabletop/rescale-table-contents';
import {
  foregroundFitOf,
  foregroundOpacityOf,
  TABLE_FOREGROUND_FITS,
  type TableForegroundFit,
  tableForegroundOf,
} from '@axe/domain/tabletop/table-foreground';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TABLE_SKY_KINDS, type TableSkyKind, tableSkyKindOf } from '@axe/domain/tabletop/table-sky';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TableBackgroundLayersComponent } from '@axe/features/tabletop/game-table-setting/table-background-layers.component';
import {
  MapImageGridAdjusterComponent,
  MapImageGridAdjusterResult,
} from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-adjuster.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { UiImagePickerTileComponent } from '@axe/ui/components/image-picker-tile/image-picker-tile.component';
import { UiRangeNumberFieldComponent } from '@axe/ui/components/range-number-field/range-number-field.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

type WallSide = 'north' | 'east' | 'south' | 'west';

/** One wall of a table: the names of what it is called in the panel and of what the table keeps for it. */
interface WallField {
  key: WallSide;
  label: string;
  alt: string;
  add: string;
  image: `${WallSide}WallImageIdentifier`;
  show: `show${Capitalize<WallSide>}Wall`;
}

const WALLS: readonly WallField[] = [
  {
    key: 'north',
    label: 'feature.tabletop.tableSetting.imageNorthWall',
    alt: 'feature.tabletop.tableSetting.imageNorthWallAlt',
    add: 'feature.tabletop.tableSetting.addImageNorthWall',
    image: 'northWallImageIdentifier',
    show: 'showNorthWall',
  },
  {
    key: 'east',
    label: 'feature.tabletop.tableSetting.imageEastWall',
    alt: 'feature.tabletop.tableSetting.imageEastWallAlt',
    add: 'feature.tabletop.tableSetting.addImageEastWall',
    image: 'eastWallImageIdentifier',
    show: 'showEastWall',
  },
  {
    key: 'south',
    label: 'feature.tabletop.tableSetting.imageSouthWall',
    alt: 'feature.tabletop.tableSetting.imageSouthWallAlt',
    add: 'feature.tabletop.tableSetting.addImageSouthWall',
    image: 'southWallImageIdentifier',
    show: 'showSouthWall',
  },
  {
    key: 'west',
    label: 'feature.tabletop.tableSetting.imageWestWall',
    alt: 'feature.tabletop.tableSetting.imageWestWallAlt',
    add: 'feature.tabletop.tableSetting.addImageWestWall',
    image: 'westWallImageIdentifier',
    show: 'showWestWall',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-table-setting',
  templateUrl: './game-table-setting.component.html',
  host: { class: 'block', '[attr.inert]': "isReadOnly() ? '' : null" },
  imports: [
    TextTooltipDirective,
    NgClass,
    FormsModule,
    NgSelectComponent,
    NgOptionComponent,
    NgSelectWindowDirective,
    TableBackgroundLayersComponent,
    UiImagePickerTileComponent,
    UiRangeNumberFieldComponent,
    TranslocoModule,
  ],
})
export class GameTableSettingComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());
  /** Whether this reader may see through the picture in front, which only the game master does. */
  readonly canSeeHidden = computed(() => this.rolePermission.canSeeHidden());
  protected readonly foregroundSeeThrough = inject(ForegroundSeeThroughService);
  protected readonly foregroundFits = TABLE_FOREGROUND_FITS;
  private readonly saveDataService = inject(SaveDataService);
  private readonly imageService = inject(ImageService);
  private readonly panelService = inject(PanelService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tables = inject(GameTableService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private get tableSelecter(): TableSelecter {
    return TableSelecter.instance;
  }
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly cutInService = inject(CutInService);
  private readonly tableBgm = inject(TableBgmService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly destroyRef = inject(DestroyRef);
  private readonly roomPanels = inject(RoomPanelService);

  /** The room holds the rules of play and the dice bot it starts everyone on. */
  openRoomSettings(): void {
    this.roomPanels.open('roomSettings');
  }

  minSize: number = 1;
  maxSize: number = 100;
  readonly minCellSize = MIN_CELL_PX;
  readonly maxCellSize = MAX_CELL_PX;

  /** The picked table's floor image, or the empty image when it has none. */
  get tableBackgroundImage(): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(this.selectedTable ? this.selectedTable.imageIdentifier : '');
  }

  /** The picked table's distant-view background image, or the empty image when it has none. */
  get tableDistanceviewImage(): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(this.selectedTable ? this.selectedTable.backgroundImageIdentifier : '');
  }

  /** The picture the picked table lays in front of everything, or the empty image when it lays none. */
  get tableForegroundImage(): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    const foreground = this.selectedTable ? tableForegroundOf(this.selectedTable) : null;
    return this.imageService.getEmptyOr(foreground?.imageIdentifier ?? '');
  }

  /** How opaque the picture in front is, in percent; writes are ignored while the table cannot be edited. */
  get tableForegroundOpacity(): number {
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return Math.round(foregroundOpacityOf(this.selectedTable?.foregroundOpacity) * 100);
  }
  set tableForegroundOpacity(percent: number) {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.foregroundOpacity = foregroundOpacityOf(Number(percent) / 100);
  }

  /** How the picture in front is fitted; writes are ignored while the table cannot be edited. */
  get tableForegroundFit(): TableForegroundFit {
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return foregroundFitOf(this.selectedTable?.foregroundFit);
  }
  set tableForegroundFit(fit: TableForegroundFit) {
    if (this.isEditable && this.selectedTable) this.selectedTable.foregroundFit = foregroundFitOf(fit);
  }

  /** The picked table's name; writes are ignored while the table cannot be edited. */
  get tableName(): string {
    return this.selectedTable?.name ?? '';
  }
  set tableName(tableName: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.name = tableName;
  }

  /** The picked table's width in grid cells; 10 when no table is picked. */
  get tableWidth(): number {
    return this.selectedTable?.width ?? 10;
  }
  set tableWidth(tableWidth: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.width = tableWidth;
  }

  /** The size of a cell of the picked table, in px; the default cell when no table is picked. */
  get tableCellSize(): number {
    return Number(this.selectedTable?.gridSize ?? 50);
  }

  /**
   * Gives the picked table the cell size a field was left at, moving what is on it to keep to its
   * cells. Taken once the slider is let go or the number is entered rather than at every step, as
   * each change scales the pieces by the change. The field is then shown the size the table took.
   */
  commitTableCellSize(event: Event): void {
    const field = event.target as HTMLInputElement;
    if (this.isEditable && this.selectedTable) {
      this.tabletopService.changeCellSize(this.selectedTable, field.valueAsNumber);
    }
    field.value = String(this.tableCellSize);
  }

  /** The picked table's height in grid cells; 10 when no table is picked. */
  get tableHeight(): number {
    return this.selectedTable?.height ?? 10;
  }
  set tableHeight(tableHeight: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.height = tableHeight;
  }

  /**
   * The picked table's grid line colour as #rrggbb, written back with a fixed, slightly transparent
   * alpha.
   */
  get tableGridColor(): string {
    return this.selectedTable?.gridColor.substring(0, 7) ?? '#000000';
  }
  set tableGridColor(tableGridColor: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridColor = tableGridColor + 'e6';
  }

  /**
   * The colour of the picked table's grid label text as #rrggbb, written back with the grid's fixed
   * alpha.
   */
  get tableGridFontColor(): string {
    return this.selectedTable?.gridFontColor.substring(0, 7) ?? '#000000';
  }
  set tableGridFontColor(tableGridFontColor: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridFontColor = tableGridFontColor + 'e6';
  }

  /**
   * Whether the picked table shows its grid. Every change raises an update for this peer alone, so
   * the grid redraws at once; writes are ignored while the table cannot be edited.
   */
  get tableGridShow(): boolean {
    return this.selectedTable?.gridShow ?? false;
  }
  set tableGridShow(tableGridShow: boolean) {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.gridShow = tableGridShow;
    triggerUpdateGameObject(this.selectedTable.toContext());
  }

  /**
   * Whether pieces snap to the picked table's grid; true when no table is picked. Writes are ignored
   * while the table cannot be edited.
   */
  get tableGridSnap(): boolean {
    return this.selectedTable?.gridSnap ?? true;
  }
  set tableGridSnap(tableGridSnap: boolean) {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.gridSnap = tableGridSnap;
  }

  /**
   * The view this table is best read in, which a reader following the table is given.
   *
   * It recommends rather than decides: a reader who has picked a view of their own keeps it. Writes
   * are ignored while the table cannot be edited.
   */
  get tableRecommendedView(): 'perspective' | 'flat' {
    return this.selectedTable?.mode2d ? 'flat' : 'perspective';
  }
  set tableRecommendedView(value: 'perspective' | 'flat') {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.mode2d = value === 'flat';
    triggerUpdateGameObject(this.selectedTable.toContext());
  }

  /** Whether the picked table is dark, so only what is lit shows. */
  get tableDarknessEnabled(): boolean {
    return this.selectedTable?.darknessEnabled ?? false;
  }
  set tableDarknessEnabled(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.darknessEnabled = value;
  }

  /** Whether lights on the picked table snap to its grid. */
  get tableLightSnapToGrid(): boolean {
    return this.selectedTable?.lightSnapToGrid ?? false;
  }
  set tableLightSnapToGrid(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.lightSnapToGrid = value;
  }

  /** Whether a compass wanders on the picked table rather than finding north. */
  get tableMagneticAnomaly(): boolean {
    return this.selectedTable?.magneticAnomaly ?? false;
  }
  set tableMagneticAnomaly(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.magneticAnomaly = value;
  }

  /** How dark the picked table is, as a percentage. */
  get tableDarknessLevelPercent(): number {
    return Math.round((this.selectedTable?.darknessLevel ?? 0) * 100);
  }
  set tableDarknessLevelPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.darknessLevel = Number(value) / 100;
  }

  /** How much light reaches everywhere on the picked table regardless of lights, as a percentage. */
  get tableGlobalIlluminationPercent(): number {
    return Math.round((this.selectedTable?.globalIllumination ?? 0) * 100);
  }
  set tableGlobalIlluminationPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.globalIllumination = Number(value) / 100;
  }

  /**
   * The colour the picked table's darkness is painted in. The shadows pieces cast in the light and
   * the tops of buildings, which stand above the darkness sheet, are painted in it too.
   */
  get tableAmbientColor(): string {
    return this.selectedTable?.ambientColor ?? '#05060a';
  }
  set tableAmbientColor(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.ambientColor = value;
  }

  /** Whether fog of war covers the picked table. */
  get tableFogEnabled(): boolean {
    return this.selectedTable?.fogEnabled ?? false;
  }
  set tableFogEnabled(value: boolean) {
    if (this.isEditable && this.selectedTable) this.selectedTable.fogEnabled = value;
  }

  /** How strict the picked table's fog of war is: easy, normal or hard. */
  get tableFogMode(): FogMode {
    return asFogMode(this.selectedTable?.fogMode);
  }
  set tableFogMode(value: FogMode) {
    if (this.isEditable && this.selectedTable) this.selectedTable.fogMode = asFogMode(value);
  }

  /** The colour of the picked table's fog of war. */
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

  /** The translated name of a fog mode, for the mode dropdown. */
  fogModeLabel(mode: FogMode): string {
    return this.t(this.fogModeLabelKeys[mode]);
  }

  /**
   * Clears what the picked table's fog of war remembers as explored; does nothing while the table
   * cannot be edited.
   */
  resetFog(): void {
    const table = this.selectedTable;
    if (!this.isEditable || !table) return;
    ensureFogMemoryOn(table).reset();
  }

  protected readonly weatherKinds = SKY_AMBIENCE_KINDS;

  /** The translated name of a weather kind, for the weather dropdown. */
  weatherKindLabel(kind: AmbienceKind): string {
    return this.t(`feature.ambience.kind.${kind}`);
  }

  protected readonly skyKinds = TABLE_SKY_KINDS;

  /** What the picked table shows past its board: empty for its background picture. */
  get tableSkyKind(): TableSkyKind {
    return tableSkyKindOf(this.selectedTable?.skyKind);
  }
  set tableSkyKind(value: TableSkyKind) {
    if (this.isEditable && this.selectedTable) this.selectedTable.skyKind = value;
  }

  /** The weather shown over the picked table; empty for none. */
  get tableWeatherKind(): string {
    return this.selectedTable?.weatherKind ?? '';
  }
  set tableWeatherKind(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherKind = value;
  }

  /** How thick the picked table's weather is, as a percentage. */
  get tableWeatherDensityPercent(): number {
    return Math.round(ambienceDensityOf(this.selectedTable?.weatherDensity ?? DEFAULT_AMBIENCE_DENSITY) * 100);
  }
  set tableWeatherDensityPercent(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherDensity = Number(value) / 100;
  }

  /** The picked table's weather colour, falling back to the weather kind's own colour when none is set. */
  get tableWeatherColor(): string {
    const table = this.selectedTable;
    if (!table) return ambiencePalette('fog').primary;
    return ambienceColorOf(ambienceKindOf(table.weatherKind), table.weatherColor);
  }
  set tableWeatherColor(value: string) {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherColor = value;
  }

  /** Whether the picked table's weather uses its kind's own colour, which disables the reset button. */
  get isWeatherDefaultColor(): boolean {
    return (this.selectedTable?.weatherColor ?? '').trim().length < 1;
  }

  /** Hands the picked table's weather back to its kind's own colour. */
  resetWeatherColor(): void {
    if (this.isEditable && this.selectedTable) this.selectedTable.weatherColor = '';
  }

  /**
   * Whether the reader is the game master, who alone is offered a preview of the table through a
   * player's eyes.
   */
  get isGameMaster(): boolean {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  }

  /**
   * The player whose view of the table this screen previews; empty for the reader's own view. It is
   * not shared with the room.
   */
  get previewAsUserId(): string {
    return this.visionService.previewAsUserId() ?? '';
  }
  set previewAsUserId(value: string) {
    this.visionService.previewAsUserId.set(value ? value : null);
  }

  /**
   * The players in the room, offered as views to preview.
   *
   * Guests are left out: every one of them sees the same, and the guest preview stands for them all.
   */
  getPreviewPlayers(): PeerCursor[] {
    this.objectChange.collectionOf('PeerCursor')();
    return this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => !cursor.isGameMaster && !cursor.isGuest);
  }

  /** The preview that looks as a guest would, offered whether or not one is connected. */
  readonly guestPersona = GUEST_PERSONA;

  minWallHeight: number = 1;
  maxWallHeight: number = 20;

  /** The four walls of a table, each with the picture and the box that shows it. */
  readonly wallFields = WALLS;

  /** How tall the picked table's walls stand; 10 when no table is picked. */
  get tableWallHeight(): number {
    return this.selectedTable?.wallHeight ?? 10;
  }
  set tableWallHeight(value: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.wallHeight = Number(value);
  }

  /** The picture on one wall of the picked table, or the empty image. */
  wallImage(wall: WallField): ImageFile {
    this.objectChange.fileVersion();
    if (this.selectedTable) this.objectChange.versionOf(this.selectedTable.identifier)();
    return this.imageService.getEmptyOr(this.selectedTable?.[wall.image] ?? '');
  }

  /** Whether one wall of the picked table is shown. */
  wallShown(wall: WallField): boolean {
    return this.selectedTable?.[wall.show] ?? false;
  }

  /** Shows or hides one wall of the picked table; ignored while the table cannot be edited. */
  setWallShown(wall: WallField, value: boolean): void {
    if (this.isEditable && this.selectedTable) this.selectedTable[wall.show] = value;
  }

  /**
   * Opens the image picker and sets the chosen picture on one wall of the picked table; does
   * nothing once the table is deleted.
   */
  openWallImage(wall: WallField): void {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable[wall.image] = value;
    });
  }

  /** Which grid points pieces on the picked table snap to. */
  get tableGridSnapStyle(): GridSnapStyle {
    return this.selectedTable?.gridSnapStyle ?? GridSnapStyle.CENTER;
  }
  set tableGridSnapStyle(snapStyle: GridSnapStyle) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridSnapStyle = Number(snapStyle);
  }

  /**
   * The snap dropdown's value, combining whether snapping is on with the points it snaps to: off,
   * center, vertex, both, all or grid. Writes are ignored while the table cannot be edited.
   */
  get tableSnapMode(): string {
    if (!this.tableGridSnap) return 'off';
    switch (Number(this.tableGridSnapStyle)) {
      case GridSnapStyle.VERTEX:
        return 'vertex';
      case GridSnapStyle.BOTH:
        return 'both';
      case GridSnapStyle.ALL:
        return 'all';
      case GridSnapStyle.GRID:
        return 'grid';
      default:
        return 'center';
    }
  }
  set tableSnapMode(mode: string) {
    if (!this.isEditable || !this.selectedTable) return;
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
              : mode === 'grid'
                ? GridSnapStyle.GRID
                : GridSnapStyle.CENTER;
    }
  }

  /** Whether the picked table's grid is square or one of the hex layouts. */
  get tableGridType(): GridType {
    return this.selectedTable?.gridType ?? 0;
  }
  set tableGridType(gridType: GridType) {
    if (this.isEditable && this.selectedTable) this.selectedTable.gridType = Number(gridType);
  }

  /** How many cells across a square may be made of, for the picked table's moves and ranges. */
  readonly squareSpans = Array.from({ length: MAX_SQUARE_SPAN }, (_, index) => index + 1);

  /** Whether the picked table has a square grid, the one grid whose cells can be put into squares. */
  get isSquareGridTable(): boolean {
    return Number(this.tableGridType) === GridType.SQUARE;
  }

  /** How many cells across one square of the picked table is; writes are ignored while it cannot be edited. */
  get tableSquareSpan(): number {
    return this.selectedTable ? squareSpanOf(this.selectedTable) : 1;
  }
  set tableSquareSpan(span: number) {
    if (this.isEditable && this.selectedTable) this.selectedTable.squareSpan = Number(span);
  }

  /** The filter drawn over the picked table's distant-view background. */
  get tableDistanceviewFilter(): FilterType {
    return this.selectedTable?.backgroundFilterType ?? FilterType.NONE;
  }
  set tableDistanceviewFilter(filterType: FilterType) {
    if (this.isEditable && this.selectedTable) this.selectedTable.backgroundFilterType = filterType;
  }

  private readonly picked = signal<GameTable | null>(null);

  /** The table picked in this panel, which every field reads and writes; null while none is. */
  get selectedTable(): GameTable | null {
    return this.picked();
  }
  set selectedTable(table: GameTable | null) {
    this.picked.set(table);
  }

  selectedTableXml: string = '';

  /** Whether no table is being viewed. */
  get isEmpty(): boolean {
    return this.tableSelecter ? (this.tableSelecter.viewTable ? false : true) : true;
  }
  /** Whether the picked table has been destroyed, or no table is picked. */
  get isDeleted(): boolean {
    this.objectChange.collectionOf('game-table')();
    if (!this.selectedTable) return true;
    return this.objectStore.get<GameTable>(this.selectedTable.identifier) == null;
  }
  /**
   * Whether the picked table can be changed from this panel: a table is viewed and the picked one
   * still exists.
   */
  get isEditable(): boolean {
    return !this.isEmpty && !this.isDeleted;
  }

  private readonly saveProgress = new SaveProgress();
  readonly isSaving = this.saveProgress.isSaving;
  readonly progressPercent = this.saveProgress.percent;

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
   * Chosen from the list, which is the one moment a cut-in and the table's music belong.
   * Creating, restoring and loading a room go through selectGameTable() and stay quiet.
   */
  chooseGameTable(identifier: string): void {
    const wasShowing = this.tableSelecter.viewTableIdentifier;
    this.selectGameTable(identifier);
    if (identifier === wasShowing) return;

    const table = this.objectStore.get<GameTable>(identifier);
    if (!table) return;
    this.cutInService.launchForTable(table);
    this.tableBgm.playFor(table);
  }

  /**
   * Shows the given table and picks it in this panel, without playing its cut-ins, and forgets any
   * kept deleted table.
   */
  selectGameTable(identifier: string) {
    emitSelectGameTable({ identifier });
    this.selectedTable = this.objectStore.get<GameTable>(identifier);
    this.selectedTableXml = '';
  }

  private readonly cutIns = computed<CutIn[]>(() => {
    this.objectChange.collectionOf(CutIn.aliasName)();
    return this.objectStore.getObjects(CutIn);
  });

  /** Every cut-in in the room, offered to play when a table is chosen. */
  getCutIns(): CutIn[] {
    return this.cutIns();
  }

  /** Moves when this panel writes the cut-ins, so the list is read again at once, ahead of the sync. */
  private readonly cutInsWritten = signal(0);

  private readonly namedCutIns = computed<string[]>(
    () => {
      const table = this.picked();
      if (table) this.objectChange.versionOf(table.identifier)();
      this.cutInsWritten();
      const known = new Set(this.cutIns().map((cutIn) => cutIn.identifier));
      return parseCutInIdentifiers(table?.cutInIdentifiers ?? '').filter((identifier) => known.has(identifier));
    },
    { equal: sameList }
  );

  /**
   * The identifiers of the cut-ins that play when the picked table is chosen from the list; writes
   * are ignored while it cannot be edited. The same list is handed back until the table names
   * other cut-ins or the room's cut-ins change.
   *
   * Only cut-ins still in the room are listed. One named by a table but gone, deleted since or
   * never brought back by an older saved room, would otherwise show as its bare identifier.
   */
  get tableCutIns(): string[] {
    return this.namedCutIns();
  }
  set tableCutIns(identifiers: string[]) {
    if (!this.isEditable || !this.selectedTable) return;
    this.selectedTable.cutInIdentifiers = encodeCutInIdentifiers(identifiers ?? []);
    this.cutInsWritten.update((count) => count + 1);
  }

  /**
   * The music the room has, offered as what the picked table puts on when it is switched to. The
   * sounds that come with the tool are left out, as the jukebox leaves them out of its list.
   */
  readonly tableBgmTracks = computed<{ value: string; name: string }[]>(() => {
    this.objectChange.fileVersion();
    return this.audioStorage.audios
      .filter((audio) => !audio.isHidden)
      .map((audio) => ({ value: audio.identifier, name: soundFileName(audio.name) }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  });

  /**
   * What the picked table does with the music on being switched to: `''` to leave it, `'stop'`,
   * or the identifier of the track it puts on. Writes are ignored while it cannot be edited.
   */
  get tableBgmChoice(): string {
    const table = this.selectedTable;
    if (!table) return '';
    const mode = tableBgmModeOf(table);
    return mode === 'play' ? table.tableBgmIdentifier : mode;
  }
  set tableBgmChoice(choice: string) {
    const table = this.selectedTable;
    if (!this.isEditable || !table) return;
    if (choice === '' || choice === 'stop') {
      table.tableBgm = choice;
      table.tableBgmIdentifier = '';
      return;
    }
    table.tableBgm = 'play';
    table.tableBgmIdentifier = choice;
  }

  /** The track the picked table names that the room does not have, which is still shown as chosen. */
  missingTableBgm(): string | null {
    const table = this.selectedTable;
    if (!table || tableBgmModeOf(table) !== 'play') return null;
    const identifier = table.tableBgmIdentifier;
    return this.tableBgmTracks().some((track) => track.value === identifier) ? null : identifier;
  }

  private readonly gameTables = computed<GameTable[]>(() => {
    this.objectChange.collectionOf(GameTable.aliasName)();
    return this.objectStore.getObjects(GameTable);
  });

  /** Every table in the room, for the table list. */
  getGameTables(): GameTable[] {
    return this.gameTables();
  }

  /**
   * Makes a new table with the default name, no image and its grid shown, and picks it; does
   * nothing for a reader who may not edit the table.
   */
  createGameTable() {
    if (!this.rolePermission.canEditTabletop()) return;
    const gameTable = new GameTable();
    gameTable.name = this.t('feature.tabletop.tableSetting.defaultName');
    gameTable.imageIdentifier = ImageFile.Empty.identifier;
    gameTable.gridShow = true;
    gameTable.initialize();
    this.selectGameTable(gameTable.identifier);
  }

  /**
   * Saves the picked table to a file named after it, showing progress while it is written; ignored
   * while a save is running.
   */
  async save() {
    const table = this.selectedTable;
    if (!table || this.isSaving()) return;
    await this.saveProgress.run((onProgress) => {
      table.selected = true;
      return this.saveDataService.saveGameObjectAsync(table, 'map_' + table.name, onProgress);
    });
  }

  /**
   * Copies the picked table, with everything on it, under a name saying it is a copy, and shows the
   * copy; does nothing for a reader who may not edit the table.
   */
  duplicate() {
    if (!this.rolePermission.canEditTabletop() || !this.selectedTable || this.isDeleted) return;
    const wanted = this.t('feature.tabletop.tableSetting.copyName', { name: this.selectedTable.name });
    const name = freeTableName(
      wanted,
      this.objectStore.getObjects(GameTable).map((table) => table.name)
    );
    const copy = copyGameTable(this.selectedTable, name);
    if (copy) this.selectGameTable(copy.identifier);
  }

  /** Whether the picked table may be taken away, which the delete button is offered by (see `GameTableService.mayRemove`). */
  readonly mayDelete = computed(() => this.tables.mayRemove(this.picked()));

  /**
   * Takes the picked table away, keeping its XML so it can be restored from this panel; does nothing
   * where it may not be (see `GameTableService.mayRemove`), as for the last table or a reader who may
   * not edit the table.
   */
  delete() {
    const table = this.selectedTable;
    if (!table) return;
    const xml = table.toXml();
    if (this.tables.remove(table)) this.selectedTableXml = xml;
  }

  /**
   * Rebuilds the deleted table from its kept XML and picks it; does nothing for a reader who may
   * not edit the table or when nothing is kept.
   */
  restore() {
    if (!this.rolePermission.canEditTabletop()) return;
    if (this.selectedTable && this.selectedTableXml) {
      const restored = this.objectSerializer.parseXml(this.selectedTableXml);
      this.selectedTableXml = '';
      if (!restored) return;
      this.selectGameTable(restored.identifier);
    }
  }

  /**
   * Opens the image picker and sets the chosen picture as the picked table's floor image; does
   * nothing once the table is deleted.
   */
  openBgImageModal() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable.imageIdentifier = value;
    });
  }

  /**
   * Picks a floor image and opens the grid adjuster on it.
   *
   * The cropped image, the size in cells and the grid type it hands back are written to the picked
   * table. Cancelling either dialog leaves the table as it was.
   */
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

  /** Opens the image picker and sets the chosen picture as the picked table's distant-view background. */
  openDistanceViewImageModal() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable.backgroundImageIdentifier = value;
    });
  }

  /** Opens the image picker and sets the chosen picture as the one the picked table lays in front of everything. */
  openForegroundImageModal() {
    if (this.isDeleted) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (!this.selectedTable || !value) return;
      this.selectedTable.foregroundImageIdentifier = value;
    });
  }

  /** Takes the picture in front off the picked table. */
  clearForeground() {
    if (this.isEditable && this.selectedTable) this.selectedTable.foregroundImageIdentifier = '';
  }

  /**
   * Chooses the table named by a select element's value, from its change event, playing its cut-ins
   * as picking from the list does.
   */
  onSelectGameTable(event: Event): void {
    this.chooseGameTable((event.target as HTMLInputElement).value);
  }
}
