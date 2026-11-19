import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { readAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { chooseMusic, moodWords, type MusicCandidate } from '@axe/domain/media/music-choice';
import { Playlist } from '@axe/domain/media/playlist';
import { BoardScene, sceneBgmOf } from '@axe/domain/scene/board-scene';
import { findOne, textArg } from '@axe/features/agent-tools/agent-lookup';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';

/** How many other candidates a choice by mood tells of. */
const OTHERS = 5;

/**
 * The AI link's tools for the room's music: what there is to play and what plays, and putting on a
 * track, a playlist or whatever suits the words of a mood, as the jukebox's own hand does. A tag, a
 * track's name, the playlists that hold it and, for the game master's seat, the scenes that put it on
 * are what a mood is matched against; the room keeps no mood of its own for a track.
 */
@Injectable({ providedIn: 'root' })
export class AgentMusicTools {
  private readonly audioStorage = inject(AudioStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly playback = inject(JukeboxPlaybackService);
  private readonly permission = inject(RolePermissionService);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    list_music: () => this.list(),
    play_music: (args) => this.play(args),
  };

  /** The tracks that can be played as music: every sound this peer holds but sound effects and ambient sounds. */
  private tracks(): AudioFile[] {
    return this.audioStorage.audios.filter((audio) => {
      const tag = AudioTag.get(audio.identifier)?.tag ?? '';
      return !audio.isHidden && tag !== 'SE' && tag !== AUDIO_TAG_BGS;
    });
  }

  /** The scenes this seat may know of, which are the game master's preparation: none for anyone else. */
  private scenes(): BoardScene[] {
    return this.permission.isGameMaster() ? this.objectStore.getObjects<BoardScene>(BoardScene) : [];
  }

  private list(): unknown {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    const playlists = Playlist.all();
    return {
      playing: jukebox?.audioIdentifier
        ? {
            track: this.audioStorage.get(jukebox.audioIdentifier)?.name ?? jukebox.audioIdentifier,
            playlist: jukebox.playlist ? this.playback.labelOf(jukebox.playlist) : null,
            paused: !jukebox.isPlaying,
          }
        : null,
      tracks: this.tracks().map((audio) => {
        const analysis = readAudioAnalysis(AudioTag.get(audio.identifier)?.analysis ?? '');
        return {
          id: audio.identifier,
          name: audio.name,
          tag: AudioTag.get(audio.identifier)?.tag ?? '',
          playlists: playlists
            .filter((playlist) => playlist.entries.includes(audio.identifier))
            .map((playlist) => this.playback.labelOf(playlist)),
          ...(analysis
            ? { seconds: Math.round(analysis.duration), bpm: analysis.bpm, loudness_lufs: analysis.lufs }
            : {}),
        };
      }),
      playlists: playlists.map((playlist) => ({
        id: playlist.identifier,
        name: this.playback.labelOf(playlist),
        tracks: playlist.entries.length,
      })),
      scenes: this.scenes().flatMap((scene) => {
        const music = sceneBgmOf(scene);
        if (!music || music.mode === 'stop') return [];
        const playing =
          music.mode === 'track'
            ? (this.audioStorage.get(music.identifier)?.name ?? music.identifier)
            : music.name || music.identifier;
        return [{ name: scene.name, folder: scene.folderName, music: playing }];
      }),
    };
  }

  private play(args: Readonly<Record<string, unknown>>): unknown {
    const given = ['track', 'playlist', 'mood'].filter((name) => textArg(args, name).trim().length > 0);
    if (given.length !== 1) {
      throw new AgentToolError('invalid_input', 'Give exactly one of track, playlist or mood.');
    }
    if (given[0] === 'track') return this.playTrack(textArg(args, 'track'));
    if (given[0] === 'playlist') return this.playPlaylist(textArg(args, 'playlist'));
    return this.playMood(textArg(args, 'mood'));
  }

  private playTrack(reference: string): unknown {
    const audio = findOne(
      this.tracks(),
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'track'
    );
    this.playback.play(audio);
    return { playing: { kind: 'track', id: audio.identifier, name: audio.name } };
  }

  private playPlaylist(reference: string): unknown {
    const playlist = findOne(
      Playlist.all(),
      reference,
      (each) => each.identifier,
      (each) => this.playback.labelOf(each),
      'playlist'
    );
    if (playlist.entries.length < 1)
      throw new AgentToolError('failed', `${this.playback.labelOf(playlist)} holds no track.`);
    this.playback.playPlaylist(playlist.identifier);
    return { playing: { kind: 'playlist', id: playlist.identifier, name: this.playback.labelOf(playlist) } };
  }

  /** Plays what best suits the words of a mood, and tells which words found it and what else they found. */
  private playMood(mood: string): unknown {
    const words = moodWords(mood);
    const found = chooseMusic(words, this.candidates());
    if (found.length < 1) {
      throw new AgentToolError(
        'not_found',
        `No track, playlist or scene goes by any of ${words.join(', ')}. list_music shows what there is; pick a track or a playlist by name.`
      );
    }
    const [best, ...others] = found;
    const played =
      best.candidate.kind === 'playlist' ? this.playPlaylist(best.candidate.id) : this.playTrack(best.candidate.id);
    return {
      ...(played as object),
      matched: best.matched,
      others: others.slice(0, OTHERS).map((match) => ({
        kind: match.candidate.kind,
        name: match.candidate.name,
        matched: match.matched,
      })),
    };
  }

  /** Every track and playlist that can be played, with every name it goes by. */
  private candidates(): MusicCandidate[] {
    const playlists = Playlist.all().filter((playlist) => playlist.entries.length > 0);
    const scenes = this.scenes();
    const sceneNames = (matches: (scene: BoardScene) => boolean) =>
      scenes.filter(matches).flatMap((scene) => [scene.name, scene.folderName]);
    return [
      ...playlists.map((playlist) => {
        const name = this.playback.labelOf(playlist);
        return {
          kind: 'playlist' as const,
          id: playlist.identifier,
          name,
          names: [
            name,
            ...sceneNames((scene) => {
              const music = sceneBgmOf(scene);
              return music?.mode === 'playlist' && (music.identifier === playlist.identifier || music.name === name);
            }),
          ],
        };
      }),
      ...this.tracks().map((audio) => ({
        kind: 'track' as const,
        id: audio.identifier,
        name: audio.name,
        names: [
          audio.name,
          AudioTag.get(audio.identifier)?.tag ?? '',
          ...playlists
            .filter((playlist) => playlist.entries.includes(audio.identifier))
            .map((playlist) => this.playback.labelOf(playlist)),
          ...sceneNames((scene) => {
            const music = sceneBgmOf(scene);
            return music?.mode === 'track' && music.identifier === audio.identifier;
          }),
        ],
      })),
    ];
  }
}
