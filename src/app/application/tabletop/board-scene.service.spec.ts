import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { emitSelectGameTable, sceneFade$, selectGameTable$ } from '@axe/core/event/domain-events';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { SCENE_FADE } from '@axe/domain/scene/board-scene-parts';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BoardSceneService', () => {
  let service: BoardSceneService;
  let jukebox: Jukebox;
  let village: GameTable;
  let cave: GameTable;

  function scene(fields: Partial<BoardScene> = {}): BoardScene {
    const made = Object.assign(new BoardScene(), fields);
    made.initialize();
    return made;
  }

  function makeTable(name: string): GameTable {
    const table = new GameTable();
    table.name = name;
    table.initialize();
    return table;
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(BoardSceneService);
    jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    village = makeTable('村');
    cave = makeTable('洞窟');
    expect(TableSelecter.instance).toBeTruthy();
    emitSelectGameTable({ identifier: village.identifier });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Config.instance.boardScene = '';
  });

  describe('putting one on', () => {
    it('writes the look onto the table shown, leaving what the scene leaves alone', () => {
      village.imageIdentifier = 'day';
      village.backgroundImageIdentifier = 'sky';

      service.apply(scene({ floorImageIdentifier: 'night', darkness: 'on' }));

      expect(village.imageIdentifier).toBe('night');
      expect(village.darknessEnabled).toBe(true);
      expect(village.backgroundImageIdentifier).toBe('sky');
    });

    it('shows the table it names in its new look, with none of the table’s own cut-ins or music', () => {
      const ownCutIn = vi.spyOn(TestBed.inject(CutInService), 'launchForTable');
      const ownMusic = vi.spyOn(TestBed.inject(TableBgmService), 'playFor');
      const shown: string[] = [];
      const off = selectGameTable$.subscribe((event) => shown.push(event.identifier));

      service.apply(scene({ tableIdentifier: cave.identifier, floorImageIdentifier: 'dark-cave' }));
      off();

      expect(TableSelecter.instance.viewTableIdentifier).toBe(cave.identifier);
      expect(shown).toEqual([cave.identifier]);
      expect(cave.imageIdentifier).toBe('dark-cave');
      expect(village.imageIdentifier).not.toBe('dark-cave');
      expect(ownCutIn).not.toHaveBeenCalled();
      expect(ownMusic).not.toHaveBeenCalled();
    });

    it('finds the table by name where its identifier means nothing here, as after a save is read back, and names it by its identifier from then on', () => {
      const back = scene({ tableIdentifier: 'gone', tableName: '洞窟' });

      service.apply(back);

      expect(TableSelecter.instance.viewTableIdentifier).toBe(cave.identifier);
      expect(back.tableIdentifier).toBe(cave.identifier);
    });

    it('takes up the name its table goes by now, renamed since', () => {
      const deep = scene({ tableIdentifier: cave.identifier, tableName: '洞窟' });
      cave.name = '地底湖';

      service.apply(deep);

      expect(deep.tableName).toBe('地底湖');
    });

    it('writes its look nowhere when the table it names is gone, rather than over the table shown', () => {
      village.imageIdentifier = 'day';

      service.apply(scene({ tableIdentifier: 'gone', tableName: '消えた塔', floorImageIdentifier: 'tower' }));

      expect(TableSelecter.instance.viewTableIdentifier).toBe(village.identifier);
      expect(village.imageIdentifier).toBe('day');
    });

    it('sends the look and the table shown in one go', () => {
      const batch = vi.spyOn(GameObject, 'batch');

      service.apply(scene({ tableIdentifier: cave.identifier, floorImageIdentifier: 'dark-cave' }));

      expect(batch).toHaveBeenCalledOnce();
    });

    it('remembers it as the scene the room is in', () => {
      const night = scene();

      service.apply(night);

      expect(Config.instance.boardScene).toBe(night.identifier);
    });

    it('is not put on by a player, nor by a guest', () => {
      for (const role of [PeerRole.Player, PeerRole.Guest]) {
        PeerCursor.myCursor.role = role;

        expect(service.apply(scene({ floorImageIdentifier: 'night' }))).toBe(false);
      }
      expect(village.imageIdentifier).not.toBe('night');
    });

    it('is put on for a player pressing a switch the game master set up, and remembered as the scene the room is in', () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      const night = scene({ floorImageIdentifier: 'night' });

      expect(service.apply(night, { trusted: true })).toBe(true);
      expect(village.imageIdentifier).toBe('night');
      expect(Config.instance.boardScene).toBe(night.identifier);
    });
  });

  describe('the music', () => {
    it('puts the scene’s track on, and lets it go on where it is already playing', () => {
      const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);

      service.apply(scene({ bgm: 'track', bgmIdentifier: 'night-theme' }));
      expect(play).toHaveBeenCalledWith('night-theme');

      play.mockClear();
      jukebox.audioIdentifier = 'night-theme';
      jukebox.isPlaying = true;
      service.apply(scene({ bgm: 'track', bgmIdentifier: 'night-theme' }));
      expect(play).not.toHaveBeenCalled();
    });

    it('plays a playlist from its first track, and lets it go on where the room plays through it already', () => {
      const battle = Playlist.create('戦闘', ['battle-a', 'battle-b']);
      const playPlaylist = vi.spyOn(jukebox, 'playPlaylist').mockImplementation(() => undefined);

      service.apply(scene({ bgm: 'playlist', bgmPlaylistIdentifier: battle.identifier }));
      expect(playPlaylist).toHaveBeenCalledWith(battle);

      playPlaylist.mockClear();
      jukebox.playlistIdentifier = battle.identifier;
      jukebox.audioIdentifier = 'battle-b';
      jukebox.isPlaying = true;
      service.apply(scene({ bgm: 'playlist', bgmPlaylistName: '戦闘' }));
      expect(playPlaylist).not.toHaveBeenCalled();
    });

    it('stops the music for a scene of silence', () => {
      const stop = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
      jukebox.audioIdentifier = 'theme';
      jukebox.isPlaying = true;

      service.apply(scene({ bgm: 'stop' }));

      expect(stop).toHaveBeenCalled();
    });

    it('leaves the music alone where asked to, still changing the look', () => {
      const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);

      service.apply(scene({ bgm: 'track', bgmIdentifier: 'night-theme', floorImageIdentifier: 'night' }), {
        bgm: false,
      });

      expect(play).not.toHaveBeenCalled();
      expect(village.imageIdentifier).toBe('night');
    });

    it('leaves just the background sounds the scene names playing', () => {
      const rain = { audioIdentifier: 'rain', stop: vi.fn() } as unknown as BackgroundSound;
      const crowd = { audioIdentifier: 'crowd', stop: vi.fn() } as unknown as BackgroundSound;
      vi.spyOn(BackgroundSound, 'playing').mockReturnValue([rain, crowd]);
      vi.spyOn(BackgroundSound, 'of').mockImplementation((id) =>
        id === 'rain' ? ({ isOn: true } as BackgroundSound) : null
      );
      const start = vi.spyOn(BackgroundSound, 'start').mockReturnValue(null);

      service.apply(scene({ bgs: 'replace', bgsIdentifiers: 'rain,fire' }));

      expect(rain.stop).not.toHaveBeenCalled();
      expect(crowd.stop).toHaveBeenCalled();
      expect(start.mock.calls).toEqual([['fire']]);
    });
  });

  describe('a scene that fades', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout'] }));
    afterEach(() => vi.useRealTimers());

    it('darkens every screen first, and is put on once they are dark', () => {
      let fades = 0;
      const off = sceneFade$.subscribe(() => fades++);

      setNetworkIsolated(true);
      try {
        service.apply(scene({ fade: 'true', floorImageIdentifier: 'night' }));
      } finally {
        setNetworkIsolated(false);
      }
      expect(fades).toBe(1);
      expect(village.imageIdentifier).not.toBe('night');

      vi.advanceTimersByTime(SCENE_FADE.inMs);
      off();
      expect(village.imageIdentifier).toBe('night');
    });

    it('is not put on once it is deleted while the screens darken', () => {
      const night = scene({ fade: 'true', floorImageIdentifier: 'night' });

      service.apply(night);
      night.destroy();
      vi.advanceTimersByTime(SCENE_FADE.inMs);

      expect(village.imageIdentifier).not.toBe('night');
    });
  });

  describe('what else it does', () => {
    it('plays one of its cut-ins', () => {
      const cutIn = new CutIn();
      cutIn.initialize();
      const launch = vi.spyOn(TestBed.inject(CutInService), 'launch').mockReturnValue(true);

      service.apply(scene({ cutInIdentifiers: `gone,${cutIn.identifier}` }));

      expect(launch).toHaveBeenCalledWith(cutIn);
    });

    it('says its words in the first tab after the look, or not where asked', () => {
      const tab = new ChatTab();
      tab.initialize();
      ChatTabList.instance.addChatTab(tab);
      const order: string[] = [];
      vi.spyOn(GameObject, 'batch').mockImplementation((work) => {
        order.push('look');
        return work();
      });
      const say = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendVerbatim')
        .mockImplementation(() => (order.push('words'), null));

      service.apply(scene({ text: '夜が来た' }));
      service.apply(scene({ text: '夜が来た' }), { text: false });

      expect(say.mock.calls.map(([to, words, as]) => [to, words, as])).toEqual([
        [ChatTabList.instance.chatTabs[0], '夜が来た', { kind: 'system' }],
      ]);
      expect(order).toEqual(['look', 'words', 'look']);
    });
  });

  describe('making one from the table as it stands', () => {
    it('catches the table shown, its whole look, and the music the room plays', () => {
      village.imageIdentifier = 'day';
      jukebox.audioIdentifier = 'theme';
      jukebox.isPlaying = true;

      const made = service.create('昼の村')!;

      expect(made.name).toBe('昼の村');
      expect([made.tableIdentifier, made.tableName]).toEqual([village.identifier, '村']);
      expect(made.floorImageIdentifier).toBe('day');
      expect(made.foregroundImageIdentifier).toBe('none');
      expect([made.bgm, made.bgmIdentifier]).toEqual(['track', 'theme']);
      expect(made.bgs).toBe('');
      expect(BoardScene.all()).toContain(made);
    });

    it('writes over only the parts the scene changes, keeping its words', () => {
      const made = scene({ name: '夜', floorImageIdentifier: 'night', text: '夜が来た' });
      village.imageIdentifier = 'dusk';
      village.darknessEnabled = true;

      service.overwrite(made);

      expect(made.floorImageIdentifier).toBe('dusk');
      expect(made.darkness).toBe('');
      expect(made.text).toBe('夜が来た');
    });

    it('copies one under another name, after the last', () => {
      const night = scene({ name: '夜', order: 5, floorImageIdentifier: 'night', text: '夜が来た' });

      const copy = service.duplicate(night, '夜のコピー')!;

      expect(copy.identifier).not.toBe(night.identifier);
      expect([copy.name, copy.floorImageIdentifier, copy.text]).toEqual(['夜のコピー', 'night', '夜が来た']);
      expect(copy.order).toBeGreaterThan(5);
    });

    it('makes none for a player', () => {
      PeerCursor.myCursor.role = PeerRole.Player;

      expect(service.create('昼')).toBeNull();
      expect(ObjectStore.instance.getObjects(BoardScene)).toEqual([]);
    });
  });
});
