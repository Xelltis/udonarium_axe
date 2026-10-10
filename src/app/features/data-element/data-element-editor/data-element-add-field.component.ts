import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { BottomSheetRef, BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { DataElement, type DataElementFieldTypeValue } from '@axe/domain/data/data-element';
import { DataElementFieldEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-field-editor.component';
import { DataElementTypeGridComponent } from '@axe/features/data-element/data-element-editor/data-element-type-grid.component';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import { TranslocoModule } from '@jsverse/transloco';

let nextPickerId = 0;

/**
 * Choosing the kind of a field about to be added at the end of a group, from the "+" a narrow sheet
 * puts there. The field is made the moment a kind is picked, and its editor takes over with the
 * name ready to be typed over.
 */
@Component({
  selector: 'data-element-add-field',
  templateUrl: './data-element-add-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataElementTypeGridComponent, TranslocoModule],
  host: { class: 'block' },
})
export class DataElementAddFieldComponent {
  private readonly edit = inject(DataElementEditService);
  private readonly sheet = inject(BottomSheetRef);
  private readonly bottomSheet = inject(BottomSheetService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The group the field goes at the end of. */
  readonly container = input.required<DataElement>();
  protected readonly headingId = `add-field-${nextPickerId++}`;

  /** Makes a field of the picked kind and hands over to its editor. */
  add(type: DataElementFieldTypeValue): void {
    const field = this.edit.addFieldInside(this.container(), type);
    if (!field) {
      this.sheet.close(null);
      return;
    }
    this.bottomSheet.open(DataElementFieldEditorComponent, {
      title: this.t('feature.dataElement.editor.fieldTitle'),
      inputs: { element: field, focusName: true },
      host: this.host.nativeElement,
    });
    this.sheet.close(field);
  }
}
