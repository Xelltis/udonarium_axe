import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { captureElementRestorePoint, restoreElementFromPoint } from '@axe/domain/data/data-element-restore';

/**
 * Deletes a row, a group or a section of a sheet at once, and offers for a few seconds to put it
 * back.
 *
 * Nothing is asked first: a delete pressed by mistake is put right from the notice it leaves. What
 * comes back is a copy in the same place, holding the same names and values.
 */
@Injectable({ providedIn: 'root' })
export class DataElementDeletionService {
  private readonly snackbar = inject(SnackbarService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Destroys the element and everything under it, and leaves a notice offering to undo it.
   *
   * `onRestored` hears of the copy put back, for a caller that keeps something about the element,
   * such as which section was open for editing.
   */
  delete(element: DataElement, onRestored?: (restored: DataElement) => void): void {
    const point = captureElementRestorePoint(element);
    const parent = element.parent instanceof DataElement ? element.parent : null;
    element.destroy();
    if (parent) this.notify(parent);
    if (!point) return;

    const name = point.name.trim();
    this.snackbar.show(
      name
        ? this.t('feature.dataElement.deletion.deleted', { name })
        : this.t('feature.dataElement.deletion.deletedUnnamed'),
      {
        action: {
          label: this.t('feature.dataElement.deletion.undo'),
          run: () => {
            const restored = restoreElementFromPoint(point, (identifier) =>
              this.objectStore.get<DataElement>(identifier)
            );
            if (!restored) return;
            const restoredParent = restored.parent;
            if (restoredParent instanceof DataElement) this.notify(restoredParent);
            this.notify(restored);
            onRestored?.(restored);
          },
        },
      }
    );
  }

  private notify(element: DataElement): void {
    element.update();
    this.objectChange.notifyChanged(element.identifier);
  }
}
