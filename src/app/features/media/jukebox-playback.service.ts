import { computed, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox, RepeatMode } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** A point in a track or its length, read out as minutes and seconds such as `1:05`; `0:00` for nothing sensible. */
export function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** A playlist as the jukebox's controls show it. */
export interface PlaylistView {
  identifier: string;
  name: string;
  label: string;
  count: number;
  isDefault: boolean;
  isActive: boolean;
}

/**
 * The room's music as the jukebox panel and the mini player both work it: what is playing, the
 * playlists, and the controls a music player has.
 *
 * Starting music from here first stops the cut-ins that have no tag, as music started anywhere
 * does.
 *
 * What plays changes for the whole room, so a guest, who is there to watch, changes none of it, and
 * only the game master turns shuffle and repeat, as with the room's other shared settings. A turn
 * of either is written in the system log under the name of whoever made it, so the room can see
 * who changed it.
 */
@Injectable({ providedIn: 'root' })
export class JukeboxPlaybackService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly t = inject(TRANSLATE_FN);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly chatMessage = inject(ChatMessageService);
  private readonly knownDurations = new Map<string, number>();

  /** Whether this reader may change what the room plays, which every role but a guest may. */
  readonly canOperate = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** Whether this reader may turn shuffle and repeat for the room, which only the game master may. */
  readonly canChangeModes = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditShared;
  });

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  private get cutInLauncher(): CutInLauncher | null {
    return this.objectStore.get<CutInLauncher>('CutInLauncher') ?? null;
  }

  /** Whether the room's track is playing. */
  readonly isPlaying = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isPlaying === true;
  });

  /** Whether the room's track is paused, to go on from where it stopped. */
  readonly isPaused = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isPaused ?? false;
  });

  /** The room's repeat mode. */
  readonly repeatMode = computed<RepeatMode>(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.repeatMode ?? 'none';
  });

  /** Whether the room plays its playlist shuffled. */
  readonly isShuffled = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.shuffles ?? false;
  });

  /** Every playlist in the room, in order, the one the room plays through marked. */
  readonly playlists = computed<PlaylistView[]>(() => {
    this.objectChange.collectionOf(Playlist.aliasName)();
    this.objectChange.versionOf('Jukebox')();
    const active = this.jukebox?.playlist?.identifier ?? Playlist.DEFAULT_IDENTIFIER;
    return Playlist.all().map((playlist) => {
      this.objectChange.versionOf(playlist.identifier)();
      return {
        identifier: playlist.identifier,
        name: playlist.name ?? '',
        label: this.labelOf(playlist),
        count: playlist.entries.length,
        isDefault: playlist.isDefault,
        isActive: playlist.identifier === active,
      };
    });
  });

  /** The playlist the room plays through. */
  readonly activePlaylist = computed<PlaylistView | null>(() => this.playlists().find((p) => p.isActive) ?? null);

  /**
   * The tracks the room plays through, as listed rather than as shuffled: the playlist's, or every
   * BGM in the library while it is empty. Tracks this peer cannot play are left out.
   */
  readonly queue = computed<AudioFile[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    this.objectChange.collectionOf(Playlist.aliasName)();
    this.objectChange.versionOf('Jukebox')();
    const playlist = this.jukebox?.playlist;
    if (playlist) this.objectChange.versionOf(playlist.identifier)();
    return (this.jukebox?.queue ?? [])
      .map((identifier) => this.audioStorage.get(identifier))
      .filter((audio): audio is AudioFile => audio !== null && !audio.isHidden);
  });

  /** The name a tag is shown under: the background sounds' tag translated, and any other as it is. */
  tagLabel(tag: string): string {
    return tag === AUDIO_TAG_BGS ? this.t('feature.media.jukebox.tagBgs') : tag;
  }

  /** The name a playlist goes by: the one it was given, or a stand-in until it has one. */
  labelOf(playlist: Playlist): string {
    const name = (playlist.name ?? '').trim();
    if (name) return name;
    return playlist.isDefault
      ? this.t('feature.media.jukebox.playlistDefaultName')
      : this.t('feature.media.jukebox.playlistUntitled');
  }

  /** The playlist with this identifier, or null when the room has none by it. */
  playlistOf(identifier: string): Playlist | null {
    const found = this.objectStore.get(identifier);
    return found instanceof Playlist ? found : null;
  }

  /** How far into the room's track it is, in seconds. */
  position(): number {
    return this.jukebox?.position ?? 0;
  }

  /** The length of the room's track in seconds, remembered from when it played if it is paused; 0 when unknown. */
  duration(): number {
    const jukebox = this.jukebox;
    if (!jukebox?.audioIdentifier) return 0;
    const playing = jukebox.isPlaying ? jukebox.duration : NaN;
    if (Number.isFinite(playing) && playing > 0) {
      this.knownDurations.set(jukebox.audioIdentifier, playing);
      return playing;
    }
    return this.knownDurations.get(jukebox.audioIdentifier) ?? 0;
  }

  /** Plays a track for the room, as the room's music or once as an effect when it is tagged SE. */
  play(audio: AudioFile): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.play(audio.identifier, AudioTag.get(audio.identifier)?.tag !== 'SE');
  }

  /** Plays a track of a playlist for the room and makes that the playlist the room goes on through. */
  playFromPlaylist(playlist: Playlist, audio: AudioFile): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.playFromPlaylist(playlist, audio.identifier);
  }

  /** Pauses the room's track, goes on with a paused one, or starts the playlist when nothing is held. */
  togglePlayPause(): void {
    const jukebox = this.jukebox;
    if (!jukebox || !this.rolePermission.canEditTabletop) return;
    if (jukebox.isPlaying) {
      jukebox.pause();
      return;
    }
    this.cutInLauncher?.stopBlankTagCutIn();
    if (jukebox.isPaused) jukebox.resume();
    else jukebox.playNext();
  }

  /** Stops the room's track and lets it go. */
  stop(): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.jukebox?.stop();
  }

  /** Plays the next track for the room. */
  next(): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.playNext();
  }

  /** Plays the previous track for the room, or starts the current one again when it is a few seconds in. */
  previous(): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.playPrevious();
  }

  /** Moves the room's track to a point in seconds. */
  seek(seconds: number): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.jukebox?.seek(seconds);
  }

  /** Turns shuffle on or off for the room, and writes in the system log who did. */
  toggleShuffle(): void {
    const jukebox = this.jukebox;
    if (!jukebox || !this.rolePermission.canEditShared) return;
    jukebox.setShuffled(!jukebox.shuffles);
    this.logChange(jukebox.shuffles ? 'shuffleOn' : 'shuffleOff');
  }

  /**
   * Steps the room's repeat mode on through none, the whole playlist and one track, and writes in
   * the system log who did and what it is now.
   */
  cycleRepeatMode(): void {
    const jukebox = this.jukebox;
    if (!jukebox || !this.rolePermission.canEditShared) return;
    jukebox.cycleRepeatMode();
    const logKeys: Record<RepeatMode, string> = { none: 'repeatNone', all: 'repeatAll', one: 'repeatOne' };
    this.logChange(logKeys[jukebox.repeatMode] ?? 'repeatNone');
  }

  private logChange(key: string): void {
    const name = PeerCursor.myCursor?.name ?? '';
    this.chatMessage.sendSystemMessage(encodeI18nMessage(`feature.media.jukebox.log.${key}`, { name }));
  }

  /** Makes a playlist the one the room plays through and starts it from the top. */
  playPlaylist(identifier: string): void {
    const playlist = this.playlistOf(identifier);
    if (!playlist || !this.rolePermission.canEditTabletop) return;
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.playPlaylist(playlist);
  }

  /** Moves the room on to the playlist after or before the one it plays through, going round, and starts it. */
  stepPlaylist(direction: 1 | -1): void {
    const playlists = this.playlists();
    if (playlists.length < 2) return;
    const index = playlists.findIndex((playlist) => playlist.isActive);
    const target = playlists[(index + direction + playlists.length) % playlists.length];
    this.playPlaylist(target.identifier);
  }
}
