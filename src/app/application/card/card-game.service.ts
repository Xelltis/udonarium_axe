import { computed, inject, Injectable } from '@angular/core';
import { CardFlipCutInService } from '@axe/application/card/card-flip-cut-in.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { Card, CardState } from '@axe/domain/card/card';
import { planDeal } from '@axe/domain/card/card-deal';
import { CardStack } from '@axe/domain/card/card-stack';
import {
  brokenCardOffset,
  drawnCardOffset,
  splitPileIndexes,
  splitPileOffset,
} from '@axe/domain/card/card-stack-spread';
import { selectHandCardsOf } from '@axe/domain/card/hand-cards';
import { handHolderOf, isHandOf } from '@axe/domain/card/hand-location';
import { findTrumpPairs, selectExtraJokers, trumpRankOf } from '@axe/domain/card/trump-card';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit, canRoleEditShared } from '@axe/domain/peer/peer-role';

const DISCARD_STACK_OFFSET = 150;

export interface CardSeat {
  userId: string;
  name: string;
}

export interface DealResult {
  dealt: number;
  participants: number;
}

/** A hand still holding cards for somebody who is no longer in the room. */
export interface AbsentHand {
  userId: string;
  /** The name they last spoke under in chat, or the start of their user id where nothing of theirs is shown. */
  name: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class CardGameService {
  private readonly objectStore = inject(ObjectStore);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly flipCutIn = inject(CardFlipCutInService);
  private readonly tabletop = inject(TabletopService);

  /**
   * The name each user last spoke under in chat, for the hands of those who have left. It is looked
   * for again only as lines are said or taken away, not each time a card moves.
   */
  private readonly lastSpokenNames = computed(() => {
    this.objectChange.collectionOf(ChatMessage.aliasName)();
    const latest = new Map<string, ChatMessage>();
    for (const message of this.objectStore.getObjects<ChatMessage>(ChatMessage)) {
      if (message.isSystem || !message.isDisplayable || (message.name ?? '').length < 1) continue;
      const before = latest.get(message.from);
      if (!before || message.timestamp > before.timestamp) latest.set(message.from, message);
    }
    return new Map([...latest].map(([userId, message]) => [userId, message.name]));
  });

  /** Your own user id. Outside a room it is not on the cursor yet, so the peer context answers instead. */
  myUserId(): string {
    return PeerCursor.myUserId;
  }

  /**
   * Who can hold cards, judged the same way the hand rail judges it: each seat linked now that may
   * play, once, though a seat that loaded the page again may still have the cursor it left behind.
   */
  participants(): CardSeat[] {
    const seen = new Set<string>();
    const seats = PeerCursor.linkedCursors()
      .filter((cursor) => cursor.userId.length > 0 && canRoleEdit(cursor.role))
      .filter((cursor) => !seen.has(cursor.userId) && Boolean(seen.add(cursor.userId)))
      .map((cursor) => ({ userId: cursor.userId, name: cursor.name }));

    const myUserId = this.myUserId();
    if (myUserId.length > 0 && canRoleEdit(PeerCursor.myRole) && !seats.some((seat) => seat.userId === myUserId)) {
      seats.unshift({ userId: myUserId, name: PeerCursor.myCursor?.name ?? '' });
    }
    return seats;
  }

  /**
   * Whether this seat may see and change a card's front: its picture, its name, its words and its
   * data. The game master always may; any other seat as {@link Card.isFrontOpenTo} says, which is
   * never for a card inside a stack.
   */
  canReadFront(card: Card): boolean {
    return card.isFrontOpenTo(this.permission.canSeeHidden());
  }

  /** Whether this seat may open a card's sheet: its disclosure lets the seat see it, and so does its front. */
  canOpenSheet(card: Card): boolean {
    return this.disclosure.canView(card) && this.canReadFront(card);
  }

  /**
   * Whether this seat may turn a card over, peek at it or take it into a hand: a seat that may change
   * the table, for a card no other seat connected now is peeking at, the game master included.
   */
  canHandle(card: Card): boolean {
    return this.permission.canEditTabletop() && !card.isPeekedByAnother;
  }

  /**
   * Turns a card face up for everyone, ending any peek, and plays its sound and the cut-in tied to it.
   * False, with nothing done, where this seat may not handle the card.
   */
  faceUp(card: Card): boolean {
    if (!this.canHandle(card)) return false;
    card.faceUp();
    SoundEffect.play(PresetSound.cardDraw);
    this.flipCutIn.playFor(card);
    return true;
  }

  /**
   * Turns a card face down, ending any peek, and plays its sound. False, with nothing done, where this
   * seat may not handle the card.
   */
  faceDown(card: Card): boolean {
    if (!this.canHandle(card)) return false;
    card.faceDown();
    SoundEffect.play(PresetSound.cardDraw);
    return true;
  }

  /**
   * Turns a card over as a double tap does: face down when this seat sees its face without peeking at
   * it, and face up otherwise. False, with nothing done, where this seat may not handle the card.
   */
  flip(card: Card): boolean {
    return card.isVisible && !card.isPeeking ? this.faceDown(card) : this.faceUp(card);
  }

  /**
   * Lays a card face down with its face shown to this seat alone, and plays its sound. False, with
   * nothing done, where this seat may not handle the card or has no user id yet.
   */
  peek(card: Card): boolean {
    const myUserId = this.myUserId();
    if (myUserId.length < 1 || !this.canHandle(card)) return false;
    card.state = CardState.BACK;
    card.owner = myUserId;
    SoundEffect.play(PresetSound.cardDraw);
    return true;
  }

  /**
   * Takes cards into this seat's hand, leaving out any this seat may not handle, and plays one sound
   * when it took any. Gives back the cards it took; none while this seat has no user id yet.
   */
  takeToHand(cards: readonly Card[]): Card[] {
    const myUserId = this.myUserId();
    if (myUserId.length < 1) return [];
    const taken = cards.filter((card) => this.canHandle(card));
    for (const card of taken) card.toHand(myUserId);
    if (taken.length > 0) SoundEffect.play(PresetSound.cardDraw);
    return taken;
  }

  /**
   * Puts loose cards into a stack one after another, each on its top or at its bottom, leaving out any
   * this seat may not handle, as a card put into a stack is no longer anybody's to peek at. Gives back
   * the cards it put in.
   */
  putIntoStack(stack: CardStack, cards: readonly Card[], at: 'top' | 'bottom'): Card[] {
    const taken = cards.filter((card) => this.canHandle(card));
    for (const card of taken) {
      if (at === 'top') stack.putOnTop(card);
      else stack.putOnBottom(card);
    }
    return taken;
  }

  /**
   * Gathers loose cards into a new stack lying where `origin` lies and turned as it is, the first of
   * them on top, leaving out any this seat may not handle. Null, with no stack made, where this seat
   * may not handle `origin` itself.
   */
  stackUp(origin: Card, cards: readonly Card[]): CardStack | null {
    if (!this.canHandle(origin)) return null;
    const stack = CardStack.create(this.t('feature.cardStack.defaultName'));
    stack.location.x = origin.location.x;
    stack.location.y = origin.location.y;
    stack.posZ = origin.posZ;
    stack.location.name = origin.location.name;
    stack.rotate = origin.rotate;
    stack.zindex = origin.zindex;
    this.putIntoStack(stack, cards, 'bottom');
    return stack;
  }

  /**
   * Takes a card out of a stack, its top card unless another of its cards is given, and lays it beside
   * the stack: down and to the right, the `index`th card of one draw a step further along. Null where
   * the stack holds no such card.
   */
  drawCard(stack: CardStack, index = 0, chosen?: Card): Card | null {
    const card = stack.drawCard(chosen ?? stack.topCard);
    if (!card) return null;
    stack.update();
    const offset = drawnCardOffset(index, this.tabletop.gridSize());
    card.location.x += offset.x;
    card.location.y += offset.y;
    card.setLocation(stack.location.name);
    return card;
  }

  /**
   * Draws up to `count` cards off the top of a stack one after another, laid beside it, and gives
   * them back; as many as the stack holds where it asks for more, and none for a count that is no
   * whole number of cards.
   */
  drawCards(stack: CardStack, count: number): Card[] {
    const wanted = clamp(Number.isFinite(count) ? Math.floor(count) : 0, 0, stack.cards.length);
    const cards: Card[] = [];
    for (let index = 0; index < wanted; index++) {
      const card = this.drawCard(stack, index);
      if (!card) break;
      cards.push(card);
    }
    return cards;
  }

  /** Draws the top card of a stack into this seat's hand. Null, with nothing drawn, while this seat has no user id yet. */
  drawToHand(stack: CardStack): Card | null {
    const myUserId = this.myUserId();
    if (myUserId.length < 1) return null;
    const card = this.drawCard(stack);
    card?.toHand(myUserId);
    return card;
  }

  /**
   * Scatters a stack's cards loose where it lay, as they lie, takes the empty stack away and plays the
   * sound of it. Gives back the cards, the bottom one first.
   */
  breakUp(stack: CardStack): Card[] {
    const cards = stack.drawCardAll().reverse();
    const gridSize = this.tabletop.gridSize();
    for (const card of cards) {
      const offset = brokenCardOffset(gridSize);
      card.location.x += offset.x;
      card.location.y += offset.y;
      card.toTopmost();
      card.setLocation(stack.location.name);
    }
    stack.setLocation('graveyard');
    stack.destroy();
    SoundEffect.play(PresetSound.cardShuffle);
    return cards;
  }

  /** How many piles a stack is split into: one for each participant, each counted once. */
  splitSeats(): number {
    return this.participants().length;
  }

  /**
   * Deals a stack's cards in turn into one new stack for each participant, laid beside it, takes it
   * away and plays the sound of it. Gives back the new stacks; none, with nothing done, where fewer
   * than two seats play. The cards go into the new stacks before it goes, as a room server takes
   * away with a stack all it still holds.
   */
  split(stack: CardStack): CardStack[] {
    const count = this.splitSeats();
    if (count < 2) return [];
    const gridSize = this.tabletop.gridSize();
    const piles: CardStack[] = [];
    for (let i = 0; i < count; i++) {
      const pile = CardStack.create(stack.name);
      const offset = splitPileOffset(gridSize);
      pile.location.x = stack.location.x + offset.x;
      pile.location.y = stack.location.y + offset.y;
      pile.posZ = stack.posZ;
      pile.location.name = stack.location.name;
      pile.rotate = stack.rotate;
      pile.toTopmost();
      piles.push(pile);
    }
    const cards = stack.drawCardAll();
    splitPileIndexes(cards.length, count).forEach((pile, index) => piles[pile].putOnBottom(cards[index]));
    stack.setLocation('graveyard');
    stack.destroy();
    SoundEffect.play(PresetSound.cardDraw);
    return piles;
  }

  /** The cards in a user's hand, in the order they were taken into it. */
  handCardsOf(userId: string): Card[] {
    return selectHandCardsOf(this.objectStore.getObjects<Card>(Card), userId);
  }

  /**
   * Shuffles a stack and deals all of it evenly into every participant's hand, announcing the deal
   * in chat.
   *
   * Jokers beyond `keepJokerCount` are put back on the bottom of the stack rather than dealt. With
   * nobody to deal to, a system message says so and nothing moves.
   */
  dealAll(cardStack: CardStack, keepJokerCount = 1): DealResult {
    const seats = this.participants();
    if (seats.length < 1) {
      this.chatMessageService.sendSystemNotice('card', encodeI18nMessage('feature.cardStack.message.noSeats'));
      return { dealt: 0, participants: 0 };
    }

    cardStack.shuffle();
    const excluded = new Set(selectExtraJokers(cardStack.cards, keepJokerCount).map((card) => card.identifier));
    const drawn = cardStack.drawCardAll();
    const cards = drawn.filter((card) => !excluded.has(card.identifier));
    for (const card of drawn.filter((card) => excluded.has(card.identifier))) cardStack.putOnBottom(card);
    if (cards.length < 1) return { dealt: 0, participants: seats.length };

    const plan = planDeal(cards.length, seats.length);
    const baseOrder = Date.now();
    seats.forEach((seat, seatIndex) => {
      plan.indexes[seatIndex].forEach((cardIndex, order) => {
        cards[cardIndex].toHand(seat.userId, baseOrder + order);
      });
    });

    SoundEffect.play(PresetSound.cardDraw);
    this.chatMessageService.sendSystemNotice(
      'card',
      encodeI18nMessage('feature.cardStack.message.dealt', { count: cards.length, players: seats.length })
    );
    return { dealt: cards.length, participants: seats.length };
  }

  /**
   * Takes a card from someone else's hand into your own and says so in chat. False while you have no
   * user id or may not hold cards.
   */
  drawFromHand(card: Card, fromName: string): boolean {
    const myUserId = this.myUserId();
    if (myUserId.length < 1 || !canRoleEdit(PeerCursor.myRole)) return false;

    card.toHand(myUserId);
    SoundEffect.play(PresetSound.cardDraw);
    this.chatMessageService.sendSystemNotice(
      'card',
      encodeI18nMessage('feature.card.message.drewFromHand', { from: fromName, to: PeerCursor.myCursor?.name ?? '' })
    );
    return true;
  }

  /**
   * Passes a card from your hand into another participant's, face down so only they see its face, and
   * says in chat who gave a card to whom without saying which.
   *
   * It is all checked again as it is done, since the hand and the room may have changed while the
   * choice was open: nothing moves, and false comes back, when the card has left your hand, you may
   * no longer hold cards, or the one it is for is not a participant who can.
   */
  giveFromHand(card: Card, toUserId: string): boolean {
    const myUserId = this.myUserId();
    if (myUserId.length < 1 || toUserId === myUserId) return false;
    if (!canRoleEdit(PeerCursor.myRole) || !isHandOf(card.location.name, myUserId)) return false;
    const receiver = this.participants().find((seat) => seat.userId === toUserId);
    if (!receiver) return false;

    card.toHand(receiver.userId);
    SoundEffect.play(PresetSound.cardPut);
    this.chatMessageService.sendSystemNotice(
      'card',
      encodeI18nMessage('feature.card.message.gaveFromHand', {
        from: PeerCursor.myCursor?.name ?? '',
        to: receiver.name,
      })
    );
    return true;
  }

  /**
   * The hands of users who are no longer in the room, found from the cards still held in them, the
   * longest first.
   *
   * Somebody connected is not absent whatever their role, and nor are you, except on a room server
   * for a guest, who holds no cards there: a hand held for a guest's user id, as one left in a
   * SkyWay table loaded into the room and claimed by a guest, may be handed over.
   */
  absentHands(): AbsentHand[] {
    const mayHold = Network.transport === 'server' ? (cursor: PeerCursor) => canRoleEdit(cursor.role) : () => true;
    const present = new Set(
      this.objectStore
        .getObjects<PeerCursor>(PeerCursor)
        .filter(mayHold)
        .map((cursor) => cursor.userId)
    );
    present.add(this.myUserId());
    const counts = new Map<string, number>();
    for (const card of this.objectStore.getObjects<Card>(Card)) {
      const holder = handHolderOf(card.location.name);
      if (holder === null || present.has(holder)) continue;
      counts.set(holder, (counts.get(holder) ?? 0) + 1);
    }
    return [...counts]
      .map(([userId, count]) => ({ userId, name: this.lastSpokenNames().get(userId) ?? userId.slice(0, 6), count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Hands every card in an absent user's hand to a participant, face down and in the order they were
   * held, and says so in chat without saying which cards. Only the game master may.
   *
   * Checked again as it is done: nothing moves, and 0 comes back, when the one the hand was held for
   * has come back, or the one it is for is not a participant who can hold cards. Otherwise it is the
   * number of cards handed over.
   */
  handOverAbsentHand(fromUserId: string, toUserId: string): number {
    if (!canRoleEditShared(PeerCursor.myRole)) return 0;
    const absent = this.absentHands().find((hand) => hand.userId === fromUserId);
    const receiver = this.participants().find((seat) => seat.userId === toUserId);
    if (!absent || !receiver) return 0;

    const cards = this.handCardsOf(fromUserId);
    const baseOrder = Date.now();
    cards.forEach((card, index) => card.toHand(receiver.userId, baseOrder + index));

    SoundEffect.play(PresetSound.cardDraw);
    this.chatMessageService.sendSystemNotice(
      'card',
      encodeI18nMessage('feature.card.message.handedOver', {
        name: PeerCursor.myCursor?.name ?? '',
        from: absent.name,
        to: receiver.name,
        count: cards.length,
      })
    );
    return cards.length;
  }

  /**
   * Discards every pair of the same rank among the cards, face up, onto the discard stack on the
   * table, and announces it.
   *
   * The discard stack is created if the table has none. Returns the pairs discarded, empty when
   * there were none.
   */
  discardPairs(cards: readonly Card[]): Card[][] {
    const pairs = findTrumpPairs(cards);
    if (pairs.length < 1) return [];

    const stack = this.findOrCreateDiscardStack();
    for (const pair of pairs) {
      for (const card of pair) {
        card.faceUp();
        stack.putOnTop(card);
      }
    }

    SoundEffect.play(PresetSound.cardPut);
    this.chatMessageService.sendSystemNotice(
      'card',
      encodeI18nMessage('feature.card.message.discardedPairs', {
        name: PeerCursor.myCursor?.name ?? '',
        ranks: pairs.map((pair) => this.rankLabel(pair[0])).join('・'),
      })
    );
    return pairs;
  }

  private rankLabel(card: Card): string {
    const rank = trumpRankOf(card);
    return typeof rank === 'number' ? String(rank) : '?';
  }

  private findOrCreateDiscardStack(): CardStack {
    const name = this.t('feature.card.discardStackName');
    const existing = this.objectStore
      .getObjects<CardStack>(CardStack)
      .find((stack) => stack.name === name && stack.location.name === 'table');
    if (existing) return existing;

    const stack = CardStack.create(name);
    stack.location.name = 'table';
    stack.location.x = DISCARD_STACK_OFFSET;
    stack.location.y = DISCARD_STACK_OFFSET;
    stack.toTopmost();
    return stack;
  }
}
