import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';

@SyncObject('table-scratch-mask')
export class GameTableScratchMask extends OwnedTabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() isScratch: boolean = false;
  @SyncVar() dispLockMark: boolean = true;
  @SyncVar() color: string = '#404040';
  @SyncVar() changeColor: string = '#FF5050';

  @SyncVar() owner: string = '';

  @SyncVar() M: boolean[] = []; // 保存データ量削減のため1文字変数
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
      return this.M[this.maxSize * y + x];
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
    this.fillMapBack = [...this.M];
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
    if (this.M[this.maxSize * y + x] != this.fillMapBack[this.maxSize * y + x]) {
      return true;
    } else {
      return false;
    }
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
    object.M = new Array(object.maxSize * object.maxSize).fill(1);

    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('width', width, {}, `width_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('height', height, {}, `height_${object.identifier}`));
    object.initialize();
    return object;
  }
}
