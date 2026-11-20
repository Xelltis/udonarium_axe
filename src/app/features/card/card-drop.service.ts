import { inject, Injectable } from '@angular/core';
import { CardGameService } from '@axe/application/card/card-game.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MultiMovableService } from '@axe/application/ui/multi-movable.service';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { surfaceKeyOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * Takes a card or a card stack let go of on the table into what it landed on.
 *
 * A stack takes in a card dropped within a cell of it, together with the cards moved along with
 * that card. A stack dropped within half a cell of a card takes the card in at its bottom, and one
 * dropped within half a cell of another stack is merged with it into a new stack that replaces
 * both. Only what stands on the same face is asked, the stacks first and then the cards, the order
 * the table draws them in, and the first stack to take what was dropped in is the only one: it is no
 * longer there to be taken in again. A card another seat connected now peeks at is theirs and is
 * taken into no stack, as {@link CardGameService.putIntoStack} leaves it out: it stays where it lies.
 */
@Injectable({ providedIn: 'root' })
export class CardDropService {
  private readonly tabletop = inject(TabletopService);
  private readonly multiMovable = inject(MultiMovableService);
  private readonly cardGame = inject(CardGameService);

  /** Lets what a card or a stack was dropped on take it in. */
  drop(dropped: Card | CardStack): void {
    const gridSize = this.tabletop.gridSize();
    for (const stack of this.onFaceOf(dropped, this.tabletop.cardStacks)) {
      if (this.dropOnStack(stack, dropped, gridSize)) return;
    }
    for (const card of this.onFaceOf(dropped, this.tabletop.cards)) this.dropOnCard(card, dropped, gridSize);
  }

  private onFaceOf<T extends TabletopObject>(dropped: TabletopObject, list: readonly T[]): T[] {
    const face = surfaceKeyOf(dropped);
    return list.filter((object) => object !== dropped && surfaceKeyOf(object) === face);
  }

  /**
   * Whether what was dropped landed on a stack, which then took in as much of it as this seat may put
   * there, or merged with it.
   */
  private dropOnStack(stack: CardStack, dropped: Card | CardStack, gridSize: number): boolean {
    if (dropped instanceof Card) {
      if (distanceSquared(dropped, stack) >= gridSize ** 2) return false;
      const followers = this.multiMovable.settledFollowersFor(dropped.identifier);
      const cards = [dropped, ...followers.filter((follower): follower is Card => follower instanceof Card)];
      this.cardGame.putIntoStack(stack, cards, 'top');
      return true;
    }
    if (distanceSquared(dropped, stack) >= (gridSize / 2) ** 2) return false;
    mergeStacks(dropped, stack);
    return true;
  }

  private dropOnCard(card: Card, dropped: Card | CardStack, gridSize: number): void {
    if (!(dropped instanceof CardStack) || distanceSquared(dropped, card) >= (gridSize / 2) ** 2) return;
    if (!this.cardGame.canHandle(card)) return;
    dropped.location.x = card.location.x;
    dropped.location.y = card.location.y;
    dropped.posZ = card.posZ;
    this.cardGame.putIntoStack(dropped, [card], 'bottom');
  }
}

function distanceSquared(a: TabletopObject, b: TabletopObject): number {
  return (a.location.x - b.location.x) ** 2 + (a.location.y - b.location.y) ** 2 + (a.posZ - b.posZ) ** 2;
}

/** Puts the cards of a stack dropped on another on top of that one's, as a new stack where the lower one lay. */
function mergeStacks(topStack: CardStack, bottomStack: CardStack): void {
  const newCardStack = CardStack.create(topStack.name);
  newCardStack.location.name = bottomStack.location.name;
  newCardStack.location.surface = bottomStack.location.surface;
  newCardStack.location.x = bottomStack.location.x;
  newCardStack.location.y = bottomStack.location.y;
  newCardStack.posZ = bottomStack.posZ;
  newCardStack.zindex = topStack.zindex;
  newCardStack.rotate = bottomStack.rotate;

  const bottomCards: Card[] = bottomStack.drawCardAll();
  const topCards: Card[] = topStack.drawCardAll();
  for (const card of [...topCards, ...bottomCards]) newCardStack.putOnBottom(card);

  bottomStack.setLocation('');
  bottomStack.destroy();

  topStack.setLocation('');
  topStack.destroy();
}
