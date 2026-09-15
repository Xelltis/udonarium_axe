import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';

export interface TabletopLocation {
  name: string;
  x: number;
  y: number;
  /** One of the table's own faces, or the identifier of a board standing on it. */
  surface?: string;
}

export type TableSurface = 'floor' | 'north-wall' | 'east-wall' | 'south-wall' | 'west-wall';

export const TABLE_SURFACES: readonly TableSurface[] = [
  'floor',
  'north-wall',
  'east-wall',
  'south-wall',
  'west-wall',
] as const;

/** The words a face is called by that are not the name of a face: nothing, said aloud. */
const NOT_A_SURFACE: ReadonlySet<string> = new Set(['', 'null', 'undefined']);

/**
 * The name an object gives for the face it stands on, or nothing where it gives none.
 *
 * A face left behind travels between seats as nothing and can come back written out as the
 * word for it. Read as a name it is the name of a face nobody has, which is a piece standing
 * somewhere that is not on the table at all.
 */
function namedSurface(object: { location: { surface?: string } }): string {
  const surface = object.location.surface ?? '';
  return NOT_A_SURFACE.has(surface) ? '' : surface;
}

/** The face an object stands on by name, with the floor named where it names none. */
export function surfaceKeyOf(object: { location: { surface?: string } }): string {
  const surface = namedSurface(object);
  return surface.length > 0 ? surface : 'floor';
}

/** Whether an object stands on something other than the floor: one of the walls, or a board. */
export function isOffTheFloor(object: { location: { surface?: string } }): boolean {
  return surfaceKeyOf(object) !== 'floor';
}

/**
 * The table face an object stands on, with a board, an unknown name or no name at all read as the
 * floor.
 */
export function surfaceOf(object: { location: { surface?: string } }): TableSurface {
  const surface = namedSurface(object) as TableSurface;
  return TABLE_SURFACES.includes(surface) ? surface : 'floor';
}

/**
 * The board an object is standing on, or nothing when it is on the table itself.
 *
 * A board names its face by its own identifier, so anything that is not one of the five
 * faces the table has is the name of a board.
 */
export function boardSurfaceOf(object: { location: { surface?: string } }): string {
  const surface = namedSurface(object);
  return TABLE_SURFACES.includes(surface as TableSurface) ? '' : surface;
}

@SyncObject('TabletopObject')
export class TabletopObject extends ObjectNode {
  @SyncVar() location: TabletopLocation = {
    name: 'table',
    x: 0,
    y: 0,
  };

  @SyncVar() posZ: number = 0;

  /**
   * Whether the object is out on the table rather than kept somewhere else, such as a card sent to
   * the graveyard.
   */
  get isVisibleOnTable(): boolean {
    return this.location.name === 'table';
  }

  private _dataElements: { [name: string]: string | null } = {};

  // GameDataElement getter/setter
  /**
   * The data element named after the object's alias, which holds its image, common and detail
   * sections; null before they are created.
   */
  get rootDataElement(): DataElement | null {
    for (const node of this.children) {
      if (node.getAttribute('name') === this.aliasName) return node as DataElement;
    }
    return null;
  }

  /** The section of the object's data that holds its pictures, or null when there is none. */
  get imageDataElement(): DataElement | null {
    return this.getElement('image');
  }
  /**
   * The section of the object's data that holds shared values such as its name and size, or null
   * when there is none.
   */
  get commonDataElement(): DataElement | null {
    return this.getElement('common');
  }
  /**
   * The section of the object's data that holds the free-form details shown on its sheet, or null
   * when there is none.
   */
  get detailDataElement(): DataElement | null {
    return this.getElement('detail');
  }

  /**
   * The object's name, kept in its common data. Setting it does nothing when there is no name
   * element.
   */
  get name(): string {
    return this.getCommonValue('name', '');
  }
  set name(name: string) {
    this.setCommonValue('name', name);
  }

  /**
   * The object's main picture, or the empty image when none is set or the file is not in storage.
   */
  get imageFile(): ImageFile {
    const imageIdElement = this.imageDataElement?.getFirstElementByName('imageIdentifier');
    if (!imageIdElement) return ImageFile.Empty;
    return ImageStorage.instance.get(imageIdElement.value as string) ?? ImageFile.Empty;
  }

  @SyncVar() isAltitudeIndicate: boolean = false;
  /**
   * How many cells above the table the object stands, kept in its common data; 0 when unset or not
   * a number.
   *
   * Setting it makes the altitude element when it is missing, provided the common section exists.
   */
  get altitude(): number {
    const element = this.getElement('altitude', this.commonDataElement);
    if (!element) return 0;
    const num = +element.value;
    return Number.isNaN(num) ? 0 : num;
  }
  set altitude(altitude: number) {
    const element = this.getElement('altitude', this.commonDataElement);
    if (element) {
      element.value = altitude;
      return;
    }
    const common = this.commonDataElement;
    if (!common) return;
    const created = DataElement.create('altitude', altitude, {}, `altitude_${this.identifier}`);
    common.appendChild(created);
    this._dataElements['altitude'] = created.identifier;
    this.sortCommonElements();
  }

