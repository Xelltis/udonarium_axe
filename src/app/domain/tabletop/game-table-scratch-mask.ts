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
   * {@link isScratchCellCovered} rather than as it stands.
   */
  @SyncVar() M: boolean[] = [];
  fillMapBack: boolean[] = [];

  @SyncVar() scratchingGrids: string = '';
  @SyncVar() scratchedGrids: string = '';

  @SyncVar() dummy: number = 0;
  private readonly maxSize = 50;
  /** How many cells a side the scratch map has, which is a fixed 50. */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Whether a cell of the scratch map is filled.
   *
   * With `myScratch` it reads the local working copy being scratched, which reads as unfilled until
   * that copy has been taken; otherwise it reads the synced map.
   */
  getMapXY(x: number, y: number, myScratch: boolean): boolean {
    if (myScratch) {
      if (this.fillMapBack.length < this.M.length) {
        return false;
      }
      return this.fillMapBack[this.maxSize * y + x];
    } else {
      return isScratchCellCovered(this.M[this.maxSize * y + x]);
    }
  }

  /**
   * Sets one cell of the local working copy. Does nothing until copyMain2BackMap has taken the
   * copy.
   */
  setMapXY(x: number, y: number, bool: boolean) {
    if (this.fillMapBack.length < this.M.length) {
      return;
    }
    this.fillMapBack[this.maxSize * y + x] = bool;
  }

  /**
   * Commits the local working copy to the synced map, and bumps the dummy counter so that peers
   * redraw.
   */
  copyBack2MainMap() {
    this.M = [...this.fillMapBack];
    this.dummy++;
    if (this.dummy >= 100) this.dummy = 0;
  }

  /** Takes a local working copy of the synced map to scratch on. */
  copyMain2BackMap() {
    this.fillMapBack = Array.from(this.M, isScratchCellCovered);
  }

  /** Flips one cell of the local working copy. Does nothing until the copy has been taken. */
  reverseMapXY(x: number, y: number) {
    if (this.fillMapBack.length < this.M.length) {
      return;
    }

    this.fillMapBack[this.maxSize * y + x] = !this.fillMapBack[this.maxSize * y + x];
  }

  /**
   * Whether a cell of the local working copy differs from the synced map. False until the copy has
   * been taken.
   */
  isMapXYChange(x: number, y: number) {
    if (this.fillMapBack.length < this.M.length) {
      return false;
    }
    return isScratchCellCovered(this.M[this.maxSize * y + x]) !== this.fillMapBack[this.maxSize * y + x];
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
