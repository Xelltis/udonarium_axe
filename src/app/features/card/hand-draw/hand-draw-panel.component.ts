import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CardGameService } from '@axe/application/card/card-game.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

export interface HandDrawTarget {
  userId: string;
  name: string;
  count: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hand-draw-panel',
  templateUrl: './hand-draw-panel.component.html',
  host: { class: 'text-ui-text block h-full overflow-y-auto p-3' },
  imports: [SafePipe, TranslocoModule],
})
export class HandDrawPanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);
  private readonly cardGame = inject(CardGameService);

  readonly selectedUserId = signal('');

  readonly targets = computed<HandDrawTarget[]>(() => {
    this.objectChange.collectionOf(Card.aliasName)();
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const myUserId = this.cardGame.myUserId();
    return this.cardGame
      .participants()
      .filter((cursor) => cursor.userId !== myUserId)
      .map((cursor) => ({
        userId: cursor.userId,
        name: cursor.name,
        count: this.cardGame.handCardsOf(cursor.userId).length,
      }))
      .filter((target) => target.count > 0);
  });

  readonly selected = computed<HandDrawTarget | null>(
    () => this.targets().find((target) => target.userId === this.selectedUserId()) ?? null
  );

  readonly cards = computed<Card[]>(() => {
    const userId = this.selectedUserId();
    if (userId.length < 1) return [];
    this.objectChange.collectionOf(Card.aliasName)();
    const cards = this.cardGame.handCardsOf(userId);
    for (const card of cards) this.objectChange.versionOf(card.identifier)();
    return cards;
  });

  /**
   * The URL of a card's back, which is all of another player's hand that is shown; the empty image
   * when the card has no back.
   */
  backImageUrl(card: Card): string {
    this.objectChange.fileVersion();
    return this.imageService.getEmptyOr(card.backImage).url;
  }

  /** Opens the hand of the player the user picked from the list. */
  select(userId: string): void {
    this.selectedUserId.set(userId);
  }

  /** Goes back to the player list, where the panel also returns once the picked hand runs out. */
  clearSelection(): void {
    this.selectedUserId.set('');
  }

  /**
   * Takes the clicked card from the selected player's hand into the local player's hand.
   *
   * The card game service announces the draw in chat. The panel goes back to the player list when
   * that player has no cards left, and nothing happens when no player is selected.
   */
  draw(card: Card): void {
    const target = this.selected();
    if (!target) return;
    this.cardGame.drawFromHand(card, target.name);
    if (this.cardGame.handCardsOf(target.userId).length < 1) this.clearSelection();
  }
}
