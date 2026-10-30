import { inject, Injectable } from '@angular/core';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import {
  calcChatTimestamp,
  emitChatMessageEvents,
  resolveChatMessageTag,
  resolveImagePos,
  resolveMessageColor,
  resolvePortraitIndex,
} from '@axe/application/chat/chat-message-helpers';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { MyDiceService } from '@axe/application/dice/my-dice.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { emitDiceTableMessage, emitResourceEditMessage, emitSendMessage } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { portraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { keptFromDecoration } from '@axe/domain/chat/chat-decoration';
import { liftImageReferences } from '@axe/domain/chat/chat-image-references';
import { ChatMessage, ChatMessageContext, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { copiedMessageContext } from '@axe/domain/chat/chat-message-copy';
import { ChatOutgoing, OutgoingStamp } from '@axe/domain/chat/chat-outgoing';
import {
  findImageIdentifierByName,
  type ImageIdentifierResult,
  type ImageNameEntry,
  parsePortraitCommand,
  stripPortraitCommand,
} from '@axe/domain/chat/chat-portrait-command';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab } from '@axe/domain/chat/chat-tab-permission';
import { OUT_OF_STORY_TAG } from '@axe/domain/chat/constants';
import { dieRollTag } from '@axe/domain/chat/die-roll-tag';
import { inlineStampSites } from '@axe/domain/chat/inline-stamp';
import { stampOf } from '@axe/domain/chat/stamp-catalog';
import { joinStampLine } from '@axe/domain/chat/stamp-line';
import { DEFAULT_NOTICE_PLACE, NOTICE_OFF, noticeRouteOf, SystemNoticeKind } from '@axe/domain/chat/system-notices';
import { DataElement } from '@axe/domain/data/data-element';
import { encodeDiceLook } from '@axe/domain/dice/dice-3d/dice-look';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import GameSystemClass from 'bcdice/lib/game_system';

@Injectable({ providedIn: 'root' })
export class ChatMessageService {
  private readonly objectStore = inject(ObjectStore);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly chatTabList = inject(ChatTabList);
  private readonly myDice = inject(MyDiceService);
  private readonly stampRules = inject(StampRulesService);
  private readonly clock = inject(ChatClockService);

  gameType: string = 'DiceBot';

