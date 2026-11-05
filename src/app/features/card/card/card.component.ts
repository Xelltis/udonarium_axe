import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { buildCardContextMenu } from '@axe/features/card/card/card-context-menu';
import { selectOverlappingCards } from '@axe/features/card/card/overlapping-cards';
import { CardDropService } from '@axe/features/card/card-drop.service';
import { CardFlipCutInService } from '@axe/features/card/card-flip-cut-in.service';
import { elementsAt } from '@axe/features/card/hand-rail/elements-at';
import { HandDragService } from '@axe/features/card/hand-rail/hand-drag.service';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { CardFaceTextComponent } from '@axe/ui/components/card-face-text/card-face-text.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { DoubleTap } from '@axe/ui/tabletop/double-tap';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { hideIconWhileTouched } from '@axe/ui/tabletop/icon-hiding';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

/** The least a card covers either way, in px, however small its size or its picture. */
const CARD_SMALLEST_PX = 25;

@Component({
  selector: 'card',
  templateUrl: './card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HudPlaceDirective,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    SafePipe,
    CardFaceTextComponent,
  ],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '[attr.data-object-id]': 'card().identifier',
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class CardComponent {
  private readonly cardDrop = inject(CardDropService);
  private readonly movableRef = viewChild(MovableDirective);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tabletopService = inject(TabletopService);

  private readonly imageService = inject(ImageService);
  private readonly pictureSizes = inject(PictureSizeService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly flipCutIn = inject(CardFlipCutInService);
  private readonly cardTarget = inject(CardTargetService);

  readonly card = input.required<Card>();

  /** Whether a locked card shows its lock mark; written straight through to the shared card. */
  get dispLockMark(): boolean {
    return this.card().dispLockMark;
  }
  set dispLockMark(disp: boolean) {
    this.card().dispLockMark = disp;
  }

  /**
   * Whether the card is locked in place, which stops it being dragged; written straight through to
   * the shared card.
   */
  get isLock(): boolean {
    return this.card().isLock;
  }
  set isLock(isLock: boolean) {
    this.card().isLock = isLock;
  }

  readonly name = computed(() => {
    this.objectChange.versionOf(this.card().identifier)();
    this.objectChange.networkVersion();
    if (this.card().owner) {
      const cursor = PeerCursor.findByUserId(this.card().owner);
      if (cursor) this.objectChange.versionOf(cursor.identifier)();
    }
    return this.card().name;
  });
  /** Which face the card is turned to, read from and written to the shared card. */
  get state(): CardState {
    return this.card().state;
  }
  set state(state: CardState) {
    this.card().state = state;
  }
  /** The card's rotation on the table in degrees, read from and written to the shared card. */
  get rotate(): number {
    return this.card().rotate;
  }
  set rotate(rotate: number) {
    this.card().rotate = rotate;
  }
  /**
   * The user id of whoever is peeking at the card, empty when nobody is; written straight through
   * to the shared card.
   */
  get owner(): string {
    return this.card().owner;
  }
  set owner(owner: string) {
    this.card().owner = owner;
  }
  /** The card's stacking order on the table. */
  get zindex(): number {
    return this.card().zindex;
  }
  /** The corners of the card's face, round from its top left, where its handles stand. */
  protected readonly faceCorners = [0, 1, 2, 3] as const;

  /** The card's width in grid squares, never below zero. */
  get size(): number {
    return Math.max(0, this.card().size);
  }

  /** Whether this user is the one peeking at the card's face while it lies face down. */
  get isPeeking(): boolean {
    return this.card().isPeeking;
  }
  /** Whether the card lies face up for everyone. */
  get isFront(): boolean {
    return this.card().isFront;
  }
  /**
   * Whether this user can see the card's face: it is face up, they are peeking, or it is in their
   * hand.
   */
  get isVisible(): boolean {
    return this.card().isVisible;
  }
  /**
   * Whose the card is, as the label over its back says it.
   *
   * It follows the card and the peers, since a name is read off the owner's cursor.
   */
  readonly hasOwner = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    return card.hasOwner;
  });

  readonly ownerName = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.networkVersion();
    const cursor = card.owner ? PeerCursor.findByUserId(card.owner) : null;
    if (cursor) this.objectChange.versionOf(cursor.identifier)();
    return card.ownerName;
  });
  /** Whether the card has an owner who is still connected to the room. */
  get ownerIsOnline(): boolean {
    return this.card().ownerIsOnline;
  }

  /**
   * The face the table sees, read through the signals rather than off the card.
   *
   * A picture arrives in two steps: the name of it comes with the card, and the bytes follow
   * when the room has passed them along. Read straight off the card, neither step moves the
   * view, so the card would stay blank for everybody else until it was dragged and the change
   * detection happened to run.
   */
  readonly displayedImageUrl = computed(() => {
    this.objectChange.fileVersion();
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    return this.imageService.getSkeletonOr(card.isFront ? card.frontImage : card.backImage).url;
  });

  /** The face the owner is allowed to peek at, read the same way. */
  readonly peekImageUrl = computed(() => {
    this.objectChange.fileVersion();
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    return this.imageService.getSkeletonOr(card.frontImage).url;
  });

  readonly showsFront = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.networkVersion();
    return card.isFront;
  });

  /**
   * Whether the canvas draws the card's face from a picture taken of it here, as it does of a face
   * that carries words: the canvas draws only the card's own pictures.
   */
  readonly picturesFace = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.networkVersion();
    return card.isVisible && card.faceText.length > 0;
  });
  private readonly pictured = viewChild<ElementRef<HTMLElement>>('pictured');

  readonly canPeek = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.networkVersion();
    return card.isPeeking;
  });

  private readonly handDrag = inject(HandDragService);

  readonly isHiddenByFog = computed(() => {
    const piece = this.card();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, this.size);
  });
  private positionBeforeDrag: { x: number; y: number } | null = null;

  private readonly iconHiding = hideIconWhileTouched(this.destroyRef);
  readonly isIconHidden = this.iconHiding.isHidden;

  /** The size of one grid square on the current table, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  /**
   * How much of its face the card covers: as wide as its size, and as deep as the picture the canvas
   * draws it with runs, the one taken of a face that carries words or else its own.
   */
  private footprint(): { width: number; height: number } {
    const width = Math.max(CARD_SMALLEST_PX, this.size * this.gridSize);
    const taken = this.pictured()?.nativeElement;
    const own = this.pictureSizes.sizeOf(this.displayedImageUrl());
    const height = taken ? taken.offsetHeight : own && own.width > 0 ? (width * own.height) / own.width : 0;
    return { width, height: Math.max(CARD_SMALLEST_PX, height) };
  }

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly doubleTap = new DoubleTap(() => this.input);

  constructor() {
    setupMovableRotableForPiece(this, {
      target: this.card,
      collideLayers: ['terrain'],
      footprint: () => this.footprint(),
    });
    pictureForCanvas({
      identifier: () => this.card().identifier,
      element: () => this.pictured()?.nativeElement,
      pictured: () => this.picturesFace(),
      follows: () => {
        this.objectChange.versionOf(this.card().identifier)();
        this.displayedImageUrl();
      },
    });
    this.destroyRef.onDestroy(() => {
      this.doubleTap.cancel();
    });
  }

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  /**
   * Feeds a press on the card to the double-tap detector, which flips the card on the second tap.
   */
  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  /**
   * Flips the card over on a double tap, clearing whoever was peeking at it and playing the flip
   * cut-in when it turns face up.
   *
   * Nothing happens for a user who may not edit the table, when the pointer moved between the taps,
   * or when someone else online is holding the card face down to peek at it.
   */
  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop()) return;
    if (!this.doubleTap.isInPlace()) return;
    if (this.ownerIsOnline && !this.isPeeking) return;
    const turnsToFront = !(this.isVisible && !this.isPeeking);
    this.state = turnsToFront ? CardState.FRONT : CardState.BACK;
    this.owner = '';
    SoundEffect.play(PresetSound.cardDraw);
    if (turnsToFront) this.flipCutIn.playFor(this.card());
  }

  /** Stops the browser's own image drag, so pressing on the card moves the piece instead. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Brings the card to the top when it is pressed, for a seat that may change the table, and starts
   * watching for a double tap.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    if (this.rolePermission.canEditTabletop()) this.card().toTopmost();
    this.iconHiding.touch();
  }

  /**
   * Opens the card's right-click menu at the pointer.
   *
   * While several pieces are selected, the menu for the whole selection opens instead. Entries for
   * switching the table surface follow the card's own when the table has any.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.card(), this.gridSize, position)) return;
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.card(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    const baseMenu = buildCardContextMenu(
      this.card(),
      this.gridSize,
      {
        onCreateStack: () => this.createStack(),
        onOverlappingToHand: () => this.overlappingToHand(),
        onShowDetail: () => this.showDetail(this.card()),
        onFlipToFront: () => this.flipCutIn.playFor(this.card()),
        onAssignCutIn: (cutInIdentifier: string) => this.flipCutIn.assign(this.card(), cutInIdentifier),
        onPickTarget: () => this.cardTarget.beginPicking(this.card()),
        onClearTarget: () => this.cardTarget.clearTarget(this.card()),
      },
      this.flipCutIn.cutIns(),
      this.translateFn
    );
    this.contextMenuService.open(
      position,
      surfaceEntries.length > 0 ? [...baseMenu, ContextMenuSeparator, ...surfaceEntries] : baseMenu,
      this.isVisible ? this.name() : this.translateFn('feature.card.title')
    );
  }

  /**
   * Starts dragging or rotating the card, remembering where it lay so a drop on the hand rail can
   * put it back.
   */
  onMove() {
    this.input!.cancel();
    SoundEffect.play(PresetSound.cardPick);
    this.positionBeforeDrag = { x: this.card().location.x, y: this.card().location.y };
    this.handDrag.armTableDrag(this.card());
  }

  /**
   * Finishes a drag or rotation of the card.
   *
   * Let go of over the hand rail, the card returns to where it lay and goes into this user's hand.
   * Anywhere else it stays where it landed and is offered to what it landed on, so a stack can take
   * it in.
   */
  onMoved() {
    this.handDrag.disarmTableDrag();
    const origin = this.positionBeforeDrag;
    this.positionBeforeDrag = null;
    if (origin && this.isDroppedOnHandRail()) {
      const card = this.card();
      card.location.x = origin.x;
      card.location.y = origin.y;
      card.toHand(PeerCursor.myCursor?.userId ?? '');
      card.update();
      this.objectChange.notifyChanged(card.identifier);
      SoundEffect.play(PresetSound.cardDraw);
      return;
    }
    SoundEffect.play(PresetSound.cardPut);
    this.movableRef()?.commitPosition();
    this.cardDrop.drop(this.card());
  }

  private isDroppedOnHandRail(): boolean {
    const pointer = this.pointerDeviceService.pointers[0];
    return elementsAt(pointer.x, pointer.y).some((element) => element.closest('.hand-rail') != null);
  }

  private createStack() {
    const cardStack = CardStack.create(this.translateFn('feature.cardStack.defaultName'));
    cardStack.location.x = this.card().location.x;
    cardStack.location.y = this.card().location.y;
    cardStack.posZ = this.card().posZ;
    cardStack.location.name = this.card().location.name;
    cardStack.rotate = this.rotate;
    cardStack.zindex = this.card().zindex;

    for (const card of this.overlappingCards()) {
      cardStack.putOnBottom(card);
    }
  }

  private overlappingCards(): Card[] {
    return selectOverlappingCards(this.tabletopService.cards, this.card());
  }

  private overlappingToHand(): void {
    const userId = PeerCursor.myCursor?.userId ?? '';
    if (!userId) return;
    for (const card of this.overlappingCards()) {
      card.toHand(userId);
      card.update();
      this.objectChange.notifyChanged(card.identifier);
    }
  }

  private showDetail(gameObject: Card) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.card.settingTitle'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 600, height: 600 });
  }
}
