import { inject, Injectable } from '@angular/core';
import {
  calcChatTimestamp,
  emitChatMessageEvents,
  findImageIdentifierByName,
  type ImageIdentifierResult,
  type ImageNameEntry,
  parsePortraitCommand,
  resolveChatMessageTag,
  resolveImagePos,
  resolveMessageColor,
  resolvePortraitIndex,
  stripPortraitCommand,
} from '@axe/application/chat/chat-message-helpers';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { emitDiceTableMessage, emitResourceEditMessage, emitSendMessage } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { toHalfWidth } from '@axe/core/util/string-util';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageContext, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { copiedMessageContext } from '@axe/domain/chat/chat-message-copy';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { OUT_OF_STORY_TAG } from '@axe/domain/chat/constants';
import { dieRollTag } from '@axe/domain/chat/die-roll-tag';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import GameSystemClass from 'bcdice/lib/game_system';

const HOURS = 60 * 60 * 1000;

@Injectable()
export class ChatMessageService {
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly chatTabList = inject(ChatTabList);

  private calibrationTimer: ReturnType<typeof setTimeout> | null = null;
  private timeOffset: number = Date.now();
  private performanceOffset: number = performance.now();

  private ntpApiUrls: string[] = ['https://worldtimeapi.org/api/ip'];

  gameType: string = 'DiceBot';

  /** The room's chat tabs, in the order they are listed. */
  get chatTabs(): readonly ChatTab[] {
    return this.chatTabList.chatTabs;
  }

  /**
   * Sets the chat clock by a public time server, then again every six hours.
   *
   * Lines are ordered by the time they are stamped with, so peers whose own clocks disagree would
   * otherwise interleave wrongly. A failed request keeps the clock as it was and tries again on the
   * same schedule. Calling it while a check is already scheduled does nothing.
   */
  calibrateTimeOffset() {
    if (this.calibrationTimer != null) {
      return;
    }
    const index = Math.floor(Math.random() * this.ntpApiUrls.length);
    const ntpApiUrl = this.ntpApiUrls[index];
    const sendTime = performance.now();
    fetch(ntpApiUrl)
      .then((response) => {
        if (response.ok) return response.json();
        throw new Error('Network response was not ok.');
      })
      .then((jsonObj) => {
        const endTime = performance.now();
        const latency = (endTime - sendTime) / 2;
        const timeobj = jsonObj;
        const st: number = new Date(timeobj.utc_datetime).getTime();
        const fixedTime = st + latency;
        this.timeOffset = fixedTime;
        this.performanceOffset = endTime;
        Logger.info(`[TimeSync] 時刻同期完了 (過延: ${latency.toFixed(0)}ms, offset: ${fixedTime.toFixed(0)})`);
        this.scheduleCalibration();
      })
      .catch((error) => {
        Logger.warn('[TimeSync] 時刻同期失敗', error.message);
        this.scheduleCalibration();
      });
    this.scheduleCalibration();
  }

  private scheduleCalibration() {
    if (this.calibrationTimer != null) clearTimeout(this.calibrationTimer);
    this.calibrationTimer = setTimeout(() => {
      this.calibrationTimer = null;
      this.calibrateTimeOffset();
    }, 6 * HOURS);
  }

  /** The current time in milliseconds by the calibrated chat clock, which is what lines are stamped with. */
  getTime(): number {
    return Math.floor(this.timeOffset + (performance.now() - this.performanceOffset));
  }

  /** Writes a notice into the system tab under the system's name, in green unless a colour is given. */
  sendSystemMessage(text: string, color?: string, from?: string): ChatMessage {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    const sysTab = chatTabList!.systemMessageTab!;
    const messageColor = resolveMessageColor(color, '#006633');
    const chatMessage: ChatMessageContext = {
      from,
      name: encodeI18nMessage('common.chat.systemName'),
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(sysTab),
      tag: 'system-message',
      text,
      imagePos: -1,
      messColor: messageColor,
    };
    return sysTab.addMessage(chatMessage);
  }

