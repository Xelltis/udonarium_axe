import { ImageFile } from '@axe/core/storage/image-file';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { DataElement } from '@axe/domain/data/data-element';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  encodeSlopeSides,
  legacySlopeDirection,
  parseSlopeSides,
  SlopeDirection,
  SlopeSide,
} from '@axe/domain/tabletop/terrain-slope';
import {
  DEFAULT_LIGHT_COLOR,
  LightAnimation,
  LightCategory,
  LightPreset,
  LightSpec,
} from '@axe/domain/tabletop/vision-types';

export enum TerrainViewState {
  NULL = 0,
  FLOOR = 1,
  WALL = 2,
  ALL = 3,
}

export enum DoorStyle {
  /** Not a door at all, which is every piece of terrain until it is told otherwise. */
  NONE = 'none',
  /** Turns on its hinge. */
  SWING = 'swing',
  /** Runs sideways into the wall beside it. */
  SLIDE = 'slide',
  /** Rises into the ceiling, the way a portcullis does. */
  LIFT = 'lift',
  /** Drops into the floor. */
  SINK = 'sink',
}

export const DOOR_STYLES: readonly DoorStyle[] = [DoorStyle.SWING, DoorStyle.SLIDE, DoorStyle.LIFT, DoorStyle.SINK];

export type TerrainFace = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';

/** Every picture a terrain holds: its faces, the two that stand in for them, and its own. */
export type TerrainImageSlot = TerrainFace | 'wall' | 'floor' | 'imageIdentifier';

export const TERRAIN_FACES: readonly TerrainFace[] = ['top', 'bottom', 'north', 'south', 'east', 'west'] as const;

@SyncObject('terrain')
export class Terrain extends TabletopObject {
  @SyncVar() isLocked: boolean = false;
  @SyncVar() mode: TerrainViewState = TerrainViewState.ALL;
  @SyncVar() rotate: number = 0;
  @SyncVar() isDropShadow: boolean = true;
  @SyncVar() isSlope: boolean = false;
  @SyncVar() isSurfaceShading: boolean = true;
  @SyncVar() slopeDirection: number = SlopeDirection.NONE;
  /**
   * The sides the slope runs down to, as their names in one line, such as `n,e`.
   *
   * {@link slopeSides} reads and writes it. A room saved before a block could slope to more
   * than one side carries nothing here and is read from {@link slopeDirection} instead.
   */
  @SyncVar() slopeSideNames: string = '';

  /**
   * The sides this block's top runs down to, as the block holds them.
   *
   * A block sloping to one side is a ramp up to the side across from it, the way a slope has
   * always read; sloping to every side raises a pyramid over the middle. Setting them turns
   * the slope on or off with them, and leaves an older peer the single direction it knows.
   */
  get slopeSides(): SlopeSide[] {
    if (!this.isSlope) return [];
    return parseSlopeSides(this.slopeSideNames, this.slopeDirection);
  }
  set slopeSides(sides: readonly SlopeSide[]) {
    this.slopeSideNames = encodeSlopeSides(sides);
    this.slopeDirection = legacySlopeDirection(sides);
    this.isSlope = sides.length > 0;
  }

  @SyncVar() isGrid: boolean = false;
  @SyncVar() isTiledTexture: boolean = false;

  @SyncVar() blocksSight: boolean = true;
  @SyncVar() blocksLight: boolean = true;

  /**
   * A face too sheer to get up, which a piece goes around rather than over.
   *
   * Terrain otherwise reads as something to be stood on: walk a piece at a low wall and it
   * steps up onto it. A cliff, a chasm wall or a pane of glass is not that, and says so here.
   */
  @SyncVar() blocksClimb: boolean = false;

  @SyncVar() doorStyle: string = DoorStyle.NONE;
  @SyncVar() isDoorOpen: boolean = false;
  /**
   * Which way round it opens: the hinge at the other end, the slide the other way.
   *
   * Two doors filling one opening are a pair, and a pair opens outward from the middle. Both
   * turning the same way is what a single door does, and reads as one door cut in half.
   */
  @SyncVar() doorMirrored: boolean = false;

  /** Whether this terrain is a door of any style. */
  get isDoor(): boolean {
    return this.doorStyle !== DoorStyle.NONE;
  }

  /**
   * What the terrain stops right now, rather than what it stops when shut.
   *
   * An open door has to let sight and light past without forgetting that it blocks them
   * when it is closed again, so the standing setting is left alone and read through here.
   */
  get blocksSightNow(): boolean {
    return this.blocksSight && !(this.isDoor && this.isDoorOpen);
  }
  /** The light counterpart of blocksSightNow: blocks light only while it is not an open door. */
  get blocksLightNow(): boolean {
    return this.blocksLight && !(this.isDoor && this.isDoorOpen);
  }

  @SyncVar() lightEnabled: boolean = false;
  @SyncVar() lightPreset: string = LightPreset.CUSTOM;
  @SyncVar() lightBrightRadius: number = 0;
  @SyncVar() lightDimRadius: number = 0;
  @SyncVar() lightColor: string = DEFAULT_LIGHT_COLOR;
  @SyncVar() lightAngle: number = 360;
  @SyncVar() lightDirection: number = 0;
  @SyncVar() lightPitch: number = 0;
  @SyncVar() lightAnimation: string = LightAnimation.NONE;

