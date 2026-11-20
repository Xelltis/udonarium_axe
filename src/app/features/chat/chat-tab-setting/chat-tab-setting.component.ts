import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatLogClearReach, ChatLogClearService } from '@axe/application/chat/chat-log-clear.service';
import { ChatTabEditService, ChatTabPermissionKey } from '@axe/application/chat/chat-tab-edit.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SaveProgress } from '@axe/application/file/save-progress';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { identifiersInXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { formatLogMoment } from '@axe/domain/chat/chat-log-rich';
import { CHAT_LOG_STYLES, ChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatLogPreviewComponent } from '@axe/features/chat/chat-log-preview/chat-log-preview.component';
import { ChatLogStylePreferenceService } from '@axe/features/chat/chat-log-style-preference.service';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** How soon after this seat deleted a tab a room server putting it back is taken as turning the deletion down. */
const TURNED_DOWN_WITHIN_MS = 30_000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'chat-tab-setting',
  templateUrl: './chat-tab-setting.component.html',
  host: { class: 'block h-full' },
  imports: [TextTooltipDirective, FormsModule, TranslocoModule],
})
export class ChatTabSettingComponent {
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly logStylePreference = inject(ChatLogStylePreferenceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectSerializer = inject(ObjectSerializer);
  private get chatTabList(): ChatTabList {
    return ChatTabList.instance;
  }
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabEdit = inject(ChatTabEditService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);
  private readonly snackbar = inject(SnackbarService);
  private readonly logClear = inject(ChatLogClearService);
  /** A tab this seat deleted in a room server's room, which the server may put back, and when. */
  private deletedOnServer: { identifier: string; at: number } | null = null;

  readonly selectedTab = signal<ChatTab | null>(null);
  selectedTabXml = '';

  readonly logStyles = CHAT_LOG_STYLES;
  readonly logStyle = this.logStylePreference.style;
  /** Whether saved logs leave out deleted lines. */
  readonly omitDeleted = this.logStylePreference.omitDeleted;

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
    const tab = this.selectedTab();
    if (!tab) return '';
    this.objectChange.versionOf(tab.identifier)();
    return tab.name ?? '';
  }
  set tabName(tabName: string) {
    const tab = this.selectedTab();
    if (this.isEditable && tab) this.tabEdit.rename(tab, tabName);
  }

  /**
   * Whether players or guests may read or speak in the selected tab; false when no tab is selected.
   */
  perm(key: ChatTabPermissionKey): boolean {
    const tab = this.selectedTab();
    if (!tab) return false;
    this.objectChange.versionOf(tab.identifier)();
    return tab[key] ?? false;
  }
  /**
   * Sets whether players or guests may read or speak in the selected tab.
   *
   * Allowing speech also allows reading, and taking reading away also takes speech away. Ignored
   * for the system tab and for a seat that may not change permissions.
   */
  setPerm(key: ChatTabPermissionKey, value: boolean): void {
    const tab = this.selectedTab();
    if (!this.canEditPerm(key) || !tab) return;
    this.tabEdit.setPermission(tab, key, value);
  }

  /**
   * The chat tabs this seat may read, in the order they are listed, which are the ones it sees and
   * manages here: every tab for the game master, in a room of peers as on a room server.
   */
  get chatTabs(): readonly ChatTab[] {
    return this.tabEdit.tabs();
  }
  /** Whether this seat is offered no chat tab at all. */
  get isEmpty(): boolean {
    return this.chatTabs.length < 1;
  }
  /**
   * Whether the selected tab no longer exists in the room, which is when the panel offers to
   * restore it.
   */
  get isDeleted(): boolean {
    const tab = this.selectedTab();
    return tab ? this.objectStore.get(tab.identifier) !== tab : false;
  }
  /** The system tab belongs to the tool rather than the room, so its name, its place and whether it travels are all handled apart. */
  get isSystemTabSelected(): boolean {
    return !!this.selectedTab()?.isSystemTab;
  }

