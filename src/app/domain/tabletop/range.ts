import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { GameCharacter } from '@axe/domain/character/game-character';
import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { centerFollowerOnCharacter } from '@axe/domain/tabletop/following';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';
import {
  asSolidKind,
  DEFAULT_SOLID_HEIGHT,
  DEFAULT_SOLID_REACH,
  isAimedSolid,
  SolidKind,
  solidKindOf,
} from '@axe/domain/tabletop/solid/solid-kind';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export const RANGE_DEFAULT_FILL_COLOR = '#FFFF00';
export const RANGE_DEFAULT_BORDER_COLOR = '#000000';
/** The name older rooms saved the diamond under. */
const LEGACY_DIAMOND = 'DIAMOND';

/**
 * The value as a number, or the default where it is none: a synchronised number arrives as text from
 * saved data, and as empty text from a version that does not know the field, which is not nought.
 */
function numberOr(value: unknown, otherwise: number): number {
  if (typeof value === 'string' && value.trim() === '') return otherwise;
  const read = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(read) ? read : otherwise;
}

/** The value as a number above nought, or the default where it is not one. */
function positiveOr(value: unknown, otherwise: number): number {
  const read = numberOr(value, otherwise);
  return read > 0 ? read : otherwise;
}

@SyncObject('range')
export class RangeArea extends TabletopObject {
  constructor(identifier: string = generateUuid()) {
    super(identifier);
    this.isAltitudeIndicate = true;
  }
  @SyncVar() isLock: boolean = false;
  @SyncVar() rotate: number = 0;
  /** The saved name is out there misspelt. The name here is corrected and the saved one left alone. */
  @SyncVar('followingCharctorIdentifier') followingCharacterIdentifier: string = '';
  @SyncVar() followingCounterDummy: number = 0; // a dummy changed to redraw while following

  @SyncVar() offSetX: boolean = false;
  @SyncVar() offSetY: boolean = false;
  @SyncVar() gridColor: string = RANGE_DEFAULT_FILL_COLOR;
  @SyncVar() rangeColor: string = RANGE_DEFAULT_BORDER_COLOR;
  @SyncVar('type') private _type: string = 'CORN';
  @SyncVar() fillOutLine: boolean = false;
  @SyncVar() subDivisionSnapPolygonal: boolean = true;
  @SyncVar() cellPattern: string = '';
  @SyncVar() customGridType: string = '';
  @SyncVar() isRotatable: boolean = false;
  /**
   * Whether it is put down wherever it is let go, off the table's grid whatever the table snaps to;
   * read through {@link placesFreely}.
   */
  @SyncVar() freePlacement: boolean = false;
  /** The hotbar slot that laid this out, so the same slot can take it down again later. */
  @SyncVar() laidByHotbarSlot: string = '';
  /** What it stands up as, written as {@link SolidKind}; read through {@link solidKind}. */
  @SyncVar() solid: string = '';
  /** How tall it stands as a column, in the range's squares; read through {@link columnHeight}. */
  @SyncVar() solidHeight: number = DEFAULT_SOLID_HEIGHT;
  /**
   * How far from the piece it follows a sphere or a column may be put, in the range's squares; read
   * through {@link reachSquares}.
   */
  @SyncVar() solidReach: number = DEFAULT_SOLID_REACH;
  /** How steeply a cone or a beam points up, in degrees; read through {@link aimPitch}. */
  @SyncVar() pitch: number = 0;
  /**
   * How far a sphere or a column stands from the middle of the piece it follows, east and south, in
   * the table's cells; read through {@link casterOffset}.
   */
  @SyncVar() casterOffsetX: number = 0;
  @SyncVar() casterOffsetY: number = 0;

  /**
   * Whether it is put down wherever it is let go, as {@link freePlacement} is set: true alone, or the
   * text a version that does not know the field passes on, so that `false` passed on as text is not
   * taken to be set. A shape of its own cells never is, as they keep to the cell its point is in.
   */
  get placesFreely(): boolean {
    if (this.type === 'CUSTOM') return false;
    const set: unknown = this.freePlacement;
    return set === true || set === 'true';
  }

  /** Sets it to be put down wherever it is let go, or not; see {@link placesFreely}. */
  set placesFreely(free: boolean) {
    this.freePlacement = free;
  }

  /**
   * What it stands up as: flat where it was never set or set to a kind nobody knows, and a column
   * where it was set to a round kind its shape cannot take.
   */
  get solidKind(): SolidKind {
    return solidKindOf(asSolidKind(this.solid), this.type);
  }
  set solidKind(kind: SolidKind) {
    this.solid = kind;
  }

  /** Whether it stands up off the table at all. */
  get isSolid(): boolean {
    return this.solidKind !== '';
  }

  /**
   * How tall it stands as a column, in the range's squares: the default where it is not a number
   * above nought, as where a version that does not know it passed it on empty.
   */
  get columnHeight(): number {
    return positiveOr(this.solidHeight, DEFAULT_SOLID_HEIGHT);
  }
  set columnHeight(height: number) {
    this.solidHeight = height;
  }

  /**
   * How far a sphere or a column may be put from the piece it follows, in the range's squares: the
   * default where it is not a number, and nought, which keeps it on the piece, where it is less.
   */
  get reachSquares(): number {
    const reach = numberOr(this.solidReach, DEFAULT_SOLID_REACH);
    return Math.max(0, reach);
  }
  set reachSquares(reach: number) {
    this.solidReach = reach;
  }

  /** How steeply a cone or a beam points up, in degrees, held between straight down and straight up. */
  get aimPitch(): number {
    return Math.max(-90, Math.min(90, numberOr(this.pitch, 0)));
  }
  set aimPitch(pitch: number) {
    this.pitch = pitch;
  }

