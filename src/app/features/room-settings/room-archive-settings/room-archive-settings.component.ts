import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { RoomSnapshotPanelComponent } from '@axe/features/room-archive/room-snapshot-panel/room-snapshot-panel.component';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/** The copies of the room this device keeps: whether it keeps them, and the copies it has. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-archive-settings',
  templateUrl: './room-archive-settings.component.html',
  host: { class: 'contents' },
  imports: [RoomSnapshotPanelComponent, TranslocoModule],
})
export class RoomArchiveSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly roomSnapshot = inject(RoomSnapshotService);

  readonly isReadOnly = this.access.isReadOnly;
  readonly isKeeping = this.roomSnapshot.isKeeping;

  /**
   * Starts or stops keeping copies of the room on this device, from the checkbox; the copies never
   * leave the device.
   */
  setKeeping(event: Event): void {
    this.roomSnapshot.setKeeping((event.target as HTMLInputElement).checked);
  }
}
