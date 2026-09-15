import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import {
  ambienceColorOf,
  ambienceDensityOf,
  type AmbienceKind,
  ambienceKindOf,
  DEFAULT_AMBIENCE_DENSITY,
} from '@axe/domain/effect/ambience/ambience-kind';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/**
 * An effect laid over one part of the board and left there, such as a poisoned marsh or a vent in the ground.
 *
 * Like a mask it is a child of the table, so it changes with the map.
 */
@SyncObject('table-ambience')
export class TableAmbience extends TabletopObject {
  @SyncVar() ambienceKind: string = 'swamp';
  /** Empty for the colour of its kind. */
  @SyncVar() ambienceColor: string = '';
  @SyncVar() ambienceDensity: number = DEFAULT_AMBIENCE_DENSITY;
  @SyncVar() isLock: boolean = false;

  /** How many grid cells wide the area is, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  set width(width: number) {
    this.setCommonValue('width', width);
  }

  /** How many grid cells tall the area is, kept in its common data. */
  get height(): number {
    return this.getCommonValue('height', 1);
  }
  set height(height: number) {
    this.setCommonValue('height', height);
  }

  /** The kind of effect, with an unknown stored kind read as swamp. */
  get kind(): AmbienceKind {
    return ambienceKindOf(this.ambienceKind, 'swamp');
  }

  /** The colour it is drawn in: the one set on it, or its kind's own when none is. */
  get color(): string {
    return ambienceColorOf(this.kind, this.ambienceColor);
  }

  /**
   * How thick the effect is drawn, from 0 to 1, with a stored value that is not a number read as
   * the default.
   */
  get density(): number {
    return ambienceDensityOf(this.ambienceDensity);
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

  /**
   * Makes an area effect of the given kind with its name and size data, and registers it for sync.
   */
  static create(name: string, kind: AmbienceKind, width: number, height: number, identifier?: string): TableAmbience {
    const object = identifier ? new TableAmbience(identifier) : new TableAmbience();
    object.createDataElements();

    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('width', width, {}, `width_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('height', height, {}, `height_${object.identifier}`));
    object.ambienceKind = kind;
    object.initialize();

    return object;
  }
}
