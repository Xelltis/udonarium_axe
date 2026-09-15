import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';

const SAN_PATTERN = /^[SsＳｓ][AaＡａ][NnＮn]$/i;
const SANITY_PATTERN = /^正気度$/i;
const SAN_WARNING_THRESHOLD = 0.8;
const SAN_WARNING_COLOR = '#D22';
const DEFAULT_VALUE_COLOR = '#444';

export const DataElementType = {
  NUMBER_RESOURCE: 'numberResource',
  TEXT: '',
  NOTE: 'note',
  CHECK_TABLE: 'checktable',
  MARKDOWN: 'markdown',
  CHECK: 'check',
  IMAGE: 'image',
} as const;

export type DataElementTypeValue = (typeof DataElementType)[keyof typeof DataElementType];

export const DataElementRole = {
  SECTION: 'section',
  GROUP: 'group',
  FIELD: 'field',
} as const;

export type DataElementRoleValue = (typeof DataElementRole)[keyof typeof DataElementRole];

export const DataElementFieldType = {
  TEXT: 'text',
  NUMBER: 'number',
  RESOURCE: 'resource',
  LONG_TEXT: 'longText',
  MARKDOWN: 'markdown',
  CHECK: 'check',
  SELECT: 'select',
  CHECK_TABLE: 'checkTable',
  IMAGE: 'image',
  CALC: 'calc',
  RANGE_SHAPE: 'rangeShape',
  EFFECT: 'effect',
} as const;

export type DataElementFieldTypeValue = (typeof DataElementFieldType)[keyof typeof DataElementFieldType];

export const DataElementViewMode = {
  NORMAL: 'normal',
  TABLE: 'table',
} as const;

export type DataElementViewModeValue = (typeof DataElementViewMode)[keyof typeof DataElementViewMode];

export const DataElementAttribute = {
  ROLE: 'role',
  FIELD_TYPE: 'fieldType',
  VIEW_MODE: 'viewMode',
  CHOICES: 'choices',
  UNIT: 'unit',
  MIN: 'min',
  MAX: 'max',
  MIN_BASE: 'min-base',
  MIN_CORRECTION: 'min-correction',
  MAX_BASE: 'max-base',
  MAX_CORRECTION: 'max-correction',
  FORMULA: 'formula',
  CELL_TEXT: 'cellText',
  COLUMN_LABEL: 'columnLabel',
  COLUMN_GROUP: 'columnGroup',
  ROW_HEADER_LABEL: 'rowHeaderLabel',
  CELL_KIND: 'cellKind',
  POPUP: 'cs-popup',
  IMAGE_POPUP_ORIGINAL: 'cs-image-popup-original',
  JUDGE_MODE: 'cs-judge-mode',
  PIECE_GAUGE: 'cs-piece-gauge',
  GAUGE_INVERTED: 'cs-gauge-inverted',
  CHANGE_EFFECT: 'cs-change-effect',
  CHANGE_SOUND: 'cs-change-sound',
  CHANGE_SOUND_SET: 'cs-change-sound-set',
  BUFF_ICON: 'cs-buff-icon',
  BUFF_COLOR: 'cs-buff-color',
  BUFF_TIMING: 'cs-buff-timing',
  BUFF_TRIGGER: 'cs-buff-trigger',
  BUFF_MOD_TARGET: 'cs-buff-mod-target',
  BUFF_MOD_SLOT: 'cs-buff-mod-slot',
  BUFF_MOD_OPERATOR: 'cs-buff-mod-operator',
  BUFF_MOD_APPLIED: 'cs-buff-mod-applied',
  GAP_DISTANCE: 'cs-gap-distance',
  LOOP_HORIZONTAL: 'cs-loop-horizontal',
  LOOP_VERTICAL: 'cs-loop-vertical',
  BASE_DIFFICULTY: 'cs-base-difficulty',
} as const;

