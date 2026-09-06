import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
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
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private readonly chatTabList = inject(ChatTabList);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  readonly selectedTab = signal<ChatTab | null>(null);
  selectedTabXml = '';

  get systemTabIndex(): number {
    return this.chatTabList.systemMessageTabIndex;
  }

  set systemTabIndex(index: number) {
    this.chatTabList.systemMessageTabIndex = index;
  }

  systemTab(): ChatTab | null {
    return this.chatTabList.systemMessageTab;
  }

  get tabName(): string {
    if (this.selectedTab()) this.objectChange.versionOf(this.selectedTab()!.identifier)();
    return this.selectedTab()?.name ?? '';
  }
  set tabName(tabName: string) {
    if (this.isEditable && this.isRenamable && this.selectedTab()) this.selectedTab()!.name = tabName;
  }

  perm(key: 'plCanView' | 'plCanSpeak' | 'guestCanView' | 'guestCanSpeak'): boolean {
    if (this.selectedTab()) this.objectChange.versionOf(this.selectedTab()!.identifier)();
    return this.selectedTab()?.[key] ?? false;
  }
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

  get chatTabs(): readonly ChatTab[] {
    this.objectChange.collectionOf('chat-tab')();
    return this.chatMessageService.chatTabs;
  }
  get isEmpty(): boolean {
    return this.chatMessageService.chatTabs.length < 1;
  }
  get isDeleted(): boolean {
    return this.selectedTab() ? this.objectStore.get(this.selectedTab()!.identifier) == null : false;
  }
  /** The system tab belongs to the tool rather than the room, so its name, its place and whether it travels are all handled apart. */
  get isSystemTabSelected(): boolean {
    return !!this.selectedTab()?.isSystemTab;
  }

  get isTickerTabSelected(): boolean {
    return !!this.selectedTab()?.isTickerTab;
  }

  /** It cannot be deleted; with nowhere for the arrivals and departures to go, they come back into the conversation. */
  get isDeletable(): boolean {
    return !this.isEmpty && !!this.selectedTab() && !this.isSystemTabSelected && !this.isTickerTabSelected;
  }

  get isRenamable(): boolean {
    return !this.isSystemTabSelected && !this.isTickerTabSelected;
  }

  get isMovable(): boolean {
    return !this.isDeleted && !this.isSystemTabSelected && !this.isTickerTabSelected;
  }

  /** Whether it travels with the room data. The system tab is no part of the room. */
  get isExportable(): boolean {
    return !this.isSystemTabSelected;
  }

  private get useCocLog(): boolean {
    return this.modeCocLog && !this.isSystemTabSelected;
  }

  get isEditable(): boolean {
    return !this.isEmpty && !this.isDeleted;
  }
  get canEditPermission(): boolean {
    this.objectChange.trackMyCursor();
    return this.isEditable && canRoleEdit(PeerCursor.myRole);
  }

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  allowDeleteLog = false;
  allowDeleteTab = false;
  modeCocLog = false;

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

  onChangeSelectTab(identifier: string) {
    this.selectedTab.set(this.objectStore.get<ChatTab>(identifier));
    this.selectedTabXml = '';
  }

  create() {
    this.chatTabList.addChatTab(this.t('feature.chat.tabSetting.defaultTabName'));
  }

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

  get roomName(): string {
    const roomName =
      Network.peerContext && 0 < Network.peerContext.roomName.length
        ? Network.peerContext.roomName
        : this.t('app.roomDataDefault');
    return roomName;
  }

  private appendTimestamp(fileName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = ('00' + (date.getMonth() + 1)).slice(-2);
    const day = ('00' + date.getDate()).slice(-2);
    const hours = ('00' + date.getHours()).slice(-2);
    const minutes = ('00' + date.getMinutes()).slice(-2);

    return fileName + `_${year}-${month}-${day}_${hours}${minutes}`;
  }

  saveLog() {
    if (!this.selectedTab()) return;
    const fileName: string = this.roomName + '_log_' + this.selectedTab()!.name;
    const fileName_: string = this.appendTimestamp(fileName);

    if (this.useCocLog) {
      this.saveDataService.saveHtmlChatLogCoc(this.selectedTab()!, fileName_);
    } else {
      this.saveDataService.saveHtmlChatLog(this.selectedTab()!, fileName_);
    }
  }

  saveAllLog() {
    const fileName: string = this.roomName + '_log_' + this.t('feature.chat.tabSetting.allTabsLogName');
    const fileName_: string = this.appendTimestamp(fileName);
    const tabs = this.chatMessageService.chatTabs;

    if (this.useCocLog) {
      this.saveDataService.saveHtmlChatLogAllCoc(fileName_, tabs);
    } else {
      this.saveDataService.saveHtmlChatLogAll(fileName_, tabs);
    }
  }

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

  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  deleteLog() {
    if (!this.allowDeleteLog) return;

    if (!this.isEmpty && this.selectedTab()) {
      while (this.selectedTab()!.children.length > 0) {
        this.selectedTab()!.children[0].destroy();
      }
      this.selectedTab()!.portraitReset();
      const mess = encodeI18nMessage('common.chat.logClearedBy', { user: this.resolveRequesterName() });
      this.chatMessageService.sendSystemMessageToTab(this.selectedTab()!, mess, undefined, this.requesterUserId());
    }
  }

  deleteLogALL() {
    if (!this.allowDeleteLog) return;

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

  restore() {
    if (this.selectedTab() && this.selectedTabXml) {
      const restoreTable = this.objectSerializer.parseXml(this.selectedTabXml)! as ChatTab;
      this.chatTabList.addChatTab(restoreTable);
      this.selectedTabXml = '';
    }
  }

  chkSystemTabIndex() {
    const list = this.chatTabList;
    if (this.systemTabIndex >= list.children.length) this.systemTabIndex = list.children.length - 1;
    if (this.systemTabIndex < 0) this.systemTabIndex = 0;
  }

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

  onSelectTab(event: Event): void {
    this.onChangeSelectTab((event.target as HTMLInputElement).value);
  }
}
