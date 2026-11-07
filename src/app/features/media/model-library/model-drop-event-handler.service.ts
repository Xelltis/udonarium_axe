import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { attachModel, MODEL_DRAG_TYPE, takesModel } from '@axe/features/media/model-library/attach-model';
import { isTabletopDropTarget } from '@axe/ui/tabletop/table-drop-target';

/**
 * Puts a model dragged from the list of models where it is let go of on the table: on the piece or
 * block it lands on, drawn as the model from then on, or, where it lands on neither, as a new piece
 * drawn as it. A seat that may not change the table puts it nowhere.
 */
@Injectable({ providedIn: 'root' })
export class ModelDropEventHandlerService {
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tablePick = inject(TablePickService);
  private readonly tabletopAction = inject(TabletopActionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly modelStorage = inject(ModelStorage);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes(MODEL_DRAG_TYPE)) event.preventDefault();
    };
    const drop = (event: DragEvent) => this.drop(event);
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    });
  }

  private drop(event: DragEvent): void {
    const identifier = event.dataTransfer?.getData(MODEL_DRAG_TYPE);
    if (!identifier || !this.rolePermission.canEditTabletop()) return;
    const model = this.modelStorage.get(identifier);
    if (!model?.isReady || !isTabletopDropTarget(document.elementFromPoint(event.clientX, event.clientY))) return;
    event.preventDefault();
    const name = model.name.replace(/\.glb$/i, '');
    const hit = this.tablePick.pressedAt(event.clientX, event.clientY);
    const target = hit ? this.objectStore.get(hit.target.id) : null;
    if (takesModel(target)) {
      attachModel(target, identifier);
      this.snackbar.show(this.t('feature.media.modelLibrary.attached', { count: 1, name }));
      return;
    }
    const piece = this.tabletopAction.createGameCharacterWith(
      this.tablePick.landingAt(event.clientX, event.clientY),
      name,
      ''
    );
    attachModel(piece, identifier);
    SoundEffect.play(PresetSound.piecePut);
    this.snackbar.show(this.t('feature.media.modelLibrary.made', { name }));
  }
}
