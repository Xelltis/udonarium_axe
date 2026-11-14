import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { Logger } from '@axe/core/logging/logger';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  isMasterTurnChatCommand,
  readTurnChatCommand,
  TurnChatCommand,
  turnChatCommandRest,
  TurnChatRefusal,
} from '@axe/domain/tabletop/turn-chat-command';
import { isTurnUnderWay } from '@axe/domain/tabletop/turn-roster';

/**
 * The round commands of chat, `&T`, `&TE`, `&RS` and the rest, carried out on the seat that says
 * them.
 *
 * Each goes through the press of the round its button makes, so buffs count down, the table is
 * told, and the step is recorded to be undone exactly as a press does it. A line read from another
 * seat never comes here: only saying a line does, so a room moves the round once however many
 * seats read it.
 */
@Injectable({ providedIn: 'root' })
export class TurnChatCommandService {
  private readonly turnOrder = inject(TurnOrderService);
  private readonly chat = inject(ChatMessageService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);

  /**
   * Says a line that may open with a round command, through `send`, which says a text as the
   * caller says any line.
   *
   * A line that opens with none is said whole. One that does is said in two: the command's word,
   * so the room reads who moved the round, and then, once the round has been moved or the speaker
   * told why it was not, whatever follows the word, as a line of its own. `last` tells `send` the
   * text is the last said of the line, which carries what goes with the line as a whole. What
   * comes back is the last said; for a command that waits on an answer, as the next round does
   * while pieces are still to move, the word's line comes back and the rest is said once answered.
   */
  say<T>(line: string, sendFrom: string, tab: ChatTab, send: (text: string, last: boolean) => T): T {
    const site = readTurnChatCommand(line);
    if (!site) return send(line, true);

    const word = line.slice(site.from, site.to);
    const rest = turnChatCommandRest(line, site);
    const said = send(word, rest.length < 1);
    const done = this.run(site.command, word, sendFrom, tab);
    if (rest.length < 1) return said;
    if (!done) return send(rest, true);
    done
      .then(() => send(rest, true))
      .catch((reason: unknown) => Logger.warn('[TurnChatCommand] the rest of the line was not said', reason));
    return said;
  }

  /**
   * Why a round command said now, as the speaker given, would move nothing; null where it would be
   * carried out.
   *
   * A seat that is only watching moves no round. The steps back, and the round's start, next,
   * taking back and reset are the game master's. A turn is taken, ended, waited out or stepped
   * into by the game master or by a seat that may move the piece: its own, or one nobody has
   * claimed. A turn is taken by the piece speaking, side by side with the side free to choose,
   * while its side's phase is open and it has neither had its turn nor begun to wait.
   */
  refusalOf(command: TurnChatCommand, sendFrom: string): TurnChatRefusal | null {
    if (!this.turnOrder.canTakeTurns) return 'watching';
    const master = this.rolePermission.isGameMaster();
    if (isMasterTurnChatCommand(command) && !master) return 'masterOnly';
    const mine = (piece: GameCharacter) => master || isControllableByUser(piece, PeerCursor.myUserId);
    const speaker = this.pieceOf(sendFrom);
    const up = this.turnOrder.phase === 'acting' ? this.pieceOf(this.turnOrder.currentIdentifier) : null;

    switch (command) {
      case 'take':
        if (!speaker) return 'noPiece';
        if (!mine(speaker)) return 'notYours';
        return this.takingRefusal(speaker);
      case 'end':
        if (master) return null;
        if (!up) return 'nobodyUp';
        return mine(up) ? null : 'notYourTurn';
      case 'wait':
        if (!up) return 'nobodyUp';
        if (!mine(up)) return 'notYourTurn';
        return this.turnOrder.mayHold(up.identifier) ? null : 'cannotWait';
      case 'stepIn':
        if (!speaker) return 'noPiece';
        if (!mine(speaker)) return 'notYours';
        return this.turnOrder.mayInterrupt(speaker.identifier) ? null : 'notWaiting';
      case 'back':
      case 'roundBack':
        return this.turnOrder.canUndo ? null : 'nothingToUndo';
      case 'roundStart':
        return isTurnUnderWay(this.turnOrder.phase) ? 'underWay' : null;
      case 'roundNext':
        return null;
      case 'roundReset':
        return this.turnOrder.round > 0 ? null : 'notStarted';
    }
  }

  /** Why the piece cannot take its turn now, by the rules of a side moving freely through its phase. */
  private takingRefusal(piece: GameCharacter): TurnChatRefusal | null {
    const turns = this.turnOrder;
    if (turns.turnOrderMode !== 'faction' || turns.factionPhaseMode !== 'free') return 'fixedOrder';
    if (!isTurnUnderWay(turns.phase)) return 'notUnderWay';
    if (!turns.orderedCharacters().includes(piece)) return 'notInOrder';
    if (turns.isHeld(piece.identifier)) return 'waiting';
    if (turns.isActed(piece.identifier)) return 'acted';
    if (turns.currentIdentifier === piece.identifier) return 'alreadyUp';
    const side = turns.orderedSides().find((group) => group.members.includes(piece))?.side ?? '';
    return side.length > 0 && side === turns.currentSide ? null : 'otherSide';
  }

  /**
   * Carries a round command out, or tells the speaker alone why it moves nothing. Answers a promise
   * for a press that waits on an answer before it is done, and nothing for one done at once.
   */
  private run(command: TurnChatCommand, word: string, sendFrom: string, tab: ChatTab): Promise<void> | void {
    const refusal = this.refusalOf(command, sendFrom);
    if (refusal) return this.tellRefused(tab, word, refusal);

    switch (command) {
      case 'take':
        return this.turnOrder.setCurrent(sendFrom);
      case 'end':
      case 'roundStart':
        return this.turnOrder.next();
      case 'wait':
        return this.turnOrder.hold(this.turnOrder.currentIdentifier);
      case 'stepIn':
        return this.turnOrder.interrupt(sendFrom);
      case 'back':
        return this.turnOrder.prev();
      case 'roundNext':
        return this.turnOrder.advanceRound();
      case 'roundBack':
        return this.turnOrder.retreatRound();
      case 'roundReset':
        return this.turnOrder.reset();
    }
  }

  /** Tells the speaker, and nobody else, that the command moved nothing and why, in the tab it was said in. */
  private tellRefused(tab: ChatTab, word: string, refusal: TurnChatRefusal): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    this.chat.sendSystemMessageOnePlayer(
      tab,
      encodeI18nMessage('feature.turnOrder.commandRefused', {
        command: word,
        reason: encodeI18nMessage(`feature.chat.lint.turn.no.${refusal}`),
      }),
      cursor.identifier
    );
  }

  private pieceOf(identifier: string): GameCharacter | null {
    const object = identifier.length > 0 ? this.objectStore.get(identifier) : null;
    return object instanceof GameCharacter ? object : null;
  }
}
