import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isAppleTouchDevice } from '@axe/core/util/apple-touch';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';
import { setZeroTimeout } from '@axe/core/util/zero-timeout';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatMessageComponent } from '@axe/features/chat/chat-message/chat-message.component';
import { buildSampleChatMessages } from '@axe/features/chat/chat-tab/chat-tab-sample-messages';
import {
  calcIndexRange,
  calcMaxElementHeight,
  findDisplayableTopIndex,
  getBoundedScrollPosition,
  MAX_RESTING_RENDERED_ROWS,
  restsAtBottom,
  ScrollPosition,
  shouldTrimRenderedRange,
} from '@axe/features/chat/chat-tab/chat-tab-scroll-helpers';

const isiOS = isAppleTouchDevice(window.navigator.userAgent, window.navigator.maxTouchPoints);
/** How long a reader has to stay put at the bottom before the lines far above are let go. */
const RENDERED_RANGE_TRIM_DELAY_MS = 800;

interface WritingSpeaker {
  peerId: string;
  speakerIdentifier?: string;
  name: string;
  imageFile: ImageFile;
}

@Component({
  selector: 'chat-tab',
  templateUrl: './chat-tab.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatMessageComponent],
})
export class ChatTabComponent {
  private renderVersion = signal(0);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly t = inject(TRANSLATE_FN);
  protected readonly isIOS = isiOS;

