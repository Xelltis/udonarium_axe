import { ImageStorage } from '@axe/core/storage/image-storage';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { MapScene } from '@axe/features/map-editor/model/scene';
import { serializeScene } from '@axe/features/map-editor/model/serialize';

export const SAVE_DELAY = 600;

export interface BoardKeeperHost {
  board(): WhiteBoard | null;
  scene(): MapScene;
  canvas(): HTMLCanvasElement | null;
  drawBare(): Promise<void>;
  redraw(): void;
}

export class BoardKeeper {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly host: BoardKeeperHost,
    private readonly images: ImageStorage
  ) {}

  /**
   * Saves the board once the drawing has been left alone for a moment.
   *
   * Each call starts the wait over, so a run of edits is saved once, after the last of them.
   */
  keepPicture(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, SAVE_DELAY);
  }

  /**
   * Writes a save still waiting straight to the board, when the editor closes.
   *
   * Only the drawing is written; the picture the board wears is not redrawn. Does nothing when no
   * save is waiting.
   */
  putDown(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.writeScene();
  }

  /** Writes the drawing onto the board and sends the board to the room, without redrawing its picture. */
  writeScene(): void {
    const board = this.host.board();
    if (!board) return;
    board.scene = serializeScene(this.host.scene());
    board.update();
  }

  /**
   * Writes the drawing onto the board and replaces the picture the board wears on the table.
   *
   * The drawing is painted bare, stored as a new image and put on the board, the old image is
   * deleted, and the board is sent to the room. Where the canvas cannot make an image, only the
   * drawing is sent. Does nothing without a board or a canvas.
   */
  async save(): Promise<void> {
    const board = this.host.board();
    const canvas = this.host.canvas();
    if (!board || !canvas) return;
    board.scene = serializeScene(this.host.scene());

    await this.host.drawBare();
    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof canvas.toBlob !== 'function') resolve(null);
      else canvas.toBlob((made) => resolve(made), 'image/webp', 0.92);
    });
    if (!blob) {
      board.update();
      this.host.redraw();
      return;
    }

    const file = await this.images.addAsync(blob);
    const element = board.imageDataElement?.getFirstElementByName('imageIdentifier');
    const worn = element?.value;
    if (element) element.value = file.identifier;
    board.update();
    if (typeof worn === 'string' && worn && worn !== file.identifier) this.images.delete(worn);
    this.host.redraw();
  }
}
