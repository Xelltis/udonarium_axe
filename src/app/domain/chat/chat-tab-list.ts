import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatLogExporter } from '@axe/domain/chat/chat-log-exporter';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import {
  SYSTEM_CHAT_TAB_IDENTIFIER,
  SYSTEM_CHAT_TAB_NAME,
  TICKER_CHAT_TAB_IDENTIFIER,
  TICKER_CHAT_TAB_NAME,
} from '@axe/domain/chat/constants';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

@SyncObject('chat-tab-list')
export class ChatTabList extends ObjectNode implements InnerXml {
  @SyncVar('_systemMessageTabIndex') private _systemMessageTabIndex: number = 0;
  set systemMessageTabIndex(index: number) {
    this._systemMessageTabIndex = index;
  }

  get systemMessageTabIndex(): number {
    return this._systemMessageTabIndex;
  }

  /** Where the system messages go: the system tab where there is one, and otherwise the tab named by number, as before. */
  get systemMessageTab(): ChatTab | null {
    const system = this.chatTabs.find((tab) => tab.isSystemTab);
    if (system) return system;
    return this.chatTabs.length > this.systemMessageTabIndex ? this.chatTabs[this.systemMessageTabIndex] : null;
  }

  /** Makes the system tab. Where there is one already it is set right and returned. */
  ensureSystemTab(): ChatTab {
    const system = this.chatTabs.find((tab) => tab.isSystemTab);
    if (system) return this.shapeSystemTab(system);
    const detached = ObjectStore.instance.get<ChatTab>(SYSTEM_CHAT_TAB_IDENTIFIER);
    if (detached) return this.shapeSystemTab(this.appendChild(detached)!);
    return this.shapeSystemTab(this.addChatTab(SYSTEM_CHAT_TAB_NAME, SYSTEM_CHAT_TAB_IDENTIFIER));
  }

  private shapeSystemTab(system: ChatTab): ChatTab {
    if (system.name !== SYSTEM_CHAT_TAB_NAME) system.name = SYSTEM_CHAT_TAB_NAME;
    if (system.plCanSpeak) system.plCanSpeak = false;
    if (system.guestCanSpeak) system.guestCanSpeak = false;
    if (!system.plCanView) system.plCanView = true;
    if (!system.guestCanView) system.guestCanView = true;
    return system;
  }

  get tickerTab(): ChatTab | null {
    return this.chatTabs.find((tab) => tab.isTickerTab) ?? null;
  }

  /** Makes the one room-synchronised tab that supplies the screen-edge ticker. */
  ensureTickerTab(): ChatTab {
    const ticker = this.tickerTab;
    if (ticker) return this.shapeTickerTab(ticker);
    const detached = ObjectStore.instance.get<ChatTab>(TICKER_CHAT_TAB_IDENTIFIER);
    if (detached) return this.shapeTickerTab(this.appendChild(detached)!);
    return this.shapeTickerTab(this.addChatTab(TICKER_CHAT_TAB_NAME, TICKER_CHAT_TAB_IDENTIFIER));
  }

  private shapeTickerTab(ticker: ChatTab): ChatTab {
    if (ticker.name !== TICKER_CHAT_TAB_NAME) ticker.name = TICKER_CHAT_TAB_NAME;
    if (!ticker.plCanView) ticker.plCanView = true;
    if (!ticker.plCanSpeak) ticker.plCanSpeak = true;
    if (!ticker.guestCanView) ticker.guestCanView = true;
    return ticker;
  }

  /** The tabs people talk in. An export covers these alone. */
  get spokenChatTabs(): readonly ChatTab[] {
    return this.chatTabs.filter((tab) => !tab.isSystemTab);
  }

  get reloadCheck(): ReloadCheck {
    return ObjectStore.instance.get<ReloadCheck>('ReloadCheck')!;
  }

