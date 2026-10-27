import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PanelService } from '@axe/application/ui/panel.service';
import {
  ROOM_SETTINGS_TABS,
  ROOM_SETTINGS_UI_TABS,
  RoomSettingsTab,
  RoomSettingsUiTab,
} from '@axe/domain/ui/room-settings-tab';
import { RoomArchiveSettingsComponent } from '@axe/features/room-settings/room-archive-settings/room-archive-settings.component';
import { RoomGeneralSettingsComponent } from '@axe/features/room-settings/room-general-settings/room-general-settings.component';
import { RoomMoveRangeSettingsComponent } from '@axe/features/room-settings/room-move-range-settings/room-move-range-settings.component';
import { RoomNoticeSettingsComponent } from '@axe/features/room-settings/room-notice-settings/room-notice-settings.component';
import { RoomRoundSettingsComponent } from '@axe/features/room-settings/room-round-settings/room-round-settings.component';
import { RoomScreenSettingsComponent } from '@axe/features/room-settings/room-screen-settings/room-screen-settings.component';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { RoomSharedViewSettingsComponent } from '@axe/features/room-settings/room-shared-view-settings/room-shared-view-settings.component';
import { RoomUtilitySettingsComponent } from '@axe/features/room-settings/room-utility-settings/room-utility-settings.component';
import { RoomZocSettingsComponent } from '@axe/features/room-settings/room-zoc-settings/room-zoc-settings.component';
import { RoomZoneRideSettingsComponent } from '@axe/features/room-settings/room-zone-ride-settings/room-zone-ride-settings.component';
import { StampRulesEditorComponent } from '@axe/features/room-settings/stamp-rules/stamp-rules-editor.component';
import { SkinPickerComponent } from '@axe/features/skin/skin-picker/skin-picker.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The room settings: the room's own settings and rules of play, and what this screen shows, in
 * parts chosen from a strip of tabs. Each part is a component of its own, reading and writing the
 * room through {@link RoomSettingsAccessService}.
 *
 * A reader who may not edit is free to look through every part; what they may not change is held
 * still where it stands.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-settings-panel',
  templateUrl: './room-settings-panel.component.html',
  host: { class: 'block' },
  imports: [
    RoomArchiveSettingsComponent,
    RoomGeneralSettingsComponent,
    RoomMoveRangeSettingsComponent,
    RoomNoticeSettingsComponent,
    RoomRoundSettingsComponent,
    RoomScreenSettingsComponent,
    RoomSharedViewSettingsComponent,
    RoomUtilitySettingsComponent,
    RoomZocSettingsComponent,
    RoomZoneRideSettingsComponent,
    SkinPickerComponent,
    StampRulesEditorComponent,
    TranslocoModule,
  ],
})
export class RoomSettingsPanelComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);

  readonly tabs = ROOM_SETTINGS_TABS;
  readonly uiTabs = ROOM_SETTINGS_UI_TABS;
  readonly tab = signal<RoomSettingsTab>('general');
  readonly uiTab = signal<RoomSettingsUiTab>('shared');

  readonly isReadOnly = this.access.isReadOnly;

  constructor() {
    queueMicrotask(() => (this.panelService.title = this.t('feature.roomSettings.title')));
  }
}
