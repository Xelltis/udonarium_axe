import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { DataElementDragService } from '@axe/application/ui/data-element-drag.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { portraitElementAt, portraitNameOf, setPortraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CharacterSheetTarget } from '@axe/domain/tabletop/character-sheet-target';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TERRAIN_FACES, TerrainFace } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { CardStackCardListComponent } from '@axe/features/card/card-stack-card-list/card-stack-card-list.component';
import { cloneTabletopObject } from '@axe/features/character/game-character-sheet/character-sheet-target-helpers';
import {
  canReorderDetailElement,
  reorderDetailElement,
  reorderDetailElementAfter,
} from '@axe/features/character/game-character-sheet/detail-element-reorder-helpers';
import { GameCharacterSettingsTabComponent } from '@axe/features/character/game-character-sheet/game-character-settings-tab.component';
import { clampInRange, roundOr } from '@axe/features/character/game-character-sheet/numeric-input-helpers';
import { ImportCharacterImgComponent } from '@axe/features/character/import-character-img/import-character-img.component';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { DisclosureControlComponent } from '@axe/features/disclosure/disclosure-control/disclosure-control.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-character-sheet',
  templateUrl: './game-character-sheet.component.html',
  host: { class: 'block' },
  imports: [
    CardStackCardListComponent,
    DisclosureControlComponent,
    FormsModule,
    GameCharacterSettingsTabComponent,
    GameDataElementComponent,
    SafePipe,
    TranslocoModule,
  ],
})
export class GameCharacterSheetComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly saveDataService = inject(SaveDataService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly dataElementDrag = inject(DataElementDragService);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly rolePermission = inject(RolePermissionService);

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });

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
    this.flushCardOwnFaceText();
    this._tabletopObject.set(value);
    this.editingIds.set(new Set());
    this.activeTab.set('sheet');
  }
  readonly isEdit = signal(false);

  readonly activeTab = signal<'sheet' | 'settings'>('sheet');

  readonly editingIds = signal(new Set<string>());

  /** Whether the card of the sheet with this identifier is open for editing. */
  isElementEditing(id: string): boolean {
    return this.editingIds().has(id);
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
  /** The stack's name for its name field, re-read when the stack changes. */
  cardStackName(stack: CardStack): string {
    this.objectChange.versionOf(stack.identifier)();
    return stack.name;
  }
  /** Renames the stack from its name field. */
  setCardStackName(stack: CardStack, event: Event): void {
    stack.name = (event.target as HTMLInputElement).value;
  }
  /** The card's name for its name field, re-read when the card changes. */
  cardOwnName(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return c.name;
  }
  /** Renames the card from its name field. */
  setCardOwnName(c: Card, event: Event): void {
    c.name = (event.target as HTMLInputElement).value;
  }
  /** The card's width in grid squares, for its size field. */
  cardOwnSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return c.size;
  }
  /**
   * Sets the card's width from its size field, rounded and held between 1 and 20 grid squares;
   * anything not a number is ignored.
   */
  setCardOwnSize(c: Card, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    c.size = Math.max(1, Math.min(20, Math.round(value)));
  }
  private cardFaceTextUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCardFaceText: { card: Card; value: string } | null = null;

  /**
   * Whether this user may read and edit the text on the card's face.
   *
   * Anyone allowed to see hidden things always may. Everyone else may only when the card shows its
   * face to them and nobody else is peeking at it.
   */
  canReadCardFace(c: Card): boolean {
    this.objectChange.versionOf(c.identifier)();
    if (PeerCursor.myCursor) this.objectChange.versionOf(PeerCursor.myCursor.identifier)();
    const isOwnedByAnotherUser = c.hasOwner && !c.isMine;
    return this.rolePermission.canSeeHidden || (!isOwnedByAnotherUser && c.isVisible);
  }

  /** The text on the card's face, or an empty string for a user who may not read it. */
  cardOwnFaceText(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceText : '';
  }
  /**
   * Takes the text typed into the card's face field, writing it to the card after a short pause.
   *
   * Each keystroke restarts the pause, so the room receives the text once typing settles. Ignored
   * for a user who may not read the face.
   */
  setCardOwnFaceText(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    if (this.cardFaceTextUpdateTimer) clearTimeout(this.cardFaceTextUpdateTimer);
    this.pendingCardFaceText = { card: c, value: (event.target as HTMLTextAreaElement).value };
    this.cardFaceTextUpdateTimer = setTimeout(() => this.flushCardOwnFaceText(), 66);
  }
  /**
   * Writes face text still waiting on its pause to the card at once, when the field loses focus,
   * the piece changes or the panel closes.
   */
  flushCardOwnFaceText(): void {
    if (this.cardFaceTextUpdateTimer) clearTimeout(this.cardFaceTextUpdateTimer);
    this.cardFaceTextUpdateTimer = null;
    const pending = this.pendingCardFaceText;
    this.pendingCardFaceText = null;
    if (pending && this.canReadCardFace(pending.card)) pending.card.faceText = pending.value;
  }
  /** The font size of the card's face text, or the default for a user who may not read it. */
  cardOwnFaceFontSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontSize : Card.DEFAULT_FACE_FONT_SIZE;
  }
  /**
   * Sets the font size of the card's face text from its field; ignored for a user who may not read
   * the face or for anything not a number.
   */
  setCardOwnFaceFontSize(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) c.faceFontSize = value;
  }

  /** The colour of the card's face text, or the default for a user who may not read it. */
  cardOwnFaceFontColor(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontColor : Card.DEFAULT_FACE_FONT_COLOR;
  }
  /**
   * Sets the colour of the card's face text from its colour field; ignored for a user who may not
   * read the face.
   */
  setCardOwnFaceFontColor(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    c.faceFontColor = (event.target as HTMLInputElement).value;
  }

  /** The note's title for its title field, re-read when the note changes. */
  textNoteTitle(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.title;
  }
  /** Sets the note's title from its title field. */
  setTextNoteTitle(note: TextNote, event: Event): void {
    this.setNoteCommonValue(note, 'title', (event.target as HTMLInputElement).value);
  }
  /** The note's body text for its text area, re-read when the note changes. */
  textNoteText(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.text;
  }
  /** Sets the note's body text from its text area. */
  setTextNoteText(note: TextNote, event: Event): void {
    note.text = (event.target as HTMLTextAreaElement).value;
  }
  /** The note's width, for its width field. */
  textNoteWidth(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.width;
  }
  /**
   * Sets the note's width in grid cells from its field, rounded and held between 1 and 24; anything
   * not a number is ignored.
   */
  setTextNoteWidth(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'width', event, 1, 24);
  }
  /** The note's height, for its height field. */
  textNoteHeight(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.height;
  }
  /**
   * Sets the note's height in grid cells from its field, rounded and held between 1 and 24; anything
   * not a number is ignored.
   */
  setTextNoteHeight(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'height', event, 1, 24);
  }
  /** The note's font size, for its font size field. */
  textNoteFontSize(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.fontSize;
  }
  /**
   * Sets the note's font size from its field, rounded and held between 6 and 64; anything not a
   * number is ignored.
   */
  setTextNoteFontSize(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'fontsize', event, 6, 64);
  }
  /** The note's altitude above the table, for its altitude field. */
  textNoteAltitude(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.altitude;
  }
  /**
   * Sets the note's altitude from its field, held between -20 and 20; anything not a number is
   * ignored.
   */
  setTextNoteAltitude(note: TextNote, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    note.altitude = Math.max(-20, Math.min(20, value));
  }
  private setNoteCommonValue(note: TextNote, name: string, value: string | number): void {
    const el = note.commonDataElement?.getFirstElementByName(name);
    if (el) el.value = value;
  }
  private setNoteCommonNumber(note: TextNote, name: string, event: Event, min: number, max: number): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    this.setNoteCommonValue(note, name, Math.max(min, Math.min(max, Math.round(value))));
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

  readonly rangeTypeItems: { type: string; labelKey: string; icon: string }[] = [
    { type: 'LINE', labelKey: 'feature.inventory.sheet.rangeShapeLine', icon: 'remove' },
    { type: 'CORN', labelKey: 'feature.inventory.sheet.rangeShapeCorn', icon: 'change_history' },
    { type: 'TRIANGLE', labelKey: 'feature.inventory.sheet.rangeShapeTriangle', icon: 'details' },
    { type: 'SQUARE', labelKey: 'feature.inventory.sheet.rangeShapeSquare', icon: 'crop_square' },
    { type: 'PENTAGON', labelKey: 'feature.inventory.sheet.rangeShapePentagon', icon: 'pentagon' },
    { type: 'HEXAGON', labelKey: 'feature.inventory.sheet.rangeShapeHexagon', icon: 'hexagon' },
    { type: 'CIRCLE', labelKey: 'feature.inventory.sheet.rangeShapeCircle', icon: 'radio_button_unchecked' },
  ];

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

  readonly portraitImages = computed(() => {
    this.objectChange.fileVersion();
    const char = this.character;
    if (!char?.imageDataElement) return [];
    this.objectChange.versionOf(char.identifier)();
    return char.imageDataElement.children.map((child, index) => {
      const file = this.imageStorage.get(child.value as string) ?? ImageFile.Empty;
      return { index, imageFile: file, name: portraitNameOf(child) };
    });
  });

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

  readonly portraitName = computed(() => {
    const char = this.character;
    if (!char) return '';
    this.objectChange.versionOf(char.identifier)();
    return portraitNameOf(portraitElementAt(char, this.readKomaIndex(char)));
  });

  readonly portraitPosIndex = computed(() => {
    const char = this.character;
    if (!char) return 0;
    this.objectChange.versionOf(char.identifier)();
    return char.portraitPosition ?? 0;
  });

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
    const HIDDEN = new Set(['\u7acb\u3061\u7d75\u4f4d\u7f6e', '\u30b3\u30de\u753b\u50cf']);
    return char.detailDataElement.children.filter((el) => !HIDDEN.has(el.name));
  });

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  constructor() {
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.tabletopObject && this.tabletopObject.identifier === e.identifier) {
        this.panelService.close();
      }
    }, this.destroyRef);

    effect(() => {
      const char = this.character;
      if (char) untracked(() => char.addExtendData());
    });
    this.destroyRef.onDestroy(() => this.flushCardOwnFaceText());
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
   * Deletes a card from the character's sheet, from the card's delete button, and forgets that it
   * was open for editing.
   */
  deleteTopLevelElement(id: string) {
    const char = this.character;
    if (!char?.detailDataElement) return;
    const el = char.detailDataElement.children.find((e) => e.identifier === id);
    if (!el) return;
    el.destroy();
    this.editingIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    char.update();
  }

  /**
   * Places a copy of the piece beside it, from the sheet's copy button; does nothing for a user who
   * may not edit the table.
   */
  clone() {
    if (!this.rolePermission.canEditTabletop) return;
    if (this.tabletopObject) cloneTabletopObject(this.tabletopObject);
  }

  /** Does nothing; the hide checkbox changes the character through its own binding. */
  clickHide() {}

  /** Does nothing; the no-talk checkbox changes the character through its own binding. */
  clickNoTalk() {}

  /** Does nothing; the terrain grid checkbox changes the terrain through its own binding. */
  clickGrid() {}

  /**
   * Chooses which of the character's portraits is its image on the table, from the portrait
   * thumbnails; the index is held within the portraits it has.
   */
  setKomaIndex(index: number) {
    const char = this.character;
    if (!char?.imageDataElement) return;
    char.addExtendData();
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    if (!iconEl) return;
    const max = char.imageDataElement.children.length - 1;
    iconEl.currentValue = Math.max(0, Math.min(index, max));
    iconEl.value = max;
    char.update();
  }

  /**
   * Opens the image picker and replaces the picture of the portrait the piece currently shows, or
   * of the first portrait when that index is out of range.
   */
  openKomaImageModal() {
    const char = this.character;
    if (!char?.imageDataElement) return;
    char.addExtendData();
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((value) => {
      if (!value || !char.imageDataElement) return;
      const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
      const idx = iconEl ? (iconEl.currentValue as number) : 0;
      const images = char.imageDataElement.children;
      if (idx >= 0 && idx < images.length) {
        images[idx].value = value;
      } else if (images.length > 0) {
        images[0].value = value;
      }
      char.update();
    });
  }

  /** Names the portrait the piece currently shows, from the name field under the thumbnails. */
  setPortraitName(event: Event) {
    const char = this.character;
    if (!char) return;
    const element = portraitElementAt(char, this.readKomaIndex(char));
    if (!element) return;
    setPortraitNameOf(element, (event.target as HTMLInputElement).value);
    char.update();
  }

  /** Moves where the character's portrait stands in chat, from the arrows beside the position. */
  setPortraitPos(pos: number) {
    const char = this.character;
    if (!char) return;
    char.portraitPosition = pos;
  }

  /**
   * Opens the image picker and adds the chosen picture as another portrait of the character, from
   * the add button after the thumbnails.
   */
  addPortrait() {
    const char = this.character;
    if (!char?.imageDataElement) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((value) => {
      if (!value) return;
      char.imageDataElement!.appendChild(DataElement.create('imageIdentifier', value, { type: 'image' }, ''));
      const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
      if (iconEl) iconEl.value = char.imageDataElement!.children.length - 1;
      char.update();
    });
  }

  /**
   * Opens the image picker and replaces the picture of a portrait, from a click on the large
   * portrait.
   */
  changePortrait(index: number) {
    const char = this.character;
    if (!char?.imageDataElement) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((value) => {
      if (!value) return;
      const images = char.imageDataElement!.children;
      if (index < images.length) {
        images[index].value = value;
        char.update();
      }
    });
  }

  /**
   * Removes a portrait from the character, from the delete button under the thumbnails.
   *
   * The last portrait cannot be removed. When the one shown on the table is removed the first
   * portrait takes its place; otherwise the piece keeps showing the same picture.
   */
  removePortrait(index: number) {
    const char = this.character;
    if (!char?.imageDataElement) return;
    const images = char.imageDataElement.children;
    if (images.length <= 1) return;
    const el = images[index];
    if (!el) return;
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    if (iconEl) {
      const komaIdx = iconEl.currentValue as number;
      if (komaIdx === index) {
        iconEl.currentValue = 0;
      } else if (komaIdx > index) {
        iconEl.currentValue = (komaIdx as number) - 1;
      }
      iconEl.value = images.length - 2;
    }
    char.imageDataElement.removeChild(el);
    char.update();
  }

  /**
   * Opens a small panel by the pointer for copying another character's pictures onto this one, from
   * the import button under the portraits.
   */
  showImportImages() {
    const obj = this.tabletopObject;
    if (!obj) return;
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x - 250,
      top: coordinate.y - 175,
      width: 350,
      height: 250,
    };
    option.title = this.translateFn('feature.inventory.sheet.imageCopyTitle', {
      name: (obj as GameCharacter).name,
    });
    const component = this.panelService.open<ImportCharacterImgComponent>(ImportCharacterImgComponent, option);
    component.tabletopObject = obj as GameCharacter;
  }

  /** Does nothing; the checkbox it is bound to changes the range area through its own binding. */
  clickRangeOffSetX() {}

  /** Does nothing; the checkbox it is bound to changes the range area through its own binding. */
  clickRangeOffSetY() {}

  /** Does nothing; the fill outline checkbox changes the range area through its own binding. */
  fillOutLine() {}

  /** Does nothing; the rotation snap checkbox changes the range area through its own binding. */
  subDivisionSnapPolygonal() {}

  /**
   * Asks the note to fit its height to its content again shortly after the limit height checkbox is
   * clicked, once the change has landed.
   */
  clickLimitHeight() {
    const obj = this.tabletopObject;
    if (!obj) return;
    setTimeout(() => {
      this.uiSignalService.requestNoteResize(obj.identifier);
    }, 100);
  }

  /**
   * Sets the height the dice symbol's image is drawn at, held between 50 and 750 pixels, and clears
   * the pointer's dragging flag; anything not a number keeps the current height.
   */
  chkDiceKomaSize(height: number) {
    const character = this.tabletopObject as DiceSymbol;
    character.komaImageHeight = clampInRange(Number(height), 50, 750, character.komaImageHeight);
    this.pointerDeviceService.isDragging = false;
  }

  /**
   * Sets the width of the piece's hover popup, held between 270 and 800 pixels; anything not a
   * number keeps the current width.
   */
  chkPopWidth(width: number) {
    const character = this.tabletopObject as GameCharacter;
    character.overViewWidth = clampInRange(width, 270, 800, character.overViewWidth);
  }

  /**
   * Sets the maximum height of the piece's hover popup, held between 250 and 1000 pixels; anything
   * not a number keeps the current height.
   */
  chkPopMaxHeight(maxHeight: number) {
    const character = this.tabletopObject as GameCharacter;
    character.overViewMaxHeight = clampInRange(maxHeight, 250, 1000, character.overViewMaxHeight);
  }
  /**
   * Saves the piece with its pictures as a zip file named after it, from the sheet's save button.
   *
   * Progress is shown while it saves and cleared half a second after. A click while a save is still
   * running is ignored.
   */
  async saveToXML() {
    const obj = this.tabletopObject;
    if (!obj || this.isSaving()) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);
    const element = obj.commonDataElement?.getFirstElementByName('name');
    const objectName: string = element ? (element.value as string) : '';

    await this.saveDataService.saveGameObjectAsync(obj, 'xml_' + objectName, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
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

  /** Sets the range area's fill colour. */
  changeGridColor(event: string) {
    if (this.tabletopObject) {
      const range: RangeArea = this.tabletopObject as RangeArea;
      range.gridColor = event;
    }
  }

  /** Sets the range area's border colour. */
  changeRangeColor(event: string) {
    if (this.tabletopObject) {
      const range: RangeArea = this.tabletopObject as RangeArea;
      range.rangeColor = event;
    }
  }

  /** Applies the dice symbol's image height from its field. */
  onChkDiceKomaSize(event: Event): void {
    this.chkDiceKomaSize((event.target as HTMLInputElement).valueAsNumber);
  }
  /**
   * Sets the piece's x position on the table from a number field, rounded; an empty field reads as
   * zero.
   */
  onChkLocationX(event: Event): void {
    const character = this.tabletopObject as GameCharacter;
    const x = roundOr((event.target as HTMLInputElement).valueAsNumber, 0);
    character.location = { ...character.location, x };
  }
  /**
   * Sets the piece's y position on the table from a number field, rounded; an empty field reads as
   * zero.
   */
  onChkLocationY(event: Event): void {
    const character = this.tabletopObject as GameCharacter;
    const y = roundOr((event.target as HTMLInputElement).valueAsNumber, 0);
    character.location = { ...character.location, y };
  }
  /** Applies the hover popup width from its number field. */
  onChkPopWidth(event: Event): void {
    this.chkPopWidth((event.target as HTMLInputElement).valueAsNumber);
  }
  /** Applies the hover popup's maximum height from its number field. */
  onChkPopMaxHeight(event: Event): void {
    this.chkPopMaxHeight((event.target as HTMLInputElement).valueAsNumber);
  }
  /** Moves the piece to the inventory named by a form field's value. */
  onSetLocation(event: Event): void {
    this.setLocation((event.target as HTMLInputElement).value);
  }
  /** Sets the range area's border colour from its colour field. */
  onChangeRangeColor(event: Event): void {
    this.changeRangeColor((event.target as HTMLInputElement).value);
  }
  /** Sets the range area's fill colour from its colour field. */
  onChangeGridColor(event: Event): void {
    this.changeGridColor((event.target as HTMLInputElement).value);
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
