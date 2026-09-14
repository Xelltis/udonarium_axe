import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatLogStylePreferenceService } from '@axe/application/chat/chat-log-style-preference.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CHAT_LOG_STYLES, ChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { ChatLogPreviewComponent } from '@axe/features/chat/chat-log-preview/chat-log-preview.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-tab-setting',
  templateUrl: './chat-tab-setting.component.html',
  host: { class: 'block h-full' },
  imports: [FormsModule, TranslocoModule],
})
export class ChatTabSettingComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly logStylePreference = inject(ChatLogStylePreferenceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private readonly chatTabList = inject(ChatTabList);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  readonly selectedTab = signal<ChatTab | null>(null);
  selectedTabXml = '';

  readonly logStyles = CHAT_LOG_STYLES;
  readonly logStyle = this.logStylePreference.style;

  /**
   * The position of the tab that system messages go to when the room has no system tab.
   *
   * It is kept on the room's tab list, so a change reaches every peer. Writes are ignored for a
   * seat that may not change the tabs.
   */
  get systemTabIndex(): number {
    return this.chatTabList.systemMessageTabIndex;
  }

  set systemTabIndex(index: number) {
    if (!this.canEditTabs) return;
    this.chatTabList.systemMessageTabIndex = index;
  }

  /**
   * The tab system messages currently land in, or null when there is none, as shown at the top of
   * the panel.
   */
  systemTab(): ChatTab | null {
    return this.chatTabList.systemMessageTab;
  }

  /**
   * The selected tab's name; renaming is ignored for the system tab and for a seat that may not
   * change the tabs.
   */
  get tabName(): string {
    if (this.selectedTab()) this.objectChange.versionOf(this.selectedTab()!.identifier)();
    return this.selectedTab()?.name ?? '';
  }
  set tabName(tabName: string) {
    if (this.isEditable && this.isRenamable && this.selectedTab()) this.selectedTab()!.name = tabName;
  }

  /**
   * Whether players or guests may read or speak in the selected tab; false when no tab is selected.
   */
  perm(key: 'plCanView' | 'plCanSpeak' | 'guestCanView' | 'guestCanSpeak'): boolean {
    if (this.selectedTab()) this.objectChange.versionOf(this.selectedTab()!.identifier)();
    return this.selectedTab()?.[key] ?? false;
  }
  /**
   * Sets whether players or guests may read or speak in the selected tab.
   *
   * Allowing speech also allows reading, and taking reading away also takes speech away. Ignored
   * for the system tab and for a seat that may not change permissions.
   */
  setPerm(key: 'plCanView' | 'plCanSpeak' | 'guestCanView' | 'guestCanSpeak', value: boolean): void {
    const tab = this.selectedTab();
    if (!this.canEditPermission || !tab || tab.isSystemTab) return;
    tab[key] = value;
    // whoever may speak may read, so speaking without reading cannot happen
    if (key === 'plCanSpeak' && value) tab.plCanView = true;
    else if (key === 'plCanView' && !value) tab.plCanSpeak = false;
    else if (key === 'guestCanSpeak' && value) tab.guestCanView = true;
    else if (key === 'guestCanView' && !value) tab.guestCanSpeak = false;
  }

  /** Every chat tab in the room, in the order they are listed. */
  get chatTabs(): readonly ChatTab[] {
    this.objectChange.collectionOf('chat-tab')();
    return this.chatMessageService.chatTabs;
  }
  /** Whether the room has no chat tabs at all. */
  get isEmpty(): boolean {
    return this.chatMessageService.chatTabs.length < 1;
  }
  /**
   * Whether the selected tab no longer exists in the room, which is when the panel offers to
   * restore it.
   */
  get isDeleted(): boolean {
    return this.selectedTab() ? this.objectStore.get(this.selectedTab()!.identifier) == null : false;
  }
  /** The system tab belongs to the tool rather than the room, so its name, its place and whether it travels are all handled apart. */
  get isSystemTabSelected(): boolean {
    return !!this.selectedTab()?.isSystemTab;
  }

  /** It cannot be deleted; with nowhere for the arrivals and departures to go, they come back into the conversation. */
  get isDeletable(): boolean {
    return !this.isEmpty && !!this.selectedTab() && !this.isSystemTabSelected && this.canEditTabs;
  }

  /** Whether the selected tab's name may be changed, which the system tab's may not. */
  get isRenamable(): boolean {
    return !this.isSystemTabSelected;
  }

  /**
   * Whether the selected tab can be moved up or down the list: it still exists, is not the system
   * tab, and this seat may change the tabs.
   */
  get isMovable(): boolean {
    return !this.isDeleted && !this.isSystemTabSelected && this.canEditTabs;
  }

  /** Whether it travels with the room data. The system tab is no part of the room. */
  get isExportable(): boolean {
    return !this.isSystemTabSelected;
  }

  private get effectiveLogStyle(): ChatLogStyle {
    const style = this.logStyle();
    return style === 'coc' && this.isSystemTabSelected ? 'standard' : style;
  }

  /**
   * Whether the selected tab's settings can be changed from this seat: a tab that still exists is
   * selected and the seat may change the tabs.
   */
  get isEditable(): boolean {
    return !this.isEmpty && !this.isDeleted && this.canEditTabs;
  }

  /**
   * Whether the tabs are this reader's to change.
   *
   * The tabs and their logs belong to the room rather than to a seat: deleting one takes the
   * conversation from everybody, and clearing a log takes it from everybody for good. A seat
   * that is only watching changes neither.
   */
  get canEditTabs(): boolean {
    this.objectChange.trackMyCursor();
    return canRoleEdit(PeerCursor.myRole);
  }

  /** Whether the read and speak permissions of the selected tab can be changed from this seat. */
  get canEditPermission(): boolean {
    return this.isEditable && this.canEditTabs;
  }

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  allowDeleteLog = false;
  allowDeleteTab = false;

  constructor() {
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.chat.tabSetting.panelTitle'))
    );
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (!this.selectedTab() || e.identifier !== this.selectedTab()!.identifier) return;
      const object = this.objectStore.get(e.identifier);
      if (object !== null) {
        this.selectedTabXml = object.toXml();
      }
      this.selectedTab.set(null);
    }, this.destroyRef);
    this.objectChange.onObjectChangedForAlias(
      [ChatTab.aliasName, ChatTabList.aliasName],
      (e) => {
        const object = this.objectStore.get(e.identifier);
        if (object instanceof ChatTab || object instanceof ChatTabList) {
          if (this.selectedTab() && !this.objectStore.get(this.selectedTab()!.identifier)) {
            this.selectedTab.set(null);
          }
          if (!this.selectedTab() && this.chatTabs.length > 0) {
            this.selectedTab.set(this.chatTabs[0]);
          }
        }
      },
      this.destroyRef
    );
  }

  /** Selects the tab with the identifier, forgetting any copy kept for restoring a deleted tab. */
  onChangeSelectTab(identifier: string) {
    this.selectedTab.set(this.objectStore.get<ChatTab>(identifier));
    this.selectedTabXml = '';
  }

  /**
   * Adds a new tab with the default name to the room; does nothing for a seat that may not change
   * the tabs.
   */
  create() {
    if (!this.canEditTabs) return;
    this.chatTabList.addChatTab(this.t('feature.chat.tabSetting.defaultTabName'));
  }

  /**
   * Downloads the selected tab, log and all, as a save file, showing progress until shortly after
   * it finishes.
   *
   * Does nothing while a save is running, and nothing for the system tab, which is no part of the
   * room.
   */
  async save() {
    if (!this.selectedTab() || this.isSaving() || !this.isExportable) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);

    const fileName: string = 'chat_' + this.selectedTab()!.name;

    await this.saveDataService.saveGameObjectAsync(this.selectedTab()!, fileName, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }

  /** Picks the format logs are previewed and downloaded in, remembered in this browser. */
  chooseLogStyle(style: ChatLogStyle): void {
    this.logStylePreference.choose(style);
  }

  /** Opens a panel previewing the selected tab's log in the chosen format. */
  openLogPreview(): void {
    const coordinate = this.pointerDeviceService.pointers[0];
    const component = this.panelService.open<ChatLogPreviewComponent>(ChatLogPreviewComponent, {
      title: this.t('feature.chat.log.previewTitle'),
      ...sheetPanelBox(coordinate, 820, 580),
    });
    component.tab.set(this.selectedTab());
  }

  /**
   * Downloads the selected tab's log in the chosen format; the system tab falls back to the
   * standard format where the chosen one does not apply.
   */
  saveLog() {
    const tab = this.selectedTab();
    if (!tab) return;
    this.saveDataService.saveChatLog(this.effectiveLogStyle, 'tab', [tab], tab.name);
  }

  /** Downloads the logs of every tab together in the chosen format. */
  saveAllLog() {
    this.saveDataService.saveChatLog(
      this.effectiveLogStyle,
      'all',
      this.chatMessageService.chatTabs,
      this.t('feature.chat.tabSetting.allTabsLogName')
    );
  }

  /**
   * Removes the selected tab from the room for every peer.
   *
   * A copy is kept so the tab can be restored, and the system message position moves with the tabs
   * that follow it. Does nothing for a tab that may not be deleted.
   */
  delete() {
    if (!this.isDeletable) return;
    if (!this.isEmpty && this.selectedTab()) {
      const parentElement = this.selectedTab()!.parent!;
      const index: number = parentElement.children.indexOf(this.selectedTab()!);
      this.selectedTabXml = this.selectedTab()!.toXml();
      this.selectedTab()!.destroy();

      if (this.systemTabIndex > index) {
        this.systemTabIndex--;
      }
      this.chkSystemTabIndex();
    }
  }

  /** This seat's own peer cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /**
   * Clears every message from the selected tab for every peer and posts who cleared it.
   *
   * Needs the confirmation box ticked and a seat that may change the tabs; the tab's portraits are
   * reset along with the log.
   */
  deleteLog() {
    if (!this.allowDeleteLog || !this.canEditTabs) return;

    if (!this.isEmpty && this.selectedTab()) {
      while (this.selectedTab()!.children.length > 0) {
        this.selectedTab()!.children[0].destroy();
      }
      this.selectedTab()!.portraitReset();
      const mess = encodeI18nMessage('common.chat.logClearedBy', { user: this.resolveRequesterName() });
      this.chatMessageService.sendSystemMessageToTab(this.selectedTab()!, mess, undefined, this.requesterUserId());
    }
  }

  /**
   * Clears the logs of every tab for every peer, posting who cleared them in each; needs the
   * confirmation box ticked and a seat that may change the tabs.
   */
  deleteLogALL() {
    if (!this.allowDeleteLog || !this.canEditTabs) return;

    const mess = encodeI18nMessage('common.chat.logClearedBy', { user: this.resolveRequesterName() });

    const requester = this.requesterUserId();
    for (const child of this.chatTabList.chatTabs) {
      while (child.children.length > 0) {
        child.children[0].destroy();
      }
      child.portraitReset();
      this.chatMessageService.sendSystemMessageToTab(child, mess, undefined, requester);
    }
  }

  private requesterUserId(): string {
    return this.myPeer?.userId ?? '';
  }

  private resolveRequesterName(): string {
    const cursor = this.myPeer;
    const name = cursor?.name?.trim();
    return name || cursor?.identifier || '';
  }

  /**
   * Puts the last deleted tab back into the room from the copy kept when it was removed, then
   * forgets the copy.
   */
  restore() {
    if (!this.canEditTabs) return;
    if (this.selectedTab() && this.selectedTabXml) {
      const restoreTable = this.objectSerializer.parseXml(this.selectedTabXml)! as ChatTab;
      this.chatTabList.addChatTab(restoreTable);
      this.selectedTabXml = '';
    }
  }

  /** Clamps the system message position to the tabs that exist. */
  chkSystemTabIndex() {
    if (!this.canEditTabs) return;
    const list = this.chatTabList;
    if (this.systemTabIndex >= list.children.length) this.systemTabIndex = list.children.length - 1;
    if (this.systemTabIndex < 0) this.systemTabIndex = 0;
  }

  /**
   * Moves the selected tab one place up the list, keeping the system message position on the same
   * tab.
   */
  upTabIndex() {
    if (!this.selectedTab() || !this.isMovable) return;
    const parentElement = this.selectedTab()!.parent!;
    const index: number = parentElement.children.indexOf(this.selectedTab()!);
    if (0 < index) {
      const prevElement = parentElement.children[index - 1];
      parentElement.insertBefore(this.selectedTab()!, prevElement);
      if (this.systemTabIndex == index) {
        this.systemTabIndex--;
      } else if (this.systemTabIndex == index - 1) {
        this.systemTabIndex++;
      }
      this.chkSystemTabIndex();
    }
  }

  /**
   * Moves the selected tab one place down the list, keeping the system message position on the same
   * tab.
   */
  downTabIndex() {
    if (!this.selectedTab() || !this.isMovable) return;
    const parentElement = this.selectedTab()!.parent!;
    const index: number = parentElement.children.indexOf(this.selectedTab()!);
    if (index < parentElement.children.length - 1) {
      const nextElement = parentElement.children[index + 1];
      parentElement.insertBefore(nextElement, this.selectedTab()!);
      if (this.systemTabIndex == index) {
        this.systemTabIndex++;
      } else if (this.systemTabIndex == index + 1) {
        this.systemTabIndex--;
      }
      this.chkSystemTabIndex();
    }
  }

  /** Selects the tab whose identifier is the value of the control that fired the event. */
  onSelectTab(event: Event): void {
    this.onChangeSelectTab((event.target as HTMLInputElement).value);
  }
}