  /** The room's chat tabs, in the order they are listed. */
  get chatTabs(): readonly ChatTab[] {
    return this.chatTabList.chatTabs;
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
   * Writes a notice of one kind where the room sends that kind: the tab it chose, or, while it chose
   * none or that tab is gone, the leftmost tab or the system tab the kind always went to. Nothing is
   * written, and null comes back, for a kind the room sends nowhere. A secret notice is kept back as
   * `sendSecretSystemMessageToTab` keeps it.
   */
  sendSystemNotice(
    kind: SystemNoticeKind,
    text: string,
    options: { color?: string; from?: string; secret?: boolean; dieIdentifiers?: readonly string[] } = {}
  ): ChatMessage | null {
    const tab = this.noticeTabOf(kind);
    if (!tab) return null;
    if (options.secret) {
      return this.sendSecretSystemMessageToTab(tab, text, options.from, options.color, options.dieIdentifiers);
    }
    return this.sendSystemMessageToTab(tab, text, options.color, options.from);
  }

  /** The tab a kind of notice goes to now, or null for a kind the room sends nowhere. */
  noticeTabOf(kind: SystemNoticeKind): ChatTab | null {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    if (!chatTabList) return null;
    const config = Config.instance;
    const route = noticeRouteOf(config.systemNotices, kind);
    if (route === NOTICE_OFF) return null;
    const chosen = route ? chatTabList.chatTabs.find((tab) => tab.identifier === route) : undefined;
    if (chosen) return chosen;
    return DEFAULT_NOTICE_PLACE[kind] === 'main' ? (chatTabList.chatTabs[0] ?? null) : chatTabList.systemMessageTab;
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
   * It goes to the named tab, or the system tab when none is named or the name is not a tab. A guest
   * on a room server says nothing in a tab guests may not speak in, which the server would take back.
   */
  sendSystemMessageAsLastSpeaker(text: string, chatTabIdentifier?: string) {
    const chatTabList = this.objectStore.get<ChatTabList>('ChatTabList');
    const sysTab = this.resolveChatTab(chatTabIdentifier) ?? chatTabList!.systemMessageTab!;
    if (PeerCursor.isMyselfKeptOffTable && !sysTab?.guestCanSpeak) return;
    const sendFrom = PeerCursor.myCursor.lastControlSendFrom
      ? PeerCursor.myCursor.lastControlSendFrom
      : PeerCursor.myCursor.identifier;
    let imgIndex = PeerCursor.myCursor.lastControlImageIndex;
    const imageIdentifier = this.findImageIdentifier(sendFrom, imgIndex);
    if (imageIdentifier != PeerCursor.myCursor.lastControlImageIdentifier) imgIndex = 0;
    this.sendMessage(sysTab!, text, null, sendFrom, undefined, imgIndex, '#006633');
  }

  /**
   * Sends a stamp going out with nothing said with it as a line of its own, as `sendStamp` does;
   * true where `value` was such a stamp, sent or refused, so the caller sends nothing more for it,
   * and false for anything else, which the caller sends as a line.
   */
  sendLoneStamp(chatTab: ChatTab, value: ChatOutgoing): boolean {
    if (!value.stamp || value.text.trim().length > 0) return false;
    this.sendStamp(
      chatTab,
      value.stamp.id,
      value.stamp.words,
      value.sendFrom,
      value.sendTo,
      value.portraitIndex,
      value.messColor,
      { light: value.messBubbleLight ?? '', dark: value.messBubbleDark ?? '' }
    );
    return true;
  }

  /**
   * Sends a stamp into a tab as a line of its own, from a piece or a peer, as a line of words is
   * sent but with nothing read out of its words: no dice, no resources, no portrait command.
   *
   * `words` stand in for the stamp wherever it cannot be drawn: in a version that does not know it,
   * in a log, in a video. A stamp that is a picture in the room carries the picture as well, for
   * those to show. A stamp this version does not know, one the room does not let be sent, or one
   * from a reader whose role may not speak in the tab, is not sent, and null comes back. A guest on a
   * room server stands no portrait in the tab's slots, which the server would put back.
   */
  sendStamp(
    chatTab: ChatTab,
    stampId: string,
    words: string,
    sendFrom: string,
    sendTo?: string,
    portraitIndex?: number,
    color?: string,
    bubbles?: { light: string; dark: string }
  ): ChatMessage | null {
    const stamp = stampOf(stampId);
    if (!stamp || !this.stampRules.allows('line', stampId)) return null;
    if (!canRoleSpeakTab(chatTab, PeerCursor.myRole)) return null;

    const imgIndex = resolvePortraitIndex(portraitIndex);
    const chatMessage: ChatMessageContext = {
      from: Network.peerContext.userId,
      to: sendTo != null ? this.whisperTo(sendTo) : undefined,
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: this.findImageIdentifier(sendFrom, imgIndex),
      timestamp: this.calcTimeStamp(chatTab),
      text: words,
      imagePos: PeerCursor.isMyselfKeptOffTable ? undefined : this.findImagePos(sendFrom),
      messColor: resolveMessageColor(color, '#000000'),
      sendFrom,
      senderRole: PeerCursor.myRole,
      stamp: stampId,
    };
    if (stamp.kind === 'image') chatMessage.attachmentImageIdentifiers = JSON.stringify([stamp.imageIdentifier]);
    if (bubbles?.light) chatMessage.messBubbleLight = bubbles.light;
    if (bubbles?.dark) chatMessage.messBubbleDark = bubbles.dark;

    this.setLastControlInfoToPeer(sendFrom, chatMessage.imageIdentifier ?? '', imgIndex, sendTo);
    return chatTab.addMessage(chatMessage);
  }

  /**
   * Speaks a line into a tab as a piece or a peer, and tells the dice table and resource edits
   * about it.
   *
   * Image references to the speaker's data are lifted out into attachments, a trailing portrait
   * command picks the portrait and is removed from the text, and a line sent under a dice system is
   * tagged with it. A line from a seat that chose how its dice look carries that look, for the dice
   * bot's answer to throw them in; a guest's carries no picture, since a guest may not add to the
   * room's images. A line not whispered to anyone also records who this reader last spoke as, which
   * `sendSystemMessageAsLastSpeaker` follows. A stamp sent with the line goes under it, with the
   * words standing in for it on a last line of their own, after everything else has been read out of
   * the line. A guest on a room server changes no piece by speaking: resource edits are not read out
   * of the line, a portrait command picks the line's portrait but leaves the piece's alone, and the
   * portrait stands in none of the tab's slots.
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
    vnEmote?: string,
    stamp?: OutgoingStamp
  ): ChatMessage {
    const speaker = this.objectStore.get(sendFrom);
    const resolvedMessage = liftImageReferences(
      text,
      speaker instanceof GameCharacter ? speaker.rootDataElement : null,
      attachmentImageIdentifiers ?? []
    );
    const stamped = this.inlineStampsGoingOut(resolvedMessage.text);
    text = stamped.text;
    const attachments = [
      ...resolvedMessage.attachmentImageIdentifiers,
      ...stamped.pictures.filter((picture) => !resolvedMessage.attachmentImageIdentifiers.includes(picture)),
    ];

    const imgIndex = resolvePortraitIndex(portraitIndex);
    const messageColor = resolveMessageColor(color, '#000000');

    const dicebot = this.objectStore.get<DiceBot>('DiceBot')!;
    const chatMessageTag = resolveChatMessageTag(gameSystem, text, dicebot);

    const chatMessage: ChatMessageContext = {
      from: Network.peerContext.userId,
      to: sendTo != null ? this.whisperTo(sendTo) : undefined,
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: this.findImageIdentifier(sendFrom, imgIndex),
      timestamp: this.calcTimeStamp(chatTab),
      tag: chatMessageTag,
      text,
      // A guest on a room server stands no portrait in the tab's slots, which the server would put back.
      imagePos: PeerCursor.isMyselfKeptOffTable ? undefined : this.findImagePos(sendFrom),
      messColor: messageColor,
      sendFrom: sendFrom,
      senderRole: PeerCursor.myRole,
    };
    if (attachments.length > 0) {
      chatMessage.attachmentImageIdentifiers = JSON.stringify(attachments);
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
    const look = this.myDice.look();
    const diceLook = encodeDiceLook(look);
    if (diceLook) chatMessage.diceLook = diceLook;
    if (look.picture && this.rolePermission.canEditTabletop()) {
      chatMessage.diceImageIdentifier = look.picture;
      void this.myDice.ensureShared();
    }

    const portrait = this.applyPortraitCommand(chatMessage, text, sendFrom, imgIndex);
    this.setLastControlInfoToPeer(sendFrom, portrait.identifier, portrait.index, sendTo);
    if (stamp) this.attachStamp(chatMessage, stamp);

    const chat = chatTab.addMessage(chatMessage);

    const eventPlan = emitChatMessageEvents(messageTargetContext ?? undefined);
    for (const target of eventPlan.sendTargets) {
      emitSendMessage({
        messageIdentifier: chat.identifier,
        messageTarget: target,
      });
    }
    emitDiceTableMessage({ messageIdentifier: chat.identifier });
    if (!PeerCursor.isMyselfKeptOffTable) {
      emitResourceEditMessage({
        messageIdentifier: chat.identifier,
        messageTargetContext: eventPlan.resourceEditTargetContext,
      });
    }

    return chat;
  }

  /**
   * Speaks a line under a name of its own, belonging to no piece and no peer.
   *
   * This is how something on the table talks: a door or a chest saying what it is. Dice in the line
   * are rolled for it, and the result comes back under the same name. It leaves alone who this
   * reader last spoke as, since the reader did not say it, and nothing in the line reaches a
   * piece's resources, since no piece is speaking. Its stamps go out as those of a line said anew.
   */
  sendAsNamed(
    chatTab: ChatTab,
    text: string,
    gameSystem: GameSystemClass | null,
    name: string,
    color?: string
  ): ChatMessage {
    const stamped = this.inlineStampsGoingOut(text);
    text = stamped.text;
    const dicebot = this.objectStore.get<DiceBot>('DiceBot')!;
    const chatMessage: ChatMessageContext = {
      from: Network.peerContext.userId,
      name,
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(chatTab),
      tag: resolveChatMessageTag(gameSystem, text, dicebot),
      text,
      imagePos: -1,
      messColor: resolveMessageColor(color, '#000000'),
      sendFrom: '',
      senderRole: PeerCursor.myRole,
    };
    if (stamped.pictures.length > 0) chatMessage.attachmentImageIdentifiers = JSON.stringify(stamped.pictures);
    const chat = chatTab.addMessage(chatMessage);
    emitSendMessage({ messageIdentifier: chat.identifier, messageTarget: null });
    emitDiceTableMessage({ messageIdentifier: chat.identifier });
    return chat;
  }

  /**
   * Rewrites a line already sent, as a line said anew goes out: a stamp put inside it that this
   * version does not know, or the room does not let be sent, is written as its name, and the
   * pictures from the room's sets among its attachments follow the stamps it now holds, those it
   * no longer holds going with them, those the room has stopped since among them. A picture
   * attached by hand stays, and so does that of a stamp under the line.
   */
  editMessage(message: ChatMessage, text: string, staging: string, at: number): void {
    const stamped = this.inlineStampsGoingOut(text);
    const under = stampOf(message.stamp ?? '');
    const kept = under?.kind === 'image' ? under.imageIdentifier : null;
    const before = stampPicturesIn(message.text ?? '').filter((picture) => picture !== kept);
    const attached = message.attachmentImageIdentifierList.filter((picture) => !before.includes(picture));
    const attachments = [...attached, ...stamped.pictures.filter((picture) => !attached.includes(picture))];
    message.edit(stamped.text, staging, at);
    const written = attachments.length > 0 ? JSON.stringify(attachments) : '';
    if ((message.attachmentImageIdentifiers ?? '') !== written) message.attachmentImageIdentifiers = written;
  }

  /**
   * The stamps put inside a line as it goes out. One this version does not know, or one the room
   * does not let be sent, is written as its name instead; a picture from the room's sets goes among
   * the attachments as well, for the room saved to carry it.
   */
  private inlineStampsGoingOut(text: string): { text: string; pictures: string[] } {
    const pictures: string[] = [];
    let out = '';
    let at = 0;
    for (const site of inlineStampSites(text)) {
      const ref = stampOf(site.id);
      out += text.slice(at, site.from);
      if (!ref || !this.stampRules.allows('line', site.id)) {
        out += keptFromDecoration(`［${site.label}］`);
      } else {
        out += text.slice(site.from, site.to);
        if (ref.kind === 'image' && !pictures.includes(ref.imageIdentifier)) pictures.push(ref.imageIdentifier);
      }
      at = site.to;
    }
    return { text: out + text.slice(at), pictures };
  }

  /**
   * Puts a stamp under a line about to be said, with the words standing in for it on a last line; a
   * picture from the room's sets also goes among the attachments, for a version that cannot draw it.
   * A stamp this version does not know, or one the room does not let be sent, is left off.
   */
  private attachStamp(chatMessage: ChatMessageContext, stamp: OutgoingStamp): void {
    const ref = stampOf(stamp.id);
    if (!ref || !this.stampRules.allows('line', stamp.id)) return;
    chatMessage.text = joinStampLine(chatMessage.text ?? '', stamp.words);
    chatMessage.stamp = stamp.id;
    if (ref.kind !== 'image') return;
    const attached: string[] = chatMessage.attachmentImageIdentifiers
      ? JSON.parse(chatMessage.attachmentImageIdentifiers)
      : [];
    if (!attached.includes(ref.imageIdentifier)) attached.push(ref.imageIdentifier);
    chatMessage.attachmentImageIdentifiers = JSON.stringify(attached);
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
    if (obj instanceof GameCharacter && !PeerCursor.isMyselfKeptOffTable) obj.selectedPortraitIndex = found.index;
    return found;
  }

  /**
   * Whom a whisper goes to. One whose target's cursor is not here at the moment, as while it is on
   * its way back or after its seat opened the page again, goes to the user it stood for rather than
   * out to everybody.
   */
  private whisperTo(identifier: string): string {
    return this.findId(identifier) || PeerCursor.userIdOf(identifier) || identifier;
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
    return PeerCursor.standingFor(identifier)?.name ?? identifier;
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
   * Says a line again in another tab, as though it had been said there.
   *
   * It goes to the end of that tab rather than back into the middle of it under its old time:
   * a line copied over is being brought into that conversation now. A guest on a room server's copy
   * stands no portrait in the tab's slots, which the server would put back.
   */
  copyMessageToTab(message: ChatMessage, chatTab: ChatTab): ChatMessage {
    const context = copiedMessageContext(message, this.calcTimeStamp(chatTab));
    if (PeerCursor.isMyselfKeptOffTable) context.imagePos = undefined;
    return chatTab.addMessage(context);
  }

  private calcTimeStamp(chatTab: ChatTab): number {
    const now = this.clock.now();
    const latest = chatTab.latestTimeStamp;
    return calcChatTimestamp(now, latest);
  }
}

/** The pictures from the room's sets that the stamps put inside a line show, whatever the room lets be sent now. */
function stampPicturesIn(text: string): string[] {
  const pictures: string[] = [];
  for (const site of inlineStampSites(text)) {
    const ref = stampOf(site.id);
    if (ref?.kind === 'image' && !pictures.includes(ref.imageIdentifier)) pictures.push(ref.imageIdentifier);
  }
  return pictures;
}
