import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SaveProgress } from '@axe/application/file/save-progress';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { DataElementDragService } from '@axe/application/ui/data-element-drag.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter, KOMA_IMAGE_SECTION, PORTRAIT_POSITION_SECTION } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { CharacterSheetTarget } from '@axe/domain/tabletop/character-sheet-target';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TERRAIN_FACES, TerrainFace } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';
import { CharacterPortraitPanelComponent } from '@axe/features/character/game-character-sheet/character-portrait-panel.component';
import { buildCharacterSheetMenu } from '@axe/features/character/game-character-sheet/character-sheet-context-menu';
import { cloneTabletopObject } from '@axe/features/character/game-character-sheet/character-sheet-target-helpers';
import {
  canReorderDetailElement,
  reorderDetailElement,
  reorderDetailElementAfter,
} from '@axe/features/character/game-character-sheet/detail-element-reorder-helpers';
import { GameCharacterSettingsTabComponent } from '@axe/features/character/game-character-sheet/game-character-settings-tab.component';
import { SheetBasicsCardComponent } from '@axe/features/character/game-character-sheet/sheet-basics-card.component';
import { SheetCardFormComponent } from '@axe/features/character/game-character-sheet/sheet-card-form.component';
import { SheetCardStackFormComponent } from '@axe/features/character/game-character-sheet/sheet-card-stack-form.component';
import { SheetNoteFormComponent } from '@axe/features/character/game-character-sheet/sheet-note-form.component';
import { SheetRangeFormComponent } from '@axe/features/character/game-character-sheet/sheet-range-form.component';
import { SheetSaveButtonsComponent } from '@axe/features/character/game-character-sheet/sheet-save-buttons.component';
import { SheetViewPreferenceService } from '@axe/features/character/game-character-sheet/sheet-view-preference.service';
import { openDataElementEditor } from '@axe/features/data-element/data-element-editor/open-data-element-editor';
import { DataElementDeletionService } from '@axe/features/data-element/game-data-element/data-element-deletion.service';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import { IN_DATA_ELEMENT_SHEET } from '@axe/features/data-element/game-data-element/data-element-sheet-host';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { DisclosureControlComponent } from '@axe/features/disclosure/disclosure-control/disclosure-control.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { PieceModelFieldsComponent } from '@axe/ui/components/piece-model-fields/piece-model-fields.component';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** How long a section picked from the row of sections stays lit while the sheet scrolls to it. */
const CHOSEN_SECTION_HOLD_MS = 1200;

/** The width, in rem, a character sheet folds to one column below. */
const NARROW_SHEET_REM = 36;

