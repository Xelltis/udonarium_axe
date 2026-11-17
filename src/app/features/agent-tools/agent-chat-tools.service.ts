import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { type AgentChatLine, AgentViews } from '@axe/application/agent/agent-views.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { diceRolled$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { composeChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { readRollLine, rollableText } from '@axe/domain/dice/dice-roll-line';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { readTurnChatCommand, turnChatCommandRest } from '@axe/domain/tabletop/turn-chat-command';
import { findOne, textArg } from '@axe/features/agent-tools/agent-lookup';
import { AgentReadTools } from '@axe/features/agent-tools/agent-read-tools.service';
import { ChatSendService } from '@axe/features/chat/chat-send.service';
import type GameSystemClass from 'bcdice/lib/game_system';

/** How long a line that rolls waits for the dice bot's answers before it is returned with what came. */
const ROLL_WAIT_MS = 3000;

/** What saying a line came to: the lines said, and the dice bot's answers to them. */
export interface AgentSaid {
  readonly lines: readonly AgentChatLine[];
  readonly dice: readonly AgentChatLine[];
  /** Said where a roll was not answered in time. */
  readonly note?: string;
}

/** The pattern a dice system reads a roll by, or null for one that reads anything. */
function patternOf(system: GameSystemClass): RegExp | null {
  return (system.COMMAND_PATTERN as RegExp | undefined) ?? null;
}

/**
 * The tools that speak and roll in chat as the linked seat: a line goes the way a line typed into the
 * chat box goes, its commands and all, and is marked as the AI's for everyone to see.
 */
@Injectable({ providedIn: 'root' })
export class AgentChatTools {
  private readonly read = inject(AgentReadTools);
  private readonly views = inject(AgentViews);
  private readonly chat = inject(ChatMessageService);
  private readonly chatSend = inject(ChatSendService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    send_chat: (args, { signal }) =>
      this.say(textArg(args, 'text'), textArg(args, 'as'), textArg(args, 'tab'), textArg(args, 'to'), signal),
    roll_dice: async (args, { signal }) => {
      const command = textArg(args, 'command').trim();
      const system = await DiceBot.gameSystemForLineAsync(this.read.diceSystem(), command);
      const dicebot = this.objectStore.get<DiceBot>('DiceBot');
      const alreadySecret = dicebot instanceof DiceBot && dicebot.checkSecretDiceCommand(system, command);
      const line = args['secret'] === true && !alreadySecret ? `S${command}` : command;
      if (!this.rollsIn(line, system)) {
        throw new AgentToolError(
          'invalid_input',
          `The dice system does not read ${command} as a roll. Check the command.`
        );
      }
      return this.say(line, textArg(args, 'as'), textArg(args, 'tab'), '', signal);
    },
  };

  /** Says a line as the seat or one of its pieces, and waits a while for the dice bot's answer where it rolls. */
  async say(text: string, as: string, tabName: string, to: string, signal?: AbortSignal): Promise<AgentSaid> {
    const turn = readTurnChatCommand(text);
    if (turn && turnChatCommandRest(text, turn).length > 0) {
      throw new AgentToolError(
        'invalid_input',
        'A turn command is said on a line of its own: send the command, then the rest with another send_chat. ' +
          'To move the round on, use advance_turn.'
      );
    }
    const tab = this.read.tab(tabName);
    if (!canRoleSpeakTab(tab, PeerCursor.myRole)) {
      throw new AgentToolError('not_allowed', `This seat may not speak in the chat tab ${tab.name}.`);
    }
    const sendFrom = this.speakerOf(as);
    const sendTo = to ? this.recipientOf(to) : '';
    const gameSystem = await DiceBot.gameSystemForLineAsync(this.read.diceSystem(), text);
    const rolls = this.rollsIn(text, gameSystem);
    const outgoing = composeChatOutgoing({
      text,
      gameSystem,
      sendFrom,
      sendTo,
      portraitIndex: 0,
      color: '',
      bubbles: { light: '', dark: '' },
      replyTo: '',
      quoteOf: '',
      toTicker: false,
    });

    const sent: string[] = [];
    const stop = this.objectChange.messageAdded$.subscribe(({ messageIdentifier }) => sent.push(messageIdentifier));
    try {
      this.chat.asAiWords(() => this.chatSend.send(tab, outgoing));
    } finally {
      stop();
    }
    const lines = sent.map((id) => this.lineOf(id)).filter((line): line is AgentChatLine => line !== null);
    if (lines.length === 0) throw new AgentToolError('failed', 'The line was not said.');
    const dice = rolls ? await this.answersTo(sent, signal) : [];
    if (rolls && dice.length < sent.length) {
      return {
        lines,
        dice,
        note: 'Not every roll was answered yet. A late answer comes in wait_for_events; do not roll again.',
      };
    }
    return { lines, dice };
  }

