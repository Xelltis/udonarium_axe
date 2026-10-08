import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { PersonalVolumeKind } from '@axe/application/media/personal-volumes';
import { RoomVolumeService } from '@axe/application/media/room-volume.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { RoomVolumeKind } from '@axe/domain/media/room-volumes';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import {
  buildLibraryTrackMenu,
  buildPlaylistTrackMenu,
  PlaylistTarget,
} from '@axe/features/media/jukebox/playlist-context-menu';
import { formatTrackTime, JukeboxPlaybackService, PlaylistView } from '@axe/features/media/jukebox-playback.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiVolumeRowComponent } from '@axe/ui/components/volume-row/volume-row.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-jukebox',
  templateUrl: './jukebox.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule, UiVolumeRowComponent],
})
export class JukeboxComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);
  protected readonly playback = inject(JukeboxPlaybackService);
  protected readonly backgroundSounds = inject(BackgroundSoundPlaybackService);
  private readonly personalVolumes = inject(PersonalVolumeService);
  private readonly roomVolumes = inject(RoomVolumeService);

  /** Whether this player may move the room volume, which only the game master may, as with the room's other settings. */
  readonly canChangeRoomVolume = this.roomVolumes.canChange;

  /** Whether this player may change what the room plays, which a guest may not. */
  readonly canOperate = this.playback.canOperate;

  /** Whether this player may turn shuffle and repeat, which only the game master may. */
  readonly canChangeModes = this.playback.canChangeModes;

  /**
   * The room-wide volume every player's sound is multiplied by, from the room volume slider.
   *
   * It lives in the room's synced config, so changing it changes what everyone hears, and only the
   * game master may change it. Reads 1 before the config exists.
   */
  get roomVolume(): number {
    return this.roomVolumes.volume();
  }

  set roomVolume(volume: number) {
    this.roomVolumes.set(volume);
  }

  /** The room's volume for one kind of sound, from 0 to 2, which its overall volume scales in turn. */
  roomVolumeOf(kind: RoomVolumeKind): number {
    return this.roomVolumes.volumes()[kind];
  }

  /** Sets the room's volume for one kind of sound for everyone. Only the game master may. */
  setRoomVolumeOf(kind: RoomVolumeKind, volume: number): void {
    this.roomVolumes.setKind(kind, volume);
  }

  /** Whether this player has turned a kind of sound off for themselves. */
  isMuted(kind: PersonalVolumeKind): boolean {
    return this.personalVolumes.isMuted(kind);
  }

  /** Turns a kind of sound off or back on for this player alone, remembered in this browser. */
  setMuted(kind: PersonalVolumeKind, muted: boolean): void {
    this.personalVolumes.setMuted(kind, muted);
  }

  /** Opens the panel holding every one of this player's sound settings, beside the pointer. */
  openSoundSettings(): void {
    const coordinate = this.pointerDeviceService.pointers[0];
    this.roomPanels.open('soundSettings', { left: coordinate.x + 25, top: coordinate.y + 25 });
  }

  /**
   * This player's own BGM volume, heard at once scaled by the room volume. Not shared, and
   * remembered in this browser like the other volumes of this player's own.
   */
  get volume(): number {
    return this.personalVolumes.get('bgm');
  }
  set volume(volume: number) {
    this.personalVolumes.set('bgm', volume);
  }

  /** This player's volume for previewing a track alone. */
  get auditionVolume(): number {
    return this.personalVolumes.get('audition');
  }
  set auditionVolume(auditionVolume: number) {
    this.personalVolumes.set('audition', auditionVolume);
  }

  /** This player's sound-effect volume. */
  get seVolume(): number {
    return this.personalVolumes.get('se');
  }
  set seVolume(seVolume: number) {
    this.personalVolumes.set('se', seVolume);
  }

  /** This player's volume for the room's background sounds. */
  get backgroundVolume(): number {
    return this.personalVolumes.get('background');
  }
  set backgroundVolume(backgroundVolume: number) {
    this.personalVolumes.set('background', backgroundVolume);
  }

  readonly allTag = computed(() => this.t('feature.media.jukebox.tagAll'));

  readonly audios = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    this.objectChange.versionOf('Jukebox')();
    const all = this.audioStorage.audios.filter((audio) => !audio.isHidden);
    const tag = this.selectTag();
    if (tag === this.allTag()) return all;
    return all.filter((audio) => {
      const audioTag = AudioTag.get(audio.identifier);
      const t = audioTag?.tag || 'BGM';
      return t === tag;
    });
  });

  readonly selectTag = signal(this.t('feature.media.jukebox.tagAll'));

  readonly viewMode = signal<'library' | 'playlist'>('library');

  private readonly chosenPlaylist = signal<string | null>(null);

  /**
   * The playlist the playlist tab shows and the library adds to: the one picked in the tab, or the
   * one the room plays through until one is picked or the picked one is deleted.
   */
  readonly viewedPlaylist = computed<PlaylistView | null>(() => {
    const playlists = this.playback.playlists();
    const chosen = this.chosenPlaylist();
    return (
      playlists.find((playlist) => playlist.identifier === chosen) ??
      playlists.find((playlist) => playlist.isActive) ??
      playlists[0] ??
      null
    );
  });

  readonly playlistAudios = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf('Jukebox')();
    const viewed = this.viewedPlaylist();
    if (viewed) this.objectChange.versionOf(viewed.identifier)();
    const entries = this.playlist?.entries ?? [];
    return entries.map((id) => this.audioStorage.get(id)).filter((a): a is AudioFile => a !== null && !a.isHidden);
  });

  /** Every track that is on some playlist, which keeps its tag. */
  private readonly tracksOnPlaylists = computed(() => {
    const held = new Set<string>();
    for (const view of this.playback.playlists()) {
      for (const identifier of this.playback.playlistOf(view.identifier)?.entries ?? []) held.add(identifier);
    }
    return held;
  });

  /** Whether the seek bar is being dragged, and where to, from 0 to 1, so playback moving on does not pull it back. */
  readonly isSeeking = signal(false);
  readonly seekPreview = signal(0);

  /**
   * The position and length of the room's track, read out as `1:23 / 4:56`. Empty while nothing is
   * held, leaving the space it takes so the seek bar keeps its length when a track starts.
   */
  readonly timeDisplay = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    if (!this.playback.isPlaying() && !this.playback.isPaused()) return '';
    const duration = this.playback.duration();
    const at = this.isSeeking() ? this.seekPreview() * duration : this.playback.position();
    return `${formatTrackTime(at)} / ${duration > 0 ? formatTrackTime(duration) : '—'}`;
  });

  /** How far through the room's track it is, from 0 to 1. */
  readonly progress = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    const duration = this.playback.duration();
    return duration > 0 ? Math.min(1, this.playback.position() / duration) : 0;
  });

  /** Where the seek bar stands: where it is being dragged to, or how far through the track it is. */
  readonly displayProgress = computed(() => (this.isSeeking() ? this.seekPreview() : this.progress()));

  /** Whether the seek bar is locked for the whole room. */
  readonly isSeekLocked = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isSeekLocked ?? true;
  });

  private dragFromIndex: number | null = null;

  readonly tagList = computed((): string[] => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    const tags = new Set<string>(JukeboxComponent.PRESET_TAGS);
    for (const audio of this.audioStorage.audios) {
      if (audio.isHidden) continue;
      const audioTag = AudioTag.get(audio.identifier);
      const t = audioTag?.tag || 'BGM';
      tags.add(t);
    }
    const sorted = [...tags].sort();
    return [this.allTag(), ...sorted];
  });

  static readonly PRESET_TAGS = ['BGM', 'SE', AUDIO_TAG_BGS];

  /** The tag a track is filed under, which is BGM for a track that was never tagged. */
  getTagOf(audio: AudioFile): string {
    return AudioTag.get(audio.identifier)?.tag || 'BGM';
  }

  /** Whether a track is tagged to loop underneath the music as a background sound. */
  isBackgroundSound(audio: AudioFile): boolean {
    return this.getTagOf(audio) === AUDIO_TAG_BGS;
  }

  /** Lets this player hear a background sound's room volume while its slider is dragged. */
  onBackgroundVolumeInput(audioIdentifier: string, event: Event): void {
    this.backgroundSounds.previewVolume(audioIdentifier, (event.target as HTMLInputElement).valueAsNumber);
  }

  /** Sets a background sound's volume for the whole room where its slider was let go. */
  onBackgroundVolumeChange(audioIdentifier: string, event: Event): void {
    this.backgroundSounds.commitVolume(audioIdentifier, (event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * Files a track under a tag, from the tag dropdown in the library.
   *
   * The tag is a synced object, so the room sees the change. A track in the playlist keeps its tag.
   */
  setTagOf(audio: AudioFile, tag: string) {
    if (!this.canOperate() || this.isOnAnyPlaylist(audio)) return;
    let audioTag = AudioTag.get(audio.identifier);
    if (!audioTag) audioTag = AudioTag.create(audio.identifier);
    audioTag.tag = tag;
    this.objectChange.notifyCollectionChanged('audio-tag');
  }

  /** Whether a track is on the playlist shown; false while there is none. */
  isInPlaylist(audio: AudioFile): boolean {
    return this.playlist?.hasEntry(audio.identifier) ?? false;
  }

  /** Whether a track is on any of the room's playlists, which keeps its tag from being changed. */
  isOnAnyPlaylist(audio: AudioFile): boolean {
    return this.tracksOnPlaylists().has(audio.identifier);
  }

  /** Adds a BGM track to the playlist shown. */
  addToPlaylist(audio: AudioFile): void {
    if (!this.canOperate()) return;
    this.playlist?.addEntry(audio.identifier);
  }

  /** Takes a track off the playlist shown. */
  removeFromPlaylist(audio: AudioFile): void {
    if (!this.canOperate()) return;
    this.playlist?.removeEntry(audio.identifier);
  }

  /** Shows a playlist in the playlist tab, which is also where the library adds tracks. */
  choosePlaylist(identifier: string): void {
    this.chosenPlaylist.set(identifier);
  }

  /** Makes a new, empty playlist for the room and shows it. */
  createPlaylist(): void {
    if (!this.canOperate()) return;
    const count = this.playback.playlists().length;
    const playlist = Playlist.create(this.t('feature.media.jukebox.playlistNewName', { number: count + 1 }));
    this.chosenPlaylist.set(playlist.identifier);
    this.viewMode.set('playlist');
  }

  /** Renames the playlist shown. An empty name puts back the stand-in it goes by. */
  renamePlaylist(name: string): void {
    if (!this.canOperate()) return;
    const playlist = this.playlist;
    const next = name.trim();
    if (playlist && playlist.name !== next) playlist.name = next;
  }

  /**
   * Deletes the playlist shown, once whoever asked has said they mean it. The room's first playlist
   * cannot be deleted.
   *
   * The track playing goes on. When it was the playlist the room plays through, the room goes on
   * through its first playlist after that track.
   */
  async deletePlaylist(): Promise<void> {
    const playlist = this.playlist;
    if (!playlist || playlist.isDefault || !this.canOperate()) return;
    const label = this.playback.labelOf(playlist);
    if (!(await this.confirm.ask(this.t('feature.media.jukebox.deletePlaylistConfirm', { name: label })))) return;
    if (this.jukebox?.playlistIdentifier === playlist.identifier) this.jukebox.playlistIdentifier = '';
    this.chosenPlaylist.set(null);
    playlist.destroy();
  }

  /** Starts the playlist shown from its first track for the whole room. */
  playViewedPlaylist(): void {
    const viewed = this.viewedPlaylist();
    if (viewed) this.playback.playPlaylist(viewed.identifier);
  }

  /** Plays a track of the playlist shown for the whole room, and goes on through that playlist. */
  playFromPlaylist(audio: AudioFile): void {
    const playlist = this.playlist;
    if (playlist) this.playback.playFromPlaylist(playlist, audio);
  }

  /** Every playlist as somewhere a track could go, marked where it is already. */
  private targetsFor(audio: AudioFile): PlaylistTarget[] {
    return this.playback.playlists().map((view) => ({
      identifier: view.identifier,
      label: view.label,
      holdsTrack: this.playback.playlistOf(view.identifier)?.hasEntry(audio.identifier) ?? false,
    }));
  }

  /** Puts a library track on a playlist or takes it off, from its menu. Only music goes on a playlist. */
  onLibraryContextMenu(event: MouseEvent, audio: AudioFile): void {
    if (this.getTagOf(audio) !== 'BGM' || !this.canOperate() || !this.pointerDeviceService.isAllowedToOpenContextMenu)
      return;
    const actions = buildLibraryTrackMenu(
      this.targetsFor(audio),
      {
        addTo: (identifier) => this.playback.playlistOf(identifier)?.addEntry(audio.identifier),
        removeFrom: (identifier) => this.playback.playlistOf(identifier)?.removeEntry(audio.identifier),
      },
      this.t
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, audio.name);
  }

  /** Remembers which playlist row a drag started from. */
  onPlaylistDragStart(index: number): void {
    if (!this.canOperate()) return;
    this.dragFromIndex = index;
  }

  /**
   * Moves the dragged track to the row it passes over, so the list reorders while dragging.
   *
   * Each move is written to the synced playlist, and the dragged row's index follows it.
   */
  onPlaylistDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (this.dragFromIndex === null || this.dragFromIndex === index) return;
    this.playlist?.moveEntry(this.dragFromIndex, index);
    this.dragFromIndex = index;
  }

  /** Forgets the dragged row once the drag ends. */
  onPlaylistDragEnd(): void {
    this.dragFromIndex = null;
  }

  /**
   * Moves a track of the playlist from its menu, opened by a right click or a press held on it.
   *
   * The playlist is otherwise put in order by dragging, which a touch screen may not start. A
   * track is moved beside the one shown next to it, since tracks that are hidden or not here yet
   * stand in the list without being shown.
   */
  onPlaylistContextMenu(event: MouseEvent, audio: AudioFile): void {
    const playlist = this.playlist;
    if (!playlist || !this.canOperate() || !this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const shown = this.playlistAudios();
    const index = shown.indexOf(audio);
    if (index < 0) return;
    const moveOnto = (neighbor: AudioFile) =>
      playlist.moveEntry(playlist.entries.indexOf(audio.identifier), playlist.entries.indexOf(neighbor.identifier));
    const reorder = buildReorderContextMenu(
      { index, count: shown.length },
      {
        moveToTop: () => moveOnto(shown[0]),
        moveUp: () => moveOnto(shown[index - 1]),
        moveDown: () => moveOnto(shown[index + 1]),
        moveToBottom: () => moveOnto(shown[shown.length - 1]),
      },
      this.t
    );
    const actions = buildPlaylistTrackMenu(
      reorder,
      this.targetsFor(audio).filter((target) => target.identifier !== playlist.identifier),
      {
        moveTo: (identifier) => {
          this.playback.playlistOf(identifier)?.addEntry(audio.identifier);
          playlist.removeEntry(audio.identifier);
        },
        copyTo: (identifier) => this.playback.playlistOf(identifier)?.addEntry(audio.identifier),
      },
      this.t
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, audio.name);
  }
  /** The room's synced jukebox, which plays BGM and sound effects for everyone. */
  get jukebox(): Jukebox {
    return this.objectStore.get<Jukebox>('Jukebox')!;
  }

  /** The playlist the playlist tab shows, or null before the room has one. */
  get playlist(): Playlist | null {
    const viewed = this.viewedPlaylist();
    return viewed ? this.playback.playlistOf(viewed.identifier) : null;
  }

  readonly auditionPlayer: AudioPlayer = new AudioPlayer();

  private readonly _tick = signal(0);

  readonly nowPlayingArtwork = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audio?.artworkUrl ?? null;
  });

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.media.jukebox.title')));
    this.auditionPlayer.volumeType = VolumeType.AUDITION;
    this.destroyRef.onDestroy(() => this.stop());
    const timer = setInterval(() => this._tick.update((v) => v + 1), 500);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** Previews a track for this player only, from its audition button. */
  play(audio: AudioFile) {
    this.auditionPlayer.play(audio);
  }

  /** Stops this player's preview; also called when the panel closes. */
  stop() {
    this.auditionPlayer.stop();
  }

  /**
   * Plays a track for the whole room, from its play button.
   *
   * Cut-ins with no tag are stopped first. A track tagged SE sounds once as an effect; any other
   * becomes the room's BGM.
   */
  playBGM(audio: AudioFile) {
    this.playback.play(audio);
  }

  /** Stops the room's BGM, but only if this track is the one playing. */
  stopBGM(audio: AudioFile) {
    if (this.jukebox.audio === audio) this.playback.stop();
  }

  /** Stops a sound effect for the whole room. */
  stopSE(audio: AudioFile) {
    if (!this.canOperate()) return;
    this.jukebox.stopSE(audio.identifier);
  }

  /** Whether a sound effect is sounding on this player's side, which swaps its play button for stop. */
  isSePlaying(audio: AudioFile): boolean {
    return this.jukebox.isSePlaying(audio.identifier);
  }

  /**
   * Loads the audio files chosen in the file input into the room.
   *
   * A role that may not edit the table loads nothing. The input is cleared either way, so the same
   * file can be chosen again.
   */
  handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!this.rolePermission.canEditTabletop) {
      input.value = '';
      return;
    }
    const files = input.files;
    if (files && files.length) this.fileArchiver.load(files);
    input.value = '';
  }

  /** Locks or unlocks the seek bar for the whole room. */
  toggleSeekLock(): void {
    if (this.jukebox && this.canOperate()) this.jukebox.isSeekLocked = !this.jukebox.isSeekLocked;
  }

  /** Shows where the seek bar is being dragged to without moving playback yet. */
  onSeekInput(event: Event): void {
    this.isSeeking.set(true);
    this.seekPreview.set((event.target as HTMLInputElement).valueAsNumber / 100);
  }

  /** Moves the room's track to where the seek bar was let go, while its length is known, and ends the drag. */
  onSeekCommit(event: Event): void {
    const duration = this.playback.duration();
    if (duration > 0) this.playback.seek(((event.target as HTMLInputElement).valueAsNumber / 100) * duration);
    this.isSeeking.set(false);
  }

  /** Opens the cut-in list panel beside the pointer. */
  openCutInList() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = { left: coordinate.x + 25, top: coordinate.y + 25, width: 980, height: 760 };
    this.roomPanels.open('cutInList', option);
  }
}