  /** Writes a notice into the given tab under the system's name, in green unless a colour is given. */
  sendSystemMessageToTab(
    chatTab: ChatTab,
    text: string,
    color?: string,
    from?: string,
    /** Marks the notice as housekeeping, so novel mode keeps it out of the script it reads. */
    outOfStory = false
  ): ChatMessage {
    const messageColor = resolveMessageColor(color, '#006633');
    const chatMessage: ChatMessageContext = {
      from,
      name: encodeI18nMessage('common.chat.systemName'),
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(chatTab),
      tag: outOfStory ? `system-message ${OUT_OF_STORY_TAG}` : 'system-message',
      text,
      imagePos: -1,
      messColor: messageColor,
    };
    return chatTab.addMessage(chatMessage);
  }

  /**
   * A notice only whoever sent it may read, which the room sees as a secret die.
   *
   * The line is sent whole and kept back by the view rather than being written short, so
   * the thrower can read their own result and open it to the table when they choose to.
   */
  sendSecretSystemMessageToTab(
    chatTab: ChatTab,
    text: string,
    from?: string,
    color?: string,
    dieIdentifiers: readonly string[] = []
  ): ChatMessage {
    const messageColor = resolveMessageColor(color, '#006633');
    const chatMessage: ChatMessageContext = {
      from,
      name: encodeI18nMessage('common.chat.systemName'),
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(chatTab),
      tag: ['system-message', 'secret', ...dieIdentifiers.map(dieRollTag)].join(' '),
      text,
      imagePos: -1,
      messColor: messageColor,
    };
    return chatTab.addMessage(chatMessage);
  }

  /** A kept-back notice, as `sendSecretSystemMessageToTab` writes it, in the first tab of the room. */
  sendSecretSystemMessageToMainTab(text: string, from?: string, dieIdentifiers: readonly string[] = []): ChatMessage {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    return this.sendSecretSystemMessageToTab(chatTabList!.chatTabs[0], text, from, undefined, dieIdentifiers);
  }

  /**
   * Writes a notice into the first tab of the room, which is where the round and other table-wide
   * events are announced.
   */
  sendSystemMessageToMainTab(text: string, color?: string): ChatMessage {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    return this.sendSystemMessageToTab(chatTabList!.chatTabs[0], text, color);
  }

  /**
   * Writes a notice only one reader receives, addressed to the piece or peer named by `sendTo`.
   *
   * An address that names neither leaves the line addressed to nobody.
   */
  sendSystemMessageOnePlayer(
    chatTab: ChatTab,
    text: string,
    sendTo: string,
    color?: string,
    outOfStory = false
  ): ChatMessage {
    const messageColor = resolveMessageColor(color, '#006633');
    const chatMessage: ChatMessageContext = {
      from: this.findId(sendTo),
      to: this.findId(sendTo),
      name: encodeI18nMessage('common.chat.systemName'),
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(chatTab),
      tag: outOfStory ? `DiceBot to-pl-system-message ${OUT_OF_STORY_TAG}` : 'DiceBot to-pl-system-message',
      text: text,
      imagePos: -1,
      messColor: messageColor,
      sendFrom: undefined,
    };
    return chatTab.addMessage(chatMessage);
  }

  /**
   * Speaks a notice as whoever this reader last spoke as, with that speaker's portrait where it
   * still matches.
   *
   * It goes to the named tab, or the system tab when none is named or the name is not a tab.
   */
  sendSystemMessageAsLastSpeaker(text: string, chatTabIdentifier?: string) {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    const sysTab = this.resolveChatTab(chatTabIdentifier) ?? chatTabList!.systemMessageTab!;
    const sendFrom = PeerCursor.myCursor.lastControlSendFrom
      ? PeerCursor.myCursor.lastControlSendFrom
      : PeerCursor.myCursor.identifier;
    let imgIndex = PeerCursor.myCursor.lastControlImageIndex;
    const imageIdentifier = this.findImageIdentifier(sendFrom, imgIndex);
    if (imageIdentifier != PeerCursor.myCursor.lastControlImageIdentifier) imgIndex = 0;
    this.sendMessage(sysTab!, text, null, sendFrom, undefined, imgIndex, '#006633');
  }

