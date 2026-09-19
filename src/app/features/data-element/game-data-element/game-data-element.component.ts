import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { DataElementDragService } from '@axe/application/ui/data-element-drag.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  playsEffectOnChange,
  playsSoundOnChange,
  RESOURCE_SOUND_SET_OPTIONS,
  ResourceSoundSet,
  soundSetOnChange,
} from '@axe/domain/character/resource-feedback';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  type DataElementFieldTypeValue,
  DataElementRole,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { calcSourceIdentifiers, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import {
  duplicateDataElement,
  findElementTemplateHolder,
  findElementTemplateOwner,
  readElementTemplates,
  saveElementTemplate,
} from '@axe/domain/data/data-element-templates';
import {
  buildTableColumnHeaderGroups,
  canRenderAsTable as canRenderAsTableShared,
  getRawTableRows,
  getSelectOptions,
  getTableColumns as getTableColumnsShared,
  isTableControlRow as isTableControlRowShared,
  type TableColumn as DataElementTableColumn,
  type TableColumnHeaderGroup as DataElementTableColumnHeaderGroup,
} from '@axe/domain/data/table-layout';
import {
  canAcceptChildRole,
  canDropStructureElement,
  type DataElementDropPosition,
  resolveDropPosition as resolveDropPositionShared,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';
import {
  createFieldElement,
  createGroupElement,
  insertElementAfter,
  moveStructureElement,
  type NewElementNames,
  placeElementTemplate,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';
import { GameDataElementTableViewComponent } from '@axe/features/data-element/game-data-element/game-data-element-table-view.component';
import { escapeHtml, isUrlText } from '@axe/features/data-element/game-data-element/game-data-element-utils';
import { GameDataElementRangeShapeComponent } from '@axe/features/data-element/game-data-element-range-shape/game-data-element-range-shape.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  selector: 'game-data-element, [game-data-element]',
  templateUrl: './game-data-element.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LinkifyPipe,
    SafePipe,
    NgSelectComponent,
    NgOptionComponent,
    NgSelectWindowDirective,
    GameDataElementTableViewComponent,
    TranslocoModule,
    GameDataElementRangeShapeComponent,
  ],
  host: {
    class:
      "relative [&.elm-drop-before]:before:content-[''] [&.elm-drop-before]:before:absolute [&.elm-drop-before]:before:inset-x-0 [&.elm-drop-before]:before:top-0 [&.elm-drop-before]:before:h-0.5 [&.elm-drop-before]:before:max-h-[calc(var(--gde-row-min)*1.5)] [&.elm-drop-before]:before:bg-ui-accent [&.elm-drop-before]:before:z-10 [&.elm-drop-before]:before:pointer-events-none [&.elm-drop-before]:before:rounded-[1px] [&.elm-drop-after]:after:content-[''] [&.elm-drop-after]:after:absolute [&.elm-drop-after]:after:inset-x-0 [&.elm-drop-after]:after:bottom-0 [&.elm-drop-after]:after:h-0.5 [&.elm-drop-after]:after:bg-ui-accent [&.elm-drop-after]:after:z-10 [&.elm-drop-after]:after:pointer-events-none [&.elm-drop-after]:after:rounded-[1px]",
    '(dragover)': 'onStructureDragOver($event)',
    '(dragleave)': 'onStructureDragLeave($event)',
    '(drop)': 'onStructureDrop($event)',
    '[class.elm-editing]': 'isEdit() && !isImage()',
    '[class.elm-drop-before]': "structureDropPosition() === 'before'",
    '[class.elm-drop-after]': "structureDropPosition() === 'after'",
    '[class.elm-drop-inside]': "structureDropPosition() === 'inside'",
    '[attr.inert]': "isReadOnly() ? '' : null",
  },
})
export class GameDataElementComponent {
  private readonly modalService = inject(ModalService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly dataElementDrag = inject(DataElementDragService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly rangeShapeInvoke = inject(RangeShapeInvokeService);
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly effectCast = inject(EffectCastService);
  private readonly rolePermission = inject(RolePermissionService);

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly contextMenuService = inject(ContextMenuService);

  readonly gameDataElement = input.required<DataElement>();
  readonly isEdit = input(false);
  readonly isTagLocked = input(false);
  readonly isValueLocked = input(false);

  readonly isImage = input(false);
  readonly indexNum = input(0);
  readonly depth = input(0);
  readonly hideSectionTitle = input(false);

  /**
   * Whether this row is a long text being edited.
   *
   * Squeezed into one line beside the row's buttons it could hardly be written in, so it is given
   * the width of the value cell under them instead, ten lines tall from the start and growing with
   * its text.
   */
  protected get isLongTextEditing(): boolean {
    return this.isEdit() && !this.isImage() && this.gameDataElement().fieldType === DataElementFieldType.LONG_TEXT;
  }

  readonly structureDropPosition = signal<DataElementDropPosition | null>(null);
  readonly fieldOptionsOpen = signal(false);
  readonly soundSetOptions = RESOURCE_SOUND_SET_OPTIONS;

  private trackTableDependencies(): void {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    for (const row of element.children) {
      this.objectChange.versionOf(row.identifier)();
      for (const child of row.children) {
        this.objectChange.versionOf(child.identifier)();
      }
    }
  }

  readonly tableRows = computed(() => {
    this.trackTableDependencies();
    return getRawTableRows(this.gameDataElement());
  });

  readonly tableBodyRows = computed(() => this.tableRows().filter((row) => !isTableControlRowShared(row)));

  readonly canRenderTableRows = computed(() => {
    this.trackTableDependencies();
    return canRenderAsTableShared(this.gameDataElement());
  });

  readonly tableColumns = computed<DataElementTableColumn[]>(() => {
    this.trackTableDependencies();
    return getTableColumnsShared(this.gameDataElement());
  });

  readonly hasTableColumnGroups = computed(() => this.tableColumns().some((column) => column.group.length > 0));

  readonly tableColumnHeaderGroups = computed<DataElementTableColumnHeaderGroup[]>(() =>
    buildTableColumnHeaderGroups(this.tableColumns())
  );

  readonly tableRowHeaderLabel = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.getAttribute(DataElementAttribute.ROW_HEADER_LABEL).trim();
  });

