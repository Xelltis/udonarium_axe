import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WIDGET_ROOM_RESTORE } from '@axe/application/ui/widget-place';
import { Network } from '@axe/core/network/network';
import { parseInviteLink } from '@axe/domain/peer/invite-link';
import { formatSnapshotSavedAt } from '@axe/features/room-archive/snapshot-format';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

const TOP_MARGIN = 12;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-room-restore-banner',
  templateUrl: './room-restore-banner.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, NgClass, TranslocoModule],
})
export class RoomRestoreBannerComponent {
  private readonly roomSnapshot = inject(RoomSnapshotService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly localModePreference = inject(LocalModePreferenceService);
  protected readonly widgetName = WIDGET_ROOM_RESTORE;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, (window.innerWidth - el.offsetWidth) / 2),
    top: TOP_MARGIN,
  });
  protected readonly isCompact = inject(ViewportService).isCompact;

  private readonly dismissed = signal(false);

  protected readonly latest = computed(() => this.roomSnapshot.snapshots()[0] ?? null);

  protected readonly savedAtLabel = computed(() => {
    const latest = this.latest();
    return latest ? formatSnapshotSavedAt(latest.savedAt) : '';
  });

  protected readonly visible = computed(() => {
    this.objectChange.networkVersion();
    if (this.dismissed()) return false;
    if (!this.roomSnapshot.isSupported) return false;
    if (this.latest() === null) return false;
    if (!this.localModePreference.enabled() && parseInviteLink(location.hash) !== null) return false;
    if (Network.peerContext?.roomName) return false;
    return this.rolePermission.canEditTabletop;
  });

  protected readonly isRestoring = this.roomSnapshot.isRestoring;

  constructor() {
    void this.roomSnapshot.refresh();
  }

  protected async restore(): Promise<void> {
    const latest = this.latest();
    if (!latest) return;
    const isRestored = await this.roomSnapshot.restore(latest.id);
    if (isRestored) this.dismissed.set(true);
  }

  protected dismiss(): void {
    this.dismissed.set(true);
  }
}
