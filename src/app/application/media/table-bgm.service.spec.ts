import { TestBed } from '@angular/core/testing';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableBgmService', () => {
  let service: TableBgmService;
  let jukebox: Jukebox;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(TableBgmService);
    jukebox = ObjectStore.instance.get<Jukebox>('Jukebox') ?? new Jukebox('Jukebox');
    if (!ObjectStore.instance.get('Jukebox')) jukebox.initialize();
    jukebox.isPlaying = false;
    jukebox.audioIdentifier = '';
    table = new GameTable();
    table.initialize();
    vi.spyOn(TestBed.inject(AudioStorage), 'get').mockImplementation((identifier: string) =>
      identifier === 'track-a' || identifier === 'track-b' ? ({ identifier } as AudioFile) : null
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    table.destroy();
  });

  function asking(mode: string, identifier = ''): void {
    table.tableBgm = mode;
    table.tableBgmIdentifier = identifier;
  }

  it('puts on the track the table names', () => {
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    asking('play', 'track-a');

    service.playFor(table);

    expect(play).toHaveBeenCalledWith('track-a');
  });

  it('lets the track carry on when it is already playing', () => {
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    jukebox.audioIdentifier = 'track-a';
    jukebox.isPlaying = true;
    asking('play', 'track-a');

    service.playFor(table);

    expect(play).not.toHaveBeenCalled();
  });

  it('puts the track on over another that is playing', () => {
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    jukebox.audioIdentifier = 'track-b';
    jukebox.isPlaying = true;
    asking('play', 'track-a');

    service.playFor(table);

    expect(play).toHaveBeenCalledWith('track-a');
  });

  it('stops the music where the table asks it to', () => {
    const stop = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
    jukebox.isPlaying = true;
    asking('stop');

    service.playFor(table);

    expect(stop).toHaveBeenCalled();
  });

  it('leaves the music where the table asks nothing, or names a track the room does not have', () => {
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    const stop = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
    jukebox.isPlaying = true;

    asking('');
    service.playFor(table);
    asking('play', 'gone');
    service.playFor(table);
    asking('something else', 'track-a');
    service.playFor(table);

    expect(play).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
