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
import { BottomSheetRef } from '@axe/application/ui/bottom-sheet.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { DataElement, type DataElementFieldTypeValue } from '@axe/domain/data/data-element';
import { DataElementTypeGridComponent } from '@axe/features/data-element/data-element-editor/data-element-type-grid.component';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import type { MoveTarget } from '@axe/features/data-element/game-data-element/game-data-element-structure-drop';
import type { SiblingMove } from '@axe/features/data-element/game-data-element/game-data-element-structure-ops';
import {
  fieldHasOptions,
  tableCellLineage,
} from '@axe/features/data-element/game-data-element/game-data-element-utils';
import { GameDataElementFieldOptionsComponent } from '@axe/features/data-element/game-data-element-field-options/game-data-element-field-options.component';
import { TranslocoModule } from '@jsverse/transloco';

/** The steps a field can take among the rows beside it, in the order the editor offers them. */
const MOVES: readonly { id: SiblingMove; icon: string; labelKey: string }[] = [
  { id: 'moveToTop', icon: 'vertical_align_top', labelKey: 'common.reorder.toTop' },
  { id: 'moveUp', icon: 'arrow_upward', labelKey: 'common.reorder.up' },
  { id: 'moveDown', icon: 'arrow_downward', labelKey: 'common.reorder.down' },
  { id: 'moveToBottom', icon: 'vertical_align_bottom', labelKey: 'common.reorder.toBottom' },
];

let nextEditorId = 0;

/**
 * Everything about one row of a sheet, in a sheet from the bottom of a phone: its name, its kind,
 * its settings, where it stands, and copying or deleting it.
 *
 * A narrow sheet has no room for these beside the row, so the row keeps only its value and opens
 * this. Every change is made at once through the same service the wide sheet's buttons use.
 */
@Component({
  selector: 'data-element-field-editor',
  templateUrl: './data-element-field-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataElementTypeGridComponent, GameDataElementFieldOptionsComponent, TranslocoModule],
  host: { class: 'block' },
})
export class DataElementFieldEditorComponent {
  private readonly edit = inject(DataElementEditService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly sheet = inject(BottomSheetRef);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly injector = inject(Injector);

  readonly element = input.required<DataElement>();
  /** Whether the name box takes the focus as the editor opens, as for a field just added. */
  readonly focusName = input(false);

  /** The row being edited, which a copy or a new row below takes the place of. */
  protected readonly current = linkedSignal(() => this.element());
  protected readonly view = signal<'main' | 'moveTo'>('main');
  protected readonly moves = MOVES;
  protected readonly idPrefix = `field-editor-${nextEditorId++}`;

  private readonly nameBox = viewChild<ElementRef<HTMLInputElement>>('nameBox');

  /** What the row is now, read again whenever it or the rows beside it change. */
  protected readonly state = computed(() => {
    const element = this.current();
    for (const node of tableCellLineage(element)) this.objectChange.versionOf(node.identifier)();
    return {
      name: element.name,
      fieldType: element.fieldType,
      isPopup: this.edit.isPopup(element),
      hasOptions: fieldHasOptions(element),
      canAddAfter: this.edit.canAddFieldAfter(element),
      canDuplicate: this.edit.canDuplicate(element),
      canMove: Object.fromEntries(MOVES.map((move) => [move.id, this.edit.canMove(element, move.id)])),
      moveTargets: this.edit.moveTargetsOf(element),
    };
  });

  /** The name as it is being typed, which goes back to the row's own name when another row is shown. */
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
    // A name left half typed when the sheet goes is still taken, as leaving the box would take it.
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.commitName());
    // A row deleted by someone else takes its editor with it.
    this.objectChange.objectDeleted$.subscribe((event) => {
      if (event.identifier === this.current().identifier) {
        this.isGone = true;
        this.sheet.close(null);
      }
    }, destroyRef);
  }

  private isGone = false;

  /** Follows the name box as it is typed in. */
  onNameInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  /** Writes the typed name to the row, unless it is blank or a sibling has it. */
  commitName(): void {
    if (this.isGone || this.nameError()) return;
    this.edit.rename(this.current(), this.nameDraft());
  }

  /** Changes what kind of field the row is. */
  setType(type: DataElementFieldTypeValue): void {
    this.edit.setFieldType(this.current(), type);
  }

  /** Moves the row a step among those beside it; the editor stays open for the next step. */
  move(move: SiblingMove): void {
    this.edit.move(this.current(), move);
  }

  /** Moves the row into another group, and goes back to the rest of the editor. */
  moveInto(target: MoveTarget): void {
    this.edit.moveInto(this.current(), target.element);
    this.view.set('main');
  }

  /** The names that lead to a group, as the list of places to move to shows them. */
  pathOf(target: MoveTarget): string {
    return target.path.join(' › ');
  }

  /** Shows the row in its piece's popup, or stops showing it there. */
  togglePopup(): void {
    this.edit.togglePopup(this.current());
  }

  /** Copies the row's path, as formulas write it, and says so. */
  copyReference(): void {
    const path = DataElement.formatReferencePath(this.current());
    this.edit.copyReference(this.current());
    if (path) this.snackbar.show(this.t('feature.dataElement.editor.referenceCopied', { path }));
  }

  /** Adds a row just below this one and goes on to edit it, its name ready to be typed over. */
  addBelow(): void {
    this.commitName();
    const added = this.edit.addFieldAfter(this.current());
    if (!added) return;
    this.current.set(added);
    afterNextRender(() => this.focusNameBox(), { injector: this.injector });
  }

  /** Copies the row just below itself and goes on to edit the copy. */
  duplicate(): void {
    this.commitName();
    const copy = this.edit.duplicate(this.current());
    if (!copy) return;
    this.current.set(copy);
    afterNextRender(() => this.focusNameBox(), { injector: this.injector });
  }

  /** Deletes the row, closing the editor; the notice it leaves can put the row back. */
  delete(): void {
    const element = this.current();
    this.commitName();
    this.isGone = true;
    this.sheet.close(null);
    this.edit.delete(element);
  }

  private focusNameBox(): void {
    const box = this.nameBox()?.nativeElement;
    if (!box) return;
    box.focus();
    box.select();
  }
}