  private _portraitHeight = 200;
  get portraitHeight(): number {
    return this._portraitHeight;
  }
  set portraitHeight(v: number) {
    this._portraitHeight = v;
    this.update();
  }
  public minPortraitSize = 100;
  public maxPortraitSize = 500;

  private _isPortraitInWindow = false;
  get isPortraitInWindow(): boolean {
    return this._isPortraitInWindow;
  }
  set isPortraitInWindow(v: boolean) {
    this._isPortraitInWindow = v;
    this.update();
  }

  private _isKeepPortraitOutWindow = false;
  get isKeepPortraitOutWindow(): boolean {
    return this._isKeepPortraitOutWindow;
  }
  set isKeepPortraitOutWindow(v: boolean) {
    this._isKeepPortraitOutWindow = v;
    this.update();
  }

  private static _instance: ChatTabList;
  static get instance(): ChatTabList {
    const stored = ObjectStore.instance.get<ChatTabList>('ChatTabList');
    if (stored) return (ChatTabList._instance = stored);
    if (!ChatTabList._instance) ChatTabList._instance = new ChatTabList('ChatTabList');
    ChatTabList._instance.initialize();
    return ChatTabList._instance;
  }

  get chatTabs(): readonly ChatTab[] {
    return this.children as readonly ChatTab[];
  }

  //The simple display flags, held as numbers to leave room to grow.
  private simpleDispFlagTime_: number = 0;
  set simpleDispFlagTime(flag: number) {
    this.simpleDispFlagTime_ = flag;
    this.update();
  }

  get simpleDispFlagTime(): number {
    return this.simpleDispFlagTime_;
  }

  private simpleDispFlagUserId_: number = 0;
  set simpleDispFlagUserId(flag: number) {
    this.simpleDispFlagUserId_ = flag;
    this.update();
  }
  get simpleDispFlagUserId(): number {
    return this.simpleDispFlagUserId_;
  }

  addChatTab(arg: ChatTab | string, identifier?: string): ChatTab {
    let chatTab: ChatTab;
    if (arg instanceof ChatTab) {
      chatTab = arg;
    } else {
      chatTab = new ChatTab(identifier);
      chatTab.name = arg;
      chatTab.initialize();
    }
    return this.appendChild(chatTab)!;
  }

  /** What goes into the room data. The system tab belongs to the tool and does not travel. */
  override innerXml(): string {
    let xml = '';
    for (const child of this.children) {
      if (child instanceof ChatTab && child.isSystemTab) continue;
      xml += ObjectSerializer.instance.toXml(child);
    }
    return xml;
  }

  override parseInnerXml(element: Element) {
    const reLoadOk = this.reloadCheck.answerCheck();

    if (reLoadOk) {
      // updates the existing object rather than making one from the saved data
      for (const child of [...ChatTabList.instance.children]) {
        if (child instanceof ChatTab && child.isSystemTab) continue;
        child.destroy();
      }

      const context = ChatTabList.instance.toContext();
      context.syncData = this.toContext().syncData;
      ChatTabList.instance.apply(context);
      ChatTabList.instance.update();

      super.parseInnerXml.apply(ChatTabList.instance, [element]);
      ChatTabList.instance.restoreSystemTab();
      this.destroy();
    }
  }

  /** The tidying after a load: room data written while the system tab still travelled has its notices gathered back into one. */
  private restoreSystemTab(): void {
    const system = this.ensureSystemTab();
    for (const tab of [...this.chatTabs]) {
      if (tab === system || tab.name !== SYSTEM_CHAT_TAB_NAME) continue;
      for (const message of [...tab.children]) system.appendChild(message);
      tab.destroy();
    }
    this.appendChild(system);
  }

  logHtml(): string {
    return ChatLogExporter.exportAllTabsHtml(this.spokenChatTabs, this.simpleDispFlagTime);
  }

  logHtmlCoc(): string {
    return ChatLogExporter.exportAllTabsHtmlCoc(this.spokenChatTabs);
  }
}
