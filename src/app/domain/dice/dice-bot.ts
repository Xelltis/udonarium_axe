import {
  diceTableMessage$,
  DiceTableMessageEvent,
  emitDiceBotCatalogLoaded,
  emitDiceBotUnreachable,
  emitDiceRolled,
  emitSendMessage,
  resourceEditMessage$,
  ResourceEditMessageEvent,
  sendMessage$,
  SendMessageEvent,
} from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { SyncObject } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PromiseQueue } from '@axe/core/util/promise-queue';
import { toHalfWidth } from '@axe/core/util/string-util';
import { answerColorsOf } from '@axe/domain/chat/chat-color';
import { ChatMessage, ChatMessageContext, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DiceRollResult, ResourceEditProcessor } from '@axe/domain/data/resource-edit-processor';
import { diceRollDetailOf, encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { GameSystemInfo } from 'bcdice/lib/bcdice/game_system_list.json';
import GameSystemClass from 'bcdice/lib/game_system';
import type Loader from 'bcdice/lib/loader/loader';

/** The dice bot everything starts with, which nobody has to have chosen. */
export const PLAIN_DICE_BOT = 'DiceBot';

@SyncObject('dice-bot')
export class DiceBot extends GameObject {
  private static loader: Loader;
  private static queue: PromiseQueue | null = null;
  private static readonly unreachableSystems = new WeakSet<GameSystemClass>();
  private resourceProcessor = new ResourceEditProcessor(
    DiceBot.diceRollAsync.bind(DiceBot),
    DiceBot.loadGameSystemAsync.bind(DiceBot)
  );
  private cleanups: (() => void)[] = [];

  static diceBotInfos: GameSystemInfo[] = [];

  /**
   * The catalog entry for a game system made here rather than shipped with the dice library, listed
   * under the given locale.
   */
  static getCustomGameSystemInfo(ststem: GameSystemClass, locale: string): GameSystemInfo {
    const gameSystemInfo: GameSystemInfo = {
      id: ststem.ID,
      name: ststem.NAME,
      className: ststem.ID,
      sortKey: ststem.SORT_KEY,
      locale: locale,
      superClassName: 'Base',
    };
    return gameSystemInfo;
  }

  private static listAvailableGameSystems(): GameSystemInfo[] {
    const diceBotInfos: GameSystemInfo[] = DiceBot.loader.listAvailableGameSystems();
    return diceBotInfos;
  }

  /**
   * Rolls a command under a game system and returns the formatted result, whether it is secret, and
   * what the dice showed.
   *
   * Rolls wait in the loading queue, so none runs before the library is ready. A command the system
   * does not recognise, or one that throws, gives an empty result.
   */
  static async diceRollAsync(message: string, gameSystem: GameSystemClass): Promise<DiceRollResult> {
    return DiceBot.loadingQueue.add(() => {
      try {
        const result = gameSystem.eval(message);
        if (result) {
          Logger.info(`[DiceRoll] ${gameSystem.ID}: ${result.text}${result.secret ? ' (secret)' : ''}`);
          return {
            id: gameSystem.ID,
            result: `${gameSystem.ID} : ${result.text}`
              .replace(/\n*(#\d+)\n/gi, '\n$1 ') // 繰り返しダイスロールを行ごとに表示
              .replace(/: \n/, ': '), // ヘッダー直後の余分な改行を除去
            isSecret: result.secret,
            // This is the only place they can be had; once the text is formatted they cannot be read back.
            detail: diceRollDetailOf(gameSystem.ID, result),
          };
        }
      } catch (e) {
        Logger.error('[DiceBot] ダイスロール失敗', e);
      }
      return { id: gameSystem.ID, result: '', isSecret: false, detail: null };
    });
  }

  /**
   * The help text of a game system, loading the system if it has not been. Empty when it cannot be
   * loaded.
   *
   * Calling it and ignoring the answer is how a system is loaded ahead of its first roll.
   */
  static async getHelpMessage(gameType: string): Promise<string> {
    try {
      const gameSystem = await DiceBot.loadGameSystemAsync(gameType);
      return gameSystem.HELP_MESSAGE;
    } catch (e) {
      Logger.error('[DiceBot] ヘルプメッセージ取得失敗', e);
    }
    return '';
  }

  /**
   * A hook for game systems made here rather than in the dice library. There are none, so it always
   * answers null.
   */
  static loadCustomGameSystem(_gameType: string): GameSystemClass | null {
    return null;
  }

  /**
   * The game system for an id, fetching its code the first time.
   *
   * An id not in the catalog gives the plain dice bot. One whose code cannot be fetched gives a
   * stand-in under the same id that recognises no command and rolls nothing; the next call tries
   * the fetch again.
   */
  static async loadGameSystemAsync(gameType: string): Promise<GameSystemClass> {
    return await DiceBot.loadingQueue.add(() => {
      const system = this.loadCustomGameSystem(gameType);
      if (system) {
        return system;
      }
      const id = this.diceBotInfos.some((info) => info.id === gameType) ? gameType : PLAIN_DICE_BOT;
      return DiceBot.loadedOrFetched(id);
    });
  }

  /**
   * The system under an id, fetching its chunk when it has not been loaded.
   *
   * A chunk that cannot be fetched - the line dropped, or a tab left open across a release asks
   * for one that is gone - gives the stand-in rather than another system, so a line sent under it
   * keeps the id the room chose and is never rolled by rules it was not meant for. Nothing about
   * the failure is kept here. Whether the next fetch can succeed is up to the browser, some of
   * which hold on to a failed module until the page is reloaded.
   */
  private static async loadedOrFetched(id: string): Promise<GameSystemClass> {
    try {
      return DiceBot.loader.getGameSystemClass(id);
    } catch {
      try {
        return await DiceBot.loader.dynamicLoad(id);
      } catch (e) {
        Logger.warn(`[DiceBot] ${id} を読み込めません`, e);
        return DiceBot.unreachableSystem(id);
      }
    }
  }

  /**
   * A stand-in for a system whose code could not be fetched: its id and name, no help, no command
   * pattern, and an eval that recognises nothing. It is never constructed, so it has no constructor.
   */
  private static unreachableSystem(id: string): GameSystemClass {
    const info = DiceBot.diceBotInfos.find((each) => each.id === id);
    const system = {
      ID: id,
      NAME: info?.name ?? id,
      SORT_KEY: info?.sortKey ?? '',
      HELP_MESSAGE: '',
      COMMAND_PATTERN: null,
      eval: () => null,
    } as unknown as GameSystemClass;
    DiceBot.unreachableSystems.add(system);
    return system;
  }

  private static isUnreachable(gameSystem: GameSystemClass): boolean {
    return DiceBot.unreachableSystems.has(gameSystem);
  }

  private static get loadingQueue(): PromiseQueue {
    if (!DiceBot.queue) DiceBot.queue = DiceBot.initializeDiceBotQueue();
    return DiceBot.queue;
  }

  /**
   * Resolves once the dice library and its catalog of game systems have loaded, starting the load
   * when nothing has asked for it yet.
   */
  static ensureLoaded(): Promise<void> {
    return DiceBot.loadingQueue.add(() => undefined);
  }

  private static initializeDiceBotQueue(): PromiseQueue {
    const queue = new PromiseQueue('DiceBotQueue');
    queue.add(async () => {
      const { default: BCDiceLoader } = await import('./bcdice/bcdice-loader');
      DiceBot.loader = new BCDiceLoader();
      DiceBot.diceBotInfos = DiceBot.listAvailableGameSystems().sort((a, b) => {
        if (a.sortKey < b.sortKey) return -1;
        if (a.sortKey > b.sortKey) return 1;
        return 0;
      });
      emitDiceBotCatalogLoaded();
    });
    return queue;
  }

  /** Every dice table in the room. */
  getDiceTables(): DiceTable[] {
    return ObjectStore.instance.getObjects(DiceTable);
  }

  /**
   * Strips the resource and buff commands aimed at the speaker out of a chat line, keeping the ones
   * aimed at a target.
   *
   * A line sent to several targets is repeated for each, and only the first copy should change the
   * speaker's own sheet. A `:` or `&` command runs to the next space and is removed unless it
   * follows a `t`.
   */
  static deleteMyselfResourceBuff(str: string): string {
    let beforeIsSpace = true;
    let beforeIsT = false;
    let tCommand = false;
    let deleteCommand = false;
    const chars: string[] = [];
    for (let i = 0; i < str.length; i++) {
      const chktext: string = str[i];

      if (beforeIsSpace && chktext.match(/[tTｔＴ]/)) {
        beforeIsSpace = false;
        beforeIsT = true;
        deleteCommand = false;
        tCommand = false;
        chars.push(str[i]);
        continue;
      }

      if (beforeIsT && chktext.match(/[:：&＆]/)) {
        beforeIsSpace = false;
        beforeIsT = false;
        deleteCommand = false;
        tCommand = true;
        chars.push(str[i]);
        continue;
      }

      if ((tCommand || beforeIsSpace || deleteCommand) && chktext.match(/[:：&＆]/)) {
        beforeIsSpace = false;
        beforeIsT = false;
        deleteCommand = true;
        tCommand = false;
        continue;
      }

      if (chktext.match(/\s/)) {
        beforeIsSpace = true;
        beforeIsT = false;
        deleteCommand = false;
        tCommand = false;
        chars.push(str[i]);
        continue;
      } else {
        beforeIsSpace = false;
      }

      if (deleteCommand) {
        continue;
      }

      chars.push(str[i]);
    }
    return chars.join('');
  }

  /**
   * Whether the line holds a secret resource command, an `s:` or `st:` at the start or after a
   * space.
   */
  checkSecretEditCommand(chatText: string): boolean {
    const text: string = ` ${toHalfWidth(chatText).toLowerCase()}`;
    const replaceText = text.replace('：', ':');
    const m = replaceText.match(/\sST?:/i);
    if (m) return true;
    return false;
  }

  /**
   * Whether the line is a secret roll under the game system: an `s` in front of a command the
   * system recognises, after any repeat count.
   *
   * The stand-in for a system whose code could not be fetched has no pattern to recognise a
   * command by, so there an `s` counts when the first word after it holds a digit or one of
   * `<>=[(`, which keeps a secret roll's command out of the open line. Any other system with no
   * command pattern has no secret lines.
   */
  checkSecretDiceCommand(gameSystem: GameSystemClass, chatText: string): boolean {
    const text: string = toHalfWidth(chatText).toLowerCase();
    const nonRepeatText = text
      .replace(/^(\d+)?\s+/, 'repeat1 ')
      .replace(/^x(\d+)?\s+/, 'repeat1 ')
      .replace(/repeat(\d+)?\s+/, '');
    const regArray = /^s(.*)?/gi.exec(nonRepeatText);
    if (gameSystem.COMMAND_PATTERN) {
      return !!(regArray && gameSystem.COMMAND_PATTERN.test(regArray[1]));
    }
    if (DiceBot.isUnreachable(gameSystem)) {
      return !!regArray && /^\S*[\d<>=[(]/.test(regArray[1] ?? '');
    }
    return false;
  }

  /**
   * Starts answering the local user's own chat lines once the dice bot is in the store: rolls, dice
   * table commands and resource commands.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.cleanups.push(sendMessage$.subscribe((data) => this.handleSendMessage(data)));
    this.cleanups.push(diceTableMessage$.subscribe((data) => this.handleDiceTableMessage(data)));
    this.cleanups.push(resourceEditMessage$.subscribe((data) => this.handleResourceEditMessage(data)));
  }

  private async handleSendMessage(data: SendMessageEvent) {
    const chatMessage = ObjectStore.instance.get<ChatMessage>(data.messageIdentifier);
    if (!chatMessage || !chatMessage.isSendFromSelf || chatMessage.isSystem) {
      return;
    }

    let text: string;
    if (data.messageTarget) {
      text = toHalfWidth(data.messageTarget.text);
    } else {
      text = toHalfWidth(chatMessage.text);
    }

    const gameType: string = chatMessage.tags ? chatMessage.tags[0] : '';

    try {
      const regArray = /^((\d+)?\s+)?(.*)?/gi.exec(text);
      const repeat: number = regArray![2] != null ? Number(regArray![2]) : 1;
      let rollText: string = regArray![3] != null ? regArray![3] : text;
      const gameSystem = await DiceBot.loadGameSystemAsync(gameType);
      if (DiceBot.isUnreachable(gameSystem)) {
        emitDiceBotUnreachable({ messageIdentifier: chatMessage.identifier, gameType: gameSystem.ID });
        return;
      }
      if (gameSystem.COMMAND_PATTERN) {
        if (!gameSystem.COMMAND_PATTERN.test(rollText)) {
          return;
        }
      }
      if (!rollText || repeat < 1) {
        return;
      }

      if (repeat > 1) {
        rollText = `x${repeat} ${rollText}`;
      }

      const rollResult = await DiceBot.diceRollAsync(rollText, gameSystem);
      if (!rollResult.result) {
        return;
      }

      if (data.messageTarget) {
        if (data.messageTarget.object) {
          this.sendResultMessage(rollResult, chatMessage, ` [${data.messageTarget.object.name}]`);
        } else {
          this.sendResultMessage(rollResult, chatMessage);
        }
      } else {
        this.sendResultMessage(rollResult, chatMessage);
      }
    } catch (e) {
      Logger.error('[DiceBot] ダイスコマンド処理エラー', e);
    }
  }

  private async handleDiceTableMessage(data: DiceTableMessageEvent) {
    const chatMessage = ObjectStore.instance.get<ChatMessage>(data.messageIdentifier);
    if (!chatMessage || !chatMessage.isSendFromSelf || chatMessage.isSystem) {
      return;
    }

    const text: string = toHalfWidth(chatMessage.text).trim();
    const splitText = text.split(/\s/);

    const diceTable = this.getDiceTables();
    if (!diceTable || splitText.length == 0) {
      return;
    }

    let rollTable: DiceTable | null = null;
    for (const table of diceTable) {
      if (table.command == splitText[0]) {
        rollTable = table;
      }
    }
    if (!rollTable) {
      return;
    }

    try {
      const regArray = /^((\d+)?\s+)?(.*)?/gi.exec(rollTable.dice);
      const repeat: number = regArray![2] != null ? Number(regArray![2]) : 1;
      const rollText: string = regArray![3] != null ? regArray![3] : text;
      const finalResult: DiceRollResult = { id: null, result: '', isSecret: false };
      for (let i = 0; i < repeat && i < 32; i++) {
        const gameSystem = await DiceBot.loadGameSystemAsync(rollTable.diceTablePalette!.dicebot);
        if (DiceBot.isUnreachable(gameSystem)) {
          emitDiceBotUnreachable({ messageIdentifier: chatMessage.identifier, gameType: gameSystem.ID });
          return;
        }
        const rollResult = await DiceBot.diceRollAsync(rollText, gameSystem);
        if (rollResult.result.length < 1) {
          break;
        }

        finalResult.result += rollResult.result;
        finalResult.isSecret = finalResult.isSecret || rollResult.isSecret;
        if (1 < repeat) {
          finalResult.result += ` #${i + 1}`;
        }
      }

      const rolledDiceNum = finalResult.result.match(/\d+$/);
      let tableAns = 'ダイス目の番号が表にありません';
      if (rolledDiceNum) {
        const tablePalette = rollTable.diceTablePalette!.getPalette();
        for (const entry of tablePalette) {
          const splitOneTable = entry.split(/[:：,，\s]/);
          if (splitOneTable[0] == rolledDiceNum[0]) {
            tableAns = entry.replace(/\\n/g, '\n');
          }
        }
      }
      finalResult.result += `\n${tableAns}`;
      this.sendResultMessage(finalResult, chatMessage);
    } catch (e) {
      Logger.error('[DiceBot] ダイス表処理エラー', e);
    }
  }

  private async handleResourceEditMessage(data: ResourceEditMessageEvent) {
    const chatMessage = ObjectStore.instance.get<ChatMessage>(data.messageIdentifier);
    if (!chatMessage || !chatMessage.isSendFromSelf || chatMessage.isSystem) {
      return;
    }

    this.resourceProcessor.checkResourceEditCommand(
      chatMessage,
      (data.messageTargetContext as ChatMessageTargetContext[] | null) ?? []
    );
  }

  private sendResultMessage(rollResult: DiceRollResult, originalMessage: ChatMessage, multiTargetOption?: string) {
    let result: string = rollResult.result;
    const isSecret: boolean = rollResult.isSecret;

    if (result.length < 1) {
      return;
    }
    result = result.replace(/[＞]/g, (_s) => '→').trim();

    if ((result.match(/ → /g) ?? []).length >= 3) {
      result = result.replace(/ → /g, '\n→ ');
    }

    const diceBotMessage: ChatMessageContext = {
      identifier: '',
      tabIdentifier: originalMessage.tabIdentifier,
      originFrom: originalMessage.from,
      from: 'System-BCDice',
      timestamp: originalMessage.timestamp + 1,
      imageIdentifier: '',
      tag: isSecret ? 'system secret' : 'system',
      dicebot: encodeDiceRollDetail(rollResult.detail ?? null),
      name: isSecret ? `<Secret-BCDice：${originalMessage.name}>` : `<BCDice：${originalMessage.name}>`,
      text: multiTargetOption ? `${result}${multiTargetOption}` : result,
      ...answerColorsOf(originalMessage),
    };

    if (originalMessage.to != null && 0 < originalMessage.to.length) {
      diceBotMessage.to = originalMessage.to;
      if (originalMessage.to.indexOf(originalMessage.from) < 0) {
        diceBotMessage.to += ` ${originalMessage.from}`;
      }
    }
    const chatTab = ObjectStore.instance.get<ChatTab>(originalMessage.tabIdentifier);
    if (chatTab) {
      const chat = chatTab.addMessage(diceBotMessage);
      emitSendMessage({ messageIdentifier: chat.identifier, messageTarget: null });
      // What the dice showed lives on the answer and the notation on the line it answered,
      // so anything that ties the two together needs both.
      emitDiceRolled({ sourceMessageIdentifier: originalMessage.identifier, resultMessageIdentifier: chat.identifier });
    }
  }

  /** Stops answering chat lines once the dice bot leaves the store. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }
}
