import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { CardFlipCutInService } from '@axe/application/card/card-flip-cut-in.service';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { ImageFile, imageFileEqual } from '@axe/core/storage/image-file';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { buildCardContextMenu } from '@axe/features/card/card/card-context-menu';
import { selectOverlappingCards } from '@axe/features/card/card/overlapping-cards';
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
import { containedImageRect } from '@axe/ui/tabletop/contained-image-rect';
import { DoubleTap } from '@axe/ui/tabletop/double-tap';
import { hideIconWhileTouched } from '@axe/ui/tabletop/icon-hiding';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { supersampleFactor, supersampleInsetPercent, supersampleTransform } from '@axe/ui/tabletop/supersample';
import { translateZCss, Z_OFFSET_TABLETOP_OBJECT_PX } from '@axe/ui/tabletop/z-offset';

@Component({
  selector: 'card',
  templateUrl: './card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, NgStyle, SafePipe, CardFaceTextComponent],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    class: 'block',
    '(carddrop)': 'onCardDrop($event)',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class CardComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tabletopService = inject(TabletopService);
  private readonly imageService = inject(ImageService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly flipCutIn = inject(CardFlipCutInService);
  private readonly cardTarget = inject(CardTargetService);

  readonly card = input.required<Card>();

  get dispLockMark(): boolean {
    return this.card().dispLockMark;
  }
  set dispLockMark(disp: boolean) {
    this.card().dispLockMark = disp;
  }

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
  get state(): CardState {
    return this.card().state;
  }
  set state(state: CardState) {
    this.card().state = state;
  }
  get rotate(): number {
    return this.card().rotate;
  }
  set rotate(rotate: number) {
    this.card().rotate = rotate;
  }
  get owner(): string {
    return this.card().owner;
  }
  set owner(owner: string) {
    this.card().owner = owner;
  }
  get zindex(): number {
    return this.card().zindex;
  }
  get size(): number {
    return Math.max(0, this.card().size);
  }

  get isPeeking(): boolean {
    return this.card().isPeeking;
  }
  get isFront(): boolean {
    return this.card().isFront;
  }
  get isVisible(): boolean {
    return this.card().isVisible;
  }
  get hasOwner(): boolean {
    return this.card().hasOwner;
  }
  get ownerIsOnline(): boolean {
    return this.card().ownerIsOnline;
  }
  get ownerName(): string {
    return this.card().ownerName;
  }

  readonly imageFile = computed(
    () => {
      this.objectChange.fileVersion();
      const card = this.card();
      this.objectChange.versionOf(card.identifier)();
      return this.imageService.getSkeletonOr(card.imageFile);
    },
    { equal: imageFileEqual() }
  );
  get frontImage(): ImageFile {
    return this.imageService.getSkeletonOr(this.card().frontImage);
  }
  get backImage(): ImageFile {
    return this.imageService.getSkeletonOr(this.card().backImage);
  }

  /**
   * The face the table sees, read through the signals rather than off the card.
   *
   * A picture arrives in two steps: the name of it comes with the card, and the bytes follow
   * when the room has passed them along. Read straight off the card, neither step moves the
   * view, so the card stayed blank for everybody else until it was dragged and the change
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

  readonly canPeek = computed(() => {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.networkVersion();
    return card.isPeeking;
  });

  private readonly imageNaturalSize = linkedSignal<string, { width: number; height: number } | null>({
    source: () => this.displayedImageUrl(),
    computation: () => null,
  });

  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    this.imageNaturalSize.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  readonly imageSupersample = computed(() => {
    const natural = this.imageNaturalSize();
    if (!natural) return 1;
    return supersampleFactor(natural.width, this.size * this.gridSize);
  });

  readonly imageSupersamplePercent = computed(() => this.imageSupersample() * 100 + '%');

  readonly imageSupersampleInset = computed(() => supersampleInsetPercent(this.imageSupersample()) + '%');

  readonly imageBoxHeightPx = computed(() => {
    const natural = this.imageNaturalSize();
    if (!natural || this.imageSupersample() <= 1) return null;
    return (this.size * this.gridSize * natural.height) / natural.width;
  });

  readonly imageTransform = computed(() => supersampleTransform({ factor: this.imageSupersample(), anchor: 'top' }));

  private readonly peekNaturalSize = linkedSignal<string, { width: number; height: number } | null>({
    source: () => this.frontImage.url,
    computation: () => null,
  });

  onPeekImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    this.peekNaturalSize.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  readonly peekSupersample = computed(() => {
    const natural = this.peekNaturalSize();
    if (!natural) return 1;
    return supersampleFactor(Math.min(natural.width, natural.height), this.size * this.gridSize);
  });

  /** A peeked card is held a little smaller than the one it is drawn over. */
  protected readonly peekScale = 'scale(0.9)';

  readonly peekTransform = computed(() =>
    supersampleTransform({ factor: this.peekSupersample(), anchor: 'center', inner: this.peekScale })
  );

  private readonly peekFrameRect = computed(() => {
    const frameWidth = this.size * this.gridSize;
    const back = this.imageNaturalSize();
    const frameHeight = back && back.width > 0 ? (frameWidth * back.height) / back.width : frameWidth;
    return { width: frameWidth, height: frameHeight };
  });

  readonly peekImageLayout = computed(() => {
    const frame = this.peekFrameRect();
    const factor = this.peekSupersample();
    const width = frame.width * factor;
    const height = frame.height * factor;
    return {
      left: (frame.width - width) / 2,
      top: (frame.height - height) / 2,
      width,
      height,
    };
  });

  readonly peekFaceRect = computed(() => {
    const frame = this.peekFrameRect();
    const front = this.peekNaturalSize();
    if (!front) return { left: 0, top: 0, ...frame };
    return containedImageRect(frame.width, frame.height, front.width, front.height) ?? { left: 0, top: 0, ...frame };
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

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly doubleTap = new DoubleTap(() => this.input);

  constructor() {
    setupMovableRotableForPiece(this, {
      target: this.card,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_TABLETOP_OBJECT_PX),
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

  onCardDrop(e: Event) {
    const ce = e as CustomEvent;
    if (this.card() === ce.detail || (!(ce.detail instanceof Card) && !(ce.detail instanceof CardStack))) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    if (ce.detail instanceof CardStack) {
      const cardStack: CardStack = ce.detail;
      const distance: number =
        (cardStack.location.x - this.card().location.x) ** 2 +
        (cardStack.location.y - this.card().location.y) ** 2 +
        (cardStack.posZ - this.card().posZ) ** 2;
      if (distance < 25 ** 2) {
        cardStack.location.x = this.card().location.x;
        cardStack.location.y = this.card().location.y;
        cardStack.posZ = this.card().posZ;
        cardStack.putOnBottom(this.card());
      }
    }
  }

  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop) return;
    if (!this.doubleTap.isInPlace()) return;
    if (this.ownerIsOnline && !this.isPeeking) return;
    const turnsToFront = !(this.isVisible && !this.isPeeking);
    this.state = turnsToFront ? CardState.FRONT : CardState.BACK;
    this.owner = '';
    SoundEffect.play(PresetSound.cardDraw);
    if (turnsToFront) this.flipCutIn.playFor(this.card());
  }

  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    this.card().toTopmost();
    this.iconHiding.touch();
  }

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

  onMove() {
    this.input!.cancel();
    SoundEffect.play(PresetSound.cardPick);
    this.positionBeforeDrag = { x: this.card().location.x, y: this.card().location.y };
    this.handDrag.armTableDrag(this.card());
  }

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
    this.dispatchCardDropEvent();
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

  private dispatchCardDropEvent() {
    const element: HTMLElement = this.elementRef.nativeElement;
    const parent = element.parentElement!;
    const children = parent.children;
    const event = new CustomEvent('carddrop', { detail: this.card(), bubbles: true });
    for (let i = 0; i < children.length; i++) {
      children[i].dispatchEvent(event);
    }
  }

  private showDetail(gameObject: Card) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.card.settingTitle'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 600, height: 600 });
  }
}
