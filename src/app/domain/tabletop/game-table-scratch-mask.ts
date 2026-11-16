import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';

/**
 * What a cell of the scratch map holds once it has been scratched open, in each form it can reach
 * here: as written by this app or sent by a peer, or read back from a saved room as text.
 */
const OPEN_CELL_VALUES: ReadonlySet<unknown> = new Set<unknown>([false, 0, 'false', '0']);

/**
 * Whether a cell of a scratch map is covered, whatever form its entry came in.
 *
 * A cell is covered while it holds anything but false, a missing entry included: a map saved with a
 * room is read back as text, one word for each cell, and `"false"` is as open as false.
 */
export function isScratchCellCovered(entry: unknown): boolean {
  return !OPEN_CELL_VALUES.has(entry);
}

@SyncObject('table-scratch-mask')
export class GameTableScratchMask extends OwnedTabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() isScratch: boolean = false;
  @SyncVar() dispLockMark: boolean = true;
  @SyncVar() color: string = '#404040';
  @SyncVar() changeColor: string = '#FF5050';

  @SyncVar() owner: string = '';

  /**
   * The scratch map, a cell covered while its entry is anything but false; named with one letter to
   * keep the saved data small. A map read from a saved room holds text, so it is read through
   * {@link isScratchCellCovered} rather than as it stands. Nothing scratches it any more: it is
   * read once, to turn the mask into a regular one.
   */
  @SyncVar() M: boolean[] = [];

  @SyncVar() scratchingGrids: string = '';
  @SyncVar() scratchedGrids: string = '';

  @SyncVar() dummy: number = 0;
  private readonly maxSize = 50;
  /** How many cells a side the scratch map has, which is a fixed 50. */
  getMaxSize(): number {
    return this.maxSize;
  }

  /** How many grid cells wide the mask is, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  /** How many grid cells tall the mask is, kept in its common data. */
  get height(): number {
    return this.getCommonValue('height', 1);
  }

  /**
   * Makes a scratch mask with its name and size data and a fully filled map, and registers it for
   * sync.
   */
  static create(
    name: string,
    width: number,
    height: number,
    opacity: number,
    identifier?: string
  ): GameTableScratchMask {
    let object: GameTableScratchMask;
    if (identifier) {
      object = new GameTableScratchMask(identifier);
    } else {
      object = new GameTableScratchMask();
    }
    object.M = new Array(object.maxSize * object.maxSize).fill(true);

    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('width', width, {}, `width_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('height', height, {}, `height_${object.identifier}`));
    object.initialize();
    return object;
  }
}
