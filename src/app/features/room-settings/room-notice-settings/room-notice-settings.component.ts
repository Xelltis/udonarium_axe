import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import {
  DEFAULT_NOTICE_PLACE,
  NOTICE_OFF,
  noticeRouteOf,
  SYSTEM_NOTICE_KINDS,
  SystemNoticeKind,
  withNoticeRoute,
} from '@axe/domain/chat/system-notices';
import { Config } from '@axe/domain/peer/config';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

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
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  readonly isSharedReadOnly = this.access.isSharedReadOnly;
  readonly noticeKinds = SYSTEM_NOTICE_KINDS;
  readonly defaultNoticePlace = DEFAULT_NOTICE_PLACE;
  readonly noticeOff = NOTICE_OFF;

  /** The room's chat tabs a notice may be sent to, the system tab among them, by identifier and name. */
  readonly noticeTabs = computed(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.versionOf('ChatTabList')();
    const tabs = this.objectStore.get<ChatTabList>('ChatTabList')?.chatTabs ?? [];
    return tabs.map((tab) => {
      this.objectChange.versionOf(tab.identifier)();
      return { identifier: tab.identifier, name: tab.name };
    });
  });

  /**
   * Where each kind of system notice goes, as its choice shows it: empty where it always went, off,
   * or a tab still in the room. A tab since gone shows as where the kind always went, which is where
   * the notice then goes.
   */
  readonly noticeRoutes = computed(() => {
    const routes = this.access.config().systemNotices;
    const tabs = new Set(this.noticeTabs().map((tab) => tab.identifier));
    return Object.fromEntries(
      SYSTEM_NOTICE_KINDS.map((kind) => {
        const route = noticeRouteOf(routes, kind);
        return [kind, route === NOTICE_OFF || tabs.has(route) ? route : ''];
      })
    ) as Record<SystemNoticeKind, string>;
  });

  /** Sends a kind of system notice to a tab, nowhere, or where it always went; only the master changes it. */
  setNoticeRoute(kind: SystemNoticeKind, route: string): void {
    if (this.isSharedReadOnly()) return;
    Config.instance.systemNotices = withNoticeRoute(Config.instance.systemNotices, kind, route);
  }
}
