import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { presetSoundLabelKey } from '@axe/domain/media/preset-sound-labels';
import { TranslocoModule } from '@jsverse/transloco';

export interface AttachedSound {
  identifier: string;
  name: string;
}

@Component({
  selector: 'visual-novel-sound-board',
  templateUrl: './visual-novel-sound-board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'contents' },
})
export class VisualNovelSoundBoardComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly language = inject(LanguageService);
  private readonly t = inject(TRANSLATE_FN);

  readonly attach = output<AttachedSound>();
  readonly played = output<void>();

  private readonly seTick = signal(0);

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox');
  }

  /** What is typed into the sound board, which narrows every list in it. */
  readonly soundFilter = signal('');

  private matchesSoundFilter(name: string): boolean {
    const keyword = this.soundFilter().trim().toLowerCase();
    return keyword.length < 1 || name.toLowerCase().includes(keyword);
  }

  /** The sounds brought to this room, which is where somebody looks for their own first. */
  readonly soundEffects = computed<AttachedSound[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    return this.audioStorage.audios
      .filter((audio) => !audio.isHidden && AudioTag.get(audio.identifier)?.tag === 'SE')
      .map((audio) => ({ identifier: audio.identifier, name: audio.name }))
      .filter((sound) => this.matchesSoundFilter(sound.name));
  });

  /**
   * The sounds the tool comes with.
   *
   * They are kept hidden from the jukebox so its list is the room's own, but a scene wants a
   * door or a thunderclap without anybody having had to upload one. Named from the same words
   * the effect library uses, so the same sound reads the same wherever it is offered.
   */
  readonly presetSoundEffects = computed<AttachedSound[]>(() => {
    this.objectChange.fileVersion();
    this.language.currentLang();
    return (
      this.audioStorage.audios
        .filter((audio) => audio.isHidden)
        .map((audio) => ({ identifier: audio.identifier, labelKey: presetSoundLabelKey(audio.identifier) }))
        // A hidden sound with no name of its own is something else the room keeps out of sight.
        .filter((sound) => sound.labelKey.length > 0)
        .map((sound) => ({ identifier: sound.identifier, name: this.t(sound.labelKey) }))
        .filter((sound) => this.matchesSoundFilter(sound.name))
        .sort((left, right) => left.name.localeCompare(right.name, 'ja'))
    );
  });

  /** Cut-ins reach everybody, so a scene can be given a title card from here. */
  readonly cutIns = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(CutIn.aliasName)();
    return this.objectStore
      .getObjects<CutIn>(CutIn)
      .map((cutIn) => ({ identifier: cutIn.identifier, name: cutIn.name }))
      .filter((cutIn) => this.matchesSoundFilter(cutIn.name));
  });

  /**
   * Plays a cut-in for the whole room and reports that something was played; the cut-in is skipped
   * if it or the launcher is missing.
   */
  playCutIn(identifier: string): void {
    const cutIn = this.objectStore.get<CutIn>(identifier);
    const launcher = this.objectStore.get<CutInLauncher>('CutInLauncher');
    if (cutIn instanceof CutIn && launcher) launcher.startCutIn(cutIn);
    this.played.emit();
  }

  readonly bgmTracks = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    return this.audioStorage.audios.filter(
      (audio) => !audio.isHidden && (AudioTag.get(audio.identifier)?.tag ?? 'BGM') === 'BGM'
    );
  });

  readonly playingBgmIdentifier = computed(() => {
    this.seTick();
    const jukebox = this.jukebox;
    return jukebox?.isPlaying ? jukebox.audioIdentifier : '';
  });

  /** Plays a track on the room's jukebox and refreshes which track shows as playing. */
  playBgm(identifier: string): void {
    this.jukebox?.play(identifier);
    this.seTick.update((tick) => tick + 1);
  }

  /** Stops the room's jukebox and refreshes which track shows as playing. */
  stopBgm(): void {
    this.jukebox?.stop();
    this.seTick.update((tick) => tick + 1);
  }

  /**
   * Plays a sound through the room's jukebox; a sound tagged as a sound effect plays over the
   * music, and anything else replaces the track.
   */
  playSoundEffect(identifier: string): void {
    this.jukebox?.play(identifier);
  }

  /** Stops a sound effect playing through the room's jukebox. */
  stopSoundEffect(identifier: string): void {
    this.jukebox?.stopSE(identifier);
  }

  /**
   * Whether a sound effect is playing, which turns its button into a stop button; rechecked when
   * the board refreshes.
   */
  isSoundEffectPlaying(identifier: string): boolean {
    this.seTick();
    return this.jukebox?.isSePlaying(identifier) ?? false;
  }

  /** The board is asked again about what is playing whenever it is opened. */
  refresh(): void {
    this.seTick.update((tick) => tick + 1);
  }
}