  /**
   * The terrain's light settings gathered into the shape the vision scene reads, with the direction
   * turned along with the terrain.
   */
  get lightSpec(): LightSpec {
    return {
      enabled: this.lightEnabled,
      preset: this.lightPreset as LightPreset,
      brightRadius: this.lightBrightRadius,
      dimRadius: this.lightDimRadius,
      color: this.lightColor,
      angle: this.lightAngle,
      direction: this.rotate + this.lightDirection,
      pitch: this.lightPitch,
      animation: this.lightAnimation as LightAnimation,
      category: LightCategory.PHYSICAL,
      ignoreOcclusion: false,
      revealToAll: false,
      castShadows: true,
    };
  }

  /** How many grid cells wide the terrain is, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  set width(width: number) {
    this.setCommonValue('width', width);
  }
  /** How many grid cells tall the terrain stands, kept in its common data. */
  get height(): number {
    return this.getCommonValue('height', 1);
  }
  set height(height: number) {
    this.setCommonValue('height', height);
  }
  /** How many grid cells deep the terrain is, kept in its common data. */
  get depth(): number {
    return this.getCommonValue('depth', 1);
  }
  set depth(depth: number) {
    this.setCommonValue('depth', depth);
  }
  /**
   * The picture shared by every upright face without one of its own, or null when unset or not in
   * storage.
   */
  get wallImage(): ImageFile | null {
    return this.getImageFile('wall');
  }
  /**
   * The picture shared by the top and the underside when they have none of their own, or null when
   * unset or not in storage.
   */
  get floorImage(): ImageFile | null {
    return this.getImageFile('floor');
  }

  /** The top face's picture, falling back to the floor picture. */
  get topImage(): ImageFile | null {
    return this.getImageFile('top') ?? this.floorImage;
  }
  /** The underside's picture, falling back to the floor picture. */
  get bottomImage(): ImageFile | null {
    return this.getImageFile('bottom') ?? this.floorImage;
  }
  /** The north face's picture, falling back to the wall picture. */
  get northImage(): ImageFile | null {
    return this.getImageFile('north') ?? this.wallImage;
  }
  /** The south face's picture, falling back to the wall picture. */
  get southImage(): ImageFile | null {
    return this.getImageFile('south') ?? this.wallImage;
  }
  /** The east face's picture, falling back to the wall picture. */
  get eastImage(): ImageFile | null {
    return this.getImageFile('east') ?? this.wallImage;
  }
  /** The west face's picture, falling back to the wall picture. */
  get westImage(): ImageFile | null {
    return this.getImageFile('west') ?? this.wallImage;
  }

  /** The picture one face is drawn with, after falling back to the shared wall or floor picture. */
  faceImage(face: TerrainFace): ImageFile | null {
    switch (face) {
      case 'top':
        return this.topImage;
      case 'bottom':
        return this.bottomImage;
      case 'north':
        return this.northImage;
      case 'south':
        return this.southImage;
      case 'east':
        return this.eastImage;
      case 'west':
        return this.westImage;
    }
  }

  /** The name written down for one picture, empty where none was. */
  faceImageIdentifier(face: TerrainImageSlot): string {
    const images = this.imageDataElement;
    if (!images) return '';
    const element = this.getElement(face, images);
    return element ? `${element.value ?? ''}` : '';
  }

  /**
   * Whether any face has been given a picture, whether or not that picture is to hand.
   *
   * Asked of the name written down rather than of the image it names: a picture that has not
   * arrived from another table yet is still a picture somebody chose, and a wall must not
   * turn to glass while it is on its way.
   */
  get hasFaceImage(): boolean {
    const images = this.imageDataElement;
    if (!images) return false;
    for (const name of ['wall', 'floor', ...TERRAIN_FACES] as const) {
      if (this.faceImageIdentifier(name).length > 0) return true;
    }
    return false;
  }

  /**
   * Sets the picture for one face or shared slot, making its image element when missing. Does
   * nothing when the terrain has no image section.
   */
  setFaceImage(face: TerrainImageSlot, imageIdentifier: string): void {
    const imageEl = this.imageDataElement;
    if (!imageEl) return;
    const existing = this.getElement(face, imageEl);
    if (existing) {
      existing.value = imageIdentifier;
      return;
    }
    imageEl.appendChild(DataElement.create(face, imageIdentifier, { type: 'image' }, `${face}_${this.identifier}`));
  }

  /** Whether the terrain's view mode draws its walls. */
  get hasWall(): boolean {
    return (this.mode & TerrainViewState.WALL) !== 0;
  }
  /** Whether the terrain's view mode draws its floor. */
  get hasFloor(): boolean {
    return (this.mode & TerrainViewState.FLOOR) !== 0;
  }

  /**
   * Makes a terrain with its name, size, and wall and floor pictures, and registers it for sync.
   */
  static create(
    name: string,
    width: number,
    depth: number,
    height: number,
    wall: string,
    floor: string,
    identifier?: string
  ): Terrain {
    let object: Terrain;

    if (identifier) {
      object = new Terrain(identifier);
    } else {
      object = new Terrain();
    }
    object.createDataElements();

    object.commonDataElement!.appendChild(DataElement.create('name', name, {}, `name_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('width', width, {}, `width_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('height', height, {}, `height_${object.identifier}`));
    object.commonDataElement!.appendChild(DataElement.create('depth', depth, {}, `depth_${object.identifier}`));
    object.imageDataElement!.appendChild(
      DataElement.create('wall', wall, { type: 'image' }, `wall_${object.identifier}`)
    );
    object.imageDataElement!.appendChild(
      DataElement.create('floor', floor, { type: 'image' }, `floor_${object.identifier}`)
    );
    object.initialize();

    return object;
  }
}
