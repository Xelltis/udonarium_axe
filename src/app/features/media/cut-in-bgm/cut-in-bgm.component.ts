import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-cut-in-bgm',
  templateUrl: './cut-in-bgm.component.html',
  imports: [TranslocoModule],
})
export class CutInBgmComponent {
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The label for a tag filter tab, translating the built-in all, BGM and SE tabs and leaving any
   * other tag as it is.
   */
  displayTab(tab: string): string {
    if (tab === '全て') return this.t('feature.media.cutIn.bgmTabAll');
    if (tab === 'BGM') return this.t('feature.media.cutIn.bgmTabBgm');
    if (tab === 'SE') return this.t('feature.media.cutIn.bgmTabSe');
    return tab;
  }

  static readonly TAGS = ['全て', 'BGM', 'SE'] as const;

  readonly selectTag = signal<string>('全て');

  readonly audios = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    return this.audioStorage.audios.filter((audio) => !audio.isHidden);
  });

  readonly filteredAudios = computed(() => {
    const tag = this.selectTag();
    const all = this.audios();
    if (tag === '全て') return all;
    return all.filter((audio) => (AudioTag.get(audio.identifier)?.tag ?? 'BGM') === tag);
  });

  /**
   * The tag an audio file is filed under, BGM when it has none; shown as a badge on each row, with
   * SE picked out.
   */
  tagOf(audio: AudioFile): string {
    return AudioTag.get(audio.identifier)?.tag ?? 'BGM';
  }
  /** The room's shared jukebox object. */
  get jukebox(): Jukebox {
    return this.objectStore.get<Jukebox>('Jukebox')!;
  }

  readonly auditionPlayer: AudioPlayer = new AudioPlayer();

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.media.cutIn.bgmTitle')));
    this.auditionPlayer.volumeType = VolumeType.AUDITION;
    this.destroyRef.onDestroy(() => this.stop());
  }

  /**
   * Auditions an audio file for the local user alone, at the audition volume, when the user presses
   * its play button.
   */
  play(audio: AudioFile) {
    this.auditionPlayer.play(audio);
  }

  /** Stops the audition; it also runs when the picker closes. */
  stop() {
    this.auditionPlayer.stop();
  }

  /**
   * Closes the picker with the chosen audio file's identifier as its result; does nothing without a
   * file.
   */
  selectBgm(file: AudioFile) {
    if (!file) return;

    this.modalService.resolve(file.identifier);
  }

  /**
   * Loads the files picked in a file input through the file archiver, as dropped files are; ignored
   * for a user who cannot edit the tabletop.
   */
  handleFileSelect(event: Event) {
    if (!this.rolePermission.canEditTabletop) return;
    const files = (event.target as HTMLInputElement).files;
    if (files && files.length) this.fileArchiver.load(files);
  }
}
