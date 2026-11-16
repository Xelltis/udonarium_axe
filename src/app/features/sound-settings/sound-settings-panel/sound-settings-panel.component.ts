import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { RoomVolumeService } from '@axe/application/media/room-volume.service';
import { ROOM_SOUND_KIND_ROWS, SOUND_KIND_ROWS } from '@axe/application/media/sound-kind-rows';
import { UiChatSoundSettingsComponent } from '@axe/ui/components/chat-sound-settings/chat-sound-settings.component';
import { UiVolumeRowComponent } from '@axe/ui/components/volume-row/volume-row.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Every sound setting of the listener's in one place: a volume for each kind of sound, each of
 * which can be turned off; the note a chat line makes; and the room's volumes, overall and for each
 * kind, which only the game master may change.
 *
 * Everything but the room's volumes is the listener's own, kept in this browser and never sent to
 * the room.
 */
@Component({
  selector: 'sound-settings-panel',
  templateUrl: './sound-settings-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, UiVolumeRowComponent, UiChatSoundSettingsComponent],
  host: { class: 'block h-full' },
})
export class SoundSettingsPanelComponent {
  protected readonly volumes = inject(PersonalVolumeService);
  protected readonly roomVolumes = inject(RoomVolumeService);

  protected readonly rows = SOUND_KIND_ROWS;
  protected readonly roomRows = ROOM_SOUND_KIND_ROWS;
}