  constructor() {
    effect(() => {
      this.uiSignalService.chatRedrawVersion();
      setZeroTimeout(() => this.redraw());
    });
    effect(() => {
      this.chatTabInput();
      if (this.panelService?.scrollablePanel) {
        this.resetMessages();
      } else {
        queueMicrotask(() => this.resetMessages());
      }
    });
    afterEveryRender(() => {
      if (!this.topElm || !this.bottomElm) return;
      queueMicrotask(() => this.adjustScrollPosition());
    });
    const messages: ChatMessage[] = [];
    for (const context of this.rawSampleMessages) {
      const message = new ChatMessage();
      const ctx = context as Record<string, string | number | undefined>;
      for (const key of Object.keys(context)) {
        if (key === 'identifier') continue;
        if (key === 'tabIdentifier') continue;
        if (key === 'text') {
          message.value = ctx[key] as string;
          continue;
        }
        if (ctx[key] == null || ctx[key] === '') continue;
        message.setAttribute(key, ctx[key] as string | number);
      }
      messages.push(message);
    }
    this.sampleMessages = messages;
    this.objectChange.messageAdded$.subscribe((event) => {
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (!message || !this.chatTab?.contains(message)) return;
      this.removeWritingSpeakerForMessage(message);
      const newLastIndex = this.chatTab.chatMessages.length - 1;
      if (this.bottomIndex >= newLastIndex - 1) {
        this.bottomIndex = newLastIndex;
        if (this.isRestingAtBottom()) {
          this.topIndex = Math.max(this.topIndex, newLastIndex - MAX_RESTING_RENDERED_ROWS + 1);
        }
      }
      this.renderVersion.update((v) => v + 1);
      this.needUpdate = true;
      this.onMessageInit();
      if (this.isIOS) this.renderedRangeTrimTimer?.reset();
    }, this.destroyRef);
    this.objectChange.writingMessage$.subscribe((event) => {
      if (event.isSendFromSelf || event.tabIdentifier !== this.chatTab?.identifier) return;
      this.addWritingSpeaker(event.sendFrom, event.speakerIdentifier);
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      [ChatMessage.aliasName],
      (event) => {
        const message = this.objectStore.get(event.identifier);
        if (message instanceof ChatMessage && this.chatTab?.contains(message) && this.topPlacedAt <= message.placedAt) {
          this.needUpdate = true;
          this.renderVersion.update((v) => v + 1);
        }
      },
      this.destroyRef
    );
    this.panelService.scrollToBottom$.subscribe(() => this.resetMessages(), this.destroyRef);
    afterNextRender(() => {
      this.scrollEventShortTimer = new ResettableTimeout(() => this.lazyScrollUpdate(), 33);
      this.scrollEventLongTimer = new ResettableTimeout(() => this.lazyScrollUpdate(false), 66);
      this.renderedRangeTrimTimer = new ResettableTimeout(
        () => this.trimRenderedRangeOnIOS(),
        RENDERED_RANGE_TRIM_DELAY_MS
      );
      this.onScroll();
      this.panelService.scrollablePanel!.addEventListener('scroll', this.callbackOnScroll, false);
    });
    this.destroyRef.onDestroy(() => {
      if (this.panelService.scrollablePanel) {
        this.panelService.scrollablePanel.removeEventListener('scroll', this.callbackOnScroll, false);
      }
      if (this.scrollEventShortTimer) this.scrollEventShortTimer.clear();
      if (this.scrollEventLongTimer) this.scrollEventLongTimer.clear();
      this.renderedRangeTrimTimer?.clear();
      if (this.addMessageEventTimer) clearTimeout(this.addMessageEventTimer);
      this.addMessageEventTimer = null;
      for (const timeout of this.writingSpeakerTimeouts.values()) timeout.stop();
      this.writingSpeakerTimeouts.clear();
      this.writingSpeakerIdentifiers.clear();
    });
  }

  private readonly rawSampleMessages = buildSampleChatMessages();
  sampleMessages: ChatMessage[] = [];

  private topPlacedAt = 0;

  private needUpdate = true;

  readonly logContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('logContainer');
  readonly messageContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('messageContainer');

  private topElm: HTMLElement | null = null;
  private bottomElm: HTMLElement | null = null;
  private topElmBox: DOMRect | null = null;
  private bottomElmBox: DOMRect | null = null;
  private topIndex = 0;
  private bottomIndex = 0;

  private _minMessageHeight = 26;
  private _minMessageHeightNormal = 61;

  /**
   * The least height a message can take, in pixels, smaller in simple display mode; used to
   * estimate the room taken by messages that are not rendered.
   */
  get minMessageHeight() {
    if (this.chatTab) {
      if (this.chatTab.chatSimpleDispFlag) {
        return this._minMessageHeight;
      }
    }
    return this._minMessageHeightNormal;
  }

  private preScrollTop = 0;
  private scrollSpeed = 0;

  private _chatMessages: ChatMessage[] = [];
  /**
   * The slice of the tab's messages currently rendered; empty when there is no tab.
   *
   * It is only cut again after the range or the messages have changed, and it remembers where the
   * slice starts so that edits to older messages do not ask for a render.
   */
  get chatMessages(): ChatMessage[] {
    this.renderVersion();
    if (!this.chatTab) return [];
    if (this.needUpdate) {
      this.needUpdate = false;
      const chatMessages = this.chatTab ? this.chatTab.chatMessages : [];
      this.adjustIndex();
      this._chatMessages = chatMessages.slice(this.topIndex, this.bottomIndex + 1);
      this.topPlacedAt = 0 < this._chatMessages.length ? this._chatMessages[0].placedAt : 0;
    }
    return this._chatMessages;
  }

  /**
   * The height the log reserves, in pixels, for every displayable message at the minimum height,
   * capped at 10,000 messages.
   *
   * It keeps the scrollbar sized to the whole log rather than the rendered slice. With no tab, the
   * sample messages are counted instead.
   */
  get minScrollHeight(): number {
    const length = this.chatTab ? this.chatTab.displayableMessagesLength() : this.sampleMessages.length;
    return (length < 10000 ? length : 10000) * this.minMessageHeight;
  }

  /** The estimated height of the messages above the rendered slice. */
  get topSpace(): number {
    return this.minScrollHeight - this.bottomSpace;
  }
  /**
   * The estimated height of the messages below the rendered slice, kept as a margin so the slice
   * sits where it would in the full log; zero when nothing is rendered.
   */
  get bottomSpace(): number {
    const tab = this.chatTab;
    return 0 < this.chatMessages.length
      ? ((tab?.chatMessages.length ?? 0) - this.bottomIndex - 1) * this.minMessageHeight
      : 0;
  }

  private scrollEventShortTimer: ResettableTimeout | null = null;
  private scrollEventLongTimer: ResettableTimeout | null = null;
  private renderedRangeTrimTimer: ResettableTimeout | null = null;
  private addMessageEventTimer: ReturnType<typeof setTimeout> | null = null;
  private callbackOnScroll: () => void = () => this.onScroll();
  private readonly writingSpeakerTimeouts = new Map<string, ResettableTimeout>();
  private readonly writingSpeakerIdentifiers = new Map<string, string | undefined>();

  readonly writingSpeakers = signal<WritingSpeaker[]>([]);

  readonly chatTabInput = input<ChatTab | null>(null, { alias: 'chatTab' });

  /**
   * Whether the lines are only to be read.
   *
   * Passed down to each line, and it also keeps the sample lines away: they are there to show
   * a newcomer what a conversation looks like, and a window opened on a quiet tab on purpose
   * should look quiet.
   */
  readonly readOnly = input(false);
  /** The chat tab shown, as bound through the `chatTab` input; null when none is bound. */
  get chatTab(): ChatTab | null {
    return this.chatTabInput();
  }
  /** The room's chat tab list, whose display settings apply to every message shown. */
  get chatTabList(): ChatTabList | null {
    return this.objectStore.get<ChatTabList>('ChatTabList');
  }

  readonly addMessage = output<void>();

  /**
   * Emits `addMessage` once on the next task, however many messages arrive before then; the chat
   * window follows new messages to the bottom on it.
   */
  onMessageInit() {
    if (this.addMessageEventTimer != null) return;
    this.addMessageEventTimer = setTimeout(() => {
      this.addMessageEventTimer = null;
      this.addMessage.emit();
    }, 0);
  }

  /**
   * Moves the rendered range to the end of the log, rendering just enough messages to fill the
   * panel.
   *
   * It runs when the tab changes and whenever the panel is asked to scroll to the bottom, and does
   * nothing until there is both a tab and a scrollable panel.
   */
  resetMessages() {
    if (!this.chatTab || !this.panelService?.scrollablePanel) return;
    const lastIndex = this.chatTab.chatMessages.length - 1;
    this.topIndex = findDisplayableTopIndex(
      this.chatTab.chatMessages,
      Math.floor(this.panelService.scrollablePanel.clientHeight / this.minMessageHeight) + 1
    );
    this.bottomIndex = lastIndex;
    this.needUpdate = true;
    this.preScrollTop = -1;
    this.scrollSpeed = 0;
    this.topElm = this.bottomElm = null;
    this.adjustIndex();
    this.renderVersion.update((v) => v + 1);
  }

  /**
   * Lets go of the lines far above a reader who has come to rest at the bottom, on iOS.
   *
   * iOS never narrows the rendered lines while it scrolls, since moving the scroll position
   * under a momentum scroll makes it jump, so without this a long session there would keep every
   * line that arrives in the document. Once the reader rests at the bottom the lines are cut back
   * to what fills the panel, the way a jump to the bottom does.
   */
  /**
   * Whether the reader is at the very bottom of the log, where the lines far above can go without
   * anything on the screen moving. On iOS the lines drawn only ever grow, so reaching the last one
   * says nothing of where the reader is.
   */
  private isRestingAtBottom(): boolean {
    const panel = this.panelService.scrollablePanel;
    if (!panel) return false;
    const position = getBoundedScrollPosition(panel);
    return restsAtBottom(position.scrollHeight - position.bottom);
  }

  private trimRenderedRangeOnIOS() {
    const panel = this.panelService.scrollablePanel;
    if (!this.isIOS || !this.chatTab || !panel) return;
    const position = getBoundedScrollPosition(panel);
    const trim = shouldTrimRenderedRange({
      topIndex: this.topIndex,
      bottomIndex: this.bottomIndex,
      lastIndex: this.chatTab.chatMessages.length - 1,
      distanceFromBottom: position.scrollHeight - position.bottom,
    });
    if (trim) this.resetMessages();
  }

  /**
   * Tracks rendered messages by identifier, so each keeps its element as the rendered range shifts.
   */
  trackByChatMessage(index: number, message: ChatMessage) {
    return message.identifier;
  }

  private addWritingSpeaker(peerId: string, speakerIdentifier?: string) {
    if (!peerId) return;
    this.writingSpeakerIdentifiers.set(peerId, speakerIdentifier ?? this.writingSpeakerIdentifiers.get(peerId));
    if (!this.writingSpeakerTimeouts.has(peerId)) {
      this.writingSpeakerTimeouts.set(
        peerId,
        new ResettableTimeout(() => {
          this.writingSpeakerTimeouts.delete(peerId);
          this.writingSpeakerIdentifiers.delete(peerId);
          this.updateWritingSpeakers();
        }, 2000)
      );
    }
    this.writingSpeakerTimeouts.get(peerId)!.reset();
    this.updateWritingSpeakers();
  }

  private removeWritingSpeaker(peerId: string) {
    const timeout = this.writingSpeakerTimeouts.get(peerId);
    if (!timeout) return;
    timeout.stop();
    this.writingSpeakerTimeouts.delete(peerId);
    this.writingSpeakerIdentifiers.delete(peerId);
    this.updateWritingSpeakers();
  }

  private removeWritingSpeakerForMessage(message: ChatMessage) {
    const peerCursor = PeerCursor.findByUserId(message.from || message.originFrom);
    if (peerCursor) {
      this.removeWritingSpeaker(peerCursor.peerId);
      return;
    }

    for (const [peerId, speakerIdentifier] of this.writingSpeakerIdentifiers) {
      if (speakerIdentifier === message.sendFrom) this.removeWritingSpeaker(peerId);
    }
  }

  private updateWritingSpeakers() {
    this.writingSpeakers.set(
      Array.from(this.writingSpeakerTimeouts.keys()).map((peerId) =>
        this.resolveWritingSpeaker(peerId, this.writingSpeakerIdentifiers.get(peerId))
      )
    );
  }

  private resolveWritingSpeaker(peerId: string, speakerIdentifier?: string): WritingSpeaker {
    const object = speakerIdentifier ? this.objectStore.get(speakerIdentifier) : null;
    if (object instanceof GameCharacter) {
      return {
        peerId,
        speakerIdentifier,
        name: object.name || this.t('feature.chat.tab.unnamedCharacter'),
        imageFile: object.imageFile ?? ImageFile.Empty,
      };
    }
    if (object instanceof PeerCursor) {
      return {
        peerId,
        speakerIdentifier,
        name: object.name || this.t('feature.chat.tab.player'),
        imageFile: object.image ?? ImageFile.Empty,
      };
    }

    const peer = PeerCursor.findByPeerId(peerId);
    return {
      peerId,
      speakerIdentifier,
      name: peer?.lastControlCharacterName || peer?.name || peerId,
      imageFile: peer?.lastControlImage ?? peer?.image ?? ImageFile.Empty,
    };
  }

  private adjustIndex() {
    const chatMessages = this.chatTab ? this.chatTab.chatMessages : [];
    const lastIndex = 0 < chatMessages.length ? chatMessages.length - 1 : 0;

    if (this.topIndex < 0) {
      this.topIndex = 0;
    }
    if (lastIndex < this.bottomIndex) {
      this.bottomIndex = lastIndex;
    }

    if (this.topIndex < 0) this.topIndex = 0;
    if (this.bottomIndex < 0) this.bottomIndex = 0;
    if (lastIndex < this.topIndex) this.topIndex = lastIndex;
    if (lastIndex < this.bottomIndex) this.bottomIndex = lastIndex;
  }

  private getScrollPosition(): ScrollPosition {
    return getBoundedScrollPosition(this.panelService.scrollablePanel!);
  }

  private adjustScrollPosition() {
    if (!this.topElm || !this.bottomElm) return;

    const hasTopElm = this.logContainerRef().nativeElement.contains(this.topElm);
    const hasBotomElm = this.logContainerRef().nativeElement.contains(this.bottomElm);

    const { hasTopBlank, hasBotomBlank } = this.checkBlank(hasTopElm, hasBotomElm);

    this.topElm = this.bottomElm = null;

    if (hasTopBlank || hasBotomBlank || (!hasTopElm && !hasBotomElm)) {
      setZeroTimeout(() => this.lazyScrollUpdate());
    }
  }
  private checkBlank(hasTopElm: boolean, hasBotomElm: boolean) {
    let hasTopBlank = !hasTopElm;
    let hasBotomBlank = !hasBotomElm;

    if (!hasTopElm && !hasBotomElm) return { hasTopBlank, hasBotomBlank };

    let elm: HTMLElement | null = null;
    let prevBox: DOMRect | null = null;
    if (hasBotomElm) {
      elm = this.bottomElm;
      prevBox = this.bottomElmBox;
    } else if (hasTopElm) {
      elm = this.topElm;
      prevBox = this.topElmBox;
    }
    const currentBox = elm!.getBoundingClientRect();
    const diff = (prevBox?.top ?? 0) - currentBox.top - this.scrollSpeed;
    if ((!hasTopBlank || !hasBotomBlank) && 0.5 ** 2 < diff ** 2) {
      this.panelService.scrollablePanel!.scrollTop -= diff;
    }

    const logBox: DOMRect = this.logContainerRef().nativeElement.getBoundingClientRect();
    const messageBox: DOMRect = this.messageContainerRef().nativeElement.getBoundingClientRect();

    const messageBoxTop = messageBox.top - logBox.top;
    const messageBoxBottom = messageBoxTop + messageBox.height;

    const scrollPosition = this.getScrollPosition();

    hasTopBlank = scrollPosition.top < messageBoxTop;
    hasBotomBlank = messageBoxBottom < scrollPosition.bottom && scrollPosition.bottom < scrollPosition.scrollHeight;

    return { hasTopBlank, hasBotomBlank };
  }

  private markForReadIfNeeded() {
    const tab = this.chatTab;
    if (!tab?.hasUnread) return;

    const scrollPosition = this.getScrollPosition();
    if (scrollPosition.scrollHeight <= scrollPosition.bottom + 100) {
      setZeroTimeout(() => {
        this.chatTab?.markForRead();
        this.renderVersion.update((v) => v + 1);
      });
    }
  }

  private onScroll() {
    this.scrollEventShortTimer?.reset();
    if (this.isIOS) this.renderedRangeTrimTimer?.reset();
    if (!this.scrollEventLongTimer?.isActive) {
      this.scrollEventLongTimer?.reset();
    }
  }

  private lazyScrollUpdate(isNormalUpdate: boolean = true) {
    this.scrollEventShortTimer?.stop();
    this.scrollEventLongTimer?.stop();

    const chatMessageElements = this.messageContainerRef().nativeElement.querySelectorAll<HTMLElement>('chat-message');

    const messageBoxTop = this.messageContainerRef().nativeElement.offsetTop;
    const messageBoxBottom = messageBoxTop + this.messageContainerRef().nativeElement.clientHeight;

    const preTopIndex = this.topIndex;
    const preBottomIndex = this.bottomIndex;

    const scrollPosition = this.getScrollPosition();
    this.scrollSpeed = scrollPosition.top - this.preScrollTop;
    this.preScrollTop = scrollPosition.top;

    const hasTopBlank = scrollPosition.top < messageBoxTop;
    const hasBotomBlank =
      messageBoxBottom < scrollPosition.bottom && scrollPosition.bottom < scrollPosition.scrollHeight;

    if (!isNormalUpdate) {
      this.scrollEventShortTimer?.reset();
    }

    if (!isNormalUpdate && !hasTopBlank && !hasBotomBlank) {
      return;
    }

    const scrollWideTop = scrollPosition.top - (!isNormalUpdate && hasTopBlank ? 100 : 1200);
    const scrollWideBottom = scrollPosition.bottom + (!isNormalUpdate && hasBotomBlank ? 100 : 1200);

    this.markForReadIfNeeded();
    const maxHeight = calcMaxElementHeight(chatMessageElements, this.minMessageHeight);
    const range = calcIndexRange({
      topIndex: this.topIndex,
      bottomIndex: this.bottomIndex,
      chatMessagesLength: this.chatTab?.chatMessages.length ?? 0,
      minMessageHeight: this.minMessageHeight,
      maxHeight,
      messageBoxTop,
      messageBoxBottom,
      scrollWideTop,
      scrollWideBottom,
      scrollPosition,
      isIOS: isiOS,
    });
    this.topIndex = range.topIndex;
    this.bottomIndex = range.bottomIndex;

    const isChangedIndex = this.topIndex != preTopIndex || this.bottomIndex != preBottomIndex;
    if (!isChangedIndex) return;

    this.needUpdate = true;

    this.topElm = chatMessageElements[0];
    this.bottomElm = chatMessageElements[chatMessageElements.length - 1];
    this.topElmBox = this.topElm.getBoundingClientRect();
    this.bottomElmBox = this.bottomElm.getBoundingClientRect();

    setZeroTimeout(() => {
      const scrollPosition = this.getScrollPosition();
      this.scrollSpeed = scrollPosition.top - this.preScrollTop;
      this.preScrollTop = scrollPosition.top;
      this.renderVersion.update((v) => v + 1);
    });
  }

  /** Renders the log again; a chat redraw request from the UI signal service leads here. */
  redraw() {
    this.renderVersion.update((v) => v + 1);
  }
}
