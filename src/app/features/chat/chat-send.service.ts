import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { TurnChatCommandService } from '@axe/application/turn/turn-chat-command.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { aimedAt, aimedAtNamesOf, aimLine } from '@axe/domain/chat/character-macro';
import { ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { evaluateCharacterReferences } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatTickerSelectionService } from '@axe/features/chat/chat-ticker-selection.service';

/**
 * Says a line typed into a chat input, as the chat window does, so that every window with an input
 * sends a line the same way: its references filled in, aimed at the targets, stamped and shown on
 * the ticker as asked.
 */
@Injectable({ providedIn: 'root' })
export class ChatSendService {
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatTickerSelection = inject(ChatTickerSelectionService);
  private readonly turnCommands = inject(TurnChatCommandService);
  private readonly t = inject(TRANSLATE_FN);

  /** Who the line is spoken as. Speaking as yourself rather than as a piece leaves nothing to read. */
  private speakingCharacterOf(sendFrom: string): GameCharacter | null {
    const object = this.objectStore.get(sendFrom);
    return object instanceof GameCharacter ? object : null;
  }

  private targeted(gameCharacter: GameCharacter): boolean {
    if (gameCharacter.location.name !== 'table') return false;
    return gameCharacter.targeted;
  }

  private targetedGameCharacterList(): GameCharacter[] {
    const objects = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => this.targeted(character));
    return objects;
  }

  /**
   * Sends a line from a chat input to a tab.
   *
   * Character references in the text are filled in from the speaker. A line that targets characters,
   * as typed or once the speaker's references in it are filled in (see `aimLine`), is sent once for
   * each targeted piece on the table, filled in against that piece and tagged with
   * its name, with the parts that change the speaker's own resources or buffs taken out after the
   * first copy so they apply once, or once for them all where it is aimed at them all at once, as
   * `t:範囲` aims it (see `aimedAt`); with nothing targeted, the line says so. Nothing is sent when
   * the reader may not speak in the tab. A line marked for the ticker is also shown there. A stamp
   * with nothing said goes as a line of its own, with nothing read out of the words standing in for
   * it; a stamp with words goes under them, the line going through all the rest as any line does.
   * A line that opens with a round command, `&T`, is said as the command, which moves the round,
   * and then as the rest (see `TurnChatCommandService.say`); the stamp, what the line answers and
   * quotes, and the ticker go with the last of them said.
   */
  send(tab: ChatTab | null, value: ChatOutgoing): void {
    if (!tab) return;
    if (!canRoleSpeakTab(tab, PeerCursor.myRole)) return;
    if (this.chatMessageService.sendLoneStamp(tab, value)) return;
    this.turnCommands.say(value.text, value.sendFrom, tab, (text, last) =>
      this.sayLine(
        tab,
        last ? { ...value, text } : { ...value, text, stamp: undefined, replyTo: '', quoteOf: '', toTicker: false }
      )
    );
  }

  /** Says one line, its references filled in and aimed at the targets, as {@link send} tells. */
  private sayLine(tab: ChatTab, value: ChatOutgoing): void {
    let outtext = '';
    const messageTargetContext: ChatMessageTargetContext[] = [];

    const speaker = this.speakingCharacterOf(value.sendFrom);
    const attachmentImageIdentifiers: string[] = [];
    const appendAttachmentImages = (identifiers: string[]) => {
      for (const identifier of identifiers) {
        if (!attachmentImageIdentifiers.includes(identifier)) attachmentImageIdentifiers.push(identifier);
      }
    };
    const fillIn = (text: string, target?: GameCharacter): string => {
      if (!speaker && !target) return text;
      const evaluated = evaluateCharacterReferences(text, speaker, target);
      appendAttachmentImages(evaluated.attachmentImageIdentifiers);
      return evaluated.text;
    };

    const marked = this.targetedGameCharacterList();
    const aimed = aimLine(value.text, speaker, aimedAtNamesOf(marked));
    if (aimed.targeted) {
      if (marked.length === 0) {
        outtext += this.t('feature.chat.window.noTarget');
      } else {
        appendAttachmentImages(aimed.attachmentImageIdentifiers);
        const sent = aimedAt(aimed, marked, fillIn);
        outtext = sent.text;
        messageTargetContext.push(...sent.contexts);
      }
    } else {
      outtext = fillIn(value.text);
      messageTargetContext.push({ text: outtext, object: null });
    }
    const sent = this.chatMessageService.sendMessage(
      tab,
      outtext,
      value.gameSystem,
      value.sendFrom,
      value.sendTo,
      value.portraitIndex,
      value.messColor,
      messageTargetContext,
      attachmentImageIdentifiers,
      value.replyTo,
      value.quoteOf,
      { light: value.messBubbleLight ?? '', dark: value.messBubbleDark ?? '' },
      undefined,
      value.stamp,
      value.targetNumber
    );
    if (value.toTicker) this.chatTickerSelection.showMessage(sent.identifier);
  }
}
