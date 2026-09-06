import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { evaluateCharacterReferences, textTargetsCharacter } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleSpeakTab, canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
  MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
} from '@axe/domain/tabletop/multi-angle';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { editsTextInPlace } from '@axe/features/chat/chat-input/chat-input-helpers';
import { ChatMessageSettingComponent } from '@axe/features/chat/chat-message-setting/chat-message-setting.component';
import { ChatPortraitComponent } from '@axe/features/chat/chat-portrait/chat-portrait.component';
import { ChatStreamPanelService } from '@axe/features/chat/chat-stream/chat-stream-panel.service';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { ChatTabSettingComponent } from '@axe/features/chat/chat-tab-setting/chat-tab-setting.component';
import { ChatTabStripComponent } from '@axe/features/chat/chat-tab-strip/chat-tab-strip.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The strip at the foot of the log that who-is-typing hangs over.
 *
 * It is held open whether or not anybody is typing, since the whole point is that the log
 * does not move when somebody starts.
 */
const WRITING_STRIP_PX = 32;

const NEAR_BOTTOM_THRESHOLD_PX = 350;
const AT_BOTTOM_THRESHOLD_PX = 8;
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-window',
  templateUrl: './chat-window.component.html',
  imports: [
    ChatTabComponent,
    FormsModule,
    NgTemplateOutlet,
    ChatPortraitComponent,
    ChatInputComponent,
    SafePipe,
    TranslocoModule,
    ChatTabStripComponent,
  ],
  host: {
    class: 'block h-full min-h-0 min-w-0',
    tabindex: '-1',
    '(keydown.control.arrowleft)': 'switchTabByKey($event, -1)',
    '(keydown.control.arrowright)': 'switchTabByKey($event, 1)',
  },
})
export class ChatWindowComponent {
  chatMessageService = inject(ChatMessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly chatStreamPanel = inject(ChatStreamPanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly chatPrefs = inject(ChatPreferencesService);
  private readonly activeChatTab = inject(ActiveChatTabService);
  private readonly tabletopService = inject(TabletopService);
  private readonly chatSpeaker = inject(ChatSpeakerService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly _sendFrom = signal('Guest');
  get sendFrom(): string {
    return this._sendFrom();
  }
  /** Choosing who to speak as tells the rest of the room; a window opening does not. */
  set sendFrom(sendFrom: string) {
    this._sendFrom.set(sendFrom);
    this.chatSpeaker.set(sendFrom);
  }

  get gameType(): string {
    return !this.chatMessageService.gameType ? 'DiceBot' : this.chatMessageService.gameType;
  }
  set gameType(gameType: string) {
    this.chatMessageService.gameType = gameType;
  }

  private readonly _chatTabidentifier = signal('');
  get chatTabidentifier(): string {
    return this._chatTabidentifier();
  }
  set chatTabidentifier(chatTabidentifier: string) {
    const hasChanged: boolean = this._chatTabidentifier() !== chatTabidentifier;
    this._chatTabidentifier.set(chatTabidentifier);
    this.activeChatTab.set(chatTabidentifier);
    this.updatePanelTitle();
    if (hasChanged) this.scrollToBottom(true);
  }

  private readonly logScroll = viewChild.required<ElementRef<HTMLDivElement>>('logScroll');
  readonly chatTabRef = viewChild(ChatTabComponent);

  /**
   * Bound to the window rather than to the input: a tab nobody may speak in renders no textarea,
   * and the shortcut used to live on that textarea, so arriving at such a tab left no way back
   * out by keyboard. Focus follows to the window when the input goes away.
   */
  switchTabByKey(event: Event, direction: number): void {
    if (editsTextInPlace(event.target)) return;
    event.preventDefault();
    this.chatTabSwitchRelative(direction);
    if (!this.canSpeakCurrentTab()) this.hostElement.nativeElement.focus();
  }

  chatTabSwitchRelative(direction: number) {
    const chatTabs = this.visibleChatTabs();
    const index = chatTabs.findIndex((elm) => elm.identifier == this.chatTabidentifier);
    if (index < 0) {
      return;
    }

    let nextIndex: number;
    if (index == chatTabs.length - 1 && direction == 1) {
      nextIndex = 0;
    } else if (index == 0 && direction == -1) {
      nextIndex = chatTabs.length - 1;
    } else {
      nextIndex = index + direction;
    }
    this.chatTabidentifier = chatTabs[nextIndex].identifier;
  }

  readonly chatTab = computed(() => {
    this.objectChange.versionOf(this.chatTabidentifier)();
    this.objectChange.collectionOf('chat-tab')();
    return this.objectStore.get<ChatTab>(this.chatTabidentifier) ?? null;
  });

  readonly chatTabsVersion = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.versionOf(ChatTabList.instance.identifier)();
    const tabs = this.chatMessageService.chatTabs;
    for (const tab of tabs) this.objectChange.versionOf(tab.identifier)();
    return [...tabs];
  });

  readonly visibleChatTabs = computed(() => {
    const tabs = this.chatTabsVersion();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return tabs.filter((tab) => canRoleViewTab(tab, role));
  });

  readonly canSpeakCurrentTab = computed(() => {
    const tab = this.chatTab();
    if (!tab) return false;
    this.objectChange.trackMyCursor();
    this.objectChange.versionOf(tab.identifier)();
    return canRoleSpeakTab(tab, PeerCursor.myRole);
  });

  readonly isTickerTab = computed(() => this.chatTab()?.isTickerTab ?? false);

  get tickerEnabled(): boolean {
    return this.tabletopService.tabletopDisplaySettings.multiAngleTickerEnabled();
  }
  set tickerEnabled(value: boolean) {
    this.tabletopService.tabletopDisplaySettings.patch({ multiAngleTickerEnabled: value });
  }

  get tickerPixelsPerSecond(): number {
    const value = Number(this.tabletopService.tabletopDisplaySettings.multiAngleTickerPixelsPerSecond());
    return Number.isFinite(value)
      ? Math.min(MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND, Math.max(MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND, value))
      : DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND;
  }
  set tickerPixelsPerSecond(value: number) {
    const numeric = Number(value);
    this.tabletopService.tabletopDisplaySettings.patch({
      multiAngleTickerPixelsPerSecond: Number.isFinite(numeric)
        ? Math.min(
            MAX_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
            Math.max(MIN_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND, numeric)
          )
        : DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
    });
  }

  private isAutoScroll = true;
  readonly hasNewMessage = signal(false);
  readonly isNearBottom = signal(true);
  readonly writingStripPx = WRITING_STRIP_PX;
  readonly newMessageCount = signal(0);
  private scrollToBottomTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollListener: (() => void) | null = null;

  constructor() {
    // Opening a window is nobody's choice of speaker: a second one would otherwise put back
    // the reader's own name over the character the first one is speaking as.
    this._sendFrom.set(PeerCursor.myCursor.identifier);
    this.chatTabidentifier =
      0 < this.chatMessageService.chatTabs.length ? this.chatMessageService.chatTabs[0].identifier : '';
    this.objectChange.messageAdded$.subscribe((event) => {
      if (event.tabIdentifier !== this.chatTabidentifier) return;
      const message = this.objectStore.get<ChatMessage>(event.messageIdentifier);
      if (message && message.isSendFromSelf) {
        this.isAutoScroll = true;
        this.hasNewMessage.set(false);
        this.newMessageCount.set(0);
      } else {
        this.checkAutoScroll();
        if (!this.isAutoScroll) {
          this.hasNewMessage.set(true);
        }
        this.newMessageCount.update((c) => c + 1);
      }
      if (this.isAutoScroll) this.chatTab()?.markForRead();
    }, this.destroyRef);
    this.objectChange.writingMessage$.subscribe((event) => {
      if (event.isSendFromSelf || event.tabIdentifier !== this.chatTabidentifier) return;
      const distance = this.distanceFromBottom();
      if (distance == null || distance > AT_BOTTOM_THRESHOLD_PX) return;
      if (!this.chatPrefs.autoFollowScroll()) return;
      setTimeout(() => {
        const panel = this.panelService.scrollablePanel;
        if (!panel) return;
        panel.scrollTop = panel.scrollHeight;
      }, 0);
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      [ChatTab.aliasName, ChatTabList.aliasName],
      () => {
        if (!this.objectStore.get<ChatTab>(this._chatTabidentifier())) {
          const chatTabs = this.chatMessageService.chatTabs;
          this.chatTabidentifier = chatTabs.length > 0 ? chatTabs[0].identifier : '';
        }
      },
      this.destroyRef
    );
    this.objectChange.objectDeleted$.subscribe((event) => {
      if (event.aliasName !== 'chat-tab') return;
      if (this._chatTabidentifier() === event.identifier) {
        const chatTabs = this.chatMessageService.chatTabs;
        this.chatTabidentifier = chatTabs.length > 0 ? chatTabs[0].identifier : '';
      }
    }, this.destroyRef);
    queueMicrotask(() => this.updatePanelTitle());
    effect(() => {
      const tab = this.chatTab();
      if (!tab) {
        const chatTabs = this.chatMessageService.chatTabs;
        if (chatTabs.length > 0) {
          this.chatTabidentifier = chatTabs[0].identifier;
        }
      }
    });
    effect(() => {
      const visible = this.visibleChatTabs();
      const current = this._chatTabidentifier();
      if (current && !visible.some((tab) => tab.identifier === current)) {
        this.chatTabidentifier = visible.length > 0 ? visible[0].identifier : '';
      }
    });
    afterNextRender({
      write: () => {
        this.panelService.claimScrollablePanel(this.logScroll().nativeElement);
      },
    });
    afterNextRender(() => {
      queueMicrotask(() => this.scrollToBottom(true));
      if (this.panelService.scrollablePanel) {
        this.scrollListener = () => this.onScrollPositionChange();
        this.panelService.scrollablePanel.addEventListener('scroll', this.scrollListener, { passive: true });
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.scrollListener && this.panelService.scrollablePanel) {
        this.panelService.scrollablePanel.removeEventListener('scroll', this.scrollListener);
      }
    });
  }

  private distanceFromBottom(): number | null {
    const panel = this.panelService.scrollablePanel;
    if (!panel) return null;
    return panel.scrollHeight - panel.clientHeight - panel.scrollTop;
  }

  private refreshNearBottom() {
    const distance = this.distanceFromBottom();
    if (distance == null) return;
    this.isNearBottom.set(distance <= NEAR_BOTTOM_THRESHOLD_PX);
  }

  private onScrollPositionChange() {
    const distance = this.distanceFromBottom();
    if (distance == null) return;
    this.isNearBottom.set(distance <= NEAR_BOTTOM_THRESHOLD_PX);
    if (distance <= AT_BOTTOM_THRESHOLD_PX) {
      this.hasNewMessage.set(false);
      this.newMessageCount.set(0);
    }
  }

  onAddMessage() {
    this.scrollToBottom();
    if (!this.chatPrefs.autoFollowScroll()) this.refreshNearBottom();
  }

  onClickScrollToBottom() {
    this.hasNewMessage.set(false);
    this.newMessageCount.set(0);
    this.scrollToBottom(true);
  }

  scrollToBottom(isForce: boolean = false) {
    if (isForce) this.isAutoScroll = true;
    if (!this.isAutoScroll) return;
    if (!this.panelService.scrollablePanel) return;
    const shouldMoveScroll = isForce || this.chatPrefs.autoFollowScroll();
    // `scrollToBottom$` triggers chat-tab.resetMessages() which jams the rendered range to the
    // very bottom. If we are not actually going to move the scroll (non-follow mode + non-force),
    // emitting it leaves the rendered slice at the bottom of a growing container while the
    // viewport stays put — the messageContainer slides off-screen below the panel and the chat
    // appears blank. Only emit when we will follow up with an actual scroll.
    if (shouldMoveScroll) this.panelService.scrollToBottom$.emit();
    if (this.scrollToBottomTimer != null) return;
    this.scrollToBottomTimer = setTimeout(() => {
      this.chatTab()?.markForRead();
      this.objectChange.notifyChanged(this.chatTabidentifier);
      this.scrollToBottomTimer = null;
      this.isAutoScroll = false;
      if (shouldMoveScroll && this.panelService.scrollablePanel) {
        this.panelService.scrollablePanel.scrollTop = this.panelService.scrollablePanel.scrollHeight;
      }
      if (shouldMoveScroll) this.newMessageCount.set(0);
    }, 0);
  }

  checkAutoScroll() {
    const distance = this.distanceFromBottom();
    if (distance == null) return;
    this.isAutoScroll = distance <= AT_BOTTOM_THRESHOLD_PX;
  }

  updatePanelTitle() {
    const tab = this.chatTab();
    if (tab) {
      this.panelService.title = this.t('feature.chat.window.titleWithTab', { tab: tab.name });
      this.panelService.chatTab = tab;
    } else {
      this.panelService.title = this.t('common.panel.chatWindow');
      this.panelService.chatTab = null;
    }
  }

  onSelectedTab(_identifier: string) {
    this.updatePanelTitle();
  }

  showTabSetting() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.chat.window.tabSettingTitle'),
      ...sheetPanelBox(coordinate, 500, 380),
    };
    const component = this.panelService.open<ChatTabSettingComponent>(ChatTabSettingComponent, option);
    component.selectedTab.set(this.chatTab());
  }

