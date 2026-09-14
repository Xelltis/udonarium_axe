import { ImageFile } from '@axe/core/storage/image-file';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { moveToTopmost } from '@axe/domain/tabletop/tabletop-object-util';

export type CoinFace = 'front' | 'back';

/** Tosses a coin, with an even chance of either face. The random source can be handed in to fix the result. */
export function pickCoinFace(random: () => number = Math.random): CoinFace {
  return random() < 0.5 ? 'front' : 'back';
}

@SyncObject('coin')
export class Coin extends TabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() face: CoinFace = 'front';
  @SyncVar() rotate: number = 0;
  @SyncVar() zindex: number = 0;

  /** The coin's size in cells, kept in its common data. A coin without the entry reads as 1. */
  get size(): number {
    return this.getCommonValue('size', 1);
  }
  set size(size: number) {
    this.setCommonValue('size', size);
  }

  /** The picture of the front face, or null when the coin has no front image entry. */
  get frontImage(): ImageFile | null {
    return this.getImageFile('front');
  }
  /** The picture of the back face, or null when the coin has no back image entry. */
  get backImage(): ImageFile | null {
    return this.getImageFile('back');
  }

  /** The picture of the face currently up, or the empty image when that face has none. */
  override get imageFile(): ImageFile {
    return (this.face === 'front' ? this.frontImage : this.backImage) ?? ImageFile.Empty;
  }

  /** Whether the front face is up. */
  get isFront(): boolean {
    return this.face === 'front';
  }

  /**
   * Tosses the coin and lays it on the face that came up, which the room then shares.
   *
   * The face is picked at random each time, so a flip can land on the face that was already up.
   */
  flip(random: () => number = Math.random): CoinFace {
    this.face = pickCoinFace(random);
    return this.face;
  }

  /** Raises the coin above every other coin showing on the table. */
  toTopmost() {
    moveToTopmost(this, ['coin']);
  }

  /**
   * Makes a coin with the given name and size and adds it to the room.
   *
   * Both faces start with no picture. Passing an identifier makes it under that identifier
   * instead of a fresh one.
   */
  static create(name: string, size: number = 1, identifier?: string): Coin {
    const object: Coin = identifier ? new Coin(identifier) : new Coin();

    object.createDataElements();
    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('size', size, {}, `size_${object.identifier}`));
    object.imageDataElement!.appendChild(
      DataElement.create('front', '', { type: 'image' }, `front_${object.identifier}`)
    );
    object.imageDataElement!.appendChild(
      DataElement.create('back', '', { type: 'image' }, `back_${object.identifier}`)
    );
    object.initialize();

    return object;
  }
}
