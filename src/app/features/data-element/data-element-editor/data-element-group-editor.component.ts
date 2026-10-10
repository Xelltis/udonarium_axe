import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BottomSheetRef, BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { DataElement, type DataElementFieldTypeValue, DataElementRole } from '@axe/domain/data/data-element';
import { DataElementFieldEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-field-editor.component';
import { DataElementTypeGridComponent } from '@axe/features/data-element/data-element-editor/data-element-type-grid.component';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import { HEADING_ICON_GROUPS } from '@axe/features/data-element/game-data-element/data-element-icons';
import type { MoveTarget } from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';
import type { SiblingMove } from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';
import { GameDataElementFieldOptionsComponent } from '@axe/features/data-element/game-data-element-field-options/game-data-element-field-options.component';
import { TranslocoModule } from '@jsverse/transloco';

/** The steps a group can take among those beside it, in the order the editor offers them. */
const MOVES: readonly { id: SiblingMove; icon: string; labelKey: string }[] = [
  { id: 'moveToTop', icon: 'vertical_align_top', labelKey: 'common.reorder.toTop' },
  { id: 'moveUp', icon: 'arrow_upward', labelKey: 'common.reorder.up' },
  { id: 'moveDown', icon: 'arrow_downward', labelKey: 'common.reorder.down' },
  { id: 'moveToBottom', icon: 'vertical_align_bottom', labelKey: 'common.reorder.toBottom' },
];

let nextEditorId = 0;

/**
 * Everything about a group or a section of a sheet, in a sheet from the bottom of a phone: its
 * name and mark, whether it shows as a table and how, what to add to it, where it stands, and
 * copying, saving as a template or deleting it.
 *
 * A narrow sheet has no room for a heading's buttons, so the heading keeps only its name and opens
 * this. Every change is made at once through the same service the wide sheet's buttons use.
 */
@Component({
  selector: 'data-element-group-editor',
  templateUrl: './data-element-group-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataElementTypeGridComponent, GameDataElementFieldOptionsComponent, TranslocoModule],
  host: { class: 'block' },
})
export class DataElementGroupEditorComponent {
  private readonly edit = inject(DataElementEditService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly sheet = inject(BottomSheetRef);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly element = input.required<DataElement>();
  /** Whether the name box takes the focus as the editor opens, as for a group just added. */
  readonly focusName = input(false);

  /** The group being edited, which a copy or a new group takes the place of. */
  protected readonly current = linkedSignal(() => this.element());
  protected readonly view = signal<'main' | 'moveTo' | 'addField' | 'templates' | 'icons'>('main');
  protected readonly moves = MOVES;
  protected readonly iconGroups = HEADING_ICON_GROUPS;
  protected readonly idPrefix = `group-editor-${nextEditorId++}`;

  private readonly nameBox = viewChild<ElementRef<HTMLInputElement>>('nameBox');
  private isGone = false;

  /** What the group is now, read again whenever it or what is around it changes. */
  protected readonly state = computed(() => {
    const element = this.current();
    this.objectChange.versionOf(element.identifier)();
    const parent = this.edit.parentOf(element);
    if (parent) this.objectChange.versionOf(parent.identifier)();
    const isSection = element.fieldRole === DataElementRole.SECTION;
    return {
      name: element.name,
      icon: this.edit.iconOf(element),
      isSection,
      isTable: this.edit.isTableView(element),
      isPopup: this.edit.isPopup(element),
      canAddField: this.edit.canAddFieldInside(element),
      canAddGroup: this.edit.canAddGroupInside(element),
      templates: this.edit.templatesFor(element),
      canSaveTemplate: this.edit.canSaveAsTemplate(element),
      canDuplicate: this.edit.canDuplicate(element),
      canMove: Object.fromEntries(MOVES.map((move) => [move.id, this.edit.canMove(element, move.id)])),
      moveTargets: isSection ? [] : this.edit.moveTargetsOf(element),
    };
  });

  /** The name as it is being typed, which goes back to the group's own name when another is shown. */
  protected readonly nameDraft = linkedSignal(() => this.state().name);
  protected readonly nameError = computed<'empty' | 'duplicate' | null>(() => {
    const draft = this.nameDraft().trim();
    if (!draft) return 'empty';
    if (draft !== this.current().name && this.edit.hasSiblingNamed(this.current(), draft)) return 'duplicate';
    return null;
  });

  constructor() {
    afterNextRender(() => {
      if (this.focusName()) this.focusNameBox();
    });
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.commitName());
    this.objectChange.objectDeleted$.subscribe((event) => {
      if (event.identifier === this.current().identifier) {
        this.isGone = true;
        this.sheet.close(null);
      }
    }, destroyRef);
  }

  /** Follows the name box as it is typed in. */
  onNameInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  /** Writes the typed name to the group, unless it is blank or a sibling has it. */
  commitName(): void {
    if (this.isGone || this.nameError()) return;
    this.edit.rename(this.current(), this.nameDraft());
  }

  /** Gives the heading a mark, or takes it away, and goes back to the rest of the editor. */
  setIcon(icon: string): void {
    this.edit.setIcon(this.current(), icon);
    this.view.set('main');
  }

  /** Shows the group as a table or as rows. */
  setTable(table: boolean): void {
    if (this.state().isTable !== table) this.edit.toggleTableView(this.current());
  }

  /**
   * Adds a field of the chosen kind at the end of the group, and goes on to edit it with its name
   * ready to be typed over.
   */
  addField(type: DataElementFieldTypeValue): void {
    this.commitName();
    const field = this.edit.addFieldInside(this.current(), type);
    if (!field) return;
    this.openFieldEditor(field);
  }

  /** Adds a group inside this one and goes on to edit it. */
  addGroup(): void {
    this.commitName();
    const group = this.edit.addGroupInside(this.current());
    if (!group) return;
    this.switchTo(group);
  }

  /** Puts a copy of a saved template into the group, and goes back to the rest of the editor. */
  insertTemplate(template: DataElement): void {
    this.edit.insertTemplate(template, this.current());
    this.view.set('main');
  }

  /** Deletes a saved template; the list goes back to the editor once none is left. */
  deleteTemplate(template: DataElement): void {
    this.edit.deleteTemplate(template);
    if (this.state().templates.length < 1) this.view.set('main');
  }

  /** Saves a copy of the group among the sheet's templates, and says so. */
  saveAsTemplate(): void {
    this.edit.saveAsTemplate(this.current());
    this.snackbar.show(this.t('feature.dataElement.editor.templateSaved', { name: this.current().name }));
  }

  /** Moves the group a step among those beside it; the editor stays open for the next step. */
  move(move: SiblingMove): void {
    this.edit.move(this.current(), move);
  }

  /** Moves the group into another, and goes back to the rest of the editor. */
  moveInto(target: MoveTarget): void {
    this.edit.moveInto(this.current(), target.element);
    this.view.set('main');
  }

  /** The names that lead to a group, as the list of places to move to shows them. */
  pathOf(target: MoveTarget): string {
    return target.path.join(' › ');
  }

  /** Shows the group in its piece's popup, or stops showing it there. */
  togglePopup(): void {
    this.edit.togglePopup(this.current());
  }

  /** Copies the group, with everything in it, just below itself and goes on to edit the copy. */
  duplicate(): void {
    this.commitName();
    const copy = this.edit.duplicate(this.current());
    if (copy) this.switchTo(copy);
  }

  /** Deletes the group and everything in it, closing the editor; the notice it leaves can put it back. */
  delete(): void {
    const element = this.current();
    this.commitName();
    this.isGone = true;
    this.sheet.close(null);
    this.edit.delete(element);
  }

  private switchTo(element: DataElement): void {
    this.current.set(element);
    this.view.set('main');
    afterNextRender(() => this.focusNameBox(), { injector: this.injector });
  }

  /** Hands the sheet over to the new field's editor, which opens before this one goes. */
  private openFieldEditor(field: DataElement): void {
    this.bottomSheet.open(DataElementFieldEditorComponent, {
      title: this.t('feature.dataElement.editor.fieldTitle'),
      inputs: { element: field, focusName: true },
      host: this.host.nativeElement,
    });
    this.sheet.close(null);
  }

  private focusNameBox(): void {
    const box = this.nameBox()?.nativeElement;
    if (!box) return;
    box.focus();
    box.select();
  }
}
