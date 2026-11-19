import { TestBed } from '@angular/core/testing';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { AgentMusicTools } from '@axe/features/agent-tools/agent-music-tools.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const signal = new AbortController().signal;

describe('AgentMusicTools', () => {
  let tools: AgentMusicTools;
  let play: ReturnType<typeof vi.spyOn>;
  let playPlaylist: ReturnType<typeof vi.spyOn>;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const audios = [
      { identifier: 'calm', name: '村の朝', isHidden: false },
      { identifier: 'fight', name: 'Clash', isHidden: false },
      { identifier: 'rain', name: '雨音', isHidden: false },
      { identifier: 'sword', name: '剣戟', isHidden: false },
    ] as AudioFile[];
    vi.spyOn(TestBed.inject(AudioStorage), 'audios', 'get').mockReturnValue(audios);
    vi.spyOn(TestBed.inject(AudioStorage), 'get').mockImplementation(
      (identifier) => audios.find((audio) => audio.identifier === identifier) ?? null
    );
    AudioTag.create('rain').tag = 'BGS';
    AudioTag.create('sword').tag = 'SE';
    const playback = TestBed.inject(JukeboxPlaybackService);
    play = vi.spyOn(playback, 'play').mockImplementation(() => undefined);
    playPlaylist = vi.spyOn(playback, 'playPlaylist').mockImplementation(() => undefined);
    tools = TestBed.inject(AgentMusicTools);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('lists as music every sound but the sound effects and the ambient sounds, with the playlists holding each', () => {
    Playlist.create('戦闘曲', ['fight']);

    const listed = call('list_music') as { tracks: { id: string; playlists: string[] }[] };

    expect(listed.tracks.map((track) => [track.id, track.playlists])).toEqual([
      ['calm', []],
      ['fight', ['戦闘曲']],
    ]);
  });

  it('puts on what suits a mood, a playlist found by as many words before a track, and tells the others', () => {
    const fights = Playlist.create('戦闘曲', ['fight']);

    expect(call('play_music', { mood: '戦闘' })).toMatchObject({
      playing: { kind: 'playlist', id: fights.identifier },
      matched: ['戦闘'],
      others: [{ kind: 'track', name: 'Clash' }],
    });
    expect(playPlaylist).toHaveBeenCalledWith(fights.identifier);
    expect(() => call('play_music', { mood: '海' })).toThrow(/No track, playlist or scene goes by any of 海/);
  });

  it('reads the scenes that put music on for the game master only, as part of the preparation', () => {
    const scene = new BoardScene();
    scene.name = 'ボス戦';
    scene.bgm = 'track';
    scene.bgmIdentifier = 'fight';
    scene.initialize();

    expect(call('play_music', { mood: 'ボス' })).toMatchObject({ playing: { kind: 'track', id: 'fight' } });
    expect(play).toHaveBeenCalledOnce();
    PeerCursor.myCursor.role = PeerRole.Player;
    expect(() => call('play_music', { mood: 'ボス' })).toThrow(/No track/);
    expect((call('list_music') as { scenes: unknown[] }).scenes).toEqual([]);
  });

  it('takes exactly one of a track, a playlist or a mood', () => {
    expect(() => call('play_music', {})).toThrow(/exactly one/);
    expect(() => call('play_music', { track: '村の朝', mood: '静か' })).toThrow(/exactly one/);
    expect(call('play_music', { track: '村の朝' })).toEqual({ playing: { kind: 'track', id: 'calm', name: '村の朝' } });
  });
});