const DATA_ELEMENT_ROLE_VALUES = new Set<string>(Object.values(DataElementRole));
const DATA_ELEMENT_FIELD_TYPE_VALUES = new Set<string>(Object.values(DataElementFieldType));
const DATA_ELEMENT_VIEW_MODE_VALUES = new Set<string>(Object.values(DataElementViewMode));

function isDataElementRole(value: string): value is DataElementRoleValue {
  return DATA_ELEMENT_ROLE_VALUES.has(value);
}

function isDataElementFieldType(value: string): value is DataElementFieldTypeValue {
  return DATA_ELEMENT_FIELD_TYPE_VALUES.has(value);
}

function isDataElementViewMode(value: string): value is DataElementViewModeValue {
  return DATA_ELEMENT_VIEW_MODE_VALUES.has(value);
}

function escapeReferencePathPart(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\//g, '\\/');
}

function parseReferencePath(reference: string): string[] {
  const parts: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of reference.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '/') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (escaped) current += '\\';
  parts.push(current.trim());

  return parts.filter((part) => part.length > 0);
}

@SyncObject('data')
export class DataElement extends ObjectNode {
  @SyncVar() name: string;
  @SyncVar() type: string;
  @SyncVar() currentValue: number | string;

  /** The data elements directly under this one on the sheet. */
  override get children(): readonly DataElement[] {
    return super.children as readonly DataElement[];
  }

  /** Whether this is a resource such as HP, whose `value` is the maximum and `currentValue` the amount left. */
  get isNumberResource(): boolean {
    return this.type != null && this.type === DataElementType.NUMBER_RESOURCE;
  }
  /** Whether this is a multi-line note. */
  get isNote(): boolean {
    return this.type != null && this.type === DataElementType.NOTE;
  }

  /** Whether a check field is ticked; any value other than 0 or `'0'` counts as ticked. */
  get isChecked(): boolean {
    return this.value !== 0 && this.value !== '0';
  }

  /**
   * Whether this element is a section, a group or a field on the sheet.
   *
   * Without an explicit role it is worked out from position: directly under the detail element is a section,
   * an element with no children is a field, and anything else is a group.
   */
  get fieldRole(): DataElementRoleValue {
    const role = this.getAttribute(DataElementAttribute.ROLE);
    if (isDataElementRole(role)) return role;
    return this.inferFieldRole();
  }

  /** How the field is edited and shown, falling back to what the older `type` implies when none is set. */
  get fieldType(): DataElementFieldTypeValue {
    const fieldType = this.getAttribute(DataElementAttribute.FIELD_TYPE);
    if (isDataElementFieldType(fieldType)) return fieldType;
    return DataElement.fieldTypeFromDataType(this.type);
  }

  /** Whether a section or group lays its contents out as a list or as a table; a list when unset. */
  get viewMode(): DataElementViewModeValue {
    const viewMode = this.getAttribute(DataElementAttribute.VIEW_MODE);
    if (isDataElementViewMode(viewMode)) return viewMode;
    return DataElementViewMode.NORMAL;
  }

  /** Stores an explicit section, group or field role, which then wins over the one worked out from position. */
  setFieldRole(role: DataElementRoleValue): void {
    this.setAttribute(DataElementAttribute.ROLE, role);
  }

  /** Stores the field type; the older `type` is left as it is. */
  setFieldType(fieldType: DataElementFieldTypeValue): void {
    this.setAttribute(DataElementAttribute.FIELD_TYPE, fieldType);
  }

  /** Stores the view mode, removing the attribute for the list layout since that is the default. */
  setViewMode(viewMode: DataElementViewModeValue): void {
    if (viewMode === DataElementViewMode.NORMAL) this.removeAttribute(DataElementAttribute.VIEW_MODE);
    else this.setAttribute(DataElementAttribute.VIEW_MODE, viewMode);
  }