/** The sheet sections the portrait panel edits through its own controls, so the list of details leaves them out. */
const SECTIONS_WITH_OWN_CONTROLS: ReadonlySet<string> = new Set([PORTRAIT_POSITION_SECTION, KOMA_IMAGE_SECTION]);

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-character-sheet',
  templateUrl: './game-character-sheet.component.html',
  host: { class: 'block' },
  providers: [{ provide: IN_DATA_ELEMENT_SHEET, useValue: true }],
  imports: [
    TextTooltipDirective,
    DisclosureControlComponent,
    FormsModule,
    CharacterPortraitPanelComponent,
    GameCharacterSettingsTabComponent,
    GameDataElementComponent,
    SafePipe,
    TranslocoModule,
    PieceModelFieldsComponent,
    SheetBasicsCardComponent,
    SheetCardFormComponent,
    SheetCardStackFormComponent,
    SheetNoteFormComponent,
    SheetRangeFormComponent,
    SheetSaveButtonsComponent,
  ],
})
export class GameCharacterSheetComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly saveDataService = inject(SaveDataService);
  private readonly tabletop = inject(TabletopService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly dataElementDrag = inject(DataElementDragService);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly snackbar = inject(SnackbarService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly dataElementDeletion = inject(DataElementDeletionService);
  private readonly dataElementEdit = inject(DataElementEditService);
  private readonly confirm = inject(ConfirmService);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly injector = inject(Injector);
  private readonly sheetView = inject(SheetViewPreferenceService);
  private readonly motion = inject(MotionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sectionChips = viewChild<ElementRef<HTMLElement>>('sectionChips');
  private readonly sheetRoot = viewChild<ElementRef<HTMLElement>>('sheetRoot');
  private readonly cardForm = viewChild(SheetCardFormComponent);
  private readonly isTouch = inject(ViewportService).isTouch;
  /** Whether the sheet is narrower than 36rem. */
  private readonly isNarrow = signal(false);

  /**
   * Whether the sheet lays itself out for a phone: one column under a heading of its own, with a
   * row of its sections. So it does where it is narrower than 36rem, and on a phone held either
   * way, where a sheet turned on its side has the width but not the height for the wide layout.
   */
  readonly narrowLayout = computed(() => this.isNarrow() || this.isCompact());

  /**
   * Whether the sheet's rows are edited through their editors rather than the buttons beside them:
   * where the sheet lays itself out for a phone, or on a touch screen at any width, where a 20px
   * button is too small for a finger.
   */
  readonly compactEditing = computed(() => this.narrowLayout() || this.isTouch());
  private cardObserver: IntersectionObserver | null = null;
  /** Until when the section picked from the row of sections stays lit, while the sheet scrolls to it. */
  private chosenSectionUntil = 0;

  /** The section the reader is at, which the narrow sheet's row of sections lights up. */
  readonly activeSectionId = signal<string | null>(null);

  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());

  /**
   * Whether the sheet is closed to a reader who may not change the table, as the panels that write
   * to it are. A character's sheet stays open, with its tabs to look through, and holds back the
   * rest itself; every other piece's sheet is a place to change it, and closes.
   */
  private readonly isClosedToReader = computed(
    () => this.isReadOnly() && !(this._tabletopObject() instanceof GameCharacter)
  );

  private readonly _tabletopObject = signal<CharacterSheetTarget | null>(null);
  /**
   * The piece whose sheet this panel shows.
   *
   * Setting it first writes out face text still waiting for the previous card, closes every card
   * opened for editing and returns to the sheet tab.
   */
  get tabletopObject(): CharacterSheetTarget | null {
    return this._tabletopObject();
  }
  set tabletopObject(value: CharacterSheetTarget | null) {
    untracked(() => this.cardForm())?.flushCardOwnFaceText();
    this._tabletopObject.set(value);
    this.editingIds.set(new Set());
    this.activeTab.set('sheet');
  }
  readonly isEdit = signal(false);

  readonly activeTab = signal<'sheet' | 'settings'>('sheet');

  readonly editingIds = signal(new Set<string>());

  /**
   * Whether the card of the sheet with this identifier is open for editing; none is for a reader who
   * may not change the table.
   */
  isElementEditing(id: string): boolean {
    return !this.isReadOnly() && this.editingIds().has(id);
  }

  /** Opens a card of the sheet for editing or closes it, from its edit button. */
  toggleElementEdit(id: string) {
    this.editingIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  readonly dragOverId = signal<string | null>(null);
  private _draggedId: string | null = null;

  /**
   * Starts dragging a card of the sheet by its handle, marking it so it can be dropped in this
   * panel or another.
   */
  onDragStart(event: DragEvent, id: string) {
    this._draggedId = id;
    this.dataElementDrag.start(event, id);
    event.stopPropagation();
  }

  /** Ends a card drag, whether it was dropped or abandoned, and clears the drop highlight. */
  onDragEnd() {
    this._draggedId = null;
    this.dataElementDrag.end();
    this.dragOverId.set(null);
  }

  /**
   * Lets the dragged card be dropped before this one and highlights it, when the move is allowed;
   * otherwise the drag passes on.
   */
  onDragOver(event: DragEvent, id: string) {
    const draggedId = this.dataElementDrag.getDraggedId(event) ?? this._draggedId;
    if (!draggedId || draggedId === id || !canReorderDetailElement(this.character, this.objectStore, draggedId, id))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverId.set(id);
  }

  /** Clears the drop highlight when the drag leaves the card it was on. */
  onDragLeave(id: string) {
    if (this.dragOverId() === id) this.dragOverId.set(null);
  }

  /**
   * A card let go of over another takes its place.
   *
   * A drop carrying no card of ours is somebody else's business - a picture, an archive -
   * and is left to travel on to whatever else the page listens for. A card let go of over
   * itself is ours all the same, and is answered for here rather than let out.
   */
  onDrop(event: DragEvent, targetId: string) {
    this.dragOverId.set(null);
    const draggedId = this.dataElementDrag.getDraggedId(event) ?? this._draggedId;
    this._draggedId = null;
    this.dataElementDrag.end();
    if (!draggedId) return;

    event.preventDefault();
    event.stopPropagation();
    if (draggedId === targetId) return;

    reorderDetailElement(this.character, this.objectStore, this.objectChange, draggedId, targetId);
  }

  /**
   * Moves a card from its menu, opened by a right click or a press held on the handle it is
   * dragged by.
   *
   * Cards are otherwise put in order by dragging, which a touch screen may not start.
   */
  onDetailCardContextMenu(event: MouseEvent, card: DataElement): void {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const cards = this.detailElements();
    const index = cards.indexOf(card);
    if (index < 0) return;
    const before = (target: DataElement) =>
      reorderDetailElement(this.character, this.objectStore, this.objectChange, card.identifier, target.identifier);
    const after = (target: DataElement) =>
      reorderDetailElementAfter(
        this.character,
        this.objectStore,
        this.objectChange,
        card.identifier,
        target.identifier
      );
    const actions = buildReorderContextMenu(
      { index, count: cards.length },
      {
        moveToTop: () => before(cards[0]),
        moveUp: () => before(cards[index - 1]),
        moveDown: () => after(cards[index + 1]),
        moveToBottom: () => after(cards[cards.length - 1]),
      },
      this.translateFn
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, this.getCardName(card));
  }

  private static readonly COLSPAN_CYCLE = ['1', '2', 'full'] as const;

  /**
   * How wide a card of the sheet is laid out: `1` or `2` columns, or `full` for the whole row; `1`
   * when unset.
   */
  getCardColspan(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return (el.getAttribute('cs-colspan') as string) || '1';
  }

  /** The title shown in a card's header. */
  getCardName(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return el.name || '';
  }

  /** The name of the icon shown before a card's title, or an empty string for none. */
  getCardIcon(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return (el.getAttribute('cs-icon') as string) || '';
  }

  /**
   * Steps a card's width from one column to two to the full row and back, from its width button;
   * the width is saved on the card.
   */
  cycleCardColspan(el: DataElement) {
    const cur = this.getCardColspan(el);
    const idx = GameCharacterSheetComponent.COLSPAN_CYCLE.indexOf(
      cur as (typeof GameCharacterSheetComponent.COLSPAN_CYCLE)[number]
    );
    const next =
      GameCharacterSheetComponent.COLSPAN_CYCLE[(idx + 1) % GameCharacterSheetComponent.COLSPAN_CYCLE.length];
    el.setAttribute('cs-colspan', next);
  }

  /** The piece as a dice symbol, or null when it is something else. */
  get diceSymbol(): DiceSymbol | null {
    return this.tabletopObject instanceof DiceSymbol ? this.tabletopObject : null;
  }
  /** The piece as a card, or null when it is something else. */
  get card(): Card | null {
    return this.tabletopObject instanceof Card ? this.tabletopObject : null;
  }
  /** The piece as a card stack, or null when it is something else. */
  get cardStack(): CardStack | null {
    return this.tabletopObject instanceof CardStack ? this.tabletopObject : null;
  }
  /** The piece as terrain, or null when it is something else. */
  get terrain(): Terrain | null {
    return this.tabletopObject instanceof Terrain ? this.tabletopObject : null;
  }
  /** The piece as a character, or null when it is something else. */
  get character(): GameCharacter | null {
    return this.tabletopObject instanceof GameCharacter ? this.tabletopObject : null;
  }
  /** The piece as a text note, or null when it is something else. */
  get textNote(): TextNote | null {
    return this.tabletopObject instanceof TextNote ? this.tabletopObject : null;
  }
  /**
   * The piece when it can be disclosed to chosen players (a character, note, card or dice symbol),
   * which shows the disclosure controls; null otherwise.
   */
  get disclosableObject(): GameCharacter | TextNote | Card | DiceSymbol | null {
    const object = this.tabletopObject;
    if (
      object instanceof GameCharacter ||
      object instanceof TextNote ||
      object instanceof Card ||
      object instanceof DiceSymbol
    ) {
      return object;
    }
    return null;
  }
  /** The piece as a range area, or null when it is something else. */
  get rangeArea(): RangeArea | null {
    return this.tabletopObject instanceof RangeArea ? this.tabletopObject : null;
  }

  readonly imageFile = computed(() => {
    this.objectChange.fileVersion();
    const obj = this.tabletopObject as TabletopObject | null;
    if (!obj) return ImageFile.Empty;
    this.objectChange.versionOf(obj.identifier)();
    return obj.imageFile;
  });

  readonly terrainFloorImage = computed(() => {
    this.objectChange.fileVersion();
    const terrain = this.terrain;
    if (!terrain) return ImageFile.Empty;
    this.objectChange.versionOf(terrain.identifier)();
    return terrain.floorImage ?? ImageFile.Empty;
  });

  readonly terrainWallImage = computed(() => {
    this.objectChange.fileVersion();
    const terrain = this.terrain;
    if (!terrain) return ImageFile.Empty;
    this.objectChange.versionOf(terrain.identifier)();
    return terrain.wallImage ?? ImageFile.Empty;
  });

  readonly terrainFaceImages = computed<{ face: TerrainFace; label: string; image: ImageFile }[]>(() => {
    this.objectChange.fileVersion();
    const terrain = this.terrain;
    if (!terrain) return [];
    this.objectChange.versionOf(terrain.identifier)();
    return TERRAIN_FACES.filter((face) => face !== 'bottom').map((face) => ({
      face,
      label: `feature.inventory.sheet.face${face.charAt(0).toUpperCase()}${face.slice(1)}`,
      image: terrain.faceImage(face) ?? ImageFile.Empty,
    }));
  });

  /**
   * Opens the image picker for one face of the terrain and sets the chosen picture on it; an empty
   * choice clears the face, and closing the picker changes nothing.
   */
  openTerrainFaceModal(face: TerrainFace) {
    const terrain = this.terrain;
    if (!terrain) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((value) => {
      if (value == null) return;
      terrain.setFaceImage(face, value);
    });
  }

  private readKomaIndex(char: GameCharacter): number {
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    return iconEl ? (iconEl.currentValue as number) : 0;
  }

  readonly komaImageIndex = computed(() => {
    const char = this.character;
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return this.readKomaIndex(char);
  });

  /**
   * Whether a section's card is folded to its heading. A card open for editing is never folded, so
   * the reader can see what they are changing.
   */
  isCardFolded(card: DataElement): boolean {
    return !this.isElementEditing(card.identifier) && this.sheetView.isFolded(card.name);
  }

  /** Folds a section's card to its heading, or opens it, from its heading; this browser remembers. */
  toggleCardFold(card: DataElement): void {
    this.sheetView.setFolded(card.name, !this.sheetView.isFolded(card.name));
  }

  /** Folds every section of the sheet, or opens them all, from the narrow sheet's menu. */
  setAllCardsFolded(folded: boolean): void {
    this.sheetView.setAllFolded(
      this.detailElements().map((card) => card.name),
      folded
    );
  }

  /**
   * Brings a section's card to the top, from the narrow sheet's row of sections, opening it first
   * if it is folded.
   */
  jumpToSection(card: DataElement): void {
    if (this.sheetView.isFolded(card.name)) this.sheetView.setFolded(card.name, false);
    this.activeSectionId.set(card.identifier);
    this.chosenSectionUntil = performance.now() + CHOSEN_SECTION_HOLD_MS;
    queueMicrotask(() => {
      const target = this.host.nativeElement.querySelector(`[data-card-id="${CSS.escape(card.identifier)}"]`);
      target?.scrollIntoView({ block: 'start', behavior: this.motion.enabled() ? 'smooth' : 'auto' });
    });
  }

  /**
   * Opens a section's editor in a sheet from the bottom, from the "⋯" on its card on a narrow
   * sheet, which holds what the card's small buttons hold on a wide one.
   */
  openSectionEditor(card: DataElement, event?: Event): void {
    openDataElementEditor(this.bottomSheet, this.translateFn, card, {
      host: event?.currentTarget instanceof Element ? event.currentTarget : null,
      injector: this.injector,
    });
  }

  /** The character's name, as the narrow sheet's heading shows it. */
  readonly characterName = computed(() => {
    const char = this.character;
    if (!char) return '';
    this.objectChange.versionOf(char.identifier)();
    return char.name;
  });

  /**
   * Opens the character's portraits in a sheet from the bottom, from the portrait at the top of a
   * narrow sheet, where there is no column beside the game data to show them in.
   */
  openPortraitSheet(event?: Event): void {
    const char = this.character;
    if (!char || this.isReadOnly()) return;
    this.bottomSheet.open(CharacterPortraitPanelComponent, {
      title: this.translateFn('feature.inventory.sheet.portraitsManageTitle', { name: char.name }),
      inputs: { character: char },
      host: event?.currentTarget instanceof Element ? event.currentTarget : null,
      injector: this.injector,
    });
  }

  /**
   * Opens the menu under the "⋯" at the top of a narrow sheet, which holds what the toolbar and the
   * portrait column hold on a wide one: for a reader who may not change the table, only saving and
   * folding.
   */
  openSheetMenu(event: MouseEvent): void {
    const button = event.currentTarget instanceof Element ? event.currentTarget : null;
    const rect = button?.getBoundingClientRect();
    const position = rect ? { x: rect.right, y: rect.bottom } : this.pointerDeviceService.pointers[0];
    const mayChange = !this.isReadOnly();
    const actions = buildCharacterSheetMenu(
      {
        portraits: mayChange ? () => this.openPortraitSheet(event) : undefined,
        copy: mayChange ? () => this.clone() : undefined,
        captureDefaults: mayChange ? () => void this.captureDefaults() : undefined,
        clearDefaults: mayChange ? () => void this.clearDefaults() : undefined,
        save: () => void this.saveToXML(),
        collapseAll: () => this.setAllCardsFolded(true),
        expandAll: () => this.setAllCardsFolded(false),
      },
      this.translateFn
    );
    this.contextMenuService.open(position, actions, this.characterName());
  }

  /**
   * Makes the values the character and its parts hold now their defaults, the values a reset puts
   * them back to, once the reader has confirmed how many items that marks. Nothing for a seat that
   * may not edit the table, and only a notice where no item holds a number to keep.
   */
  async captureDefaults(): Promise<void> {
    const char = this.character;
    if (!char || this.isReadOnly()) return;
    const count = this.dataElementEdit.countDefaultsToCapture(char);
    if (count < 1) {
      this.snackbar.show(this.translateFn('feature.dataElement.field.captureNone'));
      return;
    }
    const asked = this.translateFn('feature.dataElement.field.captureConfirm', { count });
    if (!(await this.confirm.ask(asked))) return;
    const kept = this.dataElementEdit.captureDefaults(char);
    this.snackbar.show(this.translateFn('feature.dataElement.field.captureDone', { count: kept }));
  }

  /**
   * Takes every default off the character and its parts, once the reader has confirmed how many
   * items keep one. Nothing for a seat that may not edit the table.
   */
  async clearDefaults(): Promise<void> {
    const char = this.character;
    if (!char || this.isReadOnly()) return;
    const count = this.dataElementEdit.countDefaultsKept(char);
    if (count < 1) {
      this.snackbar.show(this.translateFn('feature.dataElement.field.clearNone'));
      return;
    }
    const asked = this.translateFn('feature.dataElement.field.clearConfirm', { count });
    if (!(await this.confirm.ask({ message: asked, danger: true }))) return;
    const cleared = this.dataElementEdit.clearDefaults(char);
    this.snackbar.show(this.translateFn('feature.dataElement.field.clearDone', { count: cleared }));
  }

  readonly komaImageFile = computed(() => {
    this.objectChange.fileVersion();
    const char = this.character;
    if (!char?.imageDataElement) return ImageFile.Empty;
    this.objectChange.versionOf(char.identifier)();
    const idx = this.komaImageIndex();
    const images = char.imageDataElement.children;
    if (images.length === 0) return ImageFile.Empty;
    const target = images[Math.min(idx, images.length - 1)];
    return this.imageStorage.get(target.value as string) ?? ImageFile.Empty;
  });

  readonly detailElements = computed(() => {
    const char = this.character;
    if (!char?.detailDataElement) return [];
    this.objectChange.versionOf(char.identifier)();
    return char.detailDataElement.children.filter((el) => !SECTIONS_WITH_OWN_CONTROLS.has(el.name));
  });

  private readonly saveProgress = new SaveProgress();
  /** Whether a save of the object is running or has only just finished. */
  readonly isSaving = this.saveProgress.isSaving;
  /** How far the running save has come, from 0 to 100. */
  readonly progressPercent = this.saveProgress.percent;

  constructor() {
    effect(() => {
      if (this.isClosedToReader()) untracked(() => this.panelService.close());
    });
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.tabletopObject && this.tabletopObject.identifier === e.identifier) {
        this.panelService.close();
      }
    }, this.destroyRef);

    effect(() => {
      const char = this.character;
      if (char) untracked(() => char.addExtendData());
    });
    // The row of sections follows the reader down the sheet: whichever card stands under the row
    // is the one lit up, and the row slides to keep it in sight.
    effect(() => {
      this.detailElements();
      if (this.activeTab() !== 'sheet') return;
      untracked(() => afterNextRender(() => this.watchCards(), { injector: this.injector }));
    });
    effect(() => {
      const id = this.activeSectionId();
      const nav = this.sectionChips()?.nativeElement;
      if (!id || !nav) return;
      const chip = nav.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(id)}"]`);
      if (chip) nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2 });
    });
    this.destroyRef.onDestroy(() => this.cardObserver?.disconnect());
    effect((onCleanup) => {
      const root = this.sheetRoot()?.nativeElement;
      if (!root || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        const rem = parseFloat(getComputedStyle(root.ownerDocument.documentElement).fontSize) || 16;
        this.isNarrow.set(entry.contentRect.width < NARROW_SHEET_REM * rem);
      });
      observer.observe(root);
      onCleanup(() => observer.disconnect());
    });
  }

  private watchCards(): void {
    this.cardObserver?.disconnect();
    const root = this.host.nativeElement.closest('.overflow-auto');
    if (typeof IntersectionObserver === 'undefined' || !(root instanceof HTMLElement)) return;
    const showing = new Set<string>();
    this.cardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset['cardId'];
          if (!id) continue;
          if (entry.isIntersecting) showing.add(id);
          else showing.delete(id);
        }
        if (performance.now() < this.chosenSectionUntil) return;
        const showingCards = this.detailElements().filter((card) => showing.has(card.identifier));
        // At the very bottom a short last section can never reach the top, so the last one in view
        // is the one being read.
        const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
        const current = atBottom ? showingCards.at(-1) : showingCards[0];
        if (current) this.activeSectionId.set(current.identifier);
      },
      { root, rootMargin: '-64px 0px -60% 0px' }
    );
    for (const card of this.host.nativeElement.querySelectorAll('[data-card-id]')) this.cardObserver.observe(card);
  }

  /** Switches the sheet between reading and editing, from its edit button. */
  toggleEditMode() {
    this.isEdit.update((v) => !v);
  }

  /**
   * Adds a new section to the piece's sheet holding one group with one text field, each given a
   * default name not already used beside it.
   */
  addDataElement() {
    const obj = this.tabletopObject;
    if (obj?.detailDataElement) {
      const titleName = DataElement.createUniqueSiblingName(
        obj.detailDataElement,
        this.translateFn('feature.inventory.sheet.defaultSectionName')
      );

      const title = DataElement.create(titleName, '', {
        [DataElementAttribute.ROLE]: DataElementRole.SECTION,
      });
      const groupName = DataElement.createUniqueSiblingName(
        title,
        this.translateFn('feature.inventory.sheet.defaultGroupName')
      );
      const group = DataElement.create(groupName, '', {
        [DataElementAttribute.ROLE]: DataElementRole.GROUP,
      });
      const tagName = DataElement.createUniqueSiblingName(
        group,
        this.translateFn('feature.inventory.sheet.defaultTagName')
      );
      const tag = DataElement.create(tagName, '', {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.TEXT,
        [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      });
      group.appendChild(tag);
      title.appendChild(group);
      obj.detailDataElement.appendChild(title);
    }
  }

  /**
   * Deletes a card from the character's sheet, from the card's delete button, leaving a notice that
   * offers to put it back, and forgets that it was open for editing.
   */
  deleteTopLevelElement(id: string) {
    const char = this.character;
    if (!char?.detailDataElement) return;
    const el = char.detailDataElement.children.find((e) => e.identifier === id);
    if (!(el instanceof DataElement)) return;
    this.dataElementDeletion.delete(el, () => char.update());
    this.editingIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    char.update();
  }

  /**
   * Places a copy of the piece beside it, from the sheet's copy button; does nothing for a user who
   * may not edit the table, and says why it copies nothing of a piece a room server withholds part
   * of from this user.
   */
  clone() {
    if (!this.rolePermission.canEditTabletop() || !this.tabletopObject) return;
    if (isWithheldHere(this.tabletopObject)) {
      this.snackbar.show(this.translateFn('feature.inventory.sheet.copyWithheld'));
      return;
    }
    cloneTabletopObject(this.tabletopObject, this.tabletop.gridSize());
  }

  /** Does nothing; the terrain grid checkbox changes the terrain through its own binding. */
  clickGrid() {}

  /**
   * Saves the piece with its pictures as a zip file named after it, from the sheet's save button.
   *
   * Progress is shown while it saves and cleared half a second after. A click while a save is still
   * running is ignored, as is one for a piece a room server withholds part of from this seat, which
   * dropped back on a table would go to the whole room in that shape, as a copy would.
   */
  async saveToXML() {
    const obj = this.tabletopObject;
    if (!obj || this.isSaving()) return;
    if (isWithheldHere(obj)) {
      this.snackbar.show(this.translateFn('feature.inventory.sheet.saveWithheld'));
      return;
    }
    const element = obj.commonDataElement?.getFirstElementByName('name');
    const objectName: string = element ? (element.value as string) : '';
    await this.saveProgress.run((onProgress) =>
      this.saveDataService.saveGameObjectAsync(obj, 'xml_' + objectName, onProgress)
    );
  }

  /**
   * Moves the piece to the named inventory: the table, the shared inventory, a user's personal
   * inventory or the graveyard.
   */
  setLocation(locationName: string) {
    this.tabletopObject?.setLocation(locationName);
  }

  /**
   * Opens the image picker for one of the piece's named image slots, such as a card's front or a
   * terrain's floor, and sets the chosen picture.
   *
   * Closing the picker, an empty choice, or a piece without that slot changes nothing.
   */
  openModal(name: string = '', isAllowedEmpty: boolean = false) {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then((value) => {
      const obj = this.tabletopObject;
      if (!obj || !obj.imageDataElement || !value) return;
      const element = obj.imageDataElement.getFirstElementByName(name);
      if (!element) return;
      element.value = value;
    });
  }

  /** Moves the piece to the inventory named by a form field's value. */
  onSetLocation(event: Event): void {
    this.setLocation((event.target as HTMLInputElement).value);
  }

  /**
   * Whether a card of the sheet is shown in the character's hover popup, either marked on the card
   * itself or listed the older way on the character.
   */
  isPopupDataElement(element: DataElement): boolean {
    this.objectChange.versionOf(element.identifier)();
    return (
      element.getAttribute(DataElementAttribute.POPUP) === 'true' ||
      (this.character?.overViewDataTags.includes(element.identifier) ?? false)
    );
  }

  /**
   * Shows a card in the character's hover popup or takes it out, from the popup button in the
   * card's header.
   *
   * The card is marked on itself and dropped from the character's older list, so a card toggled
   * here is kept one way only. The click does not reach the card.
   */
  togglePopupDataElement(element: DataElement, event?: MouseEvent): void {
    event?.stopPropagation();
    const char = this.character;
    if (!char) return;

    const legacyTags = char.overViewDataTags.filter((id) => id !== element.identifier);
    if (this.isPopupDataElement(element)) element.removeAttribute(DataElementAttribute.POPUP);
    else element.setAttribute(DataElementAttribute.POPUP, 'true');

    char.overViewDataTags = legacyTags;
    this.objectChange.notifyChanged(element.identifier);
  }
}
