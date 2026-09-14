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
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
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

  isElementEditing(id: string): boolean {
    return this.editingIds().has(id);
  }

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

  onDragStart(event: DragEvent, id: string) {
    this._draggedId = id;
    this.dataElementDrag.start(event, id);
    event.stopPropagation();
  }

  onDragEnd() {
    this._draggedId = null;
    this.dataElementDrag.end();
    this.dragOverId.set(null);
  }

  onDragOver(event: DragEvent, id: string) {
    const draggedId = this.dataElementDrag.getDraggedId(event) ?? this._draggedId;
    if (!draggedId || draggedId === id || !canReorderDetailElement(this.character, this.objectStore, draggedId, id))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverId.set(id);
  }

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

  getCardColspan(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return (el.getAttribute('cs-colspan') as string) || '1';
  }

  getCardName(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return el.name || '';
  }

  getCardIcon(el: DataElement): string {
    this.objectChange.versionOf(el.identifier)();
    return (el.getAttribute('cs-icon') as string) || '';
  }

  cycleCardColspan(el: DataElement) {
    const cur = this.getCardColspan(el);
    const idx = GameCharacterSheetComponent.COLSPAN_CYCLE.indexOf(
      cur as (typeof GameCharacterSheetComponent.COLSPAN_CYCLE)[number]
    );
    const next =
      GameCharacterSheetComponent.COLSPAN_CYCLE[(idx + 1) % GameCharacterSheetComponent.COLSPAN_CYCLE.length];
    el.setAttribute('cs-colspan', next);
  }

  get diceSymbol(): DiceSymbol | null {
    return this.tabletopObject instanceof DiceSymbol ? this.tabletopObject : null;
  }
  get card(): Card | null {
    return this.tabletopObject instanceof Card ? this.tabletopObject : null;
  }
  get cardStack(): CardStack | null {
    return this.tabletopObject instanceof CardStack ? this.tabletopObject : null;
  }
  cardStackName(stack: CardStack): string {
    this.objectChange.versionOf(stack.identifier)();
    return stack.name;
  }
  setCardStackName(stack: CardStack, event: Event): void {
    stack.name = (event.target as HTMLInputElement).value;
  }
  cardOwnName(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return c.name;
  }
  setCardOwnName(c: Card, event: Event): void {
    c.name = (event.target as HTMLInputElement).value;
  }
  cardOwnSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return c.size;
  }
  setCardOwnSize(c: Card, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    c.size = Math.max(1, Math.min(20, Math.round(value)));
  }
  private cardFaceTextUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCardFaceText: { card: Card; value: string } | null = null;

  canReadCardFace(c: Card): boolean {
    this.objectChange.versionOf(c.identifier)();
    if (PeerCursor.myCursor) this.objectChange.versionOf(PeerCursor.myCursor.identifier)();
    const isOwnedByAnotherUser = c.hasOwner && !c.isMine;
    return this.rolePermission.canSeeHidden || (!isOwnedByAnotherUser && c.isVisible);
  }

  cardOwnFaceText(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceText : '';
  }
  setCardOwnFaceText(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    if (this.cardFaceTextUpdateTimer) clearTimeout(this.cardFaceTextUpdateTimer);
    this.pendingCardFaceText = { card: c, value: (event.target as HTMLTextAreaElement).value };
    this.cardFaceTextUpdateTimer = setTimeout(() => this.flushCardOwnFaceText(), 66);
  }
  flushCardOwnFaceText(): void {
    if (this.cardFaceTextUpdateTimer) clearTimeout(this.cardFaceTextUpdateTimer);
    this.cardFaceTextUpdateTimer = null;
    const pending = this.pendingCardFaceText;
    this.pendingCardFaceText = null;
    if (pending && this.canReadCardFace(pending.card)) pending.card.faceText = pending.value;
  }
  cardOwnFaceFontSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontSize : Card.DEFAULT_FACE_FONT_SIZE;
  }
  setCardOwnFaceFontSize(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) c.faceFontSize = value;
  }

  cardOwnFaceFontColor(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontColor : Card.DEFAULT_FACE_FONT_COLOR;
  }
  setCardOwnFaceFontColor(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    c.faceFontColor = (event.target as HTMLInputElement).value;
  }

  textNoteTitle(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.title;
  }
  setTextNoteTitle(note: TextNote, event: Event): void {
    this.setNoteCommonValue(note, 'title', (event.target as HTMLInputElement).value);
  }
  textNoteText(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.text;
  }
  setTextNoteText(note: TextNote, event: Event): void {
    note.text = (event.target as HTMLTextAreaElement).value;
  }
  textNoteWidth(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.width;
  }
  setTextNoteWidth(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'width', event, 1, 24);
  }
  textNoteHeight(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.height;
  }
  setTextNoteHeight(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'height', event, 1, 24);
  }
  textNoteFontSize(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.fontSize;
  }
  setTextNoteFontSize(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'fontsize', event, 6, 64);
  }
  textNoteAltitude(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.altitude;
  }
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
  get terrain(): Terrain | null {
    return this.tabletopObject instanceof Terrain ? this.tabletopObject : null;
  }
  get character(): GameCharacter | null {
    return this.tabletopObject instanceof GameCharacter ? this.tabletopObject : null;
  }
  get textNote(): TextNote | null {
    return this.tabletopObject instanceof TextNote ? this.tabletopObject : null;
  }
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
  get scratchMask(): GameTableScratchMask | null {
    return this.tabletopObject instanceof GameTableScratchMask ? this.tabletopObject : null;
  }
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

  toggleEditMode() {
    this.isEdit.update((v) => !v);
  }

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

  clone() {
    if (!this.rolePermission.canEditTabletop) return;
    if (this.tabletopObject) cloneTabletopObject(this.tabletopObject);
  }

  clickHide() {}

  clickNoTalk() {}

  clickGrid() {}

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

  setPortraitName(event: Event) {
    const char = this.character;
    if (!char) return;
    const element = portraitElementAt(char, this.readKomaIndex(char));
    if (!element) return;
    setPortraitNameOf(element, (event.target as HTMLInputElement).value);
    char.update();
  }

  setPortraitPos(pos: number) {
    const char = this.character;
    if (!char) return;
    char.portraitPosition = pos;
  }

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

  clickRangeOffSetX() {}

  clickRangeOffSetY() {}

  fillOutLine() {}

  subDivisionSnapPolygonal() {}

  clickLimitHeight() {
    const obj = this.tabletopObject;
    if (!obj) return;
    setTimeout(() => {
      this.uiSignalService.requestNoteResize(obj.identifier);
    }, 100);
  }

  chkDiceKomaSize(height: number) {
    const character = this.tabletopObject as DiceSymbol;
    character.komaImageHeight = clampInRange(Number(height), 50, 750, character.komaImageHeight);
    this.pointerDeviceService.isDragging = false;
  }

  chkPopWidth(width: number) {
    const character = this.tabletopObject as GameCharacter;
    character.overViewWidth = clampInRange(width, 270, 800, character.overViewWidth);
  }

  chkPopMaxHeight(maxHeight: number) {
    const character = this.tabletopObject as GameCharacter;
    character.overViewMaxHeight = clampInRange(maxHeight, 250, 1000, character.overViewMaxHeight);
  }
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

  setLocation(locationName: string) {
    this.tabletopObject?.setLocation(locationName);
  }

  openModal(name: string = '', isAllowedEmpty: boolean = false) {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then((value) => {
      const obj = this.tabletopObject;
      if (!obj || !obj.imageDataElement || !value) return;
      const element = obj.imageDataElement.getFirstElementByName(name);
      if (!element) return;
      element.value = value;
    });
  }

  changeMaskFillColor(event: string) {
    if (this.tabletopObject) {
      const mask: GameTableScratchMask = this.tabletopObject as GameTableScratchMask;
      mask.color = event;
    }
  }

  changeMaskChangeColor(event: string) {
    if (this.tabletopObject) {
      const mask: GameTableScratchMask = this.tabletopObject as GameTableScratchMask;
      mask.changeColor = event;
    }
  }

  changeGridColor(event: string) {
    if (this.tabletopObject) {
      const range: RangeArea = this.tabletopObject as RangeArea;
      range.gridColor = event;
    }
  }

  changeRangeColor(event: string) {
    if (this.tabletopObject) {
      const range: RangeArea = this.tabletopObject as RangeArea;
      range.rangeColor = event;
    }
  }

  onChkDiceKomaSize(event: Event): void {
    this.chkDiceKomaSize((event.target as HTMLInputElement).valueAsNumber);
  }
  onChkLocationX(event: Event): void {
    const character = this.tabletopObject as GameCharacter;
    const x = roundOr((event.target as HTMLInputElement).valueAsNumber, 0);
    character.location = { ...character.location, x };
  }
  onChkLocationY(event: Event): void {
    const character = this.tabletopObject as GameCharacter;
    const y = roundOr((event.target as HTMLInputElement).valueAsNumber, 0);
    character.location = { ...character.location, y };
  }
  onChkPopWidth(event: Event): void {
    this.chkPopWidth((event.target as HTMLInputElement).valueAsNumber);
  }
  onChkPopMaxHeight(event: Event): void {
    this.chkPopMaxHeight((event.target as HTMLInputElement).valueAsNumber);
  }
  onSetLocation(event: Event): void {
    this.setLocation((event.target as HTMLInputElement).value);
  }
  onChangeMaskFillColor(event: Event): void {
    this.changeMaskFillColor((event.target as HTMLInputElement).value);
  }
  onChangeMaskChangeColor(event: Event): void {
    this.changeMaskChangeColor((event.target as HTMLInputElement).value);
  }
  onChangeRangeColor(event: Event): void {
    this.changeRangeColor((event.target as HTMLInputElement).value);
  }
  onChangeGridColor(event: Event): void {
    this.changeGridColor((event.target as HTMLInputElement).value);
  }

  isPopupDataElement(element: DataElement): boolean {
    this.objectChange.versionOf(element.identifier)();
    return (
      element.getAttribute(DataElementAttribute.POPUP) === 'true' ||
      (this.character?.overViewDataTags.includes(element.identifier) ?? false)
    );
  }

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
