import { Injector } from '@angular/core';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { DataElement, DataElementRole } from '@axe/domain/data/data-element';

/**
 * Opens the editor of a row, a group or a section in a sheet from the bottom.
 *
 * The editors are fetched the first time one is asked for, since a wide sheet never needs them.
 * A field gets the field editor; a group or a section gets the group editor.
 */
export function openDataElementEditor(
  bottomSheet: BottomSheetService,
  t: TranslateFn,
  element: DataElement,
  options: { host?: Element | null; injector?: Injector; focusName?: boolean } = {}
): void {
  const inputs = { element, focusName: options.focusName ?? false };
  if (element.fieldRole === DataElementRole.FIELD) {
    void import('@axe/features/data-element/data-element-editor/data-element-field-editor.component').then((m) =>
      bottomSheet.open(m.DataElementFieldEditorComponent, {
        title: t('feature.dataElement.editor.fieldTitle'),
        inputs,
        host: options.host,
        injector: options.injector,
      })
    );
    return;
  }
  void import('@axe/features/data-element/data-element-editor/data-element-group-editor.component').then((m) =>
    bottomSheet.open(m.DataElementGroupEditorComponent, {
      title: t(
        element.fieldRole === DataElementRole.SECTION
          ? 'feature.dataElement.editor.sectionTitle'
          : 'feature.dataElement.editor.groupTitle'
      ),
      inputs,
      host: options.host,
      injector: options.injector,
    })
  );
}

/**
 * Opens the choice of kind for a field about to be added at the end of a group, from the "+" a
 * narrow sheet puts there.
 */
export function openAddFieldPicker(
  bottomSheet: BottomSheetService,
  t: TranslateFn,
  container: DataElement,
  options: { host?: Element | null; injector?: Injector } = {}
): void {
  void import('@axe/features/data-element/data-element-editor/data-element-add-field.component').then((m) =>
    bottomSheet.open(m.DataElementAddFieldComponent, {
      title: t('feature.dataElement.editor.addField'),
      inputs: { container },
      host: options.host,
      injector: options.injector,
    })
  );
}