  /**
   * Resource bound model:
   *   minBase + minCorrection = effective lower bound
   *   maxBase + maxCorrection = effective upper bound
   * Falls back to legacy `min` / `max` attributes when the new ones are absent.
   * Empty/non-numeric attributes contribute 0 to a present sum, or `null` (= unbounded)
   * when neither base nor legacy attribute is set.
   */
  private static parseAttrNumber(raw: string): number | null {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** The resource's configured lower bound before corrections, or the older `min`; null when there is none. */
  get minBase(): number | null {
    const base = DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MIN_BASE));
    return base ?? DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MIN));
  }
  /** The amount added to the lower bound on top of its base; 0 when unset or not a number. */
  get minCorrection(): number {
    return DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MIN_CORRECTION)) ?? 0;
  }
  /** The resource's configured upper bound before corrections, or the older `max`; null when there is none. */
  get maxBase(): number | null {
    const base = DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MAX_BASE));
    return base ?? DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MAX));
  }
  /** The amount added to the upper bound on top of its base; 0 when unset or not a number. */
  get maxCorrection(): number {
    return DataElement.parseAttrNumber(this.getAttribute(DataElementAttribute.MAX_CORRECTION)) ?? 0;
  }

  /** Effective lower bound: minBase + minCorrection. `null` when no minimum is configured. */
  get effectiveMin(): number | null {
    const base = this.minBase;
    if (base == null) return null;
    return base + this.minCorrection;
  }

  /** Effective upper bound: maxBase + maxCorrection. `null` when no maximum is configured. */
  get effectiveMax(): number | null {
    const base = this.maxBase;
    if (base == null) return null;
    return base + this.maxCorrection;
  }

  /** The field type an element with only the older `type` behaves as; an unknown type is a text field. */
  static fieldTypeFromDataType(type: string): DataElementFieldTypeValue {
    switch (type) {
      case DataElementType.NUMBER_RESOURCE:
        return DataElementFieldType.RESOURCE;
      case DataElementType.NOTE:
        return DataElementFieldType.LONG_TEXT;
      case DataElementType.CHECK_TABLE:
        return DataElementFieldType.CHECK_TABLE;
      case DataElementType.MARKDOWN:
        return DataElementFieldType.MARKDOWN;
      case DataElementType.CHECK:
        return DataElementFieldType.CHECK;
      case DataElementType.IMAGE:
        return DataElementFieldType.IMAGE;
      default:
        return DataElementFieldType.TEXT;
    }
  }

  /**
   * The older `type` to store alongside a field type, so the element still reads sensibly where only `type` is
   * understood.
   *
   * Field types with no older counterpart, such as number, select or calc, map to plain text.
   */
  static dataTypeFromFieldType(fieldType: string): DataElementTypeValue {
    switch (fieldType) {
      case DataElementFieldType.RESOURCE:
        return DataElementType.NUMBER_RESOURCE;
      case DataElementFieldType.LONG_TEXT:
        return DataElementType.NOTE;
      case DataElementFieldType.CHECK_TABLE:
        return DataElementType.CHECK_TABLE;
      case DataElementFieldType.MARKDOWN:
        return DataElementType.MARKDOWN;
      case DataElementFieldType.CHECK:
        return DataElementType.CHECK;
      case DataElementFieldType.IMAGE:
        return DataElementType.IMAGE;
      default:
        return DataElementType.TEXT;
    }
  }

  /**
   * Makes a data element with the given name, value and attributes and adds it to the object store.
   *
   * Pass an identifier to give the element a fixed id; otherwise a new one is generated. The element is not
   * placed under any parent.
   */
  public static create(
    name: string,
    value: number | string = '',
    attributes: Attributes = {},
    identifier: string = ''
  ): DataElement {
    let dataElement: DataElement;
    if (identifier && identifier.length > 0) {
      dataElement = new DataElement(identifier);
    } else {
      dataElement = new DataElement();
    }
    dataElement.attributes = attributes;
    dataElement.name = name;
    dataElement.value = value;
    dataElement.initialize();

    return dataElement;
  }

  /** Every element anywhere below this one with exactly the given name, depth first; this element is not included. */
  getElementsByName(name: string): DataElement[] {
    const children: DataElement[] = [];
    for (const child of this.children) {
      if (child.getAttribute('name') === name) children.push(child);
      Array.prototype.push.apply(children, child.getElementsByName(name));
    }
    return children;
  }

  /** Every element anywhere below this one with the given older `type`, depth first; this element is not included. */
  getElementsByType(type: string): DataElement[] {
    const children: DataElement[] = [];
    for (const child of this.children) {
      if (child.getAttribute('type') === type) children.push(child);
      Array.prototype.push.apply(children, child.getElementsByType(type));
    }
    return children;
  }

  /** The first element below this one with exactly the given name, searching depth first; null when none has it. */
  getFirstElementByName(name: string): DataElement | null {
    for (const child of this.children) {
      if (child.getAttribute('name') === name) return child;
      const match = child.getFirstElementByName(name);
      if (match) return match;
    }
    return null;
  }

  /**
   * The sheet an element's name is looked up in: its outermost `detail` ancestor.
   *
   * Formulas, references and unique names all resolve within this scope. An element outside any detail
   * element is its own scope.
   */
  static getDetailNameScope(element: DataElement): DataElement {
    let current: DataElement | null = element;
    let detailElement: DataElement | null = null;

    while (current) {
      if (current.name === 'detail') detailElement = current;
      current = current.parent instanceof DataElement ? current.parent : null;
    }

    return detailElement ?? element;
  }

  /**
   * Whether a name is already taken anywhere below the scope element, or is one of the reserved names.
   *
   * Names are compared with surrounding spaces trimmed, the element named by `exceptIdentifier` is ignored so
   * an element can keep its own name, and a blank name never counts as taken.
   */
  static hasNameInScope(
    scopeElement: DataElement,
    name: string,
    exceptIdentifier: string = '',
    reservedNames: ReadonlySet<string> = new Set()
  ): boolean {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    if (reservedNames.has(normalizedName)) return true;

    const scan = (element: DataElement): boolean => {
      for (const child of element.children) {
        if (child.identifier !== exceptIdentifier && child.name.trim() === normalizedName) return true;
        if (scan(child)) return true;
      }
      return false;
    };

    return scan(scopeElement);
  }

  /** The base name if it is free anywhere in the scope, otherwise the first free `base 2`, `base 3` and so on. */
  static createUniqueName(
    scopeElement: DataElement,
    baseName: string,
    exceptIdentifier: string = '',
    reservedNames: ReadonlySet<string> = new Set()
  ): string {
    const normalizedBaseName = baseName.trim() || baseName;
    if (!DataElement.hasNameInScope(scopeElement, normalizedBaseName, exceptIdentifier, reservedNames)) {
      return normalizedBaseName;
    }

    let suffix = 2;
    while (
      DataElement.hasNameInScope(scopeElement, `${normalizedBaseName} ${suffix}`, exceptIdentifier, reservedNames)
    ) {
      suffix++;
    }
    return `${normalizedBaseName} ${suffix}`;
  }

  /** Like {@link hasNameInScope}, but checks only the parent's direct children. */
  static hasSiblingName(
    parentElement: DataElement,
    name: string,
    exceptIdentifier: string = '',
    reservedNames: ReadonlySet<string> = new Set()
  ): boolean {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    if (reservedNames.has(normalizedName)) return true;
    return parentElement.children.some(
      (child) => child.identifier !== exceptIdentifier && child.name.trim() === normalizedName
    );
  }

  /** Like {@link createUniqueName}, but only has to avoid the names of the parent's direct children. */
  static createUniqueSiblingName(
    parentElement: DataElement,
    baseName: string,
    exceptIdentifier: string = '',
    reservedNames: ReadonlySet<string> = new Set()
  ): string {
    const normalizedBaseName = baseName.trim() || baseName;
    if (!DataElement.hasSiblingName(parentElement, normalizedBaseName, exceptIdentifier, reservedNames)) {
      return normalizedBaseName;
    }

    let suffix = 2;
    while (
      DataElement.hasSiblingName(parentElement, `${normalizedBaseName} ${suffix}`, exceptIdentifier, reservedNames)
    ) {
      suffix++;
    }
    return `${normalizedBaseName} ${suffix}`;
  }

  /**
   * The names leading from the scope element down to this element, each trimmed.
   *
   * A `detail` scope adds no name of its own. When the element does not lie inside the scope, the path is
   * just its own name.
   */
  static getReferencePathParts(
    element: DataElement,
    scopeElement: DataElement = DataElement.getDetailNameScope(element)
  ): string[] {
    if (element === scopeElement) return element.name === 'detail' ? [] : [element.name.trim()];

    const parts: string[] = [];
    let current: DataElement | null = element;

    while (current && current !== scopeElement) {
      parts.unshift(current.name.trim());
      current = current.parent instanceof DataElement ? current.parent : null;
    }

    return current === scopeElement ? parts : [element.name.trim()];
  }

  /** The element's path as formulas and references write it: names joined by `/`, with `/` and `\` escaped. */
  static formatReferencePath(
    element: DataElement,
    scopeElement: DataElement = DataElement.getDetailNameScope(element)
  ): string {
    return DataElement.getReferencePathParts(element, scopeElement).map(escapeReferencePathPart).join('/');
  }

  /**
   * Finds the element a reference names, as written by {@link formatReferencePath}.
   *
   * A bare name must belong to exactly one element anywhere below the root. A path may start from the root or
   * from any of its children, and each step must match exactly one child. Null when nothing matches or the
   * reference could mean more than one element.
   */
  static findElementByReference(rootElement: DataElement, reference: string): DataElement | null {
    const parts = parseReferencePath(reference);
    if (parts.length < 1) return null;
    if (parts.length === 1) return DataElement.findUniqueElementByName(rootElement, parts[0]);

    let found: DataElement | null = null;
    for (const scopeElement of [rootElement, ...rootElement.children]) {
      const match = DataElement.findElementByPath(scopeElement, parts);
      if (!match) continue;
      if (found && found !== match) return null;
      found = match;
    }
    return found;
  }

  private static findUniqueElementByName(rootElement: DataElement, name: string): DataElement | null {
    const matches = rootElement.getElementsByName(name.trim());
    return matches.length === 1 ? matches[0] : null;
  }

  private static findElementByPath(scopeElement: DataElement, parts: string[]): DataElement | null {
    let current: DataElement = scopeElement;
    let index = current.name.trim() === parts[0] ? 1 : 0;

    while (index < parts.length) {
      const matches = current.children.filter((child) => child.name.trim() === parts[index]);
      if (matches.length !== 1) return null;
      current = matches[0];
      index++;
    }

    return current;
  }

  /** The element's identifier, as templates read it for tracking rows and building element ids. */
  get myIdentifer() {
    return this.identifier;
  }

  private inferFieldRole(): DataElementRoleValue {
    const parent = this.parent;
    if (parent instanceof DataElement && parent.name === 'detail') return DataElementRole.SECTION;
    if (this.children.length === 0) return DataElementRole.FIELD;
    return DataElementRole.GROUP;
  }

  /** Stores the role the element's current position implies, so it no longer carries a role from where it was. */
  syncFieldRoleToHierarchy(): void {
    this.setFieldRole(this.inferFieldRole());
  }

  /**
   * Text colour for a resource's current value on a sheet.
   *
   * A sanity resource (named SAN or 正気度) turns red once it has fallen to 80% of its maximum or lower; every
   * other element uses the default colour.
   */
  get nowValueColor(): string {
    if (SAN_PATTERN.test(this.name) || SANITY_PATTERN.test(this.name)) {
      if (this.isNumberResource) {
        const current: number = this.currentValue as number;
        const value: number = this.value as number;
        if (current <= value * SAN_WARNING_THRESHOLD && current == this.currentValue && value == this.value) {
          return SAN_WARNING_COLOR;
        }
      }
    }
    return DEFAULT_VALUE_COLOR;
  }
}
