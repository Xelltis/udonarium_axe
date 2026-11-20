import { TestBed } from '@angular/core/testing';
import { CharacterImportService } from '@axe/application/character/character-import.service';
import { RoomFilesService } from '@axe/application/file/room-files.service';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MAX_AGENT_FILE_BYTES } from '@axe/core/agent/agent-tools';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { GameCharacter } from '@axe/domain/character/game-character';
import { AgentFileTools } from '@axe/features/agent-tools/agent-file-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const PNG = { name: 'goblin.png', type: 'image/png', base64: 'AQID' };
const ZIP = { name: 'room.zip', type: 'application/zip', base64: 'AQID' };

describe('AgentFileTools', () => {
  let tools: AgentFileTools;
  let archiver: FileArchiver;

  function call(
    tool: string,
    args: Record<string, unknown> = {},
    signal = new AbortController().signal
  ): Promise<unknown> {
    return Promise.resolve(tools.handlers[tool](args, { signal }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    tools = TestBed.inject(AgentFileTools);
    archiver = TestBed.inject(FileArchiver);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes in a picture as a drop does, under a name of its own, and never room data', async () => {
    const load = vi
      .spyOn(archiver, 'loadAssets')
      .mockResolvedValue({ dataRead: false, images: ['img-1'], audios: [], models: [], tooLarge: [] });

    expect(await call('import_asset', { path: 'x', file: PNG })).toEqual({ images: ['img-1'], sounds: [], models: [] });
    await call('import_asset', { path: 'x', file: { ...PNG, name: `${'a'.repeat(64)}.png` } });
    await expect(call('import_asset', { path: 'x', file: ZIP })).rejects.toThrow(/load_room puts a saved room in/);

    const [[first], [second]] = load.mock.calls;
    expect([first[0].name, first[0].type, first[0].size]).toEqual(['goblin.png', 'image/png', 3]);
    expect(second[0].name).toBe(`asset-${'a'.repeat(64)}.png`);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('tells a file too large, or none the room takes, apart from one taken in', async () => {
    const load = vi.spyOn(archiver, 'loadAssets');
    load.mockResolvedValueOnce({ dataRead: false, images: [], audios: [], models: [], tooLarge: ['goblin.png'] });
    load.mockResolvedValueOnce({ dataRead: false, images: [], audios: [], models: [], tooLarge: [] });

    await expect(call('import_asset', { path: 'x', file: PNG })).rejects.toThrow(/larger than the room takes in/);
    await expect(call('import_asset', { path: 'x', file: PNG })).rejects.toThrow(/no picture, sound or .glb model/);
  });

  it('hands the bridge the room saved as the save button saves it, everything held at asking', async () => {
    const save = TestBed.inject(SaveDataService);
    vi.spyOn(save, 'createRoomArchiveAsync').mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
    const whole = vi.spyOn(save, 'createWholeRoomArchiveAsync').mockResolvedValue(new Blob([new Uint8Array([4])]));

    expect(await call('save_room', { path: 'room.zip' })).toMatchObject({ file: ZIP });
    expect(await call('save_room', { path: 'room.zip', everything: true })).toMatchObject({ file: { base64: 'BA==' } });
    expect(whole).toHaveBeenCalledOnce();
  });

  it('hands the bridge no room larger than a message to it carries, saying how to save it instead', async () => {
    const save = TestBed.inject(SaveDataService);
    const large = { size: MAX_AGENT_FILE_BYTES + 1, arrayBuffer: vi.fn() } as unknown as Blob;
    vi.spyOn(save, 'createWholeRoomArchiveAsync').mockResolvedValue(large);

    await expect(call('save_room', { path: 'room.zip', everything: true })).rejects.toThrow(/more than the 96.0 MB/);
    expect(large.arrayBuffer).not.toHaveBeenCalled();
  });

  it('puts a saved room in only once the person at the seat agrees on their screen', async () => {
    vi.spyOn(archiver, 'roomIn').mockResolvedValue({ withheld: true });
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    const load = vi.spyOn(TestBed.inject(RoomFilesService), 'loadAgreed').mockResolvedValue(true);

    ask.mockResolvedValueOnce(false);
    await expect(call('load_room', { path: 'x', file: ZIP })).rejects.toThrow(/did not agree/);
    expect(load).not.toHaveBeenCalled();

    ask.mockResolvedValueOnce(true);
    expect(await call('load_room', { path: 'x', file: ZIP })).toEqual({ loaded: true });
    expect(load).toHaveBeenCalledOnce();
    expect((ask.mock.calls[0][0] as { message: string }).message).toContain('部屋のサーバーで伏せた形');
  });

  it('gives the person a minute, and loads nothing unanswered', async () => {
    vi.useFakeTimers();
    vi.spyOn(archiver, 'roomIn').mockResolvedValue({ withheld: false });
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockImplementation(
      (_option, signal) =>
        new Promise((resolve) => signal?.addEventListener('abort', () => resolve(false), { once: true }))
    );
    const load = vi.spyOn(TestBed.inject(RoomFilesService), 'loadAgreed');

    const loading = call('load_room', { path: 'x', file: ZIP });
    const refused = expect(loading).rejects.toThrow(/did not agree/);
    await vi.advanceTimersByTimeAsync(60_000);
    await refused;
    expect(load).not.toHaveBeenCalled();
  });

  it('puts a snapshot back as agreed, and takes exactly one of a path or a snapshot', async () => {
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    const restore = vi.spyOn(TestBed.inject(RoomSnapshotService), 'restore').mockResolvedValue(true);

    expect(await call('load_room', { snapshot: 7 })).toEqual({ loaded: true });
    expect(restore).toHaveBeenCalledWith(7, { agreed: true });
    await expect(call('load_room', {})).rejects.toThrow(/exactly one of path or snapshot/);
    await expect(call('load_room', { snapshot: 7, path: 'x', file: ZIP })).rejects.toThrow(/exactly one/);
    vi.spyOn(archiver, 'roomIn').mockResolvedValue(null);
    await expect(call('load_room', { path: 'x', file: ZIP })).rejects.toThrow(/no saved room/);
  });

  it('takes in a character sheet by its address or its text, and tells why one could not be', async () => {
    const piece = GameCharacter.create('エルフ', 1, '');
    const take = vi.spyOn(TestBed.inject(CharacterImportService), 'importFromText');
    take.mockResolvedValueOnce({
      character: piece,
      error: null,
      imageResolved: true,
      service: 'ytsheet',
      systemUnknown: false,
    });
    take.mockResolvedValueOnce({
      character: null,
      error: 'fetch-failed',
      imageResolved: false,
      service: '',
      systemUnknown: false,
    });

    expect(await call('import_character', { url: 'https://example.com/sheet' })).toEqual({
      piece: { id: piece.identifier, name: 'エルフ' },
      from: 'ytsheet',
      picture: true,
    });
    await expect(call('import_character', { text: '{}' })).rejects.toThrow(/could not be read from its site/);
    await expect(call('import_character', { url: 'a', text: 'b' })).rejects.toThrow(/exactly one of url or text/);
    piece.destroy();
  });
});
