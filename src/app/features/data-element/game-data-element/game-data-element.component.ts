import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { DataElementDragService } from '@axe/application/ui/data-element-drag.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
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
import { duplicateDataElement } from '@axe/domain/data/data-element-templates';
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
} from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';
import { GameDataElementTableViewComponent } from '@axe/features/data-element/game-data-element/game-data-element-table-view.component';
import { escapeHtml, isUrlText } from '@axe/features/data-element/game-data-element/game-data-element-utils';
import { GameDataElementRangeShapeComponent } from '@axe/features/data-element/game-data-element-range-shape/game-data-element-range-shape.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
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

  readonly gameDataElement = input.required<DataElement>();
  readonly isEdit = input(false);
  readonly isTagLocked = input(false);
  readonly isValueLocked = input(false);

  readonly isImage = input(false);
  readonly indexNum = input(0);
  readonly depth = input(0);
  readonly hideSectionTitle = input(false);

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
  get value(): number | string {
    return this._value();
  }
  set value(value: number | string) {
    if (this.isValueLocked()) return;
    this._value.set(value);
    this.setUpdateTimer();
  }

  private readonly _currentValue = signal<number | string>(0);
  get currentValue(): number | string {
    return this._currentValue();
  }
  set currentValue(currentValue: number | string) {
    if (this.isValueLocked()) return;
    this._currentValue.set(currentValue);
    this.setUpdateTimer();
  }

  currentValueMinAttr(): string {
    return this.effectiveMinDisplay();
  }

  currentValueMaxAttr(): string {
    const value = this._value();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return value;
    return '';
  }

  valueMinAttr(): string {
    return this.effectiveMinDisplay();
  }

  valueMaxAttr(): string {
    return this.effectiveMaxDisplay();
  }

  commitValueBounds(): void {
    if (this.isValueLocked()) return;
    const clamped = this.clampNumeric(this._value(), this.valueMinAttr(), this.valueMaxAttr());
    if (clamped !== this._value()) {
      this._value.set(clamped);
      this.setUpdateTimer();
    }
  }

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

  get icon(): string {
    return this.attrText('cs-icon');
  }
  set icon(value: string) {
    const el = this.gameDataElement();
    if (el) el.setAttribute('cs-icon', value.trim());
  }

  get choicesText(): string {
    return this.attrText(DataElementAttribute.CHOICES);
  }
  set choicesText(value: string) {
    this.setFieldAttribute(DataElementAttribute.CHOICES, value);
  }

  get unitText(): string {
    return this.attrText(DataElementAttribute.UNIT);
  }
  set unitText(value: string) {
    this.setFieldAttribute(DataElementAttribute.UNIT, value);
  }

  get minText(): string {
    return this.attrText(DataElementAttribute.MIN);
  }
  set minText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN, value);
  }

  get maxText(): string {
    return this.attrText(DataElementAttribute.MAX);
  }
  set maxText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MAX, value);
  }

  get minBaseText(): string {
    return this.attrText(DataElementAttribute.MIN_BASE, DataElementAttribute.MIN);
  }
  set minBaseText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN_BASE, value);
  }

  get minCorrectionText(): string {
    return this.attrText(DataElementAttribute.MIN_CORRECTION);
  }
  set minCorrectionText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MIN_CORRECTION, value);
  }

  get maxBaseText(): string {
    return this.attrText(DataElementAttribute.MAX_BASE, DataElementAttribute.MAX);
  }
  set maxBaseText(value: string | number | null | undefined) {
    this.setFieldAttribute(DataElementAttribute.MAX_BASE, value);
    this.syncCurrentMaxToEffective();
  }

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

  effectiveMinDisplay(): string {
    const v = this.gameDataElement()?.effectiveMin;
    return v == null ? '' : String(v);
  }
  effectiveMaxDisplay(): string {
    const v = this.gameDataElement()?.effectiveMax;
    return v == null ? '' : String(v);
  }

  get formulaText(): string {
    return this.attrText(DataElementAttribute.FORMULA);
  }
  set formulaText(value: string) {
    this.setFieldAttribute(DataElementAttribute.FORMULA, value);
  }

  get tableCellText(): string {
    return this.attrText(DataElementAttribute.CELL_TEXT);
  }
  set tableCellText(value: string) {
    this.setFieldAttribute(DataElementAttribute.CELL_TEXT, value);
  }

  get columnLabelText(): string {
    return this.attrText(DataElementAttribute.COLUMN_LABEL);
  }
  set columnLabelText(value: string) {
    this.setFieldAttribute(DataElementAttribute.COLUMN_LABEL, value);
  }

  get columnGroupText(): string {
    return this.attrText(DataElementAttribute.COLUMN_GROUP);
  }
  set columnGroupText(value: string) {
    this.setFieldAttribute(DataElementAttribute.COLUMN_GROUP, value);
  }

  get rowHeaderLabelText(): string {
    return this.attrText(DataElementAttribute.ROW_HEADER_LABEL);
  }
  set rowHeaderLabelText(value: string) {
    this.setFieldAttribute(DataElementAttribute.ROW_HEADER_LABEL, value);
  }

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

  selectIcon(name: string): void {
    this.icon = name;
    this.iconPickerOpen.set(false);
  }

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

  openModal(_name: string = '', isAllowedEmpty: boolean = false) {
    if (this.isValueLocked()) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then((value) => {
      if (!value) return;
      const element = this.gameDataElement();
      if (!element) return;
      element.value = value;
    });
  }

  updateKomaIconMaxValue(root: DataElement) {
    const image = root.getFirstElementByName('image');
    const icon = root.getElementsByName('ICON');
    if (icon) {
      icon[0].value = image!.children.length - 1;
      if (+icon[0].currentValue > +icon[0].value) icon[0].currentValue = icon[0].value;
    }
  }

  addImageElement() {
    this.gameDataElement().appendChild(DataElement.create('imageIdentifier', '', { type: 'image' }));
    this.updateKomaIconMaxValue(this.gameDataElement().parent as DataElement);
  }

  addElement() {
    const parentElement = this.gameDataElement();
    if (!this.canAddChildFieldElement()) return;

    const fieldElement = createFieldElement(parentElement, this.newElementNames());
    parentElement.appendChild(fieldElement);
    this.notifyStructureChanged(parentElement, fieldElement);
  }

  addSiblingElement() {
    const parentElement = this.getDataElementParent();
    if (!parentElement || !canAcceptChildRole(parentElement, DataElementRole.FIELD)) return;

    const fieldElement = createFieldElement(parentElement, this.newElementNames());
    insertElementAfter(fieldElement, this.gameDataElement(), parentElement);
    this.notifyStructureChanged(parentElement, fieldElement);
  }

  addGroupElement() {
    const parentElement = this.gameDataElement();
    if (!this.canAddChildGroupElement()) return;

    const groupElement = createGroupElement(parentElement, this.newElementNames());
    parentElement.appendChild(groupElement);
    this.notifyStructureChanged(parentElement, groupElement);
  }

  canAddChildGroupElement(): boolean {
    return canAcceptChildRole(this.gameDataElement(), DataElementRole.GROUP);
  }

  canAddChildFieldElement(): boolean {
    return canAcceptChildRole(this.gameDataElement(), DataElementRole.FIELD);
  }

  canAddSiblingFieldElement(): boolean {
    const parentElement = this.getDataElementParent();
    return !!parentElement && canAcceptChildRole(parentElement, DataElementRole.FIELD);
  }

  canDuplicateElement(): boolean {
    return !this.isImage() && this.getDataElementParent() !== null;
  }

  duplicateElement(): void {
    const element = this.gameDataElement();
    const parentElement = this.getDataElementParent();
    if (!parentElement || this.isImage()) return;

    const copy = duplicateDataElement(element, parentElement);
    if (!copy) return;
    insertElementAfter(copy, element, parentElement);
    this.notifyStructureChanged(parentElement, copy);
  }

  private newElementNames(): NewElementNames {
    return {
      field: this.t('feature.dataElement.defaults.newTag'),
      group: this.t('feature.dataElement.defaults.newGroup'),
    };
  }

  onStructureDragStart(event: DragEvent): void {
    if (!this.isEdit() || this.isImage()) return;
    this.dataElementDrag.start(event, this.gameDataElement().identifier);
    event.stopPropagation();
  }

  onStructureDragEnd(event?: DragEvent): void {
    this.dataElementDrag.end();
    this.structureDropPosition.set(null);
    event?.stopPropagation();
  }

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

  onStructureDragLeave(event: DragEvent): void {
    // Only clear the indicator when the cursor truly left this host element.
    // dragleave also fires when the cursor moves into a child element (event bubbles up),
    // so we check relatedTarget to distinguish the two cases.
    const host = event.currentTarget as HTMLElement | null;
    if (host && event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    this.structureDropPosition.set(null);
    event.stopPropagation();
  }

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

  deleteElement() {
    this.gameDataElement().destroy();
  }

  deleteImageElement() {
    const root: DataElement = this.gameDataElement().parent!.parent as DataElement;
    if (this.gameDataElement().parent!.children[0] != this.gameDataElement()) {
      this.gameDataElement().destroy();
      this.updateKomaIconMaxValue(root);
    }
  }

  setElementType(type: string) {
    const element = this.gameDataElement();
    element.setAttribute('type', type);
    element.setFieldType(DataElement.fieldTypeFromDataType(type));
  }

  setElementFieldType(fieldType: DataElementFieldTypeValue) {
    const element = this.gameDataElement();
    element.setFieldType(fieldType);
    element.setAttribute('type', DataElement.dataTypeFromFieldType(fieldType));
    this.fieldOptionsOpen.set(false);
  }

  getSelectOptions(): string[] {
    return getSelectOptions(this.gameDataElement());
  }

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

  shouldShowContainerOptions(): boolean {
    return (
      this.isEdit() &&
      !this.isImage() &&
      this.gameDataElement().fieldRole !== DataElementRole.FIELD &&
      this.isTableViewMode()
    );
  }

  toggleFieldOptions(): void {
    this.fieldOptionsOpen.update((isOpen) => !isOpen);
  }

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

  isPopupDataElement(): boolean {
    return this.hasFlag(DataElementAttribute.POPUP);
  }

  togglePopupDataElement(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.isImage()) return;
    this.toggleFlag(DataElementAttribute.POPUP);
  }

  isPieceGauge(): boolean {
    return this.hasFlag(DataElementAttribute.PIECE_GAUGE);
  }

  canShowPieceGauge(): boolean {
    return this.gameDataElement().isNumberResource;
  }

  isGaugeInverted(): boolean {
    return this.hasFlag(DataElementAttribute.GAUGE_INVERTED);
  }

  toggleGaugeInverted(): void {
    if (!this.canShowPieceGauge()) return;
    this.toggleFlag(DataElementAttribute.GAUGE_INVERTED);
  }

  togglePieceGauge(event?: MouseEvent): void {
    event?.stopPropagation();
    if (!this.canShowPieceGauge()) return;
    this.toggleFlag(DataElementAttribute.PIECE_GAUGE);
  }

  canShowChangeFeedback(): boolean {
    return this.gameDataElement().isNumberResource;
  }

  playsEffectOnChange(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return playsEffectOnChange(element);
  }

  playsSoundOnChange(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return playsSoundOnChange(element);
  }

  toggleChangeEffect(): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_EFFECT, this.playsEffectOnChange() ? 'false' : 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  toggleChangeSound(): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_SOUND, this.playsSoundOnChange() ? 'false' : 'true');
    this.objectChange.notifyChanged(element.identifier);
  }

  soundSetOnChange(): ResourceSoundSet {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return soundSetOnChange(element);
  }

  setSoundSetOnChange(value: string): void {
    if (!this.canShowChangeFeedback()) return;
    const element = this.gameDataElement();
    element.setAttribute(DataElementAttribute.CHANGE_SOUND_SET, value === 'mech' ? 'mech' : 'flesh');
    this.objectChange.notifyChanged(element.identifier);
  }

  isImagePopupOriginal(): boolean {
    return this.hasFlag(DataElementAttribute.IMAGE_POPUP_ORIGINAL);
  }

  toggleImagePopupOriginal(event?: Event): void {
    event?.stopPropagation();
    this.toggleFlag(DataElementAttribute.IMAGE_POPUP_ORIGINAL);
  }

  canToggleTableViewMode(): boolean {
    return !this.isImage() && this.gameDataElement().fieldRole !== DataElementRole.FIELD;
  }

  isTableViewMode(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return element.viewMode === DataElementViewMode.TABLE;
  }

  toggleTableViewMode(): void {
    if (!this.canToggleTableViewMode()) return;
    const element = this.gameDataElement();
    element.setViewMode(this.isTableViewMode() ? DataElementViewMode.NORMAL : DataElementViewMode.TABLE);
    this.objectChange.notifyChanged(element.identifier);
  }

  isJudgeModeEnabled(): boolean {
    return this.hasFlag(DataElementAttribute.JUDGE_MODE);
  }

  toggleJudgeModeEnabled(): void {
    this.toggleFlag(DataElementAttribute.JUDGE_MODE);
  }

  get gapDistanceText(): string {
    return this.attrText(DataElementAttribute.GAP_DISTANCE);
  }
  set gapDistanceText(value: string) {
    this.setFieldAttribute(DataElementAttribute.GAP_DISTANCE, value);
  }

  get baseDifficultyText(): string {
    return this.attrText(DataElementAttribute.BASE_DIFFICULTY);
  }
  set baseDifficultyText(value: string) {
    this.setFieldAttribute(DataElementAttribute.BASE_DIFFICULTY, value);
  }

  get loopHorizontal(): boolean {
    return this.attrText(DataElementAttribute.LOOP_HORIZONTAL) === 'true';
  }
  toggleLoopHorizontal(): void {
    this.toggleFlag(DataElementAttribute.LOOP_HORIZONTAL);
  }

  get loopVertical(): boolean {
    return this.attrText(DataElementAttribute.LOOP_VERTICAL) === 'true';
  }
  toggleLoopVertical(): void {
    this.toggleFlag(DataElementAttribute.LOOP_VERTICAL);
  }

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

  isEditUrl(dataElmIdentifier: string) {
    return this.editCheckedIds.has(dataElmIdentifier);
  }

  changeChk(dataElmIdentifier: string) {
    if (this.editCheckedIds.has(dataElmIdentifier)) {
      this.editCheckedIds.delete(dataElmIdentifier);
    } else {
      this.editCheckedIds.add(dataElmIdentifier);
    }
  }

  textFocus(dataElmIdentifier: string) {
    this.editCheckedIds.add(dataElmIdentifier);
  }

  onSetElementType(value: string): void {
    this.setElementType(value ?? '');
  }

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
