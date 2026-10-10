import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { GameCharacter } from '@axe/domain/character/game-character';
import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { appendPieceDataElements } from '@axe/domain/tabletop/piece-data-elements';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export const RANGE_DEFAULT_FILL_COLOR = '#FFFF00';
export const RANGE_DEFAULT_BORDER_COLOR = '#000000';

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
  @SyncVar() followingCounterDummy: number = 0; // 追従時再描画用ダミー

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
  /** The hotbar slot that laid this out, so the same slot can take it down again later. */
  @SyncVar() laidByHotbarSlot: string = '';

  /**
   * The range's shape, such as `CORN`, `SQUARE` or `CUSTOM`.
   *
   * Setting the retired `DIAMOND` shape stores a square turned 45 degrees instead.
   */
  get type(): string {
    return this._type;
  }
  set type(type: string) {
    if (type === 'DIAMOND') {
      this._type = 'SQUARE';
      this.rotate = this.rotate + 45;
      return;
    }
    this._type = type;
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

  gridSize: number = 50;

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
   * Bumps the follow counter, wrapping at 50, so that peers see a change and redraw the range while
   * it follows a character.
   */
  followingCounterDummyCount() {
    this.followingCounterDummy++;
    if (this.followingCounterDummy >= 50) this.followingCounterDummy = 0;
  }

  /**
   * Rewrites a range saved with the retired diamond shape as a turned square when it arrives in the
   * store.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.normalizeLegacyDiamondType();
  }

  /**
   * Applies a synced update, then rewrites the retired diamond shape as a turned square if the
   * update carried one.
   */
  override apply(context: ObjectContext) {
    super.apply(context);
    this.normalizeLegacyDiamondType();
  }

  /**
   * Moves the range onto the centre of the character it follows and bumps the follow counter.
   *
   * When that character is gone, the range stops following instead.
   */
  following() {
    const object = ObjectStore.instance.get<GameCharacter>(this.followingCharacterIdentifier);
    if (!object) {
      this.followingCharacterIdentifier = '';
      return;
    }

    this.location.x = object.location.x + (this.gridSize * object.size) / 2;
    this.location.y = object.location.y + (this.gridSize * object.size) / 2;
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
    const cells = parseCellPattern(cellPattern);
    const bb = cellPatternBoundingBox(cells);
    const width = Math.max(1, bb.width);
    const length = Math.max(1, bb.height);
    const object = RangeArea.create(name, width, length, opacity, options.identifier);
    object._type = 'CUSTOM';
    object.cellPattern = cellPattern;
    object.customGridType = gridType;
    object.isRotatable = options.isRotatable === true;
    return object;
  }

  private normalizeLegacyDiamondType() {
    if (this._type !== 'DIAMOND') return;
    this.attributes['type'] = 'SQUARE';
    this.attributes['rotate'] = Number(this.rotate) + 45;
  }
}
