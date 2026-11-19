import { emitDiceBotUnreachable, emitResetCarriedOut } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  describeBuffRemoval,
  describeBuffsLacking,
  isClearedWithBody,
  isPieceResetCommand,
  isTableResetCommand,
  parseBuffClearanceCommand,
  parseBuffRemovalCommand,
  removeBuffsAcross,
} from '@axe/domain/character/buff-bulk-removal';
import { halfWidthBuffCommand } from '@axe/domain/character/buff-command';
import { GameCharacter } from '@axe/domain/character/game-character';
import { saidNameOf } from '@axe/domain/character/hidden-name';
import { resetAcross, ResetRecorder } from '@axe/domain/character/piece-reset';
import { answerColorsOf } from '@axe/domain/chat/chat-color';
import { ChatMessage, ChatMessageContext, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { tellThoseWhoMaySee } from '@axe/domain/chat/game-master-lines';
import {
  findEmbeddedRolls,
  isDicelessArithmetic,
  isPlainArithmetic,
  replaceEmbeddedRolls,
  trailingArithmeticSplits,
  unwrapEmbeddedRolls,
  unwrapParentheses,
} from '@axe/domain/data/embedded-roll';
import { readDefaultResetCommand, resourceCommandSites } from '@axe/domain/data/resource-command-words';
import {
  ailmentsForBuffRemoval,
  applyBuffEditReport,
  applyDefaultReset,
  applyResourceEditReport,
  applyTextEdit,
  type BuffEdit,
  convertCommandToResourceEdit,
  createDefaultResourceEdit,
  type DefaultResetEdit,
  parseResourceEditOption,
  type ResourceEdit,
  type ResourceEditOption,
  type ResourceEditReport,
} from '@axe/domain/data/resource-edit-helpers';
import type { DiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
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

/**
 * How working out an amount ended: with a number, with nothing that could be read, or with a roll
 * that fell short of any total at all - an outright failure the system reports in words.
 */
type AmountOutcome = 'worked' | 'unreadable' | 'noTotal';

interface RolledOnce {
  result: string;
  /** The total at the end of the result, or null where the roll ended without one. */
  answer: number | null;
  /** Whether the dice came up as an outright failure. */
  fumble: boolean;
}

export { BuffByCharacter, BuffEdit, DiceRollResult, ResourceByCharacter, ResourceEdit, ResourceEditOption };

export class ResourceEditProcessor {
  constructor(
    private diceRollAsync: (message: string, gameSystem: GameSystemClass) => Promise<DiceRollResult>,
    private loadGameSystemAsync: (gameType: string) => Promise<GameSystemClass>,
    private isUnreachable: (gameSystem: GameSystemClass) => boolean = () => false
  ) {}

  /**
   * Picks the `:` resource and `&` buff commands out of a sent chat message and carries them out.
   *
   * A `t` prefix aims a command at the message's target character instead of the speaker, and an `s` prefix
   * makes the report a secret. A `&&` command sweeps buffs off every piece on the table instead; see
   * {@link parseBuffRemovalCommand}. `:*=既定` and `:HP=既定` put values back to their defaults, and `&リセット-`
   * and `&&リセット-` clear the buffs and then put the values back; see {@link readDefaultResetCommand}. The work continues asynchronously and ends in a system message on the same
   * chat tab; the promise returned settles once it has.
   */
  checkResourceEditCommand(
    originalMessage: ChatMessage,
    messageTargetContext: ChatMessageTargetContext[]
  ): Promise<void> {
    const resourceByCharacter: ResourceByCharacter[] = [];
    const buffByCharacter: BuffByCharacter[] = [];
    const buffSweeps: string[] = [];

    const sendFromObject = this.messageSendGameCharacter(originalMessage.sendFrom);
    let isSecret = false;

    for (const oneMessageTargetContext of messageTargetContext) {
      const words = resourceCommandSites(oneMessageTargetContext.text);
      if (words.secret) isSecret = true;
      for (const sweep of words.sweeps) buffSweeps.push(sweep.command);
      const object = oneMessageTargetContext.object;
      for (const res of words.resources) {
        if (object || !res.command.startsWith('t'))
          resourceByCharacter.push({ resourceCommand: res.command, object: object! });
      }
      for (const buff of words.buffs) {
        if (object || !buff.command.startsWith('t'))
          buffByCharacter.push({ buffCommand: buff.command, object: object! });
      }
    }
    return this.resourceEditProcess(
      sendFromObject,
      resourceByCharacter,
      buffByCharacter,
      originalMessage,
      isSecret,
      buffSweeps
    );
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
   * A command that clears the pieces aimed at of their buffs, or puts their values back to their defaults,
   * skips a part aimed at along with its body, which the body is cleared and put back with. `&リセット-` is
   * carried out as `&*-` and then `:*=既定`.
   * Amounts are rolled with the game system the loader gives for the message. A command whose amount cannot
   * be worked out is named in the report instead of applied. When the loader gives a system whose code could
   * not be fetched, no amount is worked out or reported as unreadable, and the sender is told the dice bot
   * could not be fetched; text changes and buffs still apply. The report comes from BCDice when any dice were
   * rolled, and nothing is posted when there is nothing to report.
   */
  async resourceEditProcess(
    sendFromObject: GameCharacter | null,
    resourceByCharacter: ResourceByCharacter[],
    buffByCharacter: BuffByCharacter[],
    originalMessage: ChatMessage,
    isSecret: boolean,
    buffSweeps: readonly string[] = []
  ) {
    const allEditList: ResourceEdit[] = [];
    const defaultResets: DefaultResetEdit[] = [];
    const unreadableCommands: string[] = [];
    const gameSystem = await this.loadGameSystemAsync(originalMessage.tags ? originalMessage.tags[0] : '');
    const canWorkOutAmounts = !this.isUnreachable(gameSystem);
    let leftAmountsAlone = false;

    for (const res of resourceByCharacter) {
      const oneText = res.resourceCommand;
      const targeted = !!oneText.match(/^t:/i);
      const object = targeted ? res.object : sendFromObject;
      if (object == null) {
        Logger.debug('[DiceBot] 送信元がキャラクターではないためリソース操作不可');
        continue;
      }

      const pick = readDefaultResetCommand(oneText);
      if (pick) {
        const aimedAt = resourceByCharacter
          .filter((other) => other.resourceCommand === oneText && other.object)
          .map((other) => other.object);
        if (!targeted || !isClearedWithBody(object, aimedAt)) defaultResets.push({ object, targeted, pick });
        continue;
      }

      const oneResourceEdit = this.defaultResourceEdit();
      if (!this.commandToEdit(oneResourceEdit, oneText, object, targeted)) continue;

      if (oneResourceEdit.operator !== '>') {
        if (!canWorkOutAmounts) {
          leftAmountsAlone = true;
          continue;
        }
        const outcome = await this.workOutAmount(oneResourceEdit, gameSystem);
        const named = `${targeted ? `[${saidNameOf(object)}] ` : ''}${oneText}`;
        if (outcome === 'unreadable') {
          unreadableCommands.push(`${named}を計算できません    `);
          continue;
        }
        if (outcome === 'noTotal' && oneResourceEdit.operator === '=') {
          unreadableCommands.push(`${named}は合計の出ないロールだったので変えません    `);
          continue;
        }
      }
      allEditList.push(oneResourceEdit);
    }
    if (leftAmountsAlone) {
      emitDiceBotUnreachable({ messageIdentifier: originalMessage.identifier, gameType: gameSystem.ID });
    }

    const repBuffCommandList: BuffEdit[] = [];
    const aimedAtBy = (command: string) =>
      buffByCharacter.filter((buff) => buff.buffCommand === command && buff.object).map((buff) => buff.object);
    for (const buff of buffByCharacter) {
      const oneText = buff.buffCommand;
      const targeted = !!oneText.match(/^t&/i);
      if (isPieceResetCommand(halfWidthBuffCommand(oneText))) {
        const object = targeted ? buff.object : sendFromObject;
        if (object == null) {
          Logger.debug('[DiceBot] 送信元がキャラクターではないためバフ操作不可');
          continue;
        }
        if (targeted && isClearedWithBody(object, aimedAtBy(oneText))) continue;
        repBuffCommandList.push({ command: targeted ? 't&*-' : '&*-', object, targeted });
        defaultResets.push({ object, targeted, pick: { kind: 'all' } });
        continue;
      }
      if (targeted) {
        const object = buff.object;
        const replaceText = halfWidthBuffCommand(oneText);
        if (parseBuffClearanceCommand(replaceText) && isClearedWithBody(object, aimedAtBy(oneText))) continue;
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
          const replaceText = halfWidthBuffCommand(oneText);
          repBuffCommandList.push({
            command: replaceText,
            object: sendFromObject,
            targeted: targeted,
          });
        }
      }
    }

    this.applyResourceBuffEdits(
      allEditList,
      repBuffCommandList,
      unreadableCommands,
      originalMessage,
      isSecret,
      buffSweeps,
      defaultResets
    );
  }

  /**
   * Works out an edit's amount, filling in its result, and says how that ended.
   *
   * Plain arithmetic, a division's rounding included, is rolled as it stands, its bracketed commands
   * first; a bracketed command with no dice in it is worked out as a calculation, which the system
   * will not take as a roll. An amount with more than that in it - a letter a system command takes
   * after its total, outside the brackets - is rolled whole as one command, which the system can
   * read where the arithmetic around it cannot, and where even that cannot be read, without the
   * plain arithmetic that ends it, which is added on. A roll that ends in an outright failure with
   * no total leaves the whole amount at nought: whatever was to be added to it does not come into it.
   */
  private async workOutAmount(edit: ResourceEdit, gameSystem: GameSystemClass): Promise<AmountOutcome> {
    if (!isPlainArithmetic(edit.amount)) return this.rollWholeAmount(edit, gameSystem);

    const embedded = await this.resolveEmbeddedRolls(edit, gameSystem);
    if (embedded !== 'worked') return embedded;

    const rolled = await this.rollOnce(edit.command, gameSystem);
    if (rolled == null || rolled.answer == null) return 'unreadable';

    const splitResult = rolled.result.split(' ＞ ');
    if (splitResult.length < 2) return 'unreadable';
    edit.diceResult = splitResult[splitResult.length - 2].replace(/\+\(1\[1\]-1\)$/, '');
    edit.calcAns = rolled.answer;
    return 'worked';
  }

  private async rollWholeAmount(edit: ResourceEdit, gameSystem: GameSystemClass): Promise<AmountOutcome> {
    const command = unwrapParentheses(unwrapEmbeddedRolls(edit.amount));
    const whole = await this.rollOnce(command, gameSystem);
    const split = whole == null ? await this.rollWithTrailingArithmetic(command, gameSystem) : null;
    const rolled = whole ?? split?.rolled;
    if (rolled == null) return 'unreadable';
    const rolledCommand = split?.head ?? command;
    if (rolled.answer == null) return rolled.fumble ? this.leaveAtNought(edit, rolledCommand, rolled) : 'unreadable';

    const total = rolled.answer + (split?.added ?? 0);
    const shown = rolled.result.replace(/^\S+ : /, '');
    edit.embeddedRolls.push(`[${rolledCommand}] ${shown}${split ? ` ${split.tail} ＞ ${total}` : ''}`);
    edit.isDiceRoll = true;
    const sign = edit.operator === '-' ? -1 : 1;
    edit.calcAns = sign * total;
    edit.diceResult = `${sign < 0 ? '-' : ''}${total < 0 ? `(${total})` : total}`;
    return 'worked';
  }

  /**
   * Rolls a command the system cannot read whole by rolling it without the plain arithmetic that
   * ends it, the shortest such ending first, and works that arithmetic out apart; null where nothing
   * of the kind ends it or what is left still cannot be read.
   */
  private async rollWithTrailingArithmetic(
    command: string,
    gameSystem: GameSystemClass
  ): Promise<{ head: string; tail: string; rolled: RolledOnce; added: number } | null> {
    for (const split of trailingArithmeticSplits(command)) {
      const rolled = await this.rollOnce(split.head, gameSystem);
      if (rolled == null) continue;
      const tail = await this.rollOnce(`C(0${split.tail})`, gameSystem);
      if (tail?.answer == null) return null;
      return { head: split.head, tail: split.tail, rolled, added: tail.answer };
    }
    return null;
  }

  private leaveAtNought(edit: ResourceEdit, command: string, rolled: RolledOnce): AmountOutcome {
    edit.embeddedRolls.push(`[${command}] ${rolled.result.replace(/^\S+ : /, '')}`);
    edit.isDiceRoll = true;
    edit.calcAns = 0;
    edit.diceResult = edit.operator === '-' ? '-0' : '0';
    return 'noTotal';
  }

  private async resolveEmbeddedRolls(edit: ResourceEdit, gameSystem: GameSystemClass): Promise<AmountOutcome> {
    const sites = findEmbeddedRolls(edit.command);
    if (sites.length < 1) return 'worked';

    const answers: number[] = [];
    for (const site of sites) {
      const rolled = await this.rollOnce(
        isDicelessArithmetic(site.command) ? `C(${site.command})` : site.command,
        gameSystem
      );
      if (rolled == null) return 'unreadable';
      if (rolled.answer == null) return rolled.fumble ? this.leaveAtNought(edit, site.command, rolled) : 'unreadable';
      answers.push(rolled.answer);
      edit.embeddedRolls.push(`[${site.command}] ${rolled.result.replace(/^\S+ : /, '')}`);
    }

    edit.command = replaceEmbeddedRolls(edit.command, answers);
    edit.isDiceRoll = true;
    return 'worked';
  }

  private async rollOnce(command: string, gameSystem: GameSystemClass): Promise<RolledOnce | null> {
    try {
      const rollResult = await this.diceRollAsync(command, gameSystem);
      if (!rollResult.result) return null;
      const resultMatch = rollResult.result.match(/([-+]?\d+)$/);
      return {
        result: rollResult.result,
        answer: resultMatch ? parseInt(resultMatch[1], 10) : null,
        fumble: rollResult.detail?.outcome === 'fumble',
      };
    } catch (e) {
      Logger.error('[DiceBot] リソース編集のダイスロールエラー', e);
      return null;
    }
  }

  /** Writes a `>` command's text into the character's status and returns its reports; see {@link applyTextEdit}. */
  textEdit(edit: ResourceEdit, character: GameCharacter): ResourceEditReport {
    return applyTextEdit(edit, character);
  }

  /** Applies a worked-out resource change and returns its reports; see {@link applyResourceEditReport}. */
  resourceEdit(edit: ResourceEdit, character: GameCharacter): ResourceEditReport {
    return applyResourceEditReport(edit, character);
  }

  /** Runs one buff command on the character and returns its reports; see {@link applyBuffEditReport}. */
  buffEdit(buff: BuffEdit, character: GameCharacter): ResourceEditReport {
    return applyBuffEditReport(buff, character);
  }

  /**
   * Carries the collected commands out and posts the one report: the changes of statuses in the order
   * written, then the buff commands, then the sweeps, a reset of the table among them, and only then
   * the values a `:` command or `&リセット-` puts back to their defaults, wherever in the line those were
   * written. A buff that moved a status puts back what it
   * moved as it is taken off, so a value put back first would have that taken from it a second time.
   *
   * What the commands that clear a piece of buffs, sweep the table and put values back did is kept as it
   * is done, each piece remembered just before the first of them reaches it, and told this device once
   * the report is posted, so the one who sent the line may take it back; see {@link ResetRecorder}.
   */
  private applyResourceBuffEdits(
    allEditList: ResourceEdit[],
    buffList: BuffEdit[],
    unreadableCommands: string[],
    originalMessage: ChatMessage,
    isSecret: boolean,
    buffSweeps: readonly string[] = [],
    defaultResets: readonly DefaultResetEdit[] = []
  ) {
    // What is said to everyone, and the same in full, which differs only where a piece's contents
    // are kept from anyone; the full one is then told those who may see what every such piece keeps.
    let text = '';
    let full = '';
    const kept = new Set<GameCharacter>();
    const add = (said: string, inFull = said) => {
      text += said;
      full += inFull;
    };
    let isDiceRoll = false;
    for (const edit of allEditList) {
      const character = edit.object!;
      if (edit.targeted) {
        add(`[${saidNameOf(character)}] `);
      }
      const report = edit.operator === '>' ? this.textEdit(edit, character) : this.resourceEdit(edit, character);
      add(report.shown, report.full);
      if (report.shown !== report.full) kept.add(character);
      if (edit.embeddedRolls.length > 0) {
        text = text.replace(/[ ]+$/, '');
        full = full.replace(/[ ]+$/, '');
        for (const embedded of edit.embeddedRolls) add(`\n  └ ${embedded}`);
        add('\n');
      }
      if (edit.isDiceRoll) {
        isDiceRoll = true;
      }
    }
    const recorder = new ResetRecorder();
    const withParts = (piece: GameCharacter) => [piece, ...piece.partsAlong()];
    for (const buff of buffList) {
      if (parseBuffClearanceCommand(buff.command)) recorder.watch(withParts(buff.object));
      const report = this.buffEdit(buff, buff.object);
      add(report.shown, report.full);
      if (report.shown !== report.full) kept.add(buff.object);
    }
    for (const sweep of buffSweeps) {
      add(isTableResetCommand(sweep) ? this.resetTable(sweep, recorder) : this.sweepBuffs(sweep, recorder));
    }
    for (const reset of defaultResets) {
      recorder.watch(withParts(reset.object));
      const report = applyDefaultReset(reset);
      if (reset.targeted && report.shown !== '') add(`[${saidNameOf(reset.object)}] `);
      add(report.shown, report.full);
      for (const piece of report.kept) kept.add(piece);
    }
    for (const unreadable of unreadableCommands) {
      add(unreadable);
    }
    text = text.replace(/\s+$/, '');
    full = full.replace(/\s+$/, '');

    if (text === '') return;
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
      imageIdentifier: '',
      tag: isSecret ? 'system secret' : 'system',
      name: nameText,
      text,
      ...answerColorsOf(originalMessage),
    };
    const chatTab = ObjectStore.instance.get<ChatTab>(originalMessage.tabIdentifier);
    if (chatTab) {
      const posted = chatTab.addMessage(resourceMessage);
      if (full !== text)
        tellThoseWhoMaySee(chatTab, { ...resourceMessage, timestamp: originalMessage.timestamp + 3 }, full, [...kept]);
      const record = recorder.finish();
      if (record.pieces.length > 0) emitResetCarriedOut({ messageIdentifier: posted.identifier, record });
    }
  }

  /**
   * Carries out one `&&` sweep across the pieces on the table and returns its report.
   *
   * Only the game master may sweep; anyone else is told so and nothing is taken. A sweep that finds
   * nothing says so rather than reporting a removal. `recorder` remembers how each piece stood first,
   * whatever the sweep picks by, so any sweep may be taken back.
   */
  sweepBuffs(command: string, recorder?: ResetRecorder): string {
    const rule = parseBuffRemovalCommand(command);
    if (!rule) return '';
    if (PeerCursor.myRole !== PeerRole.GameMaster) return `バフの一括解除はGMだけが使えます（${command}）    `;
    const onTable = this.piecesOnTable();
    recorder?.watch(onTable);
    const removed = removeBuffsAcross(onTable, rule, ailmentsForBuffRemoval(rule));
    const what = describeBuffRemoval(rule);
    if (removed.buffs < 1) return `卓全体に${describeBuffsLacking(rule)}はありません    `;
    return `卓全体から${what}を解除（${removed.characters}体・${removed.buffs}件）    `;
  }

  private piecesOnTable(): GameCharacter[] {
    return ObjectStore.instance
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => character.location.name === 'table');
  }

  /**
   * Carries out `&&リセット-` and returns its report: every buff off every piece on the table, and then
   * the values of each back to their defaults, each piece taken on its own.
   *
   * Only the game master may; anyone else is told so and nothing is changed. The report gives counts
   * alone, so nothing a piece keeps from anyone is said. `recorder` remembers how each piece stood
   * first. The work itself is {@link resetAcross}, which the buttons that reset pieces share.
   */
  resetTable(command: string, recorder?: ResetRecorder): string {
    if (PeerCursor.myRole !== PeerRole.GameMaster) return `卓全体のリセットはGMだけが使えます（${command}）    `;
    const onTable = this.piecesOnTable();
    recorder?.watch(onTable);
    const reset = resetAcross(onTable, { rule: { kind: 'all' }, values: true });
    if (reset.characters < 1) return '卓全体に解除するバフも戻す値もありません    ';
    return `卓全体をリセット（${reset.characters}体・バフ${reset.buffs}件・値${reset.items}項目）    `;
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
