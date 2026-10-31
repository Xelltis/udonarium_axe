import { ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import GameSystemClass from 'bcdice/lib/game_system';

export interface DiceBotTagResolver {
  checkSecretDiceCommand(gameSystem: GameSystemClass, text: string): boolean;
  checkSecretEditCommand(text: string): boolean;
}

export interface ChatEventPlan {
  sendTargets: ChatMessageTargetContext[] | [null];
  shouldEmitDiceTable: true;
  resourceEditTargetContext: ChatMessageTargetContext[] | null;
}

/** The portrait a line is spoken with, where anything missing or below one means the first. */
export function resolvePortraitIndex(portraitIndex?: number): number {
  return portraitIndex != null && portraitIndex > 0 ? portraitIndex : 0;
}

/** The colour a line is written in, taking the default only when the sender gave none. */
export function resolveMessageColor(color: string | undefined, defaultColor: string): string {
  return color ?? defaultColor;
}

/**
 * The tag a sent line carries: the dice system's id, with `secret` added for a secret roll or edit.
 *
 * A line sent with no game system carries no tag at all.
 */
export function resolveChatMessageTag(
  gameSystem: GameSystemClass | null,
  text: string,
  dicebot: DiceBotTagResolver
): string {
  if (gameSystem == null) return '';
  if (dicebot.checkSecretDiceCommand(gameSystem, text) || dicebot.checkSecretEditCommand(text)) {
    return `${gameSystem.ID} secret`;
  }
  return gameSystem.ID;
}

/** The time a new line is stamped with, nudged past the tab's latest so lines never share or reverse an order. */
export function calcChatTimestamp(now: number, latest: number): number {
  return now <= latest ? latest + 1 : now;
}

/** The stage slot a piece's portrait stands in, from 0 to 11, with anything missing or out of range read as 0. */
export function resolveImagePos(pos: number | undefined): number {
  if (pos == null) return 0;
  return pos >= 0 && pos <= 11 ? pos : 0;
}

/**
 * Which events a sent line raises, and for which targets.
 *
 * A line aimed at targets announces itself once per target and hands them to resource edits; a line
 * aimed at nobody announces itself once with no target. The dice table is told either way.
 */
export function emitChatMessageEvents(messageTargetContext?: ChatMessageTargetContext[]): ChatEventPlan {
  if (messageTargetContext && messageTargetContext.length >= 1) {
    return {
      sendTargets: messageTargetContext,
      shouldEmitDiceTable: true,
      resourceEditTargetContext: messageTargetContext,
    };
  }

  return {
    sendTargets: [null],
    shouldEmitDiceTable: true,
    resourceEditTargetContext: null,
  };
}