  showDiceTableSetting() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.chat.window.diceTableSetting'),
      left: coordinate.x + 50,
      top: coordinate.y - 450,
      width: 650,
      height: 400,
    };
    this.panelService.openLazy(
      () =>
        import('@axe/features/dice/dice-table-setting/dice-table-setting.component').then(
          (m) => m.DiceTableSettingComponent
        ),
      option
    );
  }

  showChatSetting() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.chat.window.chatSetting'),
      left: coordinate.x + 50,
      top: coordinate.y - 300,
      width: 340,
      height: 320,
    };
    const component = this.panelService.open<ChatMessageSettingComponent>(ChatMessageSettingComponent, option);
    component.chatTabidentifier = this.chatTabidentifier;
  }

  showVoteMenu() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.chat.window.voteMenuTitle'),
      left: coordinate.x + 50,
      top: coordinate.y - 450,
      width: 650,
      height: 400,
    };
    this.panelService.openLazy(
      () => import('@axe/features/vote/vote-menu/vote-menu.component').then((m) => m.VoteMenuComponent),
      option,
      (component) => (component.chatTabidentifier = this.chatTabidentifier)
    );
  }

  showAlarmMenu() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.t('feature.chat.window.alarmMenuTitle'),
      left: coordinate.x + 50,
      top: coordinate.y - 450,
      width: 650,
      height: 400,
    };
    this.panelService.openLazy(
      () => import('@axe/features/alarm/alarm-menu/alarm-menu.component').then((m) => m.AlarmMenuComponent),
      option
    );
  }

  /** Who the line is spoken as. Speaking as yourself rather than as a piece leaves nothing to read. */
  private speakingCharacterOf(sendFrom: string): GameCharacter | null {
    const object = this.objectStore.get(sendFrom);
    return object instanceof GameCharacter ? object : null;
  }

  private targeted(gameCharacter: GameCharacter): boolean {
    if (gameCharacter.location.name != 'table') return false;
    return gameCharacter.targeted;
  }

  private targetedGameCharacterList(): GameCharacter[] {
    const objects = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => this.targeted(character));
    return objects;
  }

  sendChat(value: ChatOutgoing) {
    const tab = this.chatTab();
    if (tab && !canRoleSpeakTab(tab, PeerCursor.myRole)) return;
    if (tab) {
      let outtext = '';
      let objects: GameCharacter[];
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

      if (textTargetsCharacter(value.text)) {
        objects = this.targetedGameCharacterList();
        let first = true;
        if (objects.length == 0) {
          outtext += this.t('feature.chat.window.noTarget');
        }
        for (const object of objects) {
          outtext += first ? '' : '\n';
          const str = value.text;
          let str2: string;
          if (first) {
            str2 = str;
          } else {
            str2 = DiceBot.deleteMyselfResourceBuff(str);
          }

          const filled = fillIn(str2, object);
          outtext += filled;
          outtext += ' [' + object.name + ']';
          first = false;

          const targetContext: ChatMessageTargetContext = {
            text: '',
            object: null,
          };
          targetContext.text = filled;
          targetContext.object = object;
          messageTargetContext.push(targetContext);
        }
      } else {
        outtext = fillIn(value.text);
        const targetContext: ChatMessageTargetContext = {
          text: '',
          object: null,
        };
        targetContext.text = outtext;
        targetContext.object = null;
        messageTargetContext.push(targetContext);
      }
      this.chatMessageService.sendMessage(
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
        { light: value.messBubbleLight ?? '', dark: value.messBubbleDark ?? '' }
      );
    }
  }
}
