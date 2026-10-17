import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import {
  diceBotUnreachable$,
  DiceBotUnreachableEvent,
  diceRolled$,
  serverRollUnanswered$,
  ServerRollUnansweredEvent,
} from '@axe/core/event/domain-events';
import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
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
 * A line that went unrolled because its game system could not be fetched, or because the room
 * server would not roll it or has not answered, is pointed out to the sender alone, since for
 * everyone else it is an ordinary line.
 */
/** The reasons a roll asked of the room server goes unanswered that have words of their own. */
const UNANSWERED_REASONS: ReadonlySet<string> = new Set([
  'invalid',
  'not-allowed',
  'rate-limited',
  'busy',
  'failed',
  'timeout',
]);

@Injectable({ providedIn: 'root' })
export class DiceChatEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  /**
   * The line last pointed out as unrolled. One line can go unrolled for each target it was sent to
   * and for its dice table, one after another, and the sender needs telling once.
   */
  private lastUnrolled = '';
  /** The line and the reason last pointed out as unanswered, told once for all of its targets. */
  private lastUnanswered = '';

  constructor() {
    diceBotUnreachable$.subscribe((event) => this.pointOutUnrolled(event), this.destroyRef);
    serverRollUnanswered$.subscribe((event) => this.pointOutUnanswered(event), this.destroyRef);
    diceRolled$.subscribe((event) => {
      const source = this.objectStore.get<ChatMessage>(event.sourceMessageIdentifier);
      const result = this.objectStore.get<ChatMessage>(event.resultMessageIdentifier);
      if (!(source instanceof ChatMessage) || !(result instanceof ChatMessage)) return;
      // A guest on a room server writes no die; the server would put each face back.
      if (!source.isSendFromSelf || PeerCursor.isMyselfKeptOffTable) return;

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

  private pointOutUnanswered(event: ServerRollUnansweredEvent): void {
    const key = `${event.messageIdentifier}\n${event.reason}`;
    if (key === this.lastUnanswered) return;
    const reason = UNANSWERED_REASONS.has(event.reason) ? event.reason : 'failed';
    const key18n = `feature.chat.diceBot.serverRollUnanswered.${reason}`;
    // A seat that may not speak in the tab could not put a line there either: the server would take
    // it back, and has taken back the line that asked for the roll by the time this arrives. It is
    // told at the bottom of the screen instead.
    if (reason === 'not-allowed') {
      this.lastUnanswered = key;
      this.snackbar.show(this.t(key18n));
      return;
    }
    const line = this.objectStore.get<ChatMessage>(event.messageIdentifier);
    const tab = line instanceof ChatMessage ? this.objectStore.get<ChatTab>(line.tabIdentifier) : null;
    const me = PeerCursor.myCursor;
    if (!(tab instanceof ChatTab) || !me) return;

    this.lastUnanswered = key;
    this.chatMessageService.sendSystemMessageOnePlayer(tab, encodeI18nMessage(key18n), me.identifier, undefined, true);
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

  /**
   * Its dice, in the order they were made, so the same line lands the same way twice. A die whose
   * face a room server keeps from this user is passed over, as the server would put the face it
   * took back, and the roll goes on to the next die; one that only lacks its face takes the roll.
   */
  private diceOf(owner: GameCharacter): DiceSymbol[] {
    const keptByServer = getAuthorityPeerId() !== null && !PeerCursor.isMyselfGameMaster;
    return this.objectStore
      .getObjects<DiceSymbol>(DiceSymbol)
      .filter((die) => die.ownerCharacterIdentifier === owner.identifier && !(keptByServer && !die.isVisible));
  }
}
