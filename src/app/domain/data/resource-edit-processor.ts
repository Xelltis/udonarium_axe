import { Logger } from '@axe/core/logging/logger';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { answerColorsOf } from '@axe/domain/chat/chat-color';
import { ChatMessage, ChatMessageContext, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { findEmbeddedRolls, replaceEmbeddedRolls } from '@axe/domain/data/embedded-roll';
import {
  applyBuffEdit,
  applyResourceEdit,
  applyTextEdit,
  type BuffEdit,
  convertCommandToResourceEdit,
  createDefaultResourceEdit,
  parseResourceEditOption,
  type ResourceEdit,
  type ResourceEditOption,
} from '@axe/domain/data/resource-edit-helpers';
import type { DiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import GameSystemClass from 'bcdice/lib/game_system';

interface DiceRollResult {
  id: string | null;
  result: string;
  isSecret: boolean;
  /** The roll and whether it succeeded. Neither can be read back out of the text, so they are taken where the dice fall and carried along. */
  detail?: DiceRollDetail | null;
}

interface ResourceByCharacter {
  resourceCommand: string;
  object: GameCharacter;
}

interface BuffByCharacter {
  buffCommand: string;
  object: GameCharacter;
}

export { BuffByCharacter, BuffEdit, DiceRollResult, ResourceByCharacter, ResourceEdit, ResourceEditOption };

export class ResourceEditProcessor {
  constructor(
    private diceRollAsync: (message: string, gameSystem: GameSystemClass) => Promise<DiceRollResult>,
    private loadGameSystemAsync: (gameType: string) => Promise<GameSystemClass>
  ) {}

  /**
   * Picks the `:` resource and `&` buff commands out of a sent chat message and carries them out.
   *
   * A `t` prefix aims a command at the message's target character instead of the speaker, and an `s` prefix
   * makes the report a secret. The work continues asynchronously and ends in a system message on the same
   * chat tab.
   */
  checkResourceEditCommand(originalMessage: ChatMessage, messageTargetContext: ChatMessageTargetContext[]) {
    const resourceByCharacter: ResourceByCharacter[] = [];
    const buffByCharacter: BuffByCharacter[] = [];

    const sendFromObject = this.messageSendGameCharacter(originalMessage.sendFrom);
    let isSecret = false;

    for (const oneMessageTargetContext of messageTargetContext) {
      const text = ` ${oneMessageTargetContext.text}`;
      const isMatch = !!text.match(/(\s[sSｓＳ][tTｔＴ]?[:：&＆])/i);
      if (isMatch) {
        isSecret = true;
      }

      const text2 = text.replace(/(\s[sSｓＳ][tTｔＴ][:：])/i, ' t:');
      const text3 = text2.replace(/(\s[sSｓＳ][:：])/i, ' :');
      const text4 = text3.replace(/([tTｔＴ][:：])/gi, 't:');
      const text5 = text4.replace(/([tTｔＴ][&＆])/gi, 't&');
      const text6 = text5.replace(/([:：])/gi, ':');
      const text7 = text6.replace(/([&＆])/gi, '&');

      const splitText = text7.split(/\s/);

      for (const chktxt of splitText) {
        if (chktxt.match(/^(t?[:&][^:：&＆])+/gi)) {
          //nothing to do
        } else {
          continue;
        }

        const resultRes = chktxt.match(/t?:[^:：&＆]+/gi);
        const resultBuff = chktxt.match(/t?&[^:：&＆]+/gi);

        if (resultRes) {
          for (const res of resultRes) {
            resourceByCharacter.push({
              resourceCommand: res,
              object: oneMessageTargetContext.object!,
            });
          }
        }
        if (resultBuff) {
          for (const buff of resultBuff) {
            buffByCharacter.push({
              buffCommand: buff,
              object: oneMessageTargetContext.object!,
            });
          }
        }
      }
    }
    this.resourceEditProcess(sendFromObject, resourceByCharacter, buffByCharacter, originalMessage, isSecret);
  }

  /** Reads the `L` and `Z` option letters at the end of a command's amount; see {@link parseResourceEditOption}. */
  parseOption(text: string): ResourceEditOption {
    return parseResourceEditOption(text);
  }

  /** Fills in an edit from one resource command, or returns false; see {@link convertCommandToResourceEdit}. */
  commandToEdit(oneResourceEdit: ResourceEdit, text: string, object: GameCharacter, targeted: boolean): boolean {
    return convertCommandToResourceEdit(oneResourceEdit, text, object, targeted);
  }

  /** A blank edit aimed at a resource's current value, ready for {@link commandToEdit}. */
  defaultResourceEdit(): ResourceEdit {
    return createDefaultResourceEdit();
  }

  /**
   * Works out and applies the collected resource and buff commands, then posts one report to the chat tab.
   *
   * Untargeted commands act on the speaker's character and are skipped when the speaker is not a character.
   * Amounts are rolled with the message's game system. A command whose amount cannot be worked out is named
   * in the report instead of applied. The report comes from BCDice when any dice were rolled, and nothing is
   * posted when there is nothing to report.
   */
  async resourceEditProcess(
    sendFromObject: GameCharacter | null,
    resourceByCharacter: ResourceByCharacter[],
    buffByCharacter: BuffByCharacter[],
    originalMessage: ChatMessage,
    isSecret: boolean
  ) {
    const allEditList: ResourceEdit[] = [];
    const unreadableCommands: string[] = [];
    const gameSystem = await this.loadGameSystemAsync(originalMessage.tags ? originalMessage.tags[0] : '');

    for (const res of resourceByCharacter) {
      const oneText = res.resourceCommand;
      const targeted = !!oneText.match(/^t:/i);
      const object = targeted ? res.object : sendFromObject;
      if (object == null) {
        Logger.debug('[DiceBot] 送信元がキャラクターではないためリソース操作不可');
        continue;
      }

      const oneResourceEdit = this.defaultResourceEdit();
      if (!this.commandToEdit(oneResourceEdit, oneText, object, targeted)) continue;

      if (oneResourceEdit.operator != '>' && !(await this.rollResourceEdit(oneResourceEdit, gameSystem))) {
        unreadableCommands.push(`${targeted ? `[${object.name}] ` : ''}${oneText}を計算できません    `);
        continue;
      }
      allEditList.push(oneResourceEdit);
    }

    const repBuffCommandList: BuffEdit[] = [];
    for (const buff of buffByCharacter) {
      const oneText = buff.buffCommand;
      const targeted = !!oneText.match(/^t&/i);
      if (targeted) {
        const object = buff.object;
        const replaceText = oneText.replace('＆', '&').replace(/＋$/, '+').replace(/－$/, '-');
        repBuffCommandList.push({
          command: replaceText,
          object: object,
          targeted: targeted,
        });
      } else {
        if (sendFromObject == null) {
          Logger.debug('[DiceBot] 送信元がキャラクターではないためバフ操作不可');
          continue;
        } else {
          const replaceText = oneText.replace('＆', '&').replace(/＋$/, '+').replace(/－$/, '-');
          repBuffCommandList.push({
            command: replaceText,
            object: sendFromObject,
            targeted: targeted,
          });
        }
      }
    }

    this.applyResourceBuffEdits(allEditList, repBuffCommandList, unreadableCommands, originalMessage, isSecret);
  }

  private async rollResourceEdit(edit: ResourceEdit, gameSystem: GameSystemClass): Promise<boolean> {
    if (!(await this.resolveEmbeddedRolls(edit, gameSystem))) return false;

    const rolled = await this.rollOnce(edit.command, gameSystem);
    if (rolled == null) return false;

    const splitResult = rolled.result.split(' ＞ ');
    if (splitResult.length < 2) return false;
    edit.diceResult = splitResult[splitResult.length - 2].replace(/\+\(1\[1\]-1\)$/, '');
    edit.calcAns = rolled.answer;
    return true;
  }

  private async resolveEmbeddedRolls(edit: ResourceEdit, gameSystem: GameSystemClass): Promise<boolean> {
    const sites = findEmbeddedRolls(edit.command);
    if (sites.length < 1) return true;

    const answers: number[] = [];
    for (const site of sites) {
      const rolled = await this.rollOnce(site.command, gameSystem);
      if (rolled == null) return false;
      answers.push(rolled.answer);
      edit.embeddedRolls.push(`[${site.command}] ${rolled.result.replace(/^\S+ : /, '')}`);
    }

    edit.command = replaceEmbeddedRolls(edit.command, answers);
    edit.isDiceRoll = true;
    return true;
  }

  private async rollOnce(
    command: string,
    gameSystem: GameSystemClass
  ): Promise<{ result: string; answer: number } | null> {
    try {
      const rollResult = await this.diceRollAsync(command, gameSystem);
      const resultMatch = rollResult.result.match(/([-+]?\d+)$/);
      if (!resultMatch) return null;
      return { result: rollResult.result, answer: parseInt(resultMatch[1], 10) };
    } catch (e) {
      Logger.error('[DiceBot] リソース編集のダイスロールエラー', e);
      return null;
    }
  }

  /** Writes a `>` command's text into the character's status; see {@link applyTextEdit}. */
  textEdit(edit: ResourceEdit, character: GameCharacter): string {
    return applyTextEdit(edit, character);
  }

  /** Applies a worked-out resource change and returns its report; see {@link applyResourceEdit}. */
  resourceEdit(edit: ResourceEdit, character: GameCharacter): string {
    return applyResourceEdit(edit, character);
  }

  /** Runs one buff command on the character and returns its report; see {@link applyBuffEdit}. */
  buffEdit(buff: BuffEdit, character: GameCharacter): string {
    return applyBuffEdit(buff, character);
  }

  private applyResourceBuffEdits(
    allEditList: ResourceEdit[],
    buffList: BuffEdit[],
    unreadableCommands: string[],
    originalMessage: ChatMessage,
    isSecret: boolean
  ) {
    let text = '';
    let isDiceRoll = false;
    for (const edit of allEditList) {
      const character = edit.object!;
      if (edit.targeted) {
        text += `[${character.name}] `;
      }
      if (edit.operator == '>') {
        text += this.textEdit(edit, character);
      } else {
        text += this.resourceEdit(edit, character);
      }
      if (edit.embeddedRolls.length > 0) {
        text = text.replace(/[ ]+$/, '');
        for (const embedded of edit.embeddedRolls) text += `\n  └ ${embedded}`;
        text += '\n';
      }
      if (edit.isDiceRoll) {
        isDiceRoll = true;
      }
    }
    for (const buff of buffList) {
      text += this.buffEdit(buff, buff.object);
    }
    for (const unreadable of unreadableCommands) {
      text += unreadable;
    }
    text = text.replace(/\s+$/, '');

    if (text == '') return;
    let fromText: string;
    let nameText: string;
    if (isDiceRoll) {
      fromText = 'System-BCDice';
      nameText = `<BCDice：${originalMessage.name}>`;
    } else {
      fromText = 'System';
      nameText = originalMessage.name;
    }
    const resourceMessage: ChatMessageContext = {
      identifier: '',
      tabIdentifier: originalMessage.tabIdentifier,
      originFrom: originalMessage.from,
      from: fromText,
      timestamp: originalMessage.timestamp + 2,
      imageIdentifier: PeerCursor.myCursor.diceImageIdentifier,
      tag: isSecret ? 'system secret' : 'system',
      name: nameText,
      text,
      ...answerColorsOf(originalMessage),
    };
    const chatTab = ObjectStore.instance.get<ChatTab>(originalMessage.tabIdentifier);
    if (chatTab) {
      chatTab.addMessage(resourceMessage);
    }
  }

  private messageSendGameCharacter(from: string): GameCharacter | null {
    const object = ObjectStore.instance.get<GameCharacter>(from);
    if (object instanceof GameCharacter) {
      return object;
    } else {
      Logger.debug('[DiceBot] 送信元がキャラクターではないため無視');
      return null;
    }
  }
}
