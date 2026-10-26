import { ImageStorage } from '@axe/core/storage/image-storage';
import { createScene } from '@axe/domain/map-editor/scene';
import { serializeScene } from '@axe/domain/map-editor/serialize';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { BoardKeeper, BoardKeeperHost, SAVE_DELAY } from '@axe/features/tabletop/white-board/white-board-keeper';

describe('BoardKeeper', () => {
  const scene = createScene(2, 2, 50, 0);
  let board: { scene: string; update: ReturnType<typeof vi.fn>; imageDataElement: null };
  let host: BoardKeeperHost;
  let drawBare: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let redraw: ReturnType<typeof vi.fn<() => void>>;
  let images: { addAsync: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let keeper: BoardKeeper;

  beforeEach(() => {
    vi.useFakeTimers();
    board = { scene: '', update: vi.fn(), imageDataElement: null };
    drawBare = vi.fn<() => Promise<void>>(() => Promise.resolve());
    redraw = vi.fn<() => void>();
    host = {
      board: () => board as unknown as WhiteBoard,
      scene: () => scene,
      canvas: () => ({}) as HTMLCanvasElement,
      drawBare,
      redraw,
    };
    images = { addAsync: vi.fn(), delete: vi.fn() };
    keeper = new BoardKeeper(host, images as unknown as ImageStorage);
  });

  afterEach(() => vi.useRealTimers());

  it('keeps the picture a breath after the last stroke, and only once for many strokes', async () => {
    keeper.keepPicture();
    vi.advanceTimersByTime(SAVE_DELAY - 1);
    keeper.keepPicture();
    vi.advanceTimersByTime(SAVE_DELAY - 1);
    expect(board.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(board.scene).toBe(serializeScene(scene));
    expect(drawBare).toHaveBeenCalledTimes(1);
    expect(board.update).toHaveBeenCalledTimes(1);
    expect(redraw).toHaveBeenCalledTimes(1);
    expect(images.addAsync).not.toHaveBeenCalled();
  });

  it('keeps the picture as one drawn here, which the GM may put back, and sends only the drawing when it is kept out', async () => {
    const painted = new Blob(['board'], { type: 'image/webp' });
    host.canvas = () => ({ toBlob: (made: BlobCallback) => made(painted) }) as unknown as HTMLCanvasElement;
    images.addAsync.mockResolvedValue(null);

    keeper.keepPicture();
    await vi.runAllTimersAsync();

    expect(images.addAsync).toHaveBeenCalledWith(painted, { putBack: true });
    expect(board.update).toHaveBeenCalledTimes(1);
    expect(images.delete).not.toHaveBeenCalled();
  });

  it('writes the drawing down at once when put down within the breath', () => {
    keeper.keepPicture();
    keeper.putDown();
    expect(board.scene).toBe(serializeScene(scene));
    expect(board.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(SAVE_DELAY);
    expect(drawBare).not.toHaveBeenCalled();
  });

  it('has nothing to put down when nothing is waiting', () => {
    keeper.putDown();
    expect(board.update).not.toHaveBeenCalled();
  });
});
