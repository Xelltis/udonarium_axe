import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatPreferencesService, ChatSettingScope } from '@axe/application/chat/chat-preferences.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { CHAT_SOUND_TYPES, ChatSoundSetting, ChatSoundType, playChatSound } from '@axe/domain/chat/chat-sound';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { canRoleViewTab } from '@axe/domain/chat/chat-tab-permission';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The reader's settings for the note a new chat line makes: on or off, which note and how loud,
 * either once for every tab or tab by tab, with a button to hear it.
 *
 * Both the chat's own settings and the sound settings show it, and both change the same settings,
 * kept in this browser.
 */
@Component({
  selector: 'ui-chat-sound-settings',
  templateUrl: './chat-sound-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, TranslocoModule],
  host: { class: 'block' },
})
export class UiChatSoundSettingsComponent {
  private readonly chatPrefs = inject(ChatPreferencesService);
  private readonly chatTabList = inject(ChatTabList);
  private readonly objectChange = inject(ObjectChangeService);

  readonly scopes: readonly ChatSettingScope[] = ['all', 'perTab'];
  readonly soundTypes = CHAT_SOUND_TYPES;

  readonly soundScope = computed(() => this.chatPrefs.sound().scope);
  readonly soundForAll = computed<ChatSoundSetting>(() => this.chatPrefs.sound().all);

  /**
   * The tabs a sound may be set for, each with what it is set to now.
   *
   * The system tab is in here: nobody speaks on it, but the room does, and a notice landing there
   * is as much worth a note - or worth silencing - as anybody's line. A tab the reader may not read
   * is left out.
   *
   * A row is followed by the tab's identifier, two tabs being free to share a name, while the
   * answer itself is kept under the name so that it survives the room being passed around.
   */
  readonly soundRows = computed<{ identifier: string; name: string; sound: ChatSoundSetting }[]>(() => {
    this.objectChange.collectionOf('chat-tab')();
    this.objectChange.trackMyCursor();
    this.chatPrefs.sound();
    const role = PeerCursor.myRole;
    return this.chatTabList.chatTabs
      .filter((tab) => canRoleViewTab(tab, role))
      .map((tab) => {
        this.objectChange.versionOf(tab.identifier)();
        return { identifier: tab.identifier, name: tab.name, sound: this.chatPrefs.soundOfTab(tab.name) };
      });
  });

  /** Chooses whether the sound a message makes is one setting for every tab or set tab by tab. */
  setSoundScope(scope: ChatSettingScope): void {
    this.chatPrefs.setSound({ ...this.chatPrefs.sound(), scope });
  }

  /** Changes the parts given of the message sound used for every tab, keeping the rest as they were. */
  setSoundForAll(sound: Partial<ChatSoundSetting>): void {
    const setting = this.chatPrefs.sound();
    this.chatPrefs.setSound({ ...setting, all: { ...setting.all, ...sound } });
  }

  /**
   * Changes the parts given of the message sound for the tab of this name, keeping the rest as they
   * were. Tabs are kept by name, so two tabs of one name share it.
   */
  setSoundOfTab(name: string, sound: Partial<ChatSoundSetting>): void {
    this.chatPrefs.setSoundOfTab(name, { ...this.chatPrefs.soundOfTab(name), ...sound });
  }

  /** Plays a sound at its volume so the reader can hear what it will be like; nothing plays at no volume. */
  playSoundPreview(sound: ChatSoundSetting): void {
    playChatSound(sound.type, '', sound.volume);
  }

  /** Turns the percentage from the volume slider into the 0 to 1 volume a sound setting keeps. */
  toVolume(value: string): number {
    return Number(value) / 100;
  }

  /** Turns a kept 0 to 1 volume into the whole percentage the slider and its label show. */
  toPercent(volume: number): number {
    return Math.round(volume * 100);
  }

  /**
   * Reads the choice from the sound dropdown as a sound type; the dropdown offers only known types,
   * so it is not checked.
   */
  asSoundType(value: string): ChatSoundType {
    return value as ChatSoundType;
  }
}