  /**
   * Speaks a line into a tab as a piece or a peer, and tells the dice table and resource edits
   * about it.
   *
   * Image references to the speaker's data are lifted out into attachments, a trailing portrait
   * command picks the portrait and is removed from the text, and a line sent under a dice system is
   * tagged with it. A line not whispered to anyone also records who this reader last spoke as,
   * which `sendSystemMessageAsLastSpeaker` follows.
   */
  sendMessage(
    chatTab: ChatTab,
    text: string,
    gameSystem: GameSystemClass | null,
    sendFrom: string,
    sendTo?: string,
    portraitIndex?: number,
    color?: string,
    messageTargetContext?: ChatMessageTargetContext[],
    attachmentImageIdentifiers?: string[],
    replyTo?: string,
    quoteOf?: string,
    bubbles?: { light: string; dark: string },
    vnEmote?: string
  ): ChatMessage {
    const resolvedMessage = this.resolveAttachmentImageReferences(text, sendFrom, attachmentImageIdentifiers ?? []);
    text = resolvedMessage.text;

    const imgIndex = resolvePortraitIndex(portraitIndex);
    const messageColor = resolveMessageColor(color, '#000000');

    const dicebot = this.objectStore.get<DiceBot>('DiceBot')!;
    const chatMessageTag = resolveChatMessageTag(gameSystem, text, dicebot);

    const chatMessage: ChatMessageContext = {
      from: Network.peerContext.userId,
      to: sendTo != null ? this.findId(sendTo) : undefined,
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: this.findImageIdentifier(sendFrom, imgIndex),
      timestamp: this.calcTimeStamp(chatTab),
      tag: chatMessageTag,
      text,
      imagePos: this.findImagePos(sendFrom),
      messColor: messageColor,
      sendFrom: sendFrom,
      senderRole: PeerCursor.myRole,
    };
    if (resolvedMessage.attachmentImageIdentifiers.length > 0) {
      chatMessage.attachmentImageIdentifiers = JSON.stringify(resolvedMessage.attachmentImageIdentifiers);
    }
    if (replyTo) {
      chatMessage.replyTo = replyTo;
    }
    if (quoteOf) {
      chatMessage.quoteOf = quoteOf;
    }
    if (bubbles?.light) chatMessage.messBubbleLight = bubbles.light;
    if (bubbles?.dark) chatMessage.messBubbleDark = bubbles.dark;
    if (vnEmote) chatMessage.vnEmote = vnEmote;

    const portrait = this.applyPortraitCommand(chatMessage, text, sendFrom, imgIndex);
    this.setLastControlInfoToPeer(sendFrom, portrait.identifier, portrait.index, sendTo);

    const chat = chatTab.addMessage(chatMessage);

    const eventPlan = emitChatMessageEvents(messageTargetContext ?? undefined);
    for (const target of eventPlan.sendTargets) {
      emitSendMessage({
        messageIdentifier: chat.identifier,
        messageTarget: target,
      });
    }
    emitDiceTableMessage({ messageIdentifier: chat.identifier });
    emitResourceEditMessage({
      messageIdentifier: chat.identifier,
      messageTargetContext: eventPlan.resourceEditTargetContext,
    });

    return chat;
  }

