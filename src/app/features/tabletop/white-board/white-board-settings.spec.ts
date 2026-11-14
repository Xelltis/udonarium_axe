import { ObjectStore } from '@axe/core/sync/object-store';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { BoardSettings, BoardSettingsHost } from '@axe/features/tabletop/white-board/white-board-settings';

describe('BoardSettings', () => {
  let board: WhiteBoard | null;
  let host: { [K in keyof BoardSettingsHost]: ReturnType<typeof vi.fn<BoardSettingsHost[K]>> };
  let settings: BoardSettings;

  beforeEach(() => {
    board = WhiteBoard.create('板', 4, 3, 1);
    board.location = { name: 'table', x: 100, y: 200 };
    host = {
      board: vi.fn(() => board),
      gridSize: vi.fn(() => 50),
      track: vi.fn(),
      retitle: vi.fn(),
      changed: vi.fn(),
      resized: vi.fn(),
    };
    settings = new BoardSettings(host);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('names the board and titles the panel with the name', () => {
    settings.name = '作戦図';

    expect(board!.name).toBe('作戦図');
    expect(host.retitle).toHaveBeenCalledWith('作戦図');
    expect(host.changed).toHaveBeenCalledOnce();
  });

  it('holds a side between one cell and forty, and says the sheet wants the new room', () => {
    settings.width = 100;
    expect(board!.width).toBe(40);
    settings.width = 0;
    expect(board!.width).toBe(1);
    settings.width = Number.NaN;
    expect(board!.width).toBe(1);

    expect(host.resized).toHaveBeenCalledTimes(3);
  });

  it('keeps the foot of the board where it stands when its height changes', () => {
    settings.height = 5;

    expect(board!.height).toBe(5);
    expect(board!.location.y + board!.height * 50).toBe(200 + 3 * 50);
    expect(host.resized).toHaveBeenCalledOnce();
  });

  it('turns the board in whole degrees within one turn', () => {
    settings.rotate = 370.4;

    expect(board!.rotate).toBe(10);
  });

  it('reads and writes how much the face shows as a percentage held from 0 to 100', () => {
    settings.opacityPercent = 250;
    expect(board!.opacity).toBe(1);

    settings.opacityPercent = 35;
    expect(board!.opacity).toBe(0.35);
    expect(settings.opacityPercent).toBe(35);
    expect(settings.faceOpacity).toBe(0.35);
  });

  it('remembers the face a board had while it is see through', () => {
    settings.opacityPercent = 60;

    settings.isSeeThrough = true;
    expect(board!.opacity).toBe(0);
    expect(settings.isSeeThrough).toBe(true);

    settings.isSeeThrough = false;
    expect(board!.opacity).toBe(0.6);
  });

  it('tells the view to follow the board with every read', () => {
    void settings.name;
    void settings.isLock;

    expect(host.track).toHaveBeenCalledTimes(2);
  });

  it('reads plain defaults and writes nothing before there is a board', () => {
    board = null;

    settings.name = '名前';
    settings.opacityPercent = 10;

    expect(settings.name).toBe('');
    expect(settings.width).toBe(1);
    expect(settings.boardColor).toBe('#f4f1e8');
    expect(host.retitle).not.toHaveBeenCalled();
  });
});
