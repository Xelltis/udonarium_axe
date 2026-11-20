import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import {
  DEFAULT_NOTICE_PLACE,
  NOTICE_OFF,
  noticeRouteOf,
  SYSTEM_NOTICE_KINDS,
  SystemNoticeKind,
  withNoticeRoute,
} from '@axe/domain/chat/system-notices';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/** What a kind's choice shows where it is sent to a tab the reader may not read. */
const KEPT_TAB_ROUTE = '#kept';

/** Where each kind of notice the system writes into the chat goes. Only the master changes it. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-notice-settings',
  templateUrl: './room-notice-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomNoticeSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly visibleTabs = inject(VisibleChatTabsService).tabs;

  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  /** Where the room sends each kind of system notice, as it keeps them. */
  private readonly systemNotices = this.access.setting('systemNotices');
  readonly noticeKinds = SYSTEM_NOTICE_KINDS;
  readonly defaultNoticePlace = DEFAULT_NOTICE_PLACE;
  readonly noticeOff = NOTICE_OFF;
  readonly keptTabRoute = KEPT_TAB_ROUTE;

  /**
   * The chat tabs a notice may be sent to, the system tab among them, by identifier and name: those
   * the reader may read, which for the master, the one who chooses, is every tab of the room.
   */
  readonly noticeTabs = computed(() =>
    this.visibleTabs().map((tab) => ({ identifier: tab.identifier, name: tab.name }))
  );

  /**
   * Where each kind of system notice goes, as its choice shows it: empty where it always went, off,
   * or a tab still in the room. A tab since gone shows as where the kind always went, which is where
   * the notice then goes, and a tab kept from the reader shows as one, without its name.
   */
  readonly noticeRoutes = computed(() => {
    const routes = this.systemNotices.value;
    const tabs = new Set(this.noticeTabs().map((tab) => tab.identifier));
    const room = new Set(this.roomTabIdentifiers());
    return Object.fromEntries(
      SYSTEM_NOTICE_KINDS.map((kind) => {
        const route = noticeRouteOf(routes, kind);
        if (route === NOTICE_OFF || tabs.has(route)) return [kind, route];
        return [kind, room.has(route) ? KEPT_TAB_ROUTE : ''];
      })
    ) as Record<SystemNoticeKind, string>;
  });

  /** Whether some kind is sent to a tab kept from the reader, which its choice then shows as one. */
  readonly anyKeptTabRoute = computed(() => Object.values(this.noticeRoutes()).includes(KEPT_TAB_ROUTE));

  /** The identifiers of every tab of the room, read alongside the tabs the reader is offered. */
  private roomTabIdentifiers(): string[] {
    this.visibleTabs();
    return ChatTabList.instance.chatTabs.map((tab) => tab.identifier);
  }

  /**
   * Sends a kind of system notice to a tab, nowhere, or where it always went; only those the setting
   * lets write it change it.
   */
  setNoticeRoute(kind: SystemNoticeKind, route: string): void {
    this.systemNotices.value = withNoticeRoute(this.systemNotices.value, kind, route);
  }
}