  /**
   * How far a sphere or a column stands from the middle of the piece it follows, east and south, in
   * the table's cells; nought each way where it is not a number.
   */
  get casterOffset(): { x: number; y: number } {
    return { x: numberOr(this.casterOffsetX, 0), y: numberOr(this.casterOffsetY, 0) };
  }
  set casterOffset(offset: { x: number; y: number }) {
    this.casterOffsetX = offset.x;
    this.casterOffsetY = offset.y;
  }

  /**
   * Whether it is put off the middle of the piece it follows: a sphere or a column, which stands where
   * it was put round the piece, rather than a flat range, a cone or a beam, which start from its
   * middle.
   */
  get keepsCasterOffset(): boolean {
    return this.isSolid && !isAimedSolid(this.solidKind);
  }

  /**
   * The range's shape: `LINE`, `CORN`, `TRIANGLE`, `SQUARE`, `RHOMBUS` (the diamond: the cells a
   * walk of the range's length reaches, counting no diagonals), `PENTAGON`, `HEXAGON`, `CIRCLE` or
   * `CUSTOM`.
   *
   * The diamond goes by a name of its own rather than the `DIAMOND` older rooms saved it under: a
   * version before it came back reads `DIAMOND` as a square turned an eighth and would write that
   * back over everyone's diamond the next time it moved one. A `DIAMOND` set or read is the diamond.
   */
  get type(): string {
    return this._type;
  }
  set type(type: string) {
    this._type = type === LEGACY_DIAMOND ? 'RHOMBUS' : type;
  }

  /** How far the range reaches, in grid cells, kept in its common data. */
  get length(): number {
    return this.getCommonValue('length', 1);
  }
  set length(length: number) {
    this.setCommonValue('length', length);
  }
  /** How wide the range is, in grid cells, kept in its common data. */
  get width(): number {
    return this.getCommonValue('width', 1);
  }
  set width(width: number) {
    this.setCommonValue('width', width);
  }

  /**
   * How much of the range is painted, as a share of the whole its sheet keeps.
   *
   * The sheet holds this as a resource: the whole in `value` and what is used in
   * `currentValue`, which is the half the reader moves.
   */
  setOpacityPercent(percent: number): void {
    const element = this.getElement('opacity', this.commonDataElement);
    if (!element) return;

    const whole = Number(element.value);
    const full = Number.isFinite(whole) && whole > 0 ? whole : 100;
    element.currentValue = Math.round(Math.max(0, Math.min(full, percent)));
  }

  /**
   * Sizes the range to the box round its cell pattern, at least one cell each way, so a shape of its
   * own cells is counted and painted at the size it was drawn.
   */
  fitToPattern(): void {
    const bb = cellPatternBoundingBox(parseCellPattern(this.cellPattern));
    this.length = Math.max(1, bb.height);
    this.width = Math.max(1, bb.width);
  }

  /**
   * Bumps the follow counter, wrapping at 50, so that peers see a change and redraw the range while
   * it follows a character.
   */
  followingCounterDummyCount() {
    this.followingCounterDummy++;
    if (this.followingCounterDummy >= 50) this.followingCounterDummy = 0;
  }

  /** Reads a range saved with the diamond's older name as the diamond when it arrives in the store. */
  override onStoreAdded() {
    super.onStoreAdded();
    this.normalizeLegacyDiamond();
  }

  /** Applies a synced update, reading the diamond's older name as the diamond if it carried one. */
  override apply(context: ObjectContext) {
    super.apply(context);
    this.normalizeLegacyDiamond();
  }

  /**
   * Moves the range onto the centre of the character it follows, on a table whose cells are
   * `gridSize` across, and bumps the follow counter. A sphere or a column is moved as far off that
   * centre as it was put round the character.
   *
   * When that character is gone, the range stops following instead.
   */
  following(gridSize: number) {
    const object = ObjectStore.instance.get<GameCharacter>(this.followingCharacterIdentifier);
    if (!object) {
      this.followingCharacterIdentifier = '';
      return;
    }

    centerFollowerOnCharacter(this, object, gridSize);
    if (this.keepsCasterOffset) {
      const offset = this.casterOffset;
      this.location.x += offset.x * gridSize;
      this.location.y += offset.y * gridSize;
    }
    this.followingCounterDummyCount();
  }

  /** Makes a range with its name, length, width and opacity data, and registers it for sync. */
  static create(name: string, width: number, length: number, opacity: number, identifier?: string): RangeArea {
    let object: RangeArea;

    if (identifier) {
      object = new RangeArea(identifier);
    } else {
      object = new RangeArea();
    }
    object.createDataElements();

    appendPieceDataElements(object, name, { length, width }, opacity);
    object.initialize();

    return object;
  }

  /**
   * Makes a range shaped by a cell pattern, sized to the pattern's bounding box and at least one
   * cell each way.
   */
  static createCustom(
    name: string,
    cellPattern: string,
    gridType: string,
    opacity: number,
    options: { isRotatable?: boolean; identifier?: string } = {}
  ): RangeArea {
    const object = RangeArea.create(name, 1, 1, opacity, options.identifier);
    object._type = 'CUSTOM';
    object.cellPattern = cellPattern;
    object.customGridType = gridType;
    object.isRotatable = options.isRotatable === true;
    object.fitToPattern();
    return object;
  }

  private normalizeLegacyDiamond(): void {
    if (this._type === LEGACY_DIAMOND) this.attributes['type'] = 'RHOMBUS';
  }
}
