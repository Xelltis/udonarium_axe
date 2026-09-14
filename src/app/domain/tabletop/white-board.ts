import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export const MIN_BOARD_PITCH = 0;
export const MAX_BOARD_PITCH = 90;

/**
 * Holds a board's tilt to whole degrees between flat and upright, reading anything that is not
 * finite as flat.
 */
export function clampBoardPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return MIN_BOARD_PITCH;
  return Math.min(MAX_BOARD_PITCH, Math.max(MIN_BOARD_PITCH, Math.round(pitch)));
}

/**
 * A board that other things are laid out on, and that carries them when it moves.
 *
 * The table has five faces to put things on and no more, and a plan of the second floor or
 * a row of portraits belongs on none of them. A board is a face like those: what is
 * put on it holds its place while the board is turned, tilted or stood upright, and
 * nothing is trimmed at the edge, so a piece may hang over the side.
 */
@SyncObject('white-board')
export class WhiteBoard extends TabletopObject {
  @SyncVar() isLock: boolean = false;
  /** Which way it faces, turned about the upright axis. */
  @SyncVar() rotate: number = 0;
  /** Flat on the table at nothing, standing upright at ninety. */
  @SyncVar() pitch: number = 0;
  @SyncVar() color: string = '#f4f1e8';
  @SyncVar() isDropShadow: boolean = true;
  /**
   * What has been drawn and stuck on the board, as a map editor scene.
   *
   * The board keeps the scene rather than only the picture of it, so that what was written
   * on it a week ago can be rubbed out rather than painted over.
   */
  @SyncVar() scene: string = '';

  /**
   * The pictures stuck onto the board, which have to travel with it when it is saved.
   *
   * They are named inside the packed drawing rather than by an attribute of their own, so
   * nothing walking the board's XML would find them, and a board saved without them would
   * come back with holes where its pictures were.
   */
  get carriedImageIdentifiers(): readonly string[] {
    return imagesNamedIn(this.scene);
  }

  /** How many grid cells wide the board is, kept in its common data; 4 when unset. */
  get width(): number {
    return this.getCommonValue('width', 4);
  }
  set width(width: number) {
    this.setCommonValue('width', width);
  }
  /**
   * How many grid cells deep the board is, which is how tall it stands when upright; 3 when unset.
   */
  get height(): number {
    return this.getCommonValue('height', 3);
  }
  set height(height: number) {
    this.setCommonValue('height', height);
  }

  /**
   * How opaque the board is, as every tabletop object reads it.
   *
   * Setting it writes the given value straight into the opacity resource's current value.
   */
  override get opacity(): number {
    return super.opacity;
  }
  override set opacity(opacity: number) {
    const element = this.getElement('opacity', this.commonDataElement);
    if (element) element.currentValue = opacity;
  }

  /** Whatever is standing on this board rather than on the table itself. */
  get isStanding(): boolean {
    return this.pitch > 0;
  }

  /** Makes a board with its name, size and opacity data, and registers it for sync. */
  static create(name: string, width: number, height: number, opacity: number, identifier?: string): WhiteBoard {
    const object = identifier ? new WhiteBoard(identifier) : new WhiteBoard();
    object.createDataElements();

    appendPieceDataElements(object, name, { width, height }, opacity);
    object.initialize();

    return object;
  }
}

/**
 * Changes how deep a board is without walking it towards the viewer.
 *
 * A board is held by its top left corner but hinges on its bottom edge, so every square of
 * depth added pushed that edge one square south and the standing board crept forward. The
 * foot is what stays put: the corner moves to keep it where it was.
 */
export function setBoardHeightKeepingFoot(board: WhiteBoard, height: number, gridSize: number): void {
  const foot = board.location.y + board.height * gridSize;
  board.height = height;
  board.location = { ...board.location, y: foot - height * gridSize };
}

/**
 * How a picture out of the storehouse is named where a texture is expected.
 *
 * The drawing names its pictures two ways: a sticker names one outright, and a fill names one
 * by dressing its identifier up as a texture. Both have to be found, or a board saves without
 * the ground it was painted with.
 */
const IMAGE_TEXTURE_PREFIX = 'image:';

/** Every image identifier named anywhere in a packed drawing, however deeply it is buried. */
function imagesNamedIn(scene: string): string[] {
  if (!scene) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(scene);
  } catch {
    return [];
  }

  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'imageIdentifier' && typeof entry === 'string' && entry.length > 0) found.add(entry);
      else if (key === 'textureId' && typeof entry === 'string' && entry.startsWith(IMAGE_TEXTURE_PREFIX)) {
        const named = entry.slice(IMAGE_TEXTURE_PREFIX.length);
        if (named.length > 0) found.add(named);
      } else walk(entry);
    }
  };
  walk(parsed);
  return [...found];
}
