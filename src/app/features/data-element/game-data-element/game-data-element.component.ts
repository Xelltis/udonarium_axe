import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeShapeInvokeService } from '@axe/application/tabletop/range-shape-invoke.service';
import { BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { DataElementDragService } from '@axe/application/ui/data-element-drag.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ResourceSliderRange, resourceSliderRange, showsResourceSlider } from '@axe/domain/character/resource-slider';
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
  openAddFieldPicker,
  openDataElementEditor,
} from '@axe/features/data-element/data-element-editor/open-data-element-editor';
import {
  buildContainerActions,
  buildFieldActions,
  buildMoveActions,
  type DataElementAction,
  type DataElementActionId,
  toContextMenuActions,
} from '@axe/features/data-element/game-data-element/data-element-actions';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import {
  HEADING_ICON_GROUPS,
  type HeadingIconGroup,
} from '@axe/features/data-element/game-data-element/data-element-icons';
import { IN_DATA_ELEMENT_SHEET } from '@axe/features/data-element/game-data-element/data-element-sheet-host';
import { DataElementTouchDrag } from '@axe/features/data-element/game-data-element/data-element-touch-drag';
import { FIELD_TYPE_CATALOG } from '@axe/features/data-element/game-data-element/field-type-catalog';
import {
  canDropStructureElement,
  type DataElementDropPosition,
  resolveDropPosition as resolveDropPositionShared,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';
import {
  moveStructureElement,
  type SiblingMove,
} from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';
import { GameDataElementTableViewComponent } from '@axe/features/data-element/game-data-element/game-data-element-table-view.component';
import {
  escapeHtml,
  fieldHasOptions,
  isTableCellField as isTableCellFieldShared,
  isUrlText,
  tableCellLineage,
} from '@axe/features/data-element/game-data-element/game-data-element-utils';
import { canStep, numericInputMode, stepValue } from '@axe/features/data-element/game-data-element/value-stepper';
import { GameDataElementFieldOptionsComponent } from '@axe/features/data-element/game-data-element-field-options/game-data-element-field-options.component';
import { GameDataElementRangeShapeComponent } from '@axe/features/data-element/game-data-element-range-shape/game-data-element-range-shape.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

/** How long after the last press of a ± its change is written, so a run of presses is one change. */
export const STEP_COMMIT_MS = 450;

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
    GameDataElementFieldOptionsComponent,
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
    '[attr.data-gde-id]': 'gameDataElement().identifier',
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
  private readonly edit = inject(DataElementEditService);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Whether the screen is a touch screen, where a handle is dragged by the finger rather than the browser. */
  protected readonly isTouch = inject(ViewportService).isTouch;
  private touchDrag: DataElementTouchDrag | null = null;
  private readonly injector = inject(Injector);
  /** Whether this row is drawn on a full sheet, which gives it ± buttons and an editor of its own. */
  protected readonly inSheet = inject(IN_DATA_ELEMENT_SHEET, { optional: true }) ?? false;

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

  /**
   * Whether this row shows ± buttons beside its number: on a sheet, while it is read rather than
   * edited. The buttons themselves show only on a narrow sheet or a touch screen.
   */
  showsSteppers(): boolean {
    return this.inSheet && !this.isEdit() && !this.isImage();
  }

  /** The keyboard a number box asks a phone for, given the lowest it may go. */
  inputModeFor(min: string): 'decimal' | null {
    return numericInputMode(min);
  }

  /** Whether a ± on a number would change it, so one against its bound is greyed out. */
  canStepValue(delta: number): boolean {
    return (
      !this.isValueLocked() && canStep(this._value(), delta, { min: this.valueMinAttr(), max: this.valueMaxAttr() })
    );
  }

  /** Whether a ± on what is left of a resource would change it. */
  canStepCurrentValue(delta: number): boolean {
    return (
      !this.isValueLocked() &&
      canStep(this._currentValue(), delta, { min: this.currentValueMinAttr(), max: this.currentValueMaxAttr() })
    );
  }

  /**
   * Moves a number one step from its ± button.
   *
   * The change is written a moment after the last press, so a run of presses reaches the room, and
   * the piece, as one change rather than one for every press.
   */
  stepNumberValue(delta: number): void {
    if (this.isValueLocked()) return;
    const next = stepValue(this._value(), delta, { min: this.valueMinAttr(), max: this.valueMaxAttr() });
    if (next === null) return;
    this._value.set(next);
    this.setUpdateTimer(STEP_COMMIT_MS);
  }

  /** Moves what is left of a resource one step from its ± button, written as one change after a run of presses. */
  stepCurrentValue(delta: number): void {
    if (this.isValueLocked()) return;
    const next = stepValue(this._currentValue(), delta, {
      min: this.currentValueMinAttr(),
      max: this.currentValueMaxAttr(),
    });
    if (next === null) return;
    this._currentValue.set(next);
    this.setUpdateTimer(STEP_COMMIT_MS);
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

  /** The unit shown after a number or resource field's value. Setting blank text removes it. */
  get unitText(): string {
    return this.attrText(DataElementAttribute.UNIT);
  }
  /** The lowest value a number field takes, as written in its settings; empty for no limit. */
  get minText(): string {
    return this.attrText(DataElementAttribute.MIN);
  }
  /** The highest value a number field takes, as written in its settings; empty for no limit. */
  get maxText(): string {
    return this.attrText(DataElementAttribute.MAX);
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

  static readonly ICON_GROUPS: readonly HeadingIconGroup[] = HEADING_ICON_GROUPS;

  readonly iconGroups = GameDataElementComponent.ICON_GROUPS.map((group) => ({
    label: this.t(group.labelKey),
    icons: group.icons,
  }));

  readonly fieldTypeItems: { type: DataElementFieldTypeValue; label: string }[] = FIELD_TYPE_CATALOG.map((entry) => ({
    type: entry.type,
    label: this.t(entry.labelKey),
  }));

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
    inject(DestroyRef).onDestroy(() => this.touchDrag?.cancel());
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
    if (!this.canAddChildFieldElement()) return;
    this.edit.addFieldInside(this.gameDataElement());
  }

  /**
   * Adds a new field just after this one, under a name no sibling has. Does nothing where the
   * parent cannot hold a field.
   */
  addSiblingElement() {
    this.edit.addFieldAfter(this.gameDataElement());
  }

  /**
   * Adds a new group, with one field already in it, at the end of this element. Does nothing where
   * this element cannot hold a group.
   */
  addGroupElement() {
    if (!this.canAddChildGroupElement()) return;
    this.edit.addGroupInside(this.gameDataElement());
  }

  /** Whether this element may hold a new group, which shows the button for adding one. */
  canAddChildGroupElement(): boolean {
    return this.edit.canAddGroupInside(this.gameDataElement());
  }

  /** Whether this element may hold a new field, which shows the button for adding one inside it. */
  canAddChildFieldElement(): boolean {
    return this.edit.canAddFieldInside(this.gameDataElement());
  }

  /** Whether a new field may go in beside this one, which shows the add row button on a field. */
  canAddSiblingFieldElement(): boolean {
    return this.edit.canAddFieldAfter(this.gameDataElement());
  }

  /**
   * Whether this element can be copied beside itself: anything but a picture in an image list, as
   * long as it has a parent to go into.
   */
  canDuplicateElement(): boolean {
    return !this.isImage() && this.edit.canDuplicate(this.gameDataElement());
  }

  /**
   * Puts a copy of this element, with everything under it, just after it. Does nothing for a
   * picture in an image list or an element with no parent.
   */
  duplicateElement(): void {
    if (this.isImage()) return;
    this.edit.duplicate(this.gameDataElement());
  }

  /**
   * Whether this group or section can be saved as a template, which needs it to be on the sheet of
   * an object that keeps templates, such as a character, rather than inside a saved template.
   */
  canSaveAsTemplate(): boolean {
    return !this.isImage() && this.edit.canSaveAsTemplate(this.gameDataElement());
  }

  /**
   * Saves a copy of this group or section among the templates its sheet keeps, so it can be put in
   * again from the template menu.
   */
  saveAsTemplate(): void {
    if (this.canSaveAsTemplate()) this.edit.saveAsTemplate(this.gameDataElement());
  }

  readonly elementTemplates = computed<DataElement[]>(() => {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return this.isImage() ? [] : this.edit.templatesFor(element);
  });

  /**
   * Puts a copy of a saved template in from the template menu, and closes the menu.
   *
   * The copy goes into this element where it can hold it, and otherwise into the nearest parent
   * that can, just after the branch it climbed out of.
   */
  insertTemplate(template: DataElement): void {
    this.templateMenuOpen.set(false);
    this.edit.insertTemplate(template, this.gameDataElement());
  }

  /**
   * Deletes a saved template from the template menu without inserting it; the menu closes once no
   * templates are left.
   */
  deleteTemplate(template: DataElement, event: Event): void {
    event.stopPropagation();
    this.edit.deleteTemplate(template);
    if (this.elementTemplates().length < 1) this.templateMenuOpen.set(false);
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
    const moves = this.moveActions();
    if (moves.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const actions = toContextMenuActions(moves, (id) => this.runAction(id), this.t);
    this.contextMenuService.open(this.pointerDeviceService.pointers[0], actions, this.gameDataElement().name);
  }

  /**
   * Opens this row's editor in a sheet from the bottom, from its name or its "⋯" on a narrow sheet,
   * where its buttons have no room beside it.
   */
  openEditor(event?: Event, options: { focusName?: boolean } = {}): void {
    openDataElementEditor(this.bottomSheet, this.t, this.gameDataElement(), {
      host: event?.currentTarget instanceof Element ? event.currentTarget : null,
      injector: this.injector,
      focusName: options.focusName,
    });
  }

  /**
   * Opens the choice of kind for a field to add at the end of this group, from the "+" a narrow
   * sheet puts there; the field's editor takes over once a kind is picked.
   */
  openAddField(event?: Event): void {
    openAddFieldPicker(this.bottomSheet, this.t, this.gameDataElement(), {
      host: event?.currentTarget instanceof Element ? event.currentTarget : null,
      injector: this.injector,
    });
  }

  /** Adds a group at the end of this section and opens its editor with the name ready to be typed over. */
  addGroupAndEdit(event?: Event): void {
    const group = this.edit.addGroupInside(this.gameDataElement());
    if (!group) return;
    openDataElementEditor(this.bottomSheet, this.t, group, {
      host: event?.currentTarget instanceof Element ? event.currentTarget : null,
      injector: this.injector,
      focusName: true,
    });
  }

  /** The actions of this field row, in the order its bar shows them. */
  fieldActions(): DataElementAction[] {
    return buildFieldActions({
      isPopup: this.isPopupDataElement(),
      hasFieldOptions: this.shouldShowFieldOptions(),
      fieldOptionsOpen: this.fieldOptionsOpen(),
      canAddSibling: this.canAddSiblingFieldElement(),
      canDuplicate: this.canDuplicateElement(),
    });
  }

  /** The actions of this group or section heading, in the order its bar shows them. */
  containerActions(): DataElementAction[] {
    return buildContainerActions({
      isImage: this.isImage(),
      isPopup: this.isPopupDataElement(),
      canToggleTableView: this.canToggleTableViewMode(),
      isTableView: this.isTableViewMode(),
      hasTableSettings: this.shouldShowContainerOptions(),
      settingsOpen: this.fieldOptionsOpen(),
      canDuplicate: this.canDuplicateElement(),
      canSaveTemplate: this.canSaveAsTemplate(),
      canAddGroup: this.canAddChildGroupElement(),
      hasTemplates: this.elementTemplates().length > 0,
      templateMenuOpen: this.templateMenuOpen(),
      canAddField: this.canAddChildFieldElement(),
    });
  }

  /** The moves this element can make among the ones beside it. */
  moveActions(): DataElementAction[] {
    const siblings = this.siblingElements();
    const index = siblings.indexOf(this.gameDataElement());
    if (index < 0) return [];
    return buildMoveActions({ index, count: siblings.length, hasMoveTargets: false });
  }

  /** Does what an action of this row or heading stands for. */
  runAction(id: DataElementActionId, event?: MouseEvent): void {
    switch (id) {
      case 'copyReference':
        return this.copyReferencePath(event);
      case 'togglePopup':
        return this.togglePopupDataElement(event);
      case 'fieldOptions':
      case 'tableSettings':
        return this.toggleFieldOptions();
      case 'addSibling':
        return this.addSiblingElement();
      case 'tableView':
        return this.toggleTableViewMode();
      case 'duplicate':
        return this.duplicateElement();
      case 'saveTemplate':
        return this.saveAsTemplate();
      case 'addImage':
        return this.addImageElement();
      case 'addGroup':
        return this.addGroupElement();
      case 'addFromTemplate':
        this.templateMenuOpen.update((isOpen) => !isOpen);
        return;
      case 'addField':
        return this.addElement();
      case 'moveToTop':
      case 'moveUp':
      case 'moveDown':
      case 'moveToBottom':
        return this.moveAmongSiblings(id);
      case 'moveTo':
        return;
      case 'delete':
        return this.deleteElement();
    }
  }

  private siblingElements(): DataElement[] {
    const parent = this.getDataElementParent();
    if (!parent) return [];
    return parent.children.filter((child): child is DataElement => child instanceof DataElement);
  }

  /** Moves this element to the top, up one, down one or to the bottom of the ones beside it. */
  private moveAmongSiblings(move: SiblingMove): void {
    this.edit.move(this.gameDataElement(), move);
  }

  /**
   * Starts carrying this row by its handle with a finger or a pen, among the rows beside it. The
   * browser's own drag, which a mouse uses, does not start from a touch.
   */
  onHandlePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' || !this.isEdit() || this.isImage() || this.isReadOnly()) return;
    this.touchDrag?.cancel();
    this.touchDrag = new DataElementTouchDrag(
      this.gameDataElement().identifier,
      event.currentTarget as HTMLElement,
      this.hostElement.nativeElement,
      event,
      {
        onStart: () => this.pointerDeviceService.cancelPendingContextMenu(),
        onDrop: (targetId, side) => {
          const target = this.objectStore.get<DataElement>(targetId);
          if (target) this.edit.moveBeside(this.gameDataElement(), target, side);
        },
      }
    );
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
    this.edit.notify(...elements);
  }

  /** Destroys this element and everything under it, leaving a notice that offers to put it back. */
  deleteElement() {
    this.edit.delete(this.gameDataElement());
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
    this.edit.setFieldType(this.gameDataElement(), fieldType);
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
    const element = this.gameDataElement();
    for (const node of tableCellLineage(element)) this.objectChange.versionOf(node.identifier)();
    return fieldHasOptions(element);
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
    for (const node of tableCellLineage(element)) this.objectChange.versionOf(node.identifier)();
    return isTableCellFieldShared(element);
  }

  /**
   * Copies the element's path, as formulas and references write it, to the clipboard. Does nothing
   * where the element has no path or there is no clipboard.
   */
  copyReferencePath(event?: MouseEvent): void {
    event?.stopPropagation();
    this.edit.copyReference(this.gameDataElement());
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
    this.edit.togglePopup(this.gameDataElement());
  }

  /** Whether this resource is moved with a slider as well as typed, here and in the popup over its piece. */
  hasResourceSlider(): boolean {
    const element = this.gameDataElement();
    this.objectChange.versionOf(element.identifier)();
    return showsResourceSlider(element);
  }

  /** The span the slider runs over, the same the current value may be typed within; null with nothing to slide over. */
  resourceSliderSpan(): ResourceSliderRange | null {
    return resourceSliderRange(this.currentValueMinAttr(), this.currentValueMaxAttr());
  }

  /** Shows where the slider is being dragged to in the box beside it, before anything is written. */
  previewSliderValue(event: Event): void {
    if (this.isValueLocked()) return;
    this._currentValue.set((event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * Writes where the slider was let go as what is left of the resource, once, so a drag across it
   * is one change on the piece rather than one for every step. The maximum is left alone.
   */
  commitSliderValue(event: Event): void {
    this.currentValue = (event.target as HTMLInputElement).valueAsNumber;
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
    if (this.canToggleTableViewMode()) this.edit.toggleTableView(this.gameDataElement());
  }

  /**
   * Whether this table offers judgement, in which clicking a skill cell finds the nearest learnt
   * skills to roll from.
   */
  isJudgeModeEnabled(): boolean {
    return this.hasFlag(DataElementAttribute.JUDGE_MODE);
  }

  /** Whether distance in judgement runs on from the table's last column round to its first. */
  get loopHorizontal(): boolean {
    return this.attrText(DataElementAttribute.LOOP_HORIZONTAL) === 'true';
  }
  /** Whether distance in judgement runs on from the table's last row round to its first. */
  get loopVertical(): boolean {
    return this.attrText(DataElementAttribute.LOOP_VERTICAL) === 'true';
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

  private setUpdateTimer(delayMs = 66) {
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
    }, delayMs);
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