  private readonly _name = signal<string>('');
  /**
   * The element's name as typed into its name box.
   *
   * Setting it writes to the element after a short pause, so typing does not send every key. A name
   * a sibling already has is refused, and the box goes back to the name the element keeps.
   */
  get name(): string {
    if (this.gameDataElement()) this.objectChange.versionOf(this.gameDataElement().identifier)();
    return this._name();
  }
  set name(name: string) {
    this._name.set(name);
    this.setUpdateTimer();
  }

  readonly isDuplicateName = computed(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return this.isDuplicateElementName(this._name(), element);
  });

  private readonly _value = signal<number | string>(0);
  /**
   * The value being edited in this row, which for a resource is its maximum. Setting it writes to
   * the element after a short pause, and does nothing while values are locked.
   */
  get value(): number | string {
    return this._value();
  }
  set value(value: number | string) {
    if (this.isValueLocked()) return;
    this._value.set(value);
    this.setUpdateTimer();
  }

  private readonly _currentValue = signal<number | string>(0);
  /**
   * The current value being edited in this row, such as what is left of a resource or the effect
   * chosen. Setting it writes to the element after a short pause, and does nothing while values are
   * locked.
   */
  get currentValue(): number | string {
    return this._currentValue();
  }
  set currentValue(currentValue: number | string) {
    if (this.isValueLocked()) return;
    this._currentValue.set(currentValue);
    this.setUpdateTimer();
  }

  /**
   * The lowest a resource's current value may be typed as: its effective minimum, or empty for no
   * limit.
   */
  currentValueMinAttr(): string {
    return this.effectiveMinDisplay();
  }

  /**
   * The highest a resource's current value may be typed as: its maximum while that is a number, or
   * empty for no limit.
   */
  currentValueMaxAttr(): string {
    const value = this._value();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return value;
    return '';
  }

  /**
   * The lowest the value box may be typed as: the element's effective minimum, or empty for no
   * limit.
   */
  valueMinAttr(): string {
    return this.effectiveMinDisplay();
  }

  /**
   * The highest the value box may be typed as: the element's effective maximum, or empty for no
   * limit.
   */
  valueMaxAttr(): string {
    return this.effectiveMaxDisplay();
  }

  /**
   * Keeps the value within the element's effective minimum and maximum once its box loses focus.
   * Text that is not a number is left alone, and nothing happens while values are locked.
   */
  commitValueBounds(): void {
    if (this.isValueLocked()) return;
    const clamped = this.clampNumeric(this._value(), this.valueMinAttr(), this.valueMaxAttr());
    if (clamped !== this._value()) {
      this._value.set(clamped);
      this.setUpdateTimer();
    }
  }

  /**
   * Keeps a resource's current value between its effective minimum and its maximum once the box
   * loses focus. Text that is not a number is left alone, and nothing happens while values are
   * locked.
   */
  commitCurrentValueBounds(): void {
    if (this.isValueLocked()) return;
    const clamped = this.clampNumeric(this._currentValue(), this.currentValueMinAttr(), this.currentValueMaxAttr());
    if (clamped !== this._currentValue()) {
      this._currentValue.set(clamped);
      this.setUpdateTimer();
    }
  }

  private clampNumeric(input: number | string, minStr: string, maxStr: string): number | string {
    if (input === '' || input == null) return input;
    const num = Number(input);
    if (Number.isNaN(num)) return input;
    let result = num;
    if (minStr && minStr.trim() !== '') {
      const min = Number(minStr);
      if (!Number.isNaN(min)) result = Math.max(min, result);
    }
    if (maxStr && maxStr.trim() !== '') {
      const max = Number(maxStr);
      if (!Number.isNaN(max)) result = Math.min(max, result);
    }
    return result;
  }

  /**
   * The name of the icon shown by a group or section heading; empty for none. Setting it trims the
   * name.
   */
  get icon(): string {
    return this.attrText('cs-icon');
  }
  set icon(value: string) {
    const el = this.gameDataElement();
    if (el) el.setAttribute('cs-icon', value.trim());
  }

  /**
   * The choices a select field offers, as written in its settings. Setting blank text removes them.
   */
  get choicesText(): string {
    return this.attrText(DataElementAttribute.CHOICES);
  }
  set choicesText(value: string) {
    this.setFieldAttribute(DataElementAttribute.CHOICES, value);
  }

  /** The unit shown after a number or resource field's value. Setting blank text removes it. */
  get unitText(): string {
    return this.attrText(DataElementAttribute.UNIT);
  }
  set unitText(value: string) {
    this.setFieldAttribute(DataElementAttribute.UNIT, value);
  }

  /** The lowest value a number field takes, as written in its settings; empty for no limit. */
  get minText(): string {
    return this.attrText(DataElementAttribute.MIN);
  }
  set minText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN, value);
  }

  /** The highest value a number field takes, as written in its settings; empty for no limit. */
  get maxText(): string {
    return this.attrText(DataElementAttribute.MAX);
  }
  set maxText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MAX, value);
  }

  /**
   * A resource's minimum before its correction is added, reading the plain minimum where no base is
   * set. Setting blank text removes it.
   */
  get minBaseText(): string {
    return this.attrText(DataElementAttribute.MIN_BASE, DataElementAttribute.MIN);
  }
  set minBaseText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN_BASE, value);
  }

  /** The amount added to a resource's minimum base; empty for none. */
  get minCorrectionText(): string {
    return this.attrText(DataElementAttribute.MIN_CORRECTION);
  }
  set minCorrectionText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN_CORRECTION, value);
  }

  /**
   * A resource's maximum before its correction is added, reading the plain maximum where no base is
   * set. Setting it also moves the resource's maximum to the new effective one.
   */
  get maxBaseText(): string {
    return this.attrText(DataElementAttribute.MAX_BASE, DataElementAttribute.MAX);
  }
  set maxBaseText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MAX_BASE, value);
    this.syncCurrentMaxToEffective();
  }

  /**
   * The amount added to a resource's maximum base. Setting it also moves the resource's maximum to
   * the new effective one.
   */
  get maxCorrectionText(): string {
    return this.attrText(DataElementAttribute.MAX_CORRECTION);
  }
  set maxCorrectionText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MAX_CORRECTION, value);
    this.syncCurrentMaxToEffective();
  }

  /**
   * After a max-base or max-correction edit, push the current max (value SyncVar)
   * to the new effective max so the displayed "/X" follows the configured maximum.
   */
  private syncCurrentMaxToEffective(): void {
    const el = this.gameDataElement();
    if (!el) return;
    const newEffectiveMax = el.effectiveMax;
    if (newEffectiveMax == null) return;
    if (this._value() !== newEffectiveMax) {
      this._value.set(newEffectiveMax);
      this.setUpdateTimer();
    }
  }

  /**
   * The minimum in force once base and correction are added up, as text; empty when there is none.
   */
  effectiveMinDisplay(): string {
    const v = this.gameDataElement()?.effectiveMin;
    return v == null ? '' : String(v);
  }
  /**
   * The maximum in force once base and correction are added up, as text; empty when there is none.
   */
  effectiveMaxDisplay(): string {
    const v = this.gameDataElement()?.effectiveMax;
    return v == null ? '' : String(v);
  }

  /** The formula a calculated field works its result out from. */
  get formulaText(): string {
    return this.attrText(DataElementAttribute.FORMULA);
  }
  set formulaText(value: string) {
    this.setFieldAttribute(DataElementAttribute.FORMULA, value);
  }

  /** The label a check field in a table carries beside its box. Setting blank text removes it. */
  get tableCellText(): string {
    return this.attrText(DataElementAttribute.CELL_TEXT);
  }
  set tableCellText(value: string) {
    this.setFieldAttribute(DataElementAttribute.CELL_TEXT, value);
  }

  /** The heading of the column this field makes in a table. Setting blank text removes it. */
  get columnLabelText(): string {
    return this.attrText(DataElementAttribute.COLUMN_LABEL);
  }
  set columnLabelText(value: string) {
    this.setFieldAttribute(DataElementAttribute.COLUMN_LABEL, value);
  }

  /**
   * The heading that gathers this field's column together with its neighbours above a table's
   * column headings.
   */
  get columnGroupText(): string {
    return this.attrText(DataElementAttribute.COLUMN_GROUP);
  }
  set columnGroupText(value: string) {
    this.setFieldAttribute(DataElementAttribute.COLUMN_GROUP, value);
  }

  /** The heading over the column of row names while this group or section is shown as a table. */
  get rowHeaderLabelText(): string {
    return this.attrText(DataElementAttribute.ROW_HEADER_LABEL);
  }
  set rowHeaderLabelText(value: string) {
    this.setFieldAttribute(DataElementAttribute.ROW_HEADER_LABEL, value);
  }

  /**
   * Whether this table field is a gap cell, which makes its column a gap between skill columns in
   * judgement. Turning it on gives the field a default column heading where it has none.
   */
  get isGapCell(): boolean {
    return this.attrText(DataElementAttribute.CELL_KIND) === 'gap';
  }
  set isGapCell(value: boolean) {
    const element = this.gameDataElement();
    if (value) {
      element.setAttribute(DataElementAttribute.CELL_KIND, 'gap');
      if (!element.getAttribute(DataElementAttribute.COLUMN_LABEL).trim()) {
        element.setAttribute(DataElementAttribute.COLUMN_LABEL, this.t('feature.dataElement.defaults.gapCellLabel'));
      }
    } else {
      element.removeAttribute(DataElementAttribute.CELL_KIND);
    }
    this.objectChange.notifyChanged(element.identifier);
  }

  readonly calcResult = computed(() => {
    const el = this.gameDataElement();
    // The result reads the whole sheet, so it goes stale on a change to any part of it, and on
    // a field being added or taken away.
    this.objectChange.collectionOf('data')();
    for (const identifier of calcSourceIdentifiers(el)) this.objectChange.versionOf(identifier)();
    return evaluateCalcElement(el);
  });

  readonly iconPickerOpen = signal(false);
  readonly templateMenuOpen = signal(false);

  static readonly ICON_GROUPS: { labelKey: string; icons: string[] }[] = [
    {
      labelKey: 'feature.dataElement.iconGroup.character',
      icons: [
        'person',
        'face',
        'account_circle',
        'groups',
        'man',
        'woman',
        'child_care',
        'elderly',
        'back_hand',
        'accessibility',
        'roller_skating',
      ],
    },
    {
      labelKey: 'feature.dataElement.iconGroup.combat',
      icons: [
        'shield',
        'security',
        'gavel',
        'sports_martial_arts',
        'local_fire_department',
        'bolt',
        'whatshot',
        'flash_on',
      ],
    },
    {
      labelKey: 'feature.dataElement.iconGroup.status',
      icons: ['favorite', 'health_and_safety', 'star', 'grade', 'bar_chart', 'trending_up', 'speed', 'military_tech'],
    },
    {
      labelKey: 'feature.dataElement.iconGroup.item',
      icons: ['inventory_2', 'backpack', 'category', 'sell', 'local_pharmacy', 'build', 'key', 'lock'],
    },
    {
      labelKey: 'feature.dataElement.iconGroup.magic',
      icons: ['auto_awesome', 'flare', 'nights_stay', 'wb_sunny', 'blur_on', 'casino', 'psychology', 'emoji_events'],
    },
    {
      labelKey: 'feature.dataElement.iconGroup.memo',
      icons: ['info', 'note', 'description', 'edit_note', 'comment', 'chat', 'sticky_note_2', 'assignment'],
    },
  ];

  readonly iconGroups = GameDataElementComponent.ICON_GROUPS.map((group) => ({
    label: this.t(group.labelKey),
    icons: group.icons,
  }));

  readonly fieldTypeItems: { type: DataElementFieldTypeValue; label: string }[] = [
    { type: DataElementFieldType.TEXT, label: this.t('feature.dataElement.fieldType.text') },
    { type: DataElementFieldType.NUMBER, label: this.t('feature.dataElement.fieldType.number') },
    { type: DataElementFieldType.RESOURCE, label: this.t('feature.dataElement.fieldType.resource') },
    { type: DataElementFieldType.LONG_TEXT, label: this.t('feature.dataElement.fieldType.longText') },
    { type: DataElementFieldType.CHECK, label: this.t('feature.dataElement.fieldType.check') },
    { type: DataElementFieldType.SELECT, label: this.t('feature.dataElement.fieldType.select') },
    { type: DataElementFieldType.CALC, label: this.t('feature.dataElement.fieldType.calc') },
    { type: DataElementFieldType.IMAGE, label: this.t('feature.dataElement.fieldType.image') },
    { type: DataElementFieldType.RANGE_SHAPE, label: this.t('feature.dataElement.fieldType.rangeShape') },
    { type: DataElementFieldType.EFFECT, label: this.t('feature.dataElement.fieldType.effect') },
  ];

  /** The effects on offer, held by name so the same row works in any room. */
  readonly effectNames = computed<string[]>(() => this.effectLibrary.presets().map((preset) => preset.name));

  protected invokeEffect(): void {
    const preset = this.effectLibrary.findByName(String(this.currentValue ?? ''));
    const character = this.findOwningCharacter();
    if (preset && character) this.effectCast.fireFromCharacter(preset, character);
  }

  /** Sets the heading icon picked in the icon picker, and closes the picker. */
  selectIcon(name: string): void {
    this.icon = name;
    this.iconPickerOpen.set(false);
  }

  /** Takes the heading icon away, and closes the icon picker. */
  clearIcon(): void {
    this.icon = '';
    this.iconPickerOpen.set(false);
  }

  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const element = this.gameDataElement();
      if (element) {
        this.objectChange.versionOf(element.identifier)();
        this.setValues(element);
      }
    });
  }

  readonly imageFileUrl = computed(() => {
    this.objectChange.fileVersion();
    const image = this.imageStorage.get(this._value() as string);
    return image ? image.url : '';
  });

  /**
   * Opens the image picker and puts the chosen image into this image field. Closing the picker
   * without a choice changes nothing, and it does not open while values are locked.
   */
  openModal(_name: string = '', isAllowedEmpty: boolean = false) {
    if (this.isValueLocked()) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then((value) => {
      if (!value) return;
      const element = this.gameDataElement();
      if (!element) return;
      element.value = value;
    });
  }

  /**
   * Brings a character's `ICON` field in line with how many pictures its `image` list holds.
   *
   * The field's maximum becomes the last picture, and a current picture past that is pulled back to
   * it.
   */
  updateKomaIconMaxValue(root: DataElement) {
    const image = root.getFirstElementByName('image');
    const icon = root.getElementsByName('ICON');
    if (icon) {
      icon[0].value = image!.children.length - 1;
      if (+icon[0].currentValue > +icon[0].value) icon[0].currentValue = icon[0].value;
    }
  }

  /** Adds an empty picture to a character's image list, and widens its `ICON` field to reach it. */
  addImageElement() {
    this.gameDataElement().appendChild(DataElement.create('imageIdentifier', '', { type: 'image' }));
    this.updateKomaIconMaxValue(this.gameDataElement().parent as DataElement);
  }

  /**
   * Adds a new field at the end of this group, under a name no sibling has. Does nothing where this
   * element cannot hold a field.
   */
  addElement() {
    const parentElement = this.gameDataElement();
    if (!this.canAddChildFieldElement()) return;

    const fieldElement = createFieldElement(parentElement, this.newElementNames());
    parentElement.appendChild(fieldElement);
    this.notifyStructureChanged(parentElement, fieldElement);
  }

  /**
   * Adds a new field just after this one, under a name no sibling has. Does nothing where the
   * parent cannot hold a field.
   */
  addSiblingElement() {
    const parentElement = this.getDataElementParent();
    if (!parentElement || !canAcceptChildRole(parentElement, DataElementRole.FIELD)) return;

    const fieldElement = createFieldElement(parentElement, this.newElementNames());
    insertElementAfter(fieldElement, this.gameDataElement(), parentElement);
    this.notifyStructureChanged(parentElement, fieldElement);
  }

  /**
   * Adds a new group, with one field already in it, at the end of this element. Does nothing where
   * this element cannot hold a group.
   */
  addGroupElement() {
    const parentElement = this.gameDataElement();
    if (!this.canAddChildGroupElement()) return;

    const groupElement = createGroupElement(parentElement, this.newElementNames());
    parentElement.appendChild(groupElement);
    this.notifyStructureChanged(parentElement, groupElement);
  }

  /** Whether this element may hold a new group, which shows the button for adding one. */
  canAddChildGroupElement(): boolean {
    return canAcceptChildRole(this.gameDataElement(), DataElementRole.GROUP);
  }

  /** Whether this element may hold a new field, which shows the button for adding one inside it. */
  canAddChildFieldElement(): boolean {
    return canAcceptChildRole(this.gameDataElement(), DataElementRole.FIELD);
  }

  /** Whether a new field may go in beside this one, which shows the add row button on a field. */
  canAddSiblingFieldElement(): boolean {
    const parentElement = this.getDataElementParent();
    return !!parentElement && canAcceptChildRole(parentElement, DataElementRole.FIELD);
  }

  /**
   * Whether this element can be copied beside itself: anything but a picture in an image list, as
   * long as it has a parent to go into.
   */
  canDuplicateElement(): boolean {
    return !this.isImage() && this.getDataElementParent() !== null;
  }

  /**
   * Puts a copy of this element, with everything under it, just after it. Does nothing for a
   * picture in an image list or an element with no parent.
   */
  duplicateElement(): void {
    const element = this.gameDataElement();
    const parentElement = this.getDataElementParent();
    if (!parentElement || this.isImage()) return;

    const copy = duplicateDataElement(element, parentElement);
    if (!copy) return;
    insertElementAfter(copy, element, parentElement);
    this.notifyStructureChanged(parentElement, copy);
  }

  /**
   * Whether this group or section can be saved as a template, which needs it to be on the sheet of
   * an object that keeps templates, such as a character, rather than inside a saved template.
   */
  canSaveAsTemplate(): boolean {
    const element = this.gameDataElement();
    const role = element.fieldRole;
    if (this.isImage() || (role !== DataElementRole.GROUP && role !== DataElementRole.SECTION)) return false;
    return findElementTemplateOwner(element) !== null;
  }

  /**
   * Saves a copy of this group or section among the templates its sheet keeps, so it can be put in
   * again from the template menu.
   */
  saveAsTemplate(): void {
    if (!this.canSaveAsTemplate()) return;
    const owner = findElementTemplateOwner(this.gameDataElement());
    if (!owner) return;
    const template = saveElementTemplate(owner, this.gameDataElement());
    const holder = template?.parent;
    if (template && holder instanceof DataElement) this.notifyStructureChanged(holder, template);
    this.objectChange.notifyChanged(owner.identifier);
  }

  readonly elementTemplates = computed<DataElement[]>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    if (this.isImage() || element.fieldRole === DataElementRole.FIELD) return [];
    const owner = findElementTemplateOwner(element);
    if (!owner) return [];
    this.objectChange.versionOf(owner.identifier)();
    const holder = findElementTemplateHolder(owner);
    if (holder) this.objectChange.versionOf(holder.identifier)();
    return readElementTemplates(owner);
  });

  /**
   * Puts a copy of a saved template in from the template menu, and closes the menu.
   *
   * The copy goes into this element where it can hold it, and otherwise into the nearest parent
   * that can, just after the branch it climbed out of.
   */
  insertTemplate(template: DataElement): void {
    this.templateMenuOpen.set(false);
    const placed = placeElementTemplate(template, this.gameDataElement());
    if (!placed) return;
    this.notifyStructureChanged(placed.parent, placed.element);
  }

  /**
   * Deletes a saved template from the template menu without inserting it; the menu closes once no
   * templates are left.
   */
  deleteTemplate(template: DataElement, event: Event): void {
    event.stopPropagation();
    const holder = template.parent;
    template.destroy();
    if (holder instanceof DataElement) this.notifyStructureChanged(holder);
    if (this.elementTemplates().length < 1) this.templateMenuOpen.set(false);
  }

  private newElementNames(): NewElementNames {
    return {
      field: this.t('feature.dataElement.defaults.newTag'),
      group: this.t('feature.dataElement.defaults.newGroup'),
    };
  }

  /**
   * Starts dragging this element by its handle to put the sheet in another order. Only in edit
   * mode, and never for a picture in an image list.
   */
  onStructureDragStart(event: DragEvent): void {
    if (!this.isEdit() || this.isImage()) return;
    this.dataElementDrag.start(event, this.gameDataElement().identifier);
    event.stopPropagation();
  }

  /**
   * Ends a drag started from this element's handle, whether it was dropped or not, and clears the
   * drop marker.
   */
  onStructureDragEnd(event?: DragEvent): void {
    this.dataElementDrag.end();
    this.structureDropPosition.set(null);
    event?.stopPropagation();
  }

  /**
   * Marks where the dragged element would land over this row, before, after or inside it, and lets
   * the drop happen there.
   *
   * A position the element may not take is left unmarked, so the browser refuses the drop.
   */
  onStructureDragOver(event: DragEvent): void {
    const draggedElement = this.getDraggedElement(event);
    if (!draggedElement) return;

    const targetElement = this.gameDataElement();
    const position = this.resolveDropPosition(event, targetElement);
    if (!this.canDropHere(draggedElement, targetElement, position)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.structureDropPosition.set(position);
  }

  /**
   * Clears the drop marker once the pointer leaves this row, but not when it only moves onto
   * something inside the row.
   */
  onStructureDragLeave(event: DragEvent): void {
    // Only clear the indicator when the cursor truly left this host element.
    // dragleave also fires when the cursor moves into a child element (event bubbles up),
    // so we check relatedTarget to distinguish the two cases.
    const host = event.currentTarget as HTMLElement | null;
    if (host && event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    this.structureDropPosition.set(null);
    event.stopPropagation();
  }

  /**
   * Moves the dragged element to where the marker showed, when that move is allowed, and clears the
   * marker and the drag either way.
   */
  onStructureDrop(event: DragEvent): void {
    const draggedElement = this.getDraggedElement(event);
    const targetElement = this.gameDataElement();
    const position = this.structureDropPosition() ?? this.resolveDropPosition(event, targetElement);

    this.structureDropPosition.set(null);
    this.dataElementDrag.end();
    if (!draggedElement || !this.canDropHere(draggedElement, targetElement, position)) return;

    event.preventDefault();
    event.stopPropagation();
    this.applyStructureMove(draggedElement, targetElement, position);
  }

  /**
   * Moves the element among the ones beside it from a menu, opened by a right click or a press
   * held on the handle it is dragged by.
   *
   * The structure is otherwise put in order by dragging, which a touch screen may not start. A
   * move the structure would not take by dragging is not made either.
   */
  onStructureHandleContextMenu(event: MouseEvent): void {
    if (!this.isEdit() || this.isImage() || !this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const element = this.gameDataElement();
    const parent = this.getDataElementParent(element);
    if (!parent) return;
    const siblings = parent.children.filter((child): child is DataElement => child instanceof DataElement);
    const index = siblings.indexOf(element);
    if (index < 0) return;
    const move = (target: DataElement, position: 'before' | 'after') => {
      if (canDropStructureElement(element, target, position, this.depth())) {
        this.applyStructureMove(element, target, position);
      }
    };
    const actions = buildReorderContextMenu(
      { index, count: siblings.length },
      {
        moveToTop: () => move(siblings[0], 'before'),
        moveUp: () => move(siblings[index - 1], 'before'),
        moveDown: () => move(siblings[index + 1], 'after'),
        moveToBottom: () => move(siblings[siblings.length - 1], 'after'),
      },
      this.t
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, element.name);
  }

  private getDraggedElement(event: DragEvent): DataElement | null {
    const draggedId = this.dataElementDrag.getDraggedId(event);
    if (!draggedId) return null;
    return this.objectStore.get<DataElement>(draggedId) ?? null;
  }

  private resolveDropPosition(event: DragEvent, targetElement: DataElement): DataElementDropPosition {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const rect = currentTarget?.getBoundingClientRect();
    return resolveDropPositionShared(rect ?? null, event.clientY, targetElement);
  }

  private canDropHere(
    draggedElement: DataElement,
    targetElement: DataElement,
    position: DataElementDropPosition
  ): boolean {
    if (!this.isEdit() || this.isImage()) return false;
    return canDropStructureElement(draggedElement, targetElement, position, this.depth());
  }

  private getDataElementParent(element: DataElement = this.gameDataElement()): DataElement | null {
    const parent = element.parent;
    return parent instanceof DataElement ? parent : null;
  }

  private applyStructureMove(
    draggedElement: DataElement,
    targetElement: DataElement,
    position: DataElementDropPosition
  ): void {
    const moved = moveStructureElement(draggedElement, targetElement, position);
    if (!moved) return;
    this.notifyStructureChanged(moved.newParent, draggedElement, moved.oldParent ?? undefined);
  }

  private notifyStructureChanged(...elements: (DataElement | undefined)[]): void {
    const notifiedIds = new Set<string>();
    for (const element of elements) {
      if (!element || notifiedIds.has(element.identifier)) continue;
      element.update();
      this.objectChange.notifyChanged(element.identifier);
      notifiedIds.add(element.identifier);
    }
  }

  /** Destroys this element and everything under it. */
  deleteElement() {
    this.gameDataElement().destroy();
  }

  /**
   * Destroys this picture of a character's image list, and narrows its `ICON` field to match. The
   * first picture in the list is never deleted.
   */
  deleteImageElement() {
    const root: DataElement = this.gameDataElement().parent!.parent as DataElement;
    if (this.gameDataElement().parent!.children[0] != this.gameDataElement()) {
      this.gameDataElement().destroy();
      this.updateKomaIconMaxValue(root);
    }
  }

  /** Sets the element's data type, and the field type that goes with it. */
  setElementType(type: string) {
    const element = this.gameDataElement();
    element.setAttribute('type', type);
    element.setFieldType(DataElement.fieldTypeFromDataType(type));
  }

  /**
   * Changes what kind of field this is, keeping the older data type in step, and closes the field's
   * settings.
   */
  setElementFieldType(fieldType: DataElementFieldTypeValue) {
    const element = this.gameDataElement();
    element.setFieldType(fieldType);
    element.setAttribute('type', DataElement.dataTypeFromFieldType(fieldType));
    this.fieldOptionsOpen.set(false);
  }

  /** The choices a select field offers in its dropdown. */
  getSelectOptions(): string[] {
    return getSelectOptions(this.gameDataElement());
  }

  /**
   * Whether a field being edited has settings to open: a table cell, or a select, number, resource,
   * calculated or image field.
   */
  shouldShowFieldOptions(): boolean {
    if (!this.isEdit() || this.isImage()) return false;
    const fieldType = this.gameDataElement().fieldType;
    return (
      this.isTableCellField() ||
      fieldType === DataElementFieldType.SELECT ||
      fieldType === DataElementFieldType.NUMBER ||
      fieldType === DataElementFieldType.RESOURCE ||
      fieldType === DataElementFieldType.CALC ||
      fieldType === DataElementFieldType.IMAGE
    );
  }

  /**
   * Whether a group or section being edited has table settings to open, which it has while it is
   * set to show as a table.
   */
  shouldShowContainerOptions(): boolean {
    return (
      this.isEdit() &&
      !this.isImage() &&
      this.gameDataElement().fieldRole !== DataElementRole.FIELD &&
      this.isTableViewMode()
    );
  }

  /** Opens or closes the settings under this row. */
  toggleFieldOptions(): void {
    this.fieldOptionsOpen.update((isOpen) => !isOpen);
  }

  /**
   * Whether this field is a cell of a table: it sits in a group whose parent is set to show as a
   * table.
   */
  isTableCellField(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    if (element.fieldRole !== DataElementRole.FIELD) return false;

    const rowElement = element.parent instanceof DataElement ? element.parent : null;
    const tableElement = rowElement?.parent instanceof DataElement ? rowElement.parent : null;
    if (rowElement) this.objectChange.versionOf(rowElement.identifier)();
    if (tableElement) this.objectChange.versionOf(tableElement.identifier)();
    return rowElement?.fieldRole === DataElementRole.GROUP && tableElement?.viewMode === DataElementViewMode.TABLE;
  }

  /**
   * Copies the element's path, as formulas and references write it, to the clipboard. Does nothing
   * where the element has no path or there is no clipboard.
   */
  copyReferencePath(event?: MouseEvent): void {
    event?.stopPropagation();
    const referencePath = DataElement.formatReferencePath(this.gameDataElement());
    if (!referencePath) return;
    void navigator.clipboard?.writeText(referencePath);
  }

  private hasFlag(attribute: string): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.getAttribute(attribute) === 'true';
  }

  private toggleFlag(attribute: string): void {
    const element = this.gameDataElement();
    if (this.hasFlag(attribute)) element.removeAttribute(attribute);
    else element.setAttribute(attribute, 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Whether this element is shown in the piece's popup. */
  isPopupDataElement(): boolean {
    return this.hasFlag(DataElementAttribute.POPUP);
  }

  /**
   * Shows this element in the piece's popup, or stops showing it there. Does nothing for a picture
   * in an image list.
   */
  togglePopupDataElement(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.isImage()) return;
    this.toggleFlag(DataElementAttribute.POPUP);
  }

  /** Whether this resource is shown as a bar on the piece on the table. */
  isPieceGauge(): boolean {
    return this.hasFlag(DataElementAttribute.PIECE_GAUGE);
  }

  /**
   * Whether this element is a numeric resource, the only kind that can be shown as a bar on the
   * piece.
   */
  canShowPieceGauge(): boolean {
    return this.gameDataElement().isNumberResource;
  }

  /**
   * Whether this resource grows worse as it rises, such as madness, so the bar on the piece reads
   * the other way round.
   */
  isGaugeInverted(): boolean {
    return this.hasFlag(DataElementAttribute.GAUGE_INVERTED);
  }

  /**
   * Turns the reading of this resource as one that grows worse as it rises on or off. Does nothing
   * for an element that is not a numeric resource.
   */
  toggleGaugeInverted(): void {
    if (!this.canShowPieceGauge()) return;
    this.toggleFlag(DataElementAttribute.GAUGE_INVERTED);
  }

  /**
   * Shows this resource as a bar on the piece, or takes the bar away. Does nothing for an element
   * that is not a numeric resource.
   */
  togglePieceGauge(event?: MouseEvent): void {
    event?.stopPropagation();
    if (!this.canShowPieceGauge()) return;
    this.toggleFlag(DataElementAttribute.PIECE_GAUGE);
  }

  /**
   * Whether this element is a numeric resource, the only kind that can play an effect or a sound
   * when it changes.
   */
  canShowChangeFeedback(): boolean {
    return this.gameDataElement().isNumberResource;
  }

  /** Whether a change to this resource plays an effect on the piece. */
  playsEffectOnChange(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return playsEffectOnChange(element);
  }

  /** Whether a change to this resource plays a sound. */
  playsSoundOnChange(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return playsSoundOnChange(element);
  }

  /**
   * Turns the effect played when this resource changes on or off. Does nothing for an element that
   * is not a numeric resource.
   */
  toggleChangeEffect(): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_EFFECT, this.playsEffectOnChange() ? 'false' : 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  /**
   * Turns the sound played when this resource changes on or off. Does nothing for an element that
   * is not a numeric resource.
   */
  toggleChangeSound(): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_SOUND, this.playsSoundOnChange() ? 'false' : 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Which set of sounds a change to this resource plays. */
  soundSetOnChange(): ResourceSoundSet {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return soundSetOnChange(element);
  }

  /**
   * Chooses the set of sounds a change to this resource plays, anything but `mech` being taken as
   * `flesh`. Does nothing for an element that is not a numeric resource.
   */
  setSoundSetOnChange(value: string): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_SOUND_SET, value === 'mech' ? 'mech' : 'flesh');
    this.objectChange.notifyChanged(element.identifier);
  }

  /** Whether this image field's picture is shown at full size in the popup. */
  isImagePopupOriginal(): boolean {
    return this.hasFlag(DataElementAttribute.IMAGE_POPUP_ORIGINAL);
  }

  /** Turns showing this image field's picture at full size in the popup on or off. */
  toggleImagePopupOriginal(event?: Event): void {
    event?.stopPropagation();
    this.toggleFlag(DataElementAttribute.IMAGE_POPUP_ORIGINAL);
  }

  /**
   * Whether this element can be shown as a table: any group or section, but not a field or a
   * picture in an image list.
   */
  canToggleTableViewMode(): boolean {
    return !this.isImage() && this.gameDataElement().fieldRole !== DataElementRole.FIELD;
  }

  /** Whether this group or section is set to show as a table. */
  isTableViewMode(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.viewMode === DataElementViewMode.TABLE;
  }

  /** Switches this group or section between showing as a table and showing as rows. */
  toggleTableViewMode(): void {
    if (!this.canToggleTableViewMode()) return;
    const element = this.gameDataElement();
    element.setViewMode(this.isTableViewMode() ? DataElementViewMode.NORMAL : DataElementViewMode.TABLE);
    this.objectChange.notifyChanged(element.identifier);
  }

  /**
   * Whether this table offers judgement, in which clicking a skill cell finds the nearest learnt
   * skills to roll from.
   */
  isJudgeModeEnabled(): boolean {
    return this.hasFlag(DataElementAttribute.JUDGE_MODE);
  }

  /** Turns judgement on or off for this table. */
  toggleJudgeModeEnabled(): void {
    this.toggleFlag(DataElementAttribute.JUDGE_MODE);
  }

  /**
   * How much distance each ticked gap column adds in judgement, as written in the table's settings;
   * empty counts as 1.
   */
  get gapDistanceText(): string {
    return this.attrText(DataElementAttribute.GAP_DISTANCE);
  }
  set gapDistanceText(value: string) {
    this.setFieldAttribute(DataElementAttribute.GAP_DISTANCE, value);
  }

  /**
   * The target a judgement roll starts from before the distance is added, as written in the table's
   * settings; empty counts as 5.
   */
  get baseDifficultyText(): string {
    return this.attrText(DataElementAttribute.BASE_DIFFICULTY);
  }
  set baseDifficultyText(value: string) {
    this.setFieldAttribute(DataElementAttribute.BASE_DIFFICULTY, value);
  }

  /** Whether distance in judgement runs on from the table's last column round to its first. */
  get loopHorizontal(): boolean {
    return this.attrText(DataElementAttribute.LOOP_HORIZONTAL) === 'true';
  }
  /** Turns judgement distance running round from the last column to the first on or off. */
  toggleLoopHorizontal(): void {
    this.toggleFlag(DataElementAttribute.LOOP_HORIZONTAL);
  }

  /** Whether distance in judgement runs on from the table's last row round to its first. */
  get loopVertical(): boolean {
    return this.attrText(DataElementAttribute.LOOP_VERTICAL) === 'true';
  }
  /** Turns judgement distance running round from the last row to the first on or off. */
  toggleLoopVertical(): void {
    this.toggleFlag(DataElementAttribute.LOOP_VERTICAL);
  }

  /**
   * Whether this element is drawn as a table rather than as rows: out of edit mode, set to show as
   * a table, and with rows and columns to show.
   */
  shouldRenderTableView(): boolean {
    return (
      !this.isEdit() &&
      this.isTableViewMode() &&
      this.canRenderTableRows() &&
      this.tableBodyRows().length > 0 &&
      this.tableColumns().length > 0
    );
  }

  /**
   * Reads an attribute as text.
   *
   * The rule that every read checks the version lives here alone; copied about, it leaves
   * gaps where one newly added field never updates on screen.
   */
  private attrText(attribute: string, fallback?: string): string {
    const element = this.gameDataElement();
    if (element) this.objectChange.versionOf(element.identifier)();
    // An attribute may hold a number, and testing it for truth would count a zero as empty.
    const value = String(element?.getAttribute(attribute) ?? '');
    if (value.length > 0 || fallback === undefined) return value;
    return String(element?.getAttribute(fallback) ?? '');
  }

  private setFieldAttribute(attribute: string, value: string | number | null | undefined): void {
    const element = this.gameDataElement();
    const normalizedValue = value == null ? '' : String(value).trim();
    if (normalizedValue.length > 0) element.setAttribute(attribute, normalizedValue);
    else element.removeAttribute(attribute);
    this.objectChange.notifyChanged(element.identifier);
  }

  private setValues(object: DataElement) {
    if (this.updateTimer !== null) return;
    this._name.set(object.name);
    this._currentValue.set(object.currentValue);
    this._value.set(object.value);
  }

  private setUpdateTimer() {
    clearTimeout(this.updateTimer ?? undefined);
    this.updateTimer = setTimeout(() => {
      const element = this.gameDataElement();
      const nextName = this.name.trim();
      if (element.name !== nextName) {
        if (this.isDuplicateElementName(nextName, element)) {
          this._name.set(element.name);
        } else {
          element.name = nextName;
        }
      }
      if (element.currentValue !== this.currentValue) element.currentValue = this.currentValue;
      if (element.value !== this.value) element.value = this.value;
      this.updateTimer = null;
    }, 66);
  }

  private isDuplicateElementName(name: string, element: DataElement): boolean {
    const parentElement = this.getDataElementParent(element);
    return !!parentElement && DataElement.hasSiblingName(parentElement, name, element.identifier);
  }

  readonly escapeHtml = escapeHtml;
  readonly isUrlText = isUrlText;

  protected editCheckedIds = new Set<string>();

  /**
   * Whether a long text holding a web address is open for editing as text rather than shown as a
   * link.
   */
  isEditUrl(dataElmIdentifier: string) {
    return this.editCheckedIds.has(dataElmIdentifier);
  }

  /**
   * Switches a long text holding a web address between being edited as text and being shown as a
   * link, from its edit box.
   */
  changeChk(dataElmIdentifier: string) {
    if (this.editCheckedIds.has(dataElmIdentifier)) {
      this.editCheckedIds.delete(dataElmIdentifier);
    } else {
      this.editCheckedIds.add(dataElmIdentifier);
    }
  }

  /**
   * Keeps a long text open for editing once its box takes focus, so it does not turn into a link
   * while it is typed in.
   */
  textFocus(dataElmIdentifier: string) {
    this.editCheckedIds.add(dataElmIdentifier);
  }

  /** Sets the data type from a picker's choice, an emptied choice counting as none. */
  onSetElementType(value: string): void {
    this.setElementType(value ?? '');
  }

  /** Changes the field type from the field type picker, an emptied choice counting as text. */
  onSetFieldType(value: DataElementFieldTypeValue): void {
    this.setElementFieldType(value ?? DataElementFieldType.TEXT);
  }

  private findOwningCharacter(): GameCharacter | null {
    let cursor: unknown = this.gameDataElement();
    while (cursor) {
      if (cursor instanceof GameCharacter) return cursor;
      cursor = (cursor as { parent?: unknown }).parent;
    }
    return null;
  }
}