  private resolveAttachmentImageReferences(
    text: string,
    sendFrom: string,
    attachmentImageIdentifiers: string[]
  ): { text: string; attachmentImageIdentifiers: string[] } {
    const object = this.objectStore.get(sendFrom);
    if (!(object instanceof GameCharacter) || !object.rootDataElement) {
      return { text, attachmentImageIdentifiers };
    }

    const resolvedAttachmentImageIdentifiers = [...attachmentImageIdentifiers];
    const resolvedText = text.replace(/[tTｔＴ]?[{｛]\s*([^{}｛｝]+)\s*[}｝]/g, (match, name) => {
      if (match.match(/^[tTｔＴ].*/)) return match;

      const element = DataElement.findElementByReference(object.rootDataElement!, toHalfWidth(name));
      if (!element || element.fieldType !== DataElementFieldType.IMAGE) return match;

      const imageIdentifier = String(element.value ?? '').trim();
      if (imageIdentifier.length > 0 && !resolvedAttachmentImageIdentifiers.includes(imageIdentifier)) {
        resolvedAttachmentImageIdentifiers.push(imageIdentifier);
      }
      return '';
    });

    return {
      text: resolvedText.replace(/[ \t]{2,}/g, ' ').trim(),
      attachmentImageIdentifiers: resolvedAttachmentImageIdentifiers,
    };
  }

  private applyPortraitCommand(
    chatMessage: ChatMessageContext,
    text: string,
    sendFrom: string,
    imgIndex: number
  ): ImageIdentifierResult {
    const untouched = { identifier: chatMessage.imageIdentifier ?? '', index: imgIndex };
    const command = parsePortraitCommand(text);
    if (command.type === 'none') return untouched;

    if (command.type === 'hide') {
      chatMessage.imageIdentifier = '';
      chatMessage.text = stripPortraitCommand(text);
      return { identifier: '', index: imgIndex };
    }

    const found =
      command.type === 'index'
        ? { identifier: this.findImageIdentifier(sendFrom, command.position - 1), index: command.position - 1 }
        : this.findImageIdentifierName(sendFrom, command.name);
    if (!found.identifier) return untouched;

    chatMessage.imageIdentifier = found.identifier;
    chatMessage.text = stripPortraitCommand(text);
    const obj = this.objectStore.get(sendFrom);
    if (obj instanceof GameCharacter) obj.selectedPortraitIndex = found.index;
    return found;
  }

  private findId(identifier: string): string {
    const object = this.objectStore.get(identifier);
    if (object instanceof GameCharacter) {
      return object.identifier;
    } else if (object instanceof PeerCursor) {
      return object.userId;
    }
    return '';
  }

  private resolveChatTab(identifier?: string): ChatTab | null {
    if (!identifier) return null;
    const tab = this.objectStore.get<ChatTab>(identifier);
    return tab instanceof ChatTab ? tab : null;
  }

  private findObjectName(identifier: string): string {
    const object = this.objectStore.get(identifier);
    if (object instanceof GameCharacter) {
      return object.name;
    } else if (object instanceof PeerCursor) {
      return object.name;
    }
    return identifier;
  }

  private makeMessageName(sendFrom: string, sendTo?: string): string {
    const sendFromName = this.findObjectName(sendFrom);
    if (sendTo == null || sendTo.length < 1) return sendFromName;
    const sendToName = this.findObjectName(sendTo);
    return sendFromName + ' > ' + sendToName;
  }

  private setLastControlInfoToPeer(sendFrom: string, imageIdentifier: string, imgindex: number, sendTo?: string): void {
    const sendFromName = this.findObjectName(sendFrom);
    const peerCursor = PeerCursor.myCursor;

    if (!peerCursor) {
      return;
    }
    if (sendTo == null || sendTo.length < 1) {
      if (peerCursor.lastControlImageIdentifier != imageIdentifier) {
        peerCursor.lastControlImageIdentifier = imageIdentifier;
      }
      if (peerCursor.lastControlCharacterName != sendFromName) {
        peerCursor.lastControlCharacterName = sendFromName;
      }
      peerCursor.lastControlSendFrom = sendFrom;
      peerCursor.lastControlImageIndex = imgindex;
    } else {
      // does nothing for a whisper
    }
  }

