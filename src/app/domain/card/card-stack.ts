import { emitCardStackDecreased } from '@axe/core/event/domain-events';
import { ImageFile } from '@axe/core/storage/image-file';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { Card } from '@axe/domain/card/card';
import { DataElement } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { moveToTopmost } from '@axe/domain/tabletop/tabletop-object-util';

@SyncObject('card-stack')
export class CardStack extends OwnedTabletopObject {
  @SyncVar() isLock: boolean = false;

  @SyncVar() rotate: number = 0;
  @SyncVar() zindex: number = 0;
  @SyncVar() owner: string = '';
  @SyncVar() isShowTotal: boolean = true;

  @SyncVar() overViewWidth: number = 250;
  @SyncVar() overViewMaxHeight: number = 250;

  private get cardRoot(): ObjectNode | null {
    for (const node of this.children) {
      if (node.getAttribute('name') === 'cardRoot') return node;
    }
    return null;
  }
  /** The cards in the stack, top card first. */
  get cards(): readonly Card[] {
    const cardRoot = this.cardRoot;
    return cardRoot ? (cardRoot.children as readonly Card[]) : [];
  }
  /** The card on top of the stack, or null when the stack is empty. */
  get topCard(): Card | null {
    return this.isEmpty ? null : this.cards[0];
  }
  /** Whether the stack holds no cards. */
  get isEmpty(): boolean {
    return this.cards.length < 1;
  }
  /** The stack shows its top card's image, face or back as that card would show; blank when empty. */
  override get imageFile(): ImageFile {
    return this.topCard?.imageFile ?? ImageFile.Empty;
  }

  // ObjectNode Lifecycle
  /**
   * Announces that the stack shrank whenever a card leaves it, by any route.
   *
   * Cards sit under an inner card root, and removals below it reach the stack as well.
   */
  override onChildRemoved(child: ObjectNode) {
    super.onChildRemoved(child);
    if (child instanceof Card) {
      emitCardStackDecreased({
        cardStackIdentifier: this.identifier,
        cardIdentifier: child.identifier,
      });
    }
  }

  /**
   * Puts the cards in a random order, turns each one randomly upright or upside down, and returns them top
   * first.
   *
   * The new order and rotations are synced to the other peers.
   */
  shuffle(): readonly Card[] {
    const cardRoot = this.cardRoot;
    if (!cardRoot) return [];
    const length = cardRoot.children.length;
    for (const card of this.cards) {
      card.index = Math.random() * length;
      card.rotate = Math.floor(Math.random() * 2) * 180;
      this.setSamePositionFor(card);
    }
    return this.cards;
  }

  /**
   * Takes the top card off the stack and leaves it on the stack's spot, above the other cards.
   *
   * The card keeps its lie relative to the stack by taking on the stack's rotation. Returns null when the
   * stack is empty.
   */
  drawCard(): Card | null {
    const topCard = this.topCard;
    const cardRoot = this.cardRoot;
    const card = topCard && cardRoot ? cardRoot.removeChild(topCard) : null;
    if (card) {
      card.rotate += this.rotate;
      if (card.rotate > 360) card.rotate -= 360;
      this.setSamePositionFor(card);
      card.toTopmost();
    }
    return card;
  }

  /**
   * Takes every card off the stack, top first, leaving each on the stack's spot with the stack's rotation
   * added.
   *
   * Used to break a stack up for dealing, splitting or merging; the empty stack itself is left in place.
   */
  drawCardAll(): Card[] {
    const cardRoot = this.cardRoot;
    const cards = [...this.cards];
    for (const card of cards) {
      cardRoot?.removeChild(card);
      card.rotate += this.rotate;
      this.setSamePositionFor(card);
      if (card.rotate > 360) card.rotate -= 360;
    }
    return cards;
  }

  /** Turns the top card face up for everyone, ending any peek at it; does nothing on an empty stack. */
  faceUp() {
    const topCard = this.topCard;
    if (topCard) {
      topCard.faceUp();
      this.setSamePositionFor(topCard);
    }
  }

  /** Turns the top card face down, ending any peek at it; does nothing on an empty stack. */
  faceDown() {
    const topCard = this.topCard;
    if (topCard) {
      topCard.faceDown();
      this.setSamePositionFor(topCard);
    }
  }

  /** Turns every card in the stack face up for everyone, ending any peeks. */
  faceUpAll() {
    for (const card of this.cards) {
      card.faceUp();
      this.setSamePositionFor(card);
    }
  }

  /** Turns every card in the stack face down, ending any peeks. */
  faceDownAll() {
    for (const card of this.cards) {
      card.faceDown();
      this.setSamePositionFor(card);
    }
  }

  /** Turns every card in the stack back upright, undoing upside-down cards left by a shuffle. */
  uprightAll() {
    for (const card of this.cards) {
      card.rotate = 0;
      this.setSamePositionFor(card);
    }
  }

  /** Gives every card in the stack the same size, writing only to cards whose size differs. */
  unifyCardsSize(size: number): void {
    for (const card of this.cards) {
      if (card.size !== size) card.size = size;
    }
  }

  /**
   * Puts a card on top of the stack and returns it.
   *
   * The card is moved to the stack's spot, loses any peek, and is squared to upright or upside down relative
   * to the stack, whichever is nearer. Returns null when the stack has no place to hold cards.
   */
  putOnTop(card: Card): Card | null {
    const cardRoot = this.cardRoot;
    if (!cardRoot) return null;
    const topCard = this.topCard;
    if (!topCard) return this.putOnBottom(card);
    card.owner = '';
    card.zindex = 0;
    let delta = Math.abs(card.rotate - this.rotate);
    if (delta > 180) delta = 360 - delta;
    card.rotate = delta <= 90 ? 0 : 180;
    this.setSamePositionFor(card);
    return cardRoot.insertBefore(card, topCard);
  }

  /**
   * Puts a card at the bottom of the stack and returns it, squared and cleared the same way as
   * {@link putOnTop}.
   *
   * Returns null when the stack has no place to hold cards.
   */
  putOnBottom(card: Card): Card | null {
    const cardRoot = this.cardRoot;
    if (!cardRoot) return null;
    card.owner = '';
    card.zindex = 0;
    let delta = Math.abs(card.rotate - this.rotate);
    if (delta > 180) delta = 360 - delta;
    card.rotate = delta <= 90 ? 0 : 180;
    this.setSamePositionFor(card);
    return cardRoot.appendChild(card);
  }

  /** Raises the stack above every other card stack and loose card in the drawing order. */
  toTopmost() {
    moveToTopmost(this, ['card']);
  }

  /** Moves the stack and every card in it to the named location together. */
  override setLocation(location: string) {
    super.setLocation(location);
    const cards = this.cards;
    for (const card of cards) card.setLocation(location);
  }

  private setSamePositionFor(card: Card) {
    card.location.name = this.location.name;
    card.location.x = this.location.x;
    card.location.y = this.location.y;
    card.posZ = this.posZ;
  }

  /**
   * Makes an empty, named card stack with its inner card root, ready to take cards.
   *
   * Pass an identifier to give the stack a fixed id; otherwise a new one is generated.
   */
  static create(name: string, identifier?: string): CardStack {
    let object: CardStack;

    if (identifier) {
      object = new CardStack(identifier);
    } else {
      object = new CardStack();
    }
    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    const cardRoot = new ObjectNode(`cardRoot_${object.identifier}`);
    cardRoot.setAttribute('name', 'cardRoot');
    cardRoot.initialize();
    object.appendChild(cardRoot);
    object.initialize();

    return object;
  }
}