  /**
   * Initializes the object and builds whichever data sections are missing: the root, the image
   * section with its image identifier, common and detail.
   *
   * Sections that already exist are kept, so it is safe to call again.
   */
  createDataElements() {
    this.initialize();
    const aliasName: string = this.aliasName;
    let rootEl = this.rootDataElement;
    if (!rootEl) {
      rootEl = DataElement.create(aliasName, '', {}, `${aliasName}_${this.identifier}`);
      this.appendChild(rootEl);
    }

    if (!this.imageDataElement) {
      const imageEl = DataElement.create('image', '', {}, `image_${this.identifier}`);
      rootEl.appendChild(imageEl);
      imageEl.appendChild(
        DataElement.create('imageIdentifier', '', { type: 'image' }, `imageIdentifier_${this.identifier}`)
      );
    }
    if (!this.commonDataElement) rootEl.appendChild(DataElement.create('common', '', {}, `common_${this.identifier}`));
    if (!this.detailDataElement) rootEl.appendChild(DataElement.create('detail', '', {}, `detail_${this.identifier}`));
  }

  protected getElement(name: string, from: DataElement | null = this.rootDataElement): DataElement | null {
    if (!from) return null;
    let element: DataElement | null = this._dataElements[name]
      ? ObjectStore.instance.get(this._dataElements[name])
      : null;
    if (!element || !from.contains(element)) {
      element = from.getFirstElementByName(name);
      this._dataElements[name] = element ? element.identifier : null;
    }
    return element;
  }

  protected getCommonValue<T extends string | number>(elementName: string, defaultValue: T): T {
    const element = this.getElement(elementName, this.commonDataElement);
    if (!element) return defaultValue;

    if (typeof defaultValue === 'number') {
      const number: number = +element.value;
      return (Number.isNaN(number) ? defaultValue : number) as T;
    } else {
      return `${element.value}` as T;
    }
  }

  protected setCommonValue(elementName: string, value: string | number) {
    const element = this.getElement(elementName, this.commonDataElement);
    if (!element) {
      return;
    }
    element.value = value;
  }

  protected getImageFile(elementName: string): ImageFile | null {
    if (!this.imageDataElement) return null;
    const image = this.getElement(elementName, this.imageDataElement);
    return image ? ImageStorage.instance.get(image.value as string) : null;
  }

  protected getOpacityValue(): number {
    const element = this.getElement('opacity', this.commonDataElement);
    const num = element ? (element.currentValue as number) / (element.value as number) : 1;
    return Number.isNaN(num) ? 1 : num;
  }

  /**
   * How opaque the object is, from 0 to 1: the opacity resource's current value over its maximum,
   * or 1 when there is none or it is not a number.
   */
  get opacity(): number {
    return this.getOpacityValue();
  }

  /**
   * Moves the object to a named place, such as the table or the graveyard, and marks it changed so
   * that peers pick up the move.
   */
  setLocation(location: string) {
    this.location.name = location;
    this.update();
    markForChanged(this);
  }

  /**
   * Reads the object from saved XML, then drops duplicate altitude elements and puts the common
   * values back in their standard order.
   */
  override parseInnerXml(element: Element): void {
    super.parseInnerXml(element);
    this.deduplicateAltitudeElements();
    this.sortCommonElements();
  }

  private static readonly COMMON_ELEMENT_ORDER: readonly string[] = [
    'name',
    'size',
    'width',
    'height',
    'depth',
    'altitude',
  ];

  private deduplicateAltitudeElements(): void {
    const common = this.commonDataElement;
    if (!common) return;
    const altitudes = common.getElementsByName('altitude');
    if (altitudes.length <= 1) return;
    const canonical = altitudes.find((e) => TabletopObject.hasMeaningfulValue(e)) ?? altitudes[0];
    for (const altitude of altitudes) {
      if (altitude === canonical) continue;
      altitude.parent?.removeChild(altitude);
    }
    this._dataElements['altitude'] = canonical.identifier;
  }

  private static hasMeaningfulValue(element: DataElement): boolean {
    const value = element.value;
    if (typeof value === 'string') {
      if (value === '') return false;
      const num = +value;
      return Number.isNaN(num) || num !== 0;
    }
    return value !== 0;
  }

  private sortCommonElements(): void {
    const common = this.commonDataElement;
    if (!common) return;

    const order = TabletopObject.COMMON_ELEMENT_ORDER;
    const targets = common.children.filter((c) => order.includes(c.getAttribute('name')));
    if (targets.length < 2) return;

    const slotIndices = targets.map((c) => c.index);
    const sorted = [...targets].sort(
      (a, b) => order.indexOf(a.getAttribute('name')) - order.indexOf(b.getAttribute('name'))
    );

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].index !== slotIndices[i]) sorted[i].index = slotIndices[i];
    }
  }
}
