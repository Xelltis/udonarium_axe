import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CHAT_FONT_SIZE_MAX,
  CHAT_FONT_SIZE_MIN,
  ChatPreferencesService,
  ChatSettingScope,
} from '@axe/application/chat/chat-preferences.service';
import { SystemAvatarKind, SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiChatSoundSettingsComponent } from '@axe/ui/components/chat-sound-settings/chat-sound-settings.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'chat-message-setting',
  templateUrl: './chat-message-setting.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule, UiChatSoundSettingsComponent],
})
export class ChatMessageSettingComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly chatPrefs = inject(ChatPreferencesService);
  private readonly systemAvatar = inject(SystemAvatarService);
  private readonly systemAvatarMenu = inject(SystemAvatarMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly roomPanels = inject(RoomPanelService);

  readonly systemAvatarVisible = this.systemAvatar.isVisible;
  readonly speakerAvatarVisible = this.systemAvatar.isSpeakerVisible;

  readonly systemAvatarRows = computed(() => [
    {
      kind: 'system' as SystemAvatarKind,
      labelKey: 'feature.chat.systemAvatar.kindSystem',
      url: this.systemAvatar.systemUrl(),
      hasOwnImage: this.systemAvatar.hasOwnSystemImage(),
    },
    {
      kind: 'dice' as SystemAvatarKind,
      labelKey: 'feature.chat.systemAvatar.kindDice',
      url: this.systemAvatar.diceUrl(),
      hasOwnImage: this.systemAvatar.hasOwnDiceImage(),
    },
  ]);

  readonly canEditRoom = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /**
   * Shows or hides System-chan, the avatar beside system messages and dice rolls, for everyone in
   * the room. Only a role that may edit the table can change it.
   */
  setSystemAvatarVisible(visible: boolean): void {
    if (!this.canEditRoom()) return;
    this.systemAvatar.setVisible(visible);
  }

  /**
   * Sets whether dice results show whoever rolled in place of System-chan, for everyone in the
   * room. Only a role that may edit the table can change it.
   */
  setSpeakerAvatarVisible(visible: boolean): void {
    if (!this.canEditRoom()) return;
    this.systemAvatar.setSpeakerVisible(visible);
  }

  /**
   * Opens the image picker to change System-chan's picture for system messages or for dice rolls.
   */
  changeSystemAvatarImage(kind: SystemAvatarKind): void {
    this.systemAvatarMenu.changeImage(kind);
  }

  /**
   * Puts System-chan's picture for system messages or for dice rolls back to the default. Only a
   * role that may edit the table can do it.
   */
  resetSystemAvatarImage(kind: SystemAvatarKind): void {
    if (!this.canEditRoom()) return;
    this.systemAvatar.resetImage(kind);
  }

  readonly autoFollowScroll = this.chatPrefs.autoFollowScroll;
  readonly showVnEmoteBadge = this.chatPrefs.showVnEmoteBadge;
  readonly showMessageCount = this.chatPrefs.showMessageCount;
  readonly fontSize = this.chatPrefs.fontSize;
  readonly minFontSize = CHAT_FONT_SIZE_MIN;
  readonly maxFontSize = CHAT_FONT_SIZE_MAX;

  /**
   * Sets whether the chat log scrolls down to follow new messages as they arrive, for this reader.
   */
  setAutoFollowScroll(v: boolean): void {
    this.chatPrefs.setAutoFollowScroll(v);
  }

  /**
   * Sets whether the expressions chosen in novel mode appear beside chat lines, for this reader.
   */
  setShowVnEmoteBadge(v: boolean): void {
    this.chatPrefs.setShowVnEmoteBadge(v);
  }

  /** Says whether a chat window's title carries the number of lines in the tab it is showing. */
  setShowMessageCount(v: boolean): void {
    this.chatPrefs.setShowMessageCount(v);
  }

  /**
   * Sets the chat text size from its box, rounded and kept within the sizes allowed; an emptied box
   * goes back to the default size.
   */
  onChangeFontSize(event: Event): void {
    this.chatPrefs.setFontSize((event.target as HTMLInputElement).valueAsNumber);
  }

  chatTabidentifier: string = '';

  /**
   * The chat tab this settings panel was opened from, or null when none was given or the tab is
   * gone.
   */
  get chatTab(): ChatTab | null {
    return this.objectStore.get<ChatTab>(this.chatTabidentifier) ?? null;
  }

  /**
   * The room's list of chat tabs, which holds the portrait and compact display settings edited
   * here.
   */
  get chatTabList(): ChatTabList {
    return this.objectStore.get<ChatTabList>('ChatTabList')!;
  }

  /**
   * Pulls the portrait size back to the smallest or largest allowed when the number given falls
   * outside them.
   */
  chkHeight(newNum: number) {
    if (newNum <= this.chatTabList.minPortraitSize) this.chatTabList.portraitHeight = this.chatTabList.minPortraitSize;
    if (newNum >= this.chatTabList.maxPortraitSize) this.chatTabList.portraitHeight = this.chatTabList.maxPortraitSize;
  }

  /**
   * Checks the portrait size box once its number is committed, pulling it back within the sizes
   * allowed.
   */
  onChkHeight(event: Event): void {
    this.chkHeight((event.target as HTMLInputElement).valueAsNumber);
  }

  readonly scopes: readonly ChatSettingScope[] = ['all', 'perTab'];

  readonly portraitScope = computed(() => this.chatPrefs.portrait().scope);
  readonly simpleScope = computed(() => this.chatPrefs.simple().scope);
  readonly portraitForAll = computed(() => this.chatPrefs.portrait().all !== 0);
  readonly simpleForAll = computed(() => this.chatPrefs.simple().all !== 0);

  /**
   * The tabs a reader may set a display answer for, once the answers differ per tab.
   *
   * The system tab is left out: what it shows is the room talking to itself, not a place
   * anyone speaks, and it takes what the rest of the room is set to. So is a tab the reader
   * may not read, whose name is none of their business.
   */
  readonly tabRows = computed<{ identifier: string; name: string; portrait: boolean; simple: boolean }[]>(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.trackMyCursor();
    const role = PeerCursor.myRole;
    return this.chatTabList.chatTabs
      .filter((tab) => !tab.isSystemTab && canRoleViewTab(tab, role))
      .map((tab) => {
        this.objectChange.versionOf(tab.identifier)();
        return {
          identifier: tab.identifier,
          name: tab.name,
          portrait: tab.portraitDisplayFlag !== 0,
          simple: tab.chatSimpleDispFlag !== 0,
        };
      });
  });

  /** Taking one answer for the room writes it onto every tab, so nothing is left behind. */
  setPortraitScope(scope: ChatSettingScope): void {
    this.chatPrefs.setPortrait({ scope, all: this.chatPrefs.portrait().all });
    if (scope === 'all') this.setPortraitForAll(this.portraitForAll());
  }

  /**
   * Chooses whether the compact display is one answer for every tab or set tab by tab. Taking one
   * answer writes it onto every tab.
   */
  setSimpleScope(scope: ChatSettingScope): void {
    this.chatPrefs.setSimple({ scope, all: this.chatPrefs.simple().all });
    if (scope === 'all') this.setSimpleForAll(this.simpleForAll());
  }

  /**
   * Shows or hides portraits on every tab at once, and keeps that as the one answer for all tabs.
   */
  setPortraitForAll(shown: boolean): void {
    this.chatPrefs.setPortrait({ scope: 'all', all: shown ? 1 : 0 });
    for (const tab of this.chatTabList.chatTabs) tab.portraitDisplayFlag = shown ? 1 : 0;
  }

  /**
   * Turns the compact display on or off for every tab at once, keeps that as the one answer for all
   * tabs, and redraws the chat.
   */
  setSimpleForAll(simple: boolean): void {
    this.chatPrefs.setSimple({ scope: 'all', all: simple ? 1 : 0 });
    for (const tab of this.chatTabList.chatTabs) tab.chatSimpleDispFlag = simple ? 1 : 0;
    this.uiSignalService.notifyChatRedraw();
  }

  /** Opens the panel holding every one of the reader's sound settings, the chat's note among them. */
  openSoundSettings(): void {
    this.roomPanels.open('soundSettings');
  }

  /** Shows or hides portraits on one tab. Does nothing for a tab that is gone. */
  setPortraitOfTab(identifier: string, shown: boolean): void {
    const tab = this.objectStore.get<ChatTab>(identifier);
    if (tab) tab.portraitDisplayFlag = shown ? 1 : 0;
  }

  /**
   * Turns the compact display on or off for one tab, and redraws the chat. Does nothing for a tab
   * that is gone.
   */
  setSimpleOfTab(identifier: string, simple: boolean): void {
    const tab = this.objectStore.get<ChatTab>(identifier);
    if (!tab) return;
    tab.chatSimpleDispFlag = simple ? 1 : 0;
    this.uiSignalService.notifyChatRedraw();
  }

  /** Redraws the chat after the compact display is changed. */
  changeSimpleDisp() {
    this.uiSignalService.notifyChatRedraw();
  }

  /** Redraws the chat once the box for showing times in the compact display is clicked. */
  changeDispFlagTime() {
    this.uiSignalService.notifyChatRedraw();
  }

  /** Redraws the chat once the box for showing IDs in the compact display is clicked. */
  changeDispFlagUserId() {
    this.uiSignalService.notifyChatRedraw();
  }

  /**
   * Answers a click on the box for showing portraits inside the window. The box writes the setting
   * itself, so there is nothing more to do.
   */
  changePortraitInWindow() {}

  /**
   * Answers a click on the box for keeping portraits outside the window. The box writes the setting
   * itself, so there is nothing more to do.
   */
  changeKeepPortraitOutWindow() {}
}
