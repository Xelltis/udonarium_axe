import { inject, Injectable } from '@angular/core';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildMacroMessage } from '@axe/domain/chat/character-macro';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DiceBot, PLAIN_DICE_BOT } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import GameSystemClass from 'bcdice/lib/game_system';

export interface MacroSendOptions {
  tab?: ChatTab | null;
  /** Already loaded by the caller. Left out, the game system is looked up from `gameType`. */
  gameSystem?: GameSystemClass | null;
  gameType?: string;
  sendFrom?: string;
  sendTo?: string;
  portraitIndex?: number;
  colorIndex?: number;
  color?: string;
  /** Null says to send none at all, which is how the remote controller's notices speak. */
  bubbles?: { light: string; dark: string } | null;
  replyTo?: string;
  quoteOf?: string;
  targets?: readonly GameCharacter[];
}

/**
 * A system somebody actually chose, rather than the one everything starts with.
 *
 * A piece's palette and the room both carry `DiceBot` from the moment they are made, so
 * reading either as an answer would mean nothing chosen further along could ever be heard.
 */
function chosenSystem(gameType: string | undefined | null): string {
  return gameType && gameType !== PLAIN_DICE_BOT ? gameType : '';
}

@Injectable({ providedIn: 'root' })
export class CharacterMacroService {
  private readonly objectStore = inject(ObjectStore);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly activeChatTab = inject(ActiveChatTabService);
  private readonly t = inject(TRANSLATE_FN);

  /** The pieces on the table someone has marked, which a line aimed at a target speaks to. */
  markedCharacters(): GameCharacter[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => character.location.name === 'table' && character.targeted);
  }

  send(character: GameCharacter, line: string, options: MacroSendOptions = {}): ChatMessage | null {
    const tab = this.resolveTab(options.tab);
    if (!tab) return null;

    const targets = options.targets ?? this.markedCharacters();
    const message = buildMacroMessage(character, line, targets, this.t('feature.chat.palette.noTarget'));
    const bubbles = this.resolveBubblesOption(character, options);

    return this.chatMessageService.sendMessage(
      tab,
      message.text,
      options.gameSystem ?? null,
      options.sendFrom ?? character.identifier,
      options.sendTo ?? '',
      options.portraitIndex ?? character.selectedPortraitIndex,
      options.color ?? this.resolveColor(character, options.colorIndex ?? 0),
      message.targetContexts,
      message.attachmentImageIdentifiers,
      options.replyTo,
      options.quoteOf,
      bubbles
    );
  }

  async sendAsCharacter(
    character: GameCharacter,
    line: string,
    options: MacroSendOptions = {}
  ): Promise<ChatMessage | null> {
    if (options.gameSystem !== undefined) return this.send(character, line, options);

    const gameType =
      options.gameType ||
      chosenSystem(character.chatPalette?.dicebot) ||
      chosenSystem(this.objectStore.get<Config>('Config')?.defaultDiceBot) ||
      this.chatMessageService.gameType;
    const gameSystem = await DiceBot.loadGameSystemAsync(gameType);
    return this.send(character, line, { ...options, gameSystem });
  }

  /**
   * Says something already worked out, such as the note a buff leaves behind.
   *
   * A panel that has nobody picked still has things to announce, so the speaker may be absent.
   */
  announce(character: GameCharacter | null, text: string, options: MacroSendOptions = {}): ChatMessage | null {
    const tab = this.resolveTab(options.tab);
    if (!tab) return null;

    return this.chatMessageService.sendMessage(
      tab,
      text,
      options.gameSystem ?? null,
      options.sendFrom ?? character?.identifier ?? '',
      options.sendTo ?? '',
      options.portraitIndex ?? character?.selectedPortraitIndex,
      options.color ?? (character ? this.resolveColor(character, options.colorIndex ?? 0) : undefined),
      undefined,
      undefined,
      options.replyTo,
      options.quoteOf,
      character ? this.resolveBubblesOption(character, options) : (options.bubbles ?? undefined)
    );
  }

  /** The tab a line would be spoken into: the one named, else the one being read, else the first there is. */
  currentTab(identifier = ''): ChatTab | null {
    if (identifier) {
      const named = this.objectStore.get<ChatTab>(identifier);
      if (named instanceof ChatTab) return named;
    }
    return this.activeChatTab.current() ?? this.chatMessageService.chatTabs[0] ?? null;
  }

  private resolveTab(tab: ChatTab | null | undefined): ChatTab | null {
    return tab ?? this.currentTab();
  }

  private resolveColor(character: GameCharacter, colorIndex: number): string {
    return character.chatColorCode[colorIndex] ?? character.chatColorCode[0] ?? '#000000';
  }

  private resolveBubblesOption(
    character: GameCharacter,
    options: MacroSendOptions
  ): { light: string; dark: string } | undefined {
    if (options.bubbles === null) return undefined;
    return options.bubbles ?? this.resolveBubbles(character, options.colorIndex ?? 0);
  }

  private resolveBubbles(character: GameCharacter, colorIndex: number): { light: string; dark: string } {
    return {
      light: character.chatBubbleLight[colorIndex] ?? character.chatBubbleLight[0] ?? '',
      dark: character.chatBubbleDark[colorIndex] ?? character.chatBubbleDark[0] ?? '',
    };
  }
}
