import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * An effect left standing on the board, such as a poisoned marsh or a wall of flame.
 *
 * It is an ordinary effect, its playback wrapped round its own length to repeat.
 * The same picture serves, so no separate effect has to be made for a standing one.
 */
@SyncObject('effect-field')
export class EffectField extends TabletopObject {
  @SyncVar() presetIdentifier: string = '';
  /** One side, in cells, measured as a piece is. The size of the effect follows from the scale. */
  @SyncVar() size: number = 1;
  /** The hotbar slot that put this here, so the same slot can take it away again later. */
  @SyncVar() laidByHotbarSlot: string = '';

  /** Every standing effect in the room. */
  static list(): EffectField[] {
    return ObjectStore.instance.getObjects<EffectField>(EffectField);
  }

  /**
   * How far the repetition is offset, in milliseconds.
   * Several of these side by side all moving together would look pasted on.
   */
  get phaseOffset(): number {
    let hash = 0;
    for (let index = 0; index < this.identifier.length; index++) {
      hash = (hash * 31 + this.identifier.charCodeAt(index)) % 100000;
    }
    return hash;
  }
}