  /**
   * Whether the selected tab may be deleted from this seat. The system tab cannot be: with nowhere
   * for the arrivals and departures to go, they would come back into the conversation. Nor, in a room
   * server's room, can anyone but the game master delete one that holds dice the server rolled.
   */
  get isDeletable(): boolean {
    const tab = this.selectedTab();
    return !!tab && this.isSelectionInReach() && this.tabEdit.mayDelete(tab);
  }

  /**
   * Whether the selected tab is one that, in a room server's room, only the game master may delete,
   * for holding dice the server rolled, which the server keeps from anyone else's deleting.
   */
  get isDeleteKeptForGameMaster(): boolean {
    const tab = this.selectedTab();
    return !!tab && this.tabEdit.deleteKeptForGameMaster(tab);
  }

  /**
   * Whether a room server holds this seat to what only the game master may change in the tabs: who
   * may read a tab, and deleting the dice the server rolled. Among peers nothing is held back.
   */
  get isKeptToGameMasterByServer(): boolean {
    return this.tabEdit.heldByServer();
  }

  /** Whether the selected tab's name may be changed, which the system tab's may not. */
  get isRenamable(): boolean {
    return !this.isSystemTabSelected;
  }

  /**
   * Whether the selected tab can be moved up or down the list: it still exists, is not the system
   * tab, and this seat manages it.
   */
  get isMovable(): boolean {
    const tab = this.selectedTab();
    return !!tab && !this.isDeleted && this.tabEdit.mayRearrange(tab);
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
   * selected and the seat manages it.
   */
  get isEditable(): boolean {
    const tab = this.selectedTab();
    return !!tab && !this.isDeleted && this.isSelectionInReach() && this.tabEdit.mayManage(tab);
  }

  /**
   * Whether the tabs are this reader's to change.
   *
   * The tabs and their logs belong to the room rather than to a seat: deleting one takes the
   * conversation from everybody, and clearing a log takes it from everybody for good. A seat
   * that is only watching changes neither.
   */
  get canEditTabs(): boolean {
    return this.tabEdit.mayEditTabs();
  }

  /** Whether the read and speak permissions of the selected tab can be changed from this seat. */
  get canEditPermission(): boolean {
    return this.isEditable;
  }

  /**
   * Whether this seat may change one of the selected tab's permissions.
   *
   * In a room server's room, who may read a tab is the game master's alone to change, as the server
   * holds. Anyone else may change who may speak only where those who would speak may already read,
   * since speaking brings reading with it.
   */
  canEditPerm(key: ChatTabPermissionKey): boolean {
    const tab = this.selectedTab();
    return !!tab && this.canEditPermission && this.tabEdit.mayChangePermission(tab, key);
  }

  private readonly saveProgress = new SaveProgress();
  /** Whether a save of the tab is running or has only just finished. */
  readonly isSaving = this.saveProgress.isSaving;
  /** How far the running save has come, from 0 to 100. */
  readonly progressPercent = this.saveProgress.percent;

  allowDeleteLog = false;
  /** What is written in the box of the log clearing: a local date and time, or nothing. */
  readonly clearBefore = signal('');
  /**
   * Whether a clearing takes only the lines before the moment in the box. It is turned on as the box
   * is gone into: a date half written reads as an empty box, and a clearing of the whole log must not
   * follow from that.
   */
  readonly clearOnlyBefore = signal(false);
  allowDeleteTab = false;

  constructor() {
    // A tab another seat deleted is let go of; only one this seat deleted is offered back.
    this.objectChange.objectDeleted$.subscribe((e) => {
      if (e.identifier !== this.selectedTab()?.identifier || this.selectedTabXml) return;
      this.selectedTab.set(null);
    }, this.destroyRef);
    // A room server hands back a tab holding dice it rolled, whispers this seat cannot see among
    // them, which only the game master may delete; the seat is told why the tab came back. One that
    // comes back with the room's catalog, its deletion lost with the link, is no such refusal.
    networkMessage$.subscribe((message) => {
      const deleted = this.deletedOnServer;
      if (!deleted || message.eventName !== AuthorityEvent.AUTHORITATIVE) return;
      if (message.sendFrom !== Network.authorityPeerId) return;
      if ((message.data as { identifier?: unknown } | null)?.identifier !== deleted.identifier) return;
      this.deletedOnServer = null;
      if (Date.now() - deleted.at < TURNED_DOWN_WITHIN_MS)
        this.snackbar.show(this.t('feature.chat.tabSetting.deleteTurnedDown'));
    }, this.destroyRef);
    // A tab gone from the list, or one this seat may no longer read, is let go of, as on the seat
    // being made a player while it had a tab only the game master reads picked. One this seat has
    // just deleted stays picked while its copy is kept, for the offer to bring it back, until it
    // comes back under its name, as from a file, when the tab that came back is picked instead.
    this.objectChange.onObjectChangedForAlias(
      [ChatTab.aliasName, ChatTabList.aliasName, PeerCursor.aliasName],
      () => {
        const picked = this.selectedTab();
        const cameBack = picked ? this.objectStore.get<ChatTab>(picked.identifier) : null;
        if (picked && cameBack && cameBack !== picked && this.chatTabs.includes(cameBack)) {
          this.selectedTab.set(cameBack);
          this.selectedTabXml = '';
        }
        const kept = this.selectedTab();
        if (kept && !this.chatTabs.includes(kept) && !this.selectedTabXml) {
          this.selectedTab.set(null);
        }
        if (!this.selectedTab() && this.chatTabs.length > 0) {
          this.selectedTab.set(this.chatTabs[0]);
          this.selectedTabXml = '';
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
    this.tabEdit.create(this.t('feature.chat.tabSetting.defaultTabName'));
  }

  /**
   * Downloads the selected tab, log and all, as a save file, showing progress until shortly after
   * it finishes.
   *
   * Does nothing while a save is running, nothing for the system tab, which is no part of the
   * room, and nothing for a tab this seat may no longer read.
   */
  async save() {
    const tab = this.selectedTab();
    if (!tab || !this.isExportable || !this.isSelectionInReach()) return;
    await this.saveProgress.run((onProgress) =>
      this.saveDataService.saveGameObjectAsync(tab, 'chat_' + tab.name, onProgress)
    );
  }

  /** Picks the format logs are previewed and downloaded in, remembered in this browser. */
  chooseLogStyle(style: ChatLogStyle): void {
    this.logStylePreference.choose(style);
  }

  /** Sets whether saved logs leave out deleted lines, remembered in this browser. */
  setOmitDeleted(omit: boolean): void {
    this.logStylePreference.setOmitDeleted(omit);
  }

  /** Opens a panel previewing the selected tab's log in the chosen format, for a tab this seat may read. */
  openLogPreview(): void {
    if (!this.isSelectionInReach()) return;
    const coordinate = this.pointerDeviceService.pointers[0];
    const component = this.panelService.open<ChatLogPreviewComponent>(ChatLogPreviewComponent, {
      title: this.t('feature.chat.log.previewTitle'),
      ...sheetPanelBox(coordinate, 820, 580),
    });
    component.tab.set(this.selectedTab());
  }

  /**
   * Downloads the selected tab's log in the chosen format; the system tab falls back to the
   * standard format where the chosen one does not apply. Does nothing for a tab this seat may no longer
   * read.
   */
  saveLog() {
    const tab = this.selectedTab();
    if (!tab || !this.isSelectionInReach()) return;
    this.saveDataService.saveChatLog(this.effectiveLogStyle, 'tab', [tab], tab.name, this.logOptions());
  }

  /** Downloads the logs of every tab this seat may read together in the chosen format. */
  saveAllLog() {
    this.saveDataService.saveChatLog(
      this.effectiveLogStyle,
      'all',
      this.chatTabs,
      this.t('feature.chat.tabSetting.allTabsLogName'),
      this.logOptions()
    );
  }

  private logOptions(): { omitDeleted: boolean } {
    return { omitDeleted: this.omitDeleted() };
  }

  /**
   * Removes the selected tab from the room for every peer.
   *
   * A copy is kept so the tab can be restored, and the system message position moves with the tabs
   * that follow it. Does nothing for a tab that may not be deleted.
   */
  delete() {
    const tab = this.selectedTab();
    if (!tab || !this.isDeletable) return;
    const xml = tab.toXml();
    const heldByServer = this.isKeptToGameMasterByServer;
    if (!this.tabEdit.delete(tab)) return;
    this.selectedTabXml = xml;
    if (heldByServer) this.deletedOnServer = { identifier: tab.identifier, at: Date.now() };
  }

  /** This seat's own peer cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /**
   * The moment written in the box of the log clearing, in epoch milliseconds; null while the box is
   * empty or holds no whole date and time.
   */
  get clearBeforeMoment(): number | null {
    const written = this.clearBefore().trim();
    if (!written) return null;
    const moment = new Date(written).getTime();
    return Number.isFinite(moment) ? moment : null;
  }

  /**
   * Whether a clearing can be done as it is set: always for the whole log, and for the lines before a
   * moment only once a whole date and time is written.
   */
  get canClearAsSet(): boolean {
    return !this.clearOnlyBefore() || this.clearBeforeMoment !== null;
  }

  /** The moment before which lines are cleared, as the hint under the box names it; empty for none. */
  get clearBeforeText(): string {
    const moment = this.clearBeforeMoment;
    return moment === null ? '' : formatLogMoment(moment);
  }

  /**
   * Clears the selected tab's log for every peer and posts who cleared it: all of it, or only the
   * lines said before the moment written in the box.
   *
   * Needs the confirmation box ticked and a tab this seat manages; clearing the whole log
   * resets the tab's portraits along with it. In a room server's room, anyone but the game master
   * leaves the dice the server rolled where they are, since the server keeps them.
   */
  deleteLog() {
    const tab = this.selectedTab();
    if (!tab || !this.allowDeleteLog || !this.isSelectionInReach() || !this.canClearAsSet) return;
    this.logClear.clear(tab, this.clearReach());
  }

  /**
   * Clears the logs of every tab this seat may read for every peer, all of each or only the lines said
   * before the moment written in the box, posting who cleared them in each; needs the confirmation box
   * ticked and a seat that may change the tabs. The tabs kept from this seat are left alone, and in a
   * room server's room anyone but the game master leaves the dice the server rolled where they are.
   */
  deleteLogALL() {
    if (!this.allowDeleteLog || !this.canEditTabs || !this.canClearAsSet) return;
    this.tabEdit.clearAll(this.clearReach());
  }

  private clearReach(): ChatLogClearReach | undefined {
    const moment = this.clearBeforeMoment;
    return !this.clearOnlyBefore() || moment === null ? undefined : { before: moment };
  }

  /** Whether the picked tab is still one this seat is listed, and so may save, clear or delete. */
  private isSelectionInReach(): boolean {
    const tab = this.selectedTab();
    return tab !== null && this.tabEdit.isOffered(tab);
  }

  /**
   * Puts the last deleted tab back into the room from the copy kept when it was removed, then
   * forgets the copy. The tab and its lines come back under their names, which are said to be coming
   * back first, as every other seat and a room server would delete them again.
   */
  restore() {
    if (!this.canEditTabs) return;
    if (this.selectedTab() && this.selectedTabXml) {
      this.deletedOnServer = null;
      this.objectStore.announceComingBack(identifiersInXml(this.selectedTabXml));
      const restoreTable = this.objectSerializer.parseXml(this.selectedTabXml)! as ChatTab;
      this.chatTabList.addChatTab(restoreTable);
      this.selectedTabXml = '';
      this.selectedTab.set(restoreTable);
    }
  }

  /**
   * Moves the selected tab one place up among the tabs this seat may read, keeping the system message
   * position on the same tab.
   */
  upTabIndex() {
    const tab = this.selectedTab();
    if (tab && this.isMovable) this.tabEdit.step(tab, -1);
  }

  /**
   * Moves the selected tab one place down among the tabs this seat may read, keeping the system
   * message position on the same tab.
   */
  downTabIndex() {
    const tab = this.selectedTab();
    if (tab && this.isMovable) this.tabEdit.step(tab, 1);
  }

  /** Selects the tab whose identifier is the value of the control that fired the event. */
  onSelectTab(event: Event): void {
    this.onChangeSelectTab((event.target as HTMLInputElement).value);
  }
}
