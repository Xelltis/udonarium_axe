import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { planDeal } from '@axe/domain/card/card-deal';
import { CardStack } from '@axe/domain/card/card-stack';
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

  /** Your own user id. Outside a room it is not on the cursor yet, so the peer context answers instead. */
  myUserId(): string {
    const fromCursor = PeerCursor.myCursor?.userId ?? '';
    return fromCursor.length > 0 ? fromCursor : getPeerContext().userId;
  }

  /** Who can hold cards, judged the same way the hand rail judges it. */
  participants(): CardSeat[] {
    const seats = this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.userId.length > 0 && canRoleEdit(cursor.role))
      .map((cursor) => ({ userId: cursor.userId, name: cursor.name }));

    const myUserId = this.myUserId();
    if (myUserId.length > 0 && canRoleEdit(PeerCursor.myRole) && !seats.some((seat) => seat.userId === myUserId)) {
      seats.unshift({ userId: myUserId, name: PeerCursor.myCursor?.name ?? '' });
    }
    return seats;
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
      this.chatMessageService.sendSystemMessage(this.t('feature.cardStack.message.noSeats'));
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
    this.chatMessageService.sendSystemMessage(
      this.t('feature.cardStack.message.dealt', { count: cards.length, players: seats.length })
    );
    return { dealt: cards.length, participants: seats.length };
  }

  /** Takes a card from someone else's hand into your own and says so in chat. False while you have no user id. */
  drawFromHand(card: Card, fromName: string): boolean {
    const myUserId = this.myUserId();
    if (myUserId.length < 1) return false;

    card.toHand(myUserId);
    SoundEffect.play(PresetSound.cardDraw);
    this.chatMessageService.sendSystemMessage(
      this.t('feature.card.message.drewFromHand', { from: fromName, to: PeerCursor.myCursor?.name ?? '' })
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
    this.chatMessageService.sendSystemMessage(
      this.t('feature.card.message.gaveFromHand', { from: PeerCursor.myCursor?.name ?? '', to: receiver.name })
    );
    return true;
  }

  /**
   * The hands of users who are no longer in the room, found from the cards still held in them, the
   * longest first.
   *
   * Somebody connected is not absent whatever their role, and nor are you.
   */
  absentHands(): AbsentHand[] {
    const present = new Set(this.objectStore.getObjects<PeerCursor>(PeerCursor).map((cursor) => cursor.userId));
    present.add(this.myUserId());
    const counts = new Map<string, number>();
    for (const card of this.objectStore.getObjects<Card>(Card)) {
      const holder = handHolderOf(card.location.name);
      if (holder === null || present.has(holder)) continue;
      counts.set(holder, (counts.get(holder) ?? 0) + 1);
    }
    return [...counts]
      .map(([userId, count]) => ({ userId, name: this.lastSpokenNameOf(userId), count }))
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
    this.chatMessageService.sendSystemMessage(
      this.t('feature.card.message.handedOver', {
        name: PeerCursor.myCursor?.name ?? '',
        from: absent.name,
        to: receiver.name,
        count: cards.length,
      })
    );
    return cards.length;
  }

  private lastSpokenNameOf(userId: string): string {
    let latest: ChatMessage | null = null;
    for (const message of this.objectStore.getObjects<ChatMessage>(ChatMessage)) {
      if (message.from !== userId || message.isSystem || !message.isDisplayable) continue;
      if ((message.name ?? '').length < 1) continue;
      if (!latest || message.timestamp > latest.timestamp) latest = message;
    }
    return latest?.name ?? userId.slice(0, 6);
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
    this.chatMessageService.sendSystemMessage(
      this.t('feature.card.message.discardedPairs', {
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