  private findImageIdentifierName(sendFrom: string, name: string): ImageIdentifierResult {
    const object = this.objectStore.get(sendFrom);
    if (object instanceof GameCharacter) {
      const data: DataElement | null = object.imageDataElement;
      if (!data) return findImageIdentifierByName([], name);
      const entries: ImageNameEntry[] = [];
      for (const child of data.children) {
        if (child instanceof DataElement) {
          const img = this.imageStorage.get(child.value as string);
          entries.push({
            label: portraitNameOf(child),
            identifier: img ? img.identifier : '',
          });
        }
      }
      return findImageIdentifierByName(entries, name);
    }
    return { identifier: '', index: 0 };
  }

  private findImageIdentifier(sendFrom: string, index: number): string {
    const object = this.objectStore.get(sendFrom);
    if (object instanceof GameCharacter) {
      if (index >= 0 && object.imageDataElement && object.imageDataElement.children.length > index) {
        const img = this.imageStorage.get(object.imageDataElement.children[index].value as string);
        if (img) {
          return img.identifier;
        }
      }
      return '';
    } else if (object instanceof PeerCursor) {
      return object.imageIdentifier;
    }
    return '';
  }

  private findImagePos(identifier: string): number {
    const object = this.objectStore.get(identifier);
    if (object instanceof GameCharacter) return resolveImagePos(object.portraitPosition ?? undefined);
    return -1;
  }

  /**
   * Opens the latest kept-back roll of a die to the table, across every tab.
   *
   * Answers how many were opened: 1, or 0 when the die has no kept-back roll or this reader may not
   * show it.
   */
  discloseDieRolls(dieIdentifier: string): number {
    const tag = dieRollTag(dieIdentifier);
    let latest: ChatMessage | null = null;
    for (const chatTab of this.chatTabs) {
      for (const message of chatTab.chatMessages) {
        if (!message.isSecret || !message.tags.includes(tag)) continue;
        if (!latest || latest.placedAt < message.placedAt) latest = message;
      }
    }
    if (!latest || !this.canDiscloseMessage(latest)) return 0;

    this.discloseMessage(latest);
    return 1;
  }

  /**
   * Whether this reader may show a kept-back roll to the table.
   *
   * Whoever rolled it may, since it was theirs to keep back, and the master may, since a roll
   * nobody can be made to show is a roll the master cannot rule on. Nobody else: a die kept
   * back is the one thing a seat holds against the rest of the table.
   */
  canDiscloseMessage(message: ChatMessage): boolean {
    if (!message.isSecret) return false;
    return message.isSendFromSelf || this.rolePermission.canSeeHidden;
  }

  /**
   * Shows a kept-back line to the table and moves it to the end of its tab, stamped with when it
   * was shown.
   *
   * Does nothing for a line this reader may not disclose.
   */
  discloseMessage(message: ChatMessage): void {
    if (!this.canDiscloseMessage(message)) return;
    message.tag = message.tags.filter((tag) => tag !== 'secret').join(' ');
    const chatTab = message.parent;
    if (!(chatTab instanceof ChatTab)) return;
    message.disclosedAt = this.calcTimeStamp(chatTab);
    chatTab.appendChild(message);
  }

  /**
   * Says a line again in another tab, as though it had been said there.
   *
   * It goes to the end of that tab rather than back into the middle of it under its old time:
   * a line copied over is being brought into that conversation now.
   */
  copyMessageToTab(message: ChatMessage, chatTab: ChatTab): ChatMessage {
    return chatTab.addMessage(copiedMessageContext(message, this.calcTimeStamp(chatTab)));
  }

  private calcTimeStamp(chatTab: ChatTab): number {
    const now = this.getTime();
    const latest = chatTab.latestTimeStamp;
    return calcChatTimestamp(now, latest);
  }
}
