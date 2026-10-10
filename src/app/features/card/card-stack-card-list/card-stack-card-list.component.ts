import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { callShuffleCardStack } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  formatTrumpCardCode,
  parseTrumpCardCode,
  TrumpCardLabel,
} from '@axe/features/card/card-stack-card-list/trump-card-label';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { CardFacePreviewComponent } from '@axe/ui/components/card-face-preview/card-face-preview.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { type DropSide, RowReorder } from '@axe/ui/dragging/row-reorder';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'card-stack-card-list',
  templateUrl: './card-stack-card-list.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipDirective, SafePipe, TranslocoModule, CardFacePreviewComponent],
})
export class CardStackCardListComponent {
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  readonly cardStack = input.required<CardStack>();

  private readonly owner = Network.peerContext.userId;
  private currentlyOwned: CardStack | null = null;

  readonly cards = computed<readonly Card[]>(() => {
    const stack = this.cardStack();
    this.objectChange.versionOf(stack.identifier)();
    return stack.cards;
  });

  constructor() {
    effect(() => {
      const stack = this.cardStack();
      untracked(() => this.claimOwnership(stack));
    });

    this.objectChange.onObjectChangedFor(
      () => [this.cardStack().identifier],
      () => {
        const stack = this.cardStack();
        if (stack.owner && stack.owner !== this.owner) {
          this.panelService.close();
        }
      },
      this.destroyRef
    );
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (this.cardStack().identifier === e.identifier) {
        this.panelService.close();
      }
    }, this.destroyRef);
    this.destroyRef.onDestroy(() => this.releaseOwnership());
  }

  private claimOwnership(stack: CardStack): void {
    if (this.currentlyOwned && this.currentlyOwned !== stack && this.currentlyOwned.owner === this.owner) {
      this.currentlyOwned.owner = '';
    }
    stack.owner = this.owner;
    this.currentlyOwned = stack;
  }

  private releaseOwnership(): void {
    if (this.currentlyOwned && this.currentlyOwned.owner === this.owner) {
      this.currentlyOwned.owner = '';
    }
    this.currentlyOwned = null;
  }

  /** Shuffles the stack for everyone at the table, announcing the shuffle and playing its sound. */
  shuffle(): void {
    const stack = this.cardStack();
    stack.shuffle();
    callShuffleCardStack(stack.identifier);
    SoundEffect.play(PresetSound.cardShuffle);
  }

  /**
   * Takes a card out of the stack and lays it on the table beside it, from the list's draw button.
   *
   * The card lands a little to the lower right of the stack with some random scatter, on the same
   * table, turned by the stack's rotation and brought to the top.
   */
  drawCard(card: Card): void {
    const stack = this.cardStack();
    card.parent?.removeChild(card);
    card.location.x = stack.location.x + 100 + Math.random() * 50;
    card.location.y = stack.location.y + 25 + Math.random() * 50;
    card.location.name = stack.location.name;
    card.rotate += stack.rotate;
    if (360 < card.rotate) card.rotate -= 360;
    card.toTopmost();
    SoundEffect.play(PresetSound.cardDraw);
  }

  /** Opens the card's own settings sheet, placed just off the corner of this panel. */
  showDetail(card: Card): void {
    const title = sheetPanelTitle(this.t('feature.card.settingTitle'), card.name);
    this.objectPanels.openSheet(
      card,
      title,
      { width: 600, height: 600 },
      { at: { x: this.panelService.left, y: this.panelService.top }, offset: { x: -20, y: -30 } }
    );
  }

  /** Keys a row of the list by its card, so reordering moves rows rather than rebuilding them. */
  trackByCard(_index: number, card: Card): string {
    return card.identifier;
  }

  readonly cardDrag = new RowReorder<string>();

  private activePointerId: number | null = null;

  /** Whether this card's row is the one being dragged to a new place, which dims it. */
  isDragging(card: Card): boolean {
    return this.cardDrag.isHeld(card.identifier);
  }

  /** Whether the dragged row would land above this card, which draws the insertion line over it. */
  isDropBefore(card: Card): boolean {
    return this.cardDrag.isDropBefore(card.identifier);
  }

  /**
   * Whether the dragged row would land below this card, which draws the insertion line under it.
   */
  isDropAfter(card: Card): boolean {
    return this.cardDrag.isDropAfter(card.identifier);
  }

  /**
   * Picks a row up by its drag handle and captures the pointer for the rest of the drag.
   *
   * Only the primary mouse button starts a drag; touch and pen always do.
   */
  onPointerDown(event: PointerEvent, card: Card): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.cardDrag.begin(card.identifier);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  /** Follows the dragged row over the list, marking which half of which row it would drop on. */
  onPointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (this.cardDrag.held() === null) return;

    const found = this.findCardRowUnderPointer(event.clientX, event.clientY);
    if (!found) {
      this.cardDrag.leave();
      return;
    }
    this.cardDrag.hoverHalf(found.id, found.rect, event.clientY);
  }

  /**
   * Drops the dragged row and moves its card in the stack to match.
   *
   * Letting go outside any row, or with a different pointer than the one that started, leaves the
   * order alone.
   */
  onPointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    const drop = this.cardDrag.release();
    this.activePointerId = null;
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may have been released already
    }

    if (drop?.side) this.performReorder(drop.held, drop.over, drop.side);
  }

  /** Abandons a drag the browser cancelled, leaving the stack in its original order. */
  onPointerCancel(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.resetDragState();
  }

  private resetDragState(): void {
    this.activePointerId = null;
    this.cardDrag.cancel();
  }

  private findCardRowUnderPointer(x: number, y: number): { id: string; rect: DOMRect } | null {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const row = el.closest<HTMLElement>('[data-card-id]');
      if (row) {
        const id = row.dataset['cardId'];
        if (id) return { id, rect: row.getBoundingClientRect() };
      }
    }
    return null;
  }

  private performReorder(draggedId: string, overId: string, position: DropSide): void {
    const stack = this.cardStack();
    const dragged = stack.cards.find((c) => c.identifier === draggedId);
    const target = stack.cards.find((c) => c.identifier === overId);
    if (!dragged || !target || !target.parent || dragged.parent !== target.parent) return;

    if (position === 'before') {
      target.parent.insertBefore(dragged, target);
      return;
    }

    const siblings = target.parent.children;
    const nextSibling = siblings[siblings.indexOf(target) + 1];
    if (nextSibling && nextSibling !== dragged) {
      target.parent.insertBefore(dragged, nextSibling);
    } else {
      target.parent.appendChild(dragged);
    }
  }

  /** The card's name for its row, re-read whenever the card changes. */
  cardName(card: Card): string {
    this.objectChange.versionOf(card.identifier)();
    return card.name;
  }

  /** Renames the card from its row's name field; the name is shared with the room. */
  setCardName(card: Card, event: Event): void {
    card.name = (event.target as HTMLInputElement).value;
  }

  /**
   * Opens the image picker and sets the chosen picture as the card's front or back.
   *
   * Closing the picker without a choice, or a card without that image slot, changes nothing.
   */
  setImage(card: Card, slot: 'front' | 'back'): void {
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (value == null) return;
      const el = card.imageDataElement?.getFirstElementByName(slot);
      if (!el) return;
      el.value = value;
    });
  }

  private cardImageBasename(card: Card): string {
    this.objectChange.versionOf(card.identifier)();
    this.objectChange.fileVersion();
    const front = card.imageDataElement?.getFirstElementByName('front');
    const url = (card.frontImage?.url || (front?.value as string)) ?? '';
    const slash = url.lastIndexOf('/');
    const filename = slash >= 0 ? url.substring(slash + 1) : url;
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.substring(0, dot) : filename;
  }

  /**
   * A short label for a card that has no name of its own, taken from its front image's file name.
   *
   * A playing-card file name such as `h12` reads as the suit and rank; any other name is shown as
   * is.
   */
  cardImageHint(card: Card): string {
    const basename = this.cardImageBasename(card);
    return formatTrumpCardCode(basename) ?? basename;
  }

  /**
   * The suit and rank the front image's file name spells out, or null when it is not a playing
   * card.
   */
  trumpLabel(card: Card): TrumpCardLabel | null {
    return parseTrumpCardCode(this.cardImageBasename(card));
  }
}