  /**
   * Who says the line: the seat, or a piece it sees whose sheet it may open. A line said as a piece
   * reads that piece's sheet where it refers to a value and writes it where it changes a resource, so
   * a piece whose sheet the seat is not shown is not spoken as.
   */
  private speakerOf(as: string): string {
    if (as === '' || as.toLowerCase() === 'self') return PeerCursor.myCursor?.identifier ?? '';
    const piece = this.read.piece(as);
    if (!this.views.sheetOpen(piece)) {
      throw new AgentToolError(
        'not_allowed',
        `This seat may not open the sheet of ${this.views.nameOf(piece)}, so it does not speak as it.`
      );
    }
    return piece.identifier;
  }

  /**
   * Whom a whisper is to: a seat by its name, or the seat that owns a piece this seat sees. A piece
   * no other seat here owns is refused, since a whisper to it would reach nobody.
   */
  private recipientOf(name: string): string {
    const seats = this.objectStore.getObjects<PeerCursor>(PeerCursor);
    const seat = seats.find((cursor) => cursor.name === name.trim());
    if (seat) return seat.identifier;
    const pieces = this.views.visiblePieces();
    const piece = findOne(
      pieces,
      name,
      (each) => each.identifier,
      (each) => this.views.nameOf(each),
      'seat or piece'
    );
    const owner = piece.owner ? PeerCursor.findByUserId(piece.owner) : null;
    if (!owner || owner.userId === PeerCursor.myCursor?.userId) {
      throw new AgentToolError(
        'invalid_input',
        `No other seat here owns ${this.views.nameOf(piece)}, so a whisper to it would reach nobody. Whisper to a seat by its name.`
      );
    }
    return owner.identifier;
  }

  /**
   * Whether a line holds a roll the dice system reads: one its pattern takes, and that it evaluates to
   * a result, as the dice bot does before it answers. The pattern of the plain dice bot takes almost
   * any text, so the pattern alone would wait on lines that roll nothing.
   */
  private rollsIn(text: string, system: GameSystemClass): boolean {
    const rollText = readRollLine(rollableText(text)).rollText;
    const pattern = patternOf(system);
    if (rollText.length < 1 || (pattern !== null && !pattern.test(rollText))) return false;
    try {
      return system.eval(rollText) !== null;
    } catch {
      return false;
    }
  }

  /** The dice bot's answers to some lines, as they come, giving up after a while. */
  private answersTo(sources: readonly string[], signal?: AbortSignal): Promise<AgentChatLine[]> {
    return new Promise((resolve) => {
      const answers: string[] = [];
      const finish = () => {
        clearTimeout(timer);
        stop();
        signal?.removeEventListener('abort', finish);
        resolve(answers.map((id) => this.lineOf(id)).filter((line): line is AgentChatLine => line !== null));
      };
      const stop = diceRolled$.subscribe(({ sourceMessageIdentifier, resultMessageIdentifier }) => {
        if (!sources.includes(sourceMessageIdentifier)) return;
        answers.push(resultMessageIdentifier);
        if (answers.length >= sources.length) finish();
      });
      const timer = setTimeout(finish, ROLL_WAIT_MS);
      signal?.addEventListener('abort', finish);
    });
  }

  private lineOf(identifier: string): AgentChatLine | null {
    const message = this.objectStore.get<ChatMessage>(identifier);
    return message instanceof ChatMessage ? this.views.chatLine(message) : null;
  }
}
