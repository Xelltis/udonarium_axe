import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatLogExporter } from '@axe/domain/chat/chat-log-exporter';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { SYSTEM_CHAT_TAB_IDENTIFIER, SYSTEM_CHAT_TAB_NAME } from '@axe/domain/chat/constants';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

@SyncObject('chat-tab-list')
export class ChatTabList extends ObjectNode implements InnerXml {
  @SyncVar('_systemMessageTabIndex') private _systemMessageTabIndex: number = 0;
  /**
   * The position of the tab that takes system messages when the room has no system tab of its own.
   */
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

  /** The tabs people talk in. An export covers these alone. */
  get spokenChatTabs(): readonly ChatTab[] {
    return this.chatTabs.filter((tab) => !tab.isSystemTab);
  }

  /** The room's reload guard, which asks before room data loaded mid-session replaces the tabs. */
  get reloadCheck(): ReloadCheck {
    return ObjectStore.instance.get<ReloadCheck>('ReloadCheck')!;
  }

  private _portraitHeight = 200;
  /**
   * How tall chat portraits are drawn, in pixels. Kept in this browser; setting it announces a
   * change to the list, and callers hold it between `minPortraitSize` and `maxPortraitSize`.
   */
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
  /**
   * Whether portraits are drawn inside the chat window. Kept in this browser; setting it announces
   * a change to the list.
   */
  get isPortraitInWindow(): boolean {
    return this._isPortraitInWindow;
  }
  set isPortraitInWindow(v: boolean) {
    this._isPortraitInWindow = v;
    this.update();
  }

  private _isKeepPortraitOutWindow = false;
  /**
   * Whether portraits are kept outside the chat window, a choice that only applies while
   * `isPortraitInWindow` is off. Kept in this browser; setting it announces a change to the list.
   */
  get isKeepPortraitOutWindow(): boolean {
    return this._isKeepPortraitOutWindow;
  }
  set isKeepPortraitOutWindow(v: boolean) {
    this._isKeepPortraitOutWindow = v;
    this.update();
  }

  private static _instance: ChatTabList;
  /**
   * The room's single tab list: the one in the object store, or one made and initialized under the
   * fixed identifier when there is none yet.
   */
  static get instance(): ChatTabList {
    const stored = ObjectStore.instance.get<ChatTabList>('ChatTabList');
    if (stored) return (ChatTabList._instance = stored);
    if (!ChatTabList._instance) ChatTabList._instance = new ChatTabList('ChatTabList');
    ChatTabList._instance.initialize();
    return ChatTabList._instance;
  }

  /** The tabs in their order, the system tab included. */
  get chatTabs(): readonly ChatTab[] {
    return this.children as readonly ChatTab[];
  }

  //The simple display flags, held as numbers to leave room to grow.
  private simpleDispFlagTime_: number = 0;
  /**
   * Whether chat lines show the time they were said; 0 is off. Kept in this browser; setting it
   * announces a change to the list.
   */
  set simpleDispFlagTime(flag: number) {
    this.simpleDispFlagTime_ = flag;
    this.update();
  }

  get simpleDispFlagTime(): number {
    return this.simpleDispFlagTime_;
  }

  private simpleDispFlagUserId_: number = 0;
  /**
   * Whether chat lines show the sender's user id; 0 is off. Kept in this browser; setting it
   * announces a change to the list.
   */
  set simpleDispFlagUserId(flag: number) {
    this.simpleDispFlagUserId_ = flag;
    this.update();
  }
  get simpleDispFlagUserId(): number {
    return this.simpleDispFlagUserId_;
  }

  /**
   * Adds a tab to the end of the list, either the one given or a new tab of that name under
   * `identifier`, and returns it.
   */
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

  /**
   * Reads tabs from room data into the room's existing list once the reload guard allows it, then
   * destroys the loaded copy.
   *
   * Every tab but the system tab is replaced, and notices from room data written while the system
   * tab still travelled are gathered back into it. When the guard refuses, nothing is replaced.
   */
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

  /**
   * The standard-layout log page of every spoken tab, with times when `simpleDispFlagTime` is on.
   */
  logHtml(): string {
    return ChatLogExporter.exportAllTabsHtml(this.spokenChatTabs, this.simpleDispFlagTime);
  }

  /** The classic-layout log page of every spoken tab. */
  logHtmlCoc(): string {
    return ChatLogExporter.exportAllTabsHtmlCoc(this.spokenChatTabs);
  }
}
