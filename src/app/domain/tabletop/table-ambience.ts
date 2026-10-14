import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { AmbienceBrightness, ambienceBrightnessOf } from '@axe/domain/effect/ambience/ambience-brightness';
import {
  ambienceColorOf,
  ambienceDensityOf,
  type AmbienceKind,
  ambienceKindOf,
  DEFAULT_AMBIENCE_DENSITY,
} from '@axe/domain/effect/ambience/ambience-kind';
import { asShownTo, ShownTo } from '@axe/domain/tabletop/shown-to';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  DEFAULT_DIRT,
  DEFAULT_LEAVES,
  DEFAULT_SURFACE_CELLS,
  DEFAULT_TURBIDITY,
  dirtOf,
  flowDirectionOf,
  flowSpeedOf,
  leavesOf,
  surfaceCellsOf,
  turbidityOf,
} from '@axe/domain/tabletop/water/water-surface';

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
  /**
   * Who it is drawn for, as one of SHOWN_TO. Empty shows it to the room, as it always was.
   *
   * A bank of fog the party has not come upon yet is a bank of fog they should not be looking
   * at, and a master laying one ahead of them has until now had to lay it as they arrived.
   */
  @SyncVar() shownTo: string = '';
  /**
   * Whether nobody sees through it.
   *
   * A bank of fog that only looks like fog hides nothing: an eye reads straight through it and
   * the party sees the far side of it as clearly as the near. Set, its outline stands in the
   * way of sight the way a wall does, so a piece on one side of it cannot see one on the
   * other, and a piece inside it is not seen from outside at all.
   */
  @SyncVar() blocksSight: boolean = false;
  /**
   * How bright the ground under it is, as one of AMBIENCE_BRIGHTNESS. Empty leaves it alone.
   *
   * A patch of the board lit, dimmed or put out whatever the rest of the table is lit by: the
   * pool of magical darkness over a doorway, the shaft of daylight down a stairwell.
   */
  @SyncVar() brightness: string = '';
  /**
   * How many cells the water stands over the area's own floor. Only water reads it.
   *
   * A piece whose feet are lower than this is in the water, and the part of it under the
   * surface is drawn as seen through water.
   */
  @SyncVar() surfaceHeight: number = DEFAULT_SURFACE_CELLS;
  /**
   * How murky the water is, from 0 for clear to 1 for water nothing can be seen through. Only
   * water reads it: the murkier, the sooner the bottom and whatever is under the surface are lost.
   */
  @SyncVar() turbidity: number = DEFAULT_TURBIDITY;
  /**
   * How dirty the water is, from 0 for clean to 1 for water thick with scum. Only water reads it:
   * the dirtier, the duller its colour, the thicker the scum floating on it.
   */
  @SyncVar() dirtiness: number = DEFAULT_DIRT;
  /**
   * How much of the water floating leaves cover, from 0 for none to 1 for a pond crowded with
   * them, some in flower. Only water reads it.
   */
  @SyncVar() floatingLeaves: number = DEFAULT_LEAVES;
  /**
   * How fast the water flows, from 0 for still water to 1 for a racing river. Only water reads
   * it: what floats on the water and what drifts in it is carried along.
   */
  @SyncVar() flowSpeed: number = 0;
  /** Which way the water flows, in degrees clockwise from the top of the table. */
  @SyncVar() flowDirection: number = 0;

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

  /** Who it is drawn for, with anything unknown - an empty answer included - shown to the room. */
  get shows(): ShownTo {
    return asShownTo(this.shownTo, 'room');
  }

  /** How bright the ground under it is, with anything unknown leaving the light as it was. */
  get shade(): AmbienceBrightness {
    return ambienceBrightnessOf(this.brightness);
  }

  /** How high the water stands over the floor, in cells, with an empty or unreadable value read as the default. */
  get surface(): number {
    return surfaceCellsOf(this.surfaceHeight);
  }

  /** How murky the water is, with an empty or unreadable value read as the default. */
  get murk(): number {
    return turbidityOf(this.turbidity);
  }

  /** How dirty the water is, with an empty or unreadable value read as clean. */
  get dirt(): number {
    return dirtOf(this.dirtiness);
  }

  /** How much of the water floating leaves cover, with an empty or unreadable value read as none. */
  get leaves(): number {
    return leavesOf(this.floatingLeaves);
  }

  /** How fast the water flows, with an empty or unreadable value read as still. */
  get flow(): number {
    return flowSpeedOf(this.flowSpeed);
  }

  /** Which way the water flows, with an empty or unreadable value read as towards the top. */
  get flowHeading(): number {
    return flowDirectionOf(this.flowDirection);
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
