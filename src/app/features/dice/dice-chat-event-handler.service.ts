import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { diceBotUnreachable$, DiceBotUnreachableEvent, diceRolled$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { parseDiceChatToken } from '@axe/domain/dice/dice-chat-token';
import { linkRollsToDice } from '@axe/domain/dice/dice-link';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Carries what the dice bot did with a line back to the table and to the sender.
 *
 * What a rolled command showed goes onto the dice a piece keeps on the table. Only the sender
 * applies it: the faces are synchronised fields, so everybody sees them turn, and applying it at
 * the receiving end as well would set the same dice twice.
 *
 * A line that went unrolled because its game system could not be fetched is pointed out to the
 * sender alone, since for everyone else it is an ordinary line.
 */
@Injectable({ providedIn: 'root' })
export class DiceChatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatMessageService = inject(ChatMessageService);
  /**
   * The line last pointed out as unrolled. One line can go unrolled for each target it was sent to
   * and for its dice table, one after another, and the sender needs telling once.
   */
  private lastUnrolled = '';

  constructor() {
    diceBotUnreachable$.subscribe((event) => this.pointOutUnrolled(event), this.destroyRef);
    diceRolled$.subscribe((event) => {
      const source = this.objectStore.get<ChatMessage>(event.sourceMessageIdentifier);
      const result = this.objectStore.get<ChatMessage>(event.resultMessageIdentifier);
      if (!(source instanceof ChatMessage) || !(result instanceof ChatMessage)) return;
      if (!source.isSendFromSelf) return;

      const token = parseDiceChatToken(source.text);
      const rolls = result.rollDetail?.faces ?? [];
      if (!token || rolls.length < 1) return;

      const owner = this.ownerOf(token.name, source);
      if (!owner) return;

      for (const { die, face } of linkRollsToDice(this.diceOf(owner), rolls)) {
        die.face = face;
      }
    }, this.destroyRef);
  }

  private pointOutUnrolled(event: DiceBotUnreachableEvent): void {
    if (event.messageIdentifier === this.lastUnrolled) return;
    const line = this.objectStore.get<ChatMessage>(event.messageIdentifier);
    const tab = line instanceof ChatMessage ? this.objectStore.get<ChatTab>(line.tabIdentifier) : null;
    const me = PeerCursor.myCursor;
    if (!(tab instanceof ChatTab) || !me) return;

    this.lastUnrolled = event.messageIdentifier;
    const name = DiceBot.diceBotInfos.find((info) => info.id === event.gameType)?.name ?? event.gameType;
    const text = encodeI18nMessage('feature.chat.diceBot.unreachable', { name });
    this.chatMessageService.sendSystemMessageOnePlayer(tab, text, me.identifier, undefined, true);
  }

  /** The piece named in the token, or the one that spoke the line when it names none. */
  private ownerOf(name: string, message: ChatMessage): GameCharacter | null {
    if (name.length < 1) {
      const speaker = this.objectStore.get<GameCharacter>(message.sendFrom);
      return speaker instanceof GameCharacter ? speaker : null;
    }

    const needle = name.trim();
    return (
      this.objectStore.getObjects<GameCharacter>(GameCharacter).find((character) => character.name.trim() === needle) ??
      null
    );
  }

  /** Its dice, in the order they were made, so the same line lands the same way twice. */
  private diceOf(owner: GameCharacter): DiceSymbol[] {
    return this.objectStore
      .getObjects<DiceSymbol>(DiceSymbol)
      .filter((die) => die.ownerCharacterIdentifier === owner.identifier);
  }
}
