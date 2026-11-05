import { NgClass } from '@angular/common';
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
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { copyDetailSchema } from '@axe/domain/card/deck-builder';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CardDrawCountDialogComponent } from '@axe/features/card/card-draw-count-dialog/card-draw-count-dialog.component';
import { CardDropService } from '@axe/features/card/card-drop.service';
import { CardGameService } from '@axe/features/card/card-game.service';
import { buildCardStackContextMenu } from '@axe/features/card/card-stack/card-stack-context-menu';
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
import { TranslocoModule } from '@jsverse/transloco';

/** The cell, in px, that the offsets for drawn and scattered cards were laid out for. */
const LAID_OUT_FOR_CELL_PX = 50;

/** How wide the edge of the plate a stack's top card lies in is, round the picture, in px. */
const STACK_PLATE_BORDER_PX = 5;

/** How deep the plate of a stack with no cards is, in px. */
const EMPTY_STACK_PX = 100;

@Component({
  selector: 'card-stack',
  templateUrl: './card-stack.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HudPlaceDirective,
    MovableDirective,
    NgClass,
    RotableDirective,
    SelectableDirective,
    SafePipe,
    TranslocoModule,
    CardFaceTextComponent,
  ],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '[attr.data-object-id]': 'cardStack().identifier',
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class CardStackComponent {
  private readonly cardGameService = inject(CardGameService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly imageService = inject(ImageService);
  private readonly pictureSizes = inject(PictureSizeService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  protected readonly tabletopService = inject(TabletopService);

  private readonly motions = inject(PieceMotionsService);
  private readonly modalService = inject(ModalService);
  private readonly cardDrop = inject(CardDropService);
  private readonly movableRef = viewChild(MovableDirective);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  readonly isHiddenByFog = computed(() => {
    const piece = this.cardStack();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, this.size);
  });

  readonly cardStack = input.required<CardStack>();

  /**
   * Whether the canvas draws the top card from a picture taken of it here, as it does of a face that
   * carries words: the canvas draws only the card's own picture.
   */
  readonly picturesTop = computed(() => {
    this.objectChange.versionOf(this.cardStack().identifier)();
    this.objectChange.networkVersion();
    const top = this.cardStack().topCard;
    if (top) this.objectChange.versionOf(top.identifier)();
    return !!top && top.isVisible && top.faceText.length > 0;
  });
  private readonly pictured = viewChild<ElementRef<HTMLElement>>('pictured');

  readonly isLock = computed(() => {
    const cardStack = this.cardStack();
    this.objectChange.versionOf(cardStack.identifier)();
    return cardStack.isLock;
  });

  readonly name = computed(() => {
    this.objectChange.versionOf(this.cardStack().identifier)();
    this.objectChange.networkVersion();
    if (this.cardStack().owner) {
      const cursor = PeerCursor.findByUserId(this.cardStack().owner);
      if (cursor) this.objectChange.versionOf(cursor.identifier)();
    }
    return this.cardStack().name;
  });
  /** The stack's turn on the table in degrees; writing it turns the synced stack. */
  get rotate(): number {
    return this.cardStack().rotate;
  }
  set rotate(rotate: number) {
    this.cardStack().rotate = rotate;
  }
  /** Where the stack sits in the stacking order of the pieces on the table. */
  get zindex(): number {
    return this.cardStack().zindex;
  }
  /** Whether the stack shows how many cards it holds, as toggled from its context menu. */
  get isShowTotal(): boolean {
    return this.cardStack().isShowTotal;
  }
  /**
   * How many cards the stack holds, following every card that joins it or leaves it, here or at a
   * peer.
   */
  readonly cardCount = computed(() => {
    const cardStack = this.cardStack();
    this.objectChange.versionOf(cardStack.identifier)();
    return cardStack.cards.length;
  });
  /** Whether the stack has no cards left, which shrinks its frame to a fixed size. */
  get isEmpty(): boolean {
    return this.cardStack().isEmpty;
  }
  /** The stack's width in grid cells, taken from its top card; 2 when the stack is empty. */
  get size(): number {
    const card = this.cardStack().topCard;
    return card ? card.size : 2;
  }

  /**
   * Who is looking through the stack, as the label under it says.
   *
   * It follows the stack and the peers, since a name is read off the owner's cursor.
   */
  readonly hasOwner = computed(() => {
    const cardStack = this.cardStack();
    this.objectChange.versionOf(cardStack.identifier)();
    return cardStack.hasOwner;
  });

  readonly ownerName = computed(() => {
    const cardStack = this.cardStack();
    this.objectChange.versionOf(cardStack.identifier)();
    this.objectChange.networkVersion();
    const cursor = cardStack.owner ? PeerCursor.findByUserId(cardStack.owner) : null;
    if (cursor) this.objectChange.versionOf(cursor.identifier)();
    return cardStack.ownerName;
  });

  /** The card showing on top of the stack, or null when the stack is empty. */
  get topCard(): Card | null {
    return this.cardStack().topCard;
  }

  readonly imageFile = computed(
    () => {
      this.objectChange.fileVersion();
      const cardStack = this.cardStack();
      this.objectChange.versionOf(cardStack.identifier)();
      return this.imageService.getSkeletonOr(cardStack.imageFile);
    },
    { equal: imageFileEqual() }
  );

  private readonly iconHiding = hideIconWhileTouched(this.destroyRef);
  readonly isIconHidden = this.iconHiding.isHidden;

  /** The size of one grid cell on the current table, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  /**
   * How much of its face the stack covers: as wide as its top card, and as deep as the plate the
   * canvas draws it on runs, a rim round the picture the canvas draws its top card with, the one
   * taken of a face that carries words or else the card's own. An empty stack is a bare plate.
   */
  private footprint(): { width: number; height: number } {
    const width = this.size * this.gridSize;
    if (this.isEmpty) return { width, height: EMPTY_STACK_PX };
    const pictureWidth = width - 2 * STACK_PLATE_BORDER_PX;
    const taken = this.pictured()?.nativeElement;
    const own = this.pictureSizes.sizeOf(this.imageFile().url);
    const pictureHeight = taken
      ? taken.offsetHeight
      : own && own.width > 0
        ? (pictureWidth * own.height) / own.width
        : 0;
    return { width, height: pictureHeight + 2 * STACK_PLATE_BORDER_PX };
  }

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly doubleTap = new DoubleTap(() => this.input);

  constructor() {
    this.objectChange.shuffleCardStack$.subscribe((event) => {
      if (event.identifier === this.cardStack().identifier) {
        this.motions.play(event.identifier, 'shuffle', { parts: ['top'] });
      }
    }, this.destroyRef);
    setupMovableRotableForPiece(this, {
      target: this.cardStack,
      collideLayers: ['terrain'],
      footprint: () => this.footprint(),
    });
    pictureForCanvas({
      identifier: () => this.cardStack().identifier,
      element: () => this.pictured()?.nativeElement,
      pictured: () => this.picturesTop(),
      follows: () => {
        this.objectChange.versionOf(this.cardStack().identifier)();
        this.imageFile();
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

  /** Feeds a press into the double-tap detector, which draws a card when a second press lands in place. */
  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  /**
   * Draws the top card onto the table on a double click or double tap.
   *
   * Does nothing for a reader who may not edit the table, or when the pointer moved between the two
   * presses.
   */
  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop()) return;
    if (!this.doubleTap.isInPlace()) return;
    if (this.drawCard() != null) {
      SoundEffect.play(PresetSound.cardDraw);
    }
  }

  /** Stops the browser's native drag of the stack's images, so only the movable directive moves it. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Starts a press on the stack: arms the double tap, brings the stack to the top for a seat that
   * may change the table, briefly hides its handle icons and selects it.
   */
  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    if (this.rolePermission.canEditTabletop()) this.cardStack().toTopmost();
    this.iconHiding.touch();

    this.selectionSignalService.selectObject(this.cardStack().identifier, 'GameCharacter');
  }

  /**
   * Opens the stack's context menu at the pointer.
   *
   * When several pieces are selected the shared selection menu opens instead. Entries for switching
   * the surface the stack lies on are appended when there are any.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.cardStack(), this.gridSize, position)) return;
    const menuArray = buildCardStackContextMenu(
      this.cardStack(),
      this.gridSize,
      () => this.drawCard(),
      () => this.drawCardToHand(),
      () => this.openDrawCardsDialog(),
      (n) => this.splitStack(n),
      () => this.breakStack(),
      () => this.dealAll(),
      () => this.copySchemaToAll(),
      (cs) => this.showDetail(cs),
      this.translateFn
    );
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.cardStack(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    this.contextMenuService.open(
      position,
      surfaceEntries.length > 0 ? [...menuArray, ContextMenuSeparator, ...surfaceEntries] : menuArray,
      this.name()
    );
  }

  /** Plays the pick-up sound when the stack starts being dragged or turned. */
  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  /**
   * Plays the put-down sound when a drag ends, and offers the stack to what it landed on, so it can
   * merge into a stack or take in a card there.
   */
  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
    this.movableRef()?.commitPosition();
    this.cardDrop.drop(this.cardStack());
  }

  private drawCard(): Card | null {
    return this.drawCardAt(0);
  }

  private drawCardToHand(): Card | null {
    const card = this.drawCard();
    if (card) card.toHand(PeerCursor.myUserId);
    return card;
  }

  private drawCards(count: number): Card[] {
    const normalizedCount = Number.isFinite(count) ? Math.floor(count) : 0;
    const drawCount = Math.min(Math.max(0, normalizedCount), this.cardStack().cards.length);
    const cards: Card[] = [];
    for (let index = 0; index < drawCount; index++) {
      const card = this.drawCardAt(index);
      if (!card) break;
      cards.push(card);
    }
    return cards;
  }

  private drawCardAt(index: number): Card | null {
    const card = this.cardStack().drawCard();
    if (card) {
      this.cardStack().update();
      const scale = this.gridSize / LAID_OUT_FOR_CELL_PX;
      card.location.x += (100 + index * 18 + Math.random() * 50) * scale;
      card.location.y += (25 + index * 8 + Math.random() * 50) * scale;
      card.setLocation(this.cardStack().location.name);
    }
    return card;
  }

  private async openDrawCardsDialog() {
    const maxCount = this.cardStack().cards.length;
    if (maxCount < 1) return;

    const count = await this.modalService
      .open<number | null>(CardDrawCountDialogComponent, {
        title: this.translateFn('feature.card.drawDialog.title'),
        maxCount,
        defaultCount: Math.min(2, maxCount),
      })
      .catch(() => null);
    if (count == null) return;

    if (this.drawCards(count).length > 0) {
      SoundEffect.play(PresetSound.cardDraw);
    }
  }

  private copySchemaToAll() {
    const stack = this.cardStack();
    const sample = stack.topCard;
    if (!sample) return;
    let changed = 0;
    for (const card of stack.cards) {
      if (card === sample) continue;
      if (copyDetailSchema(sample.detailDataElement, card.detailDataElement).length > 0) changed += 1;
    }
    if (changed > 0) SoundEffect.play(PresetSound.cardPut);
  }

  /**
   * Deals the whole stack out. Asked first when some cards are face down to this seat on a room
   * server, as their jokers cannot be told apart and go out with the rest; a player there is
   * pointed to the GM, who holds every face.
   */
  private async dealAll() {
    const stack = this.cardStack();
    const withheld = stack.cards.some((card) => card.isFaceWithheld);
    if (withheld) {
      const gameMasterHoldsThem =
        getAuthorityPeerId() !== null && !isNetworkIsolated() && !PeerCursor.isMyselfGameMaster;
      const askGm = gameMasterHoldsThem ? this.translateFn('feature.cardStack.message.dealWithheldAskGm') : '';
      if (!(await this.confirm.ask(this.translateFn('feature.cardStack.message.dealWithheld', { askGm })))) return;
    }
    this.cardGameService.dealAll(stack);
  }

  private breakStack() {
    const cards = this.cardStack().drawCardAll().reverse();
    const scale = this.gridSize / LAID_OUT_FOR_CELL_PX;
    for (const card of cards) {
      card.location.x += (25 - Math.random() * 50) * scale;
      card.location.y += (25 - Math.random() * 50) * scale;
      card.toTopmost();
      card.setLocation(this.cardStack().location.name);
    }
    this.cardStack().setLocation('graveyard');
    this.cardStack().destroy();
  }

  /**
   * Deals the deck's cards in turn into `split` new piles beside it. The cards go into the piles
   * before the deck is taken away, as a room server takes away with a deck all it still holds.
   */
  private splitStack(split: number) {
    if (split < 2) return;
    const cardStacks: CardStack[] = [];
    const scale = this.gridSize / LAID_OUT_FOR_CELL_PX;
    for (let i = 0; i < split; i++) {
      const cardStack = CardStack.create(this.cardStack().name);
      cardStack.location.x = this.cardStack().location.x + (50 - Math.random() * 100) * scale;
      cardStack.location.y = this.cardStack().location.y + (50 - Math.random() * 100) * scale;
      cardStack.posZ = this.cardStack().posZ;
      cardStack.location.name = this.cardStack().location.name;
      cardStack.rotate = this.rotate;
      cardStack.toTopmost();
      cardStacks.push(cardStack);
    }

    const cards = this.cardStack().drawCardAll();
    let num = 0;
    let splitIndex = (cards.length / split) * (num + 1);
    for (let i = 0; i < cards.length; i++) {
      cardStacks[num].putOnBottom(cards[i]);
      if (splitIndex <= i + 1) {
        num++;
        splitIndex = (cards.length / split) * (num + 1);
      }
    }

    this.cardStack().setLocation('graveyard');
    this.cardStack().destroy();
  }

  private showDetail(gameObject: CardStack) {
    const title = sheetPanelTitle(this.translateFn('feature.cardStack.settingTitle'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 640, height: 720 }, { offset: { x: 300, y: 300 } });
  }
}
