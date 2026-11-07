import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ImageDroppedEvent } from '@axe/core/event/domain-events';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { characterNameFromFileName } from '@axe/features/tabletop/image-drop/dropped-image-name';
import { clampToTable, isTabletopDropTarget } from '@axe/ui/tabletop/table-drop-target';

@Injectable({ providedIn: 'root' })
export class ImageDropEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly tablePick = inject(TablePickService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    this.objectChange.imageDropped$.subscribe((event) => this.createCharacter(event), this.destroyRef);
  }

  private createCharacter(event: ImageDroppedEvent): void {
    if (!this.rolePermission.canEditTabletop()) return;

    const dropTarget = document.elementFromPoint(event.dropPoint.x, event.dropPoint.y) as HTMLElement | null;
    if (!isTabletopDropTarget(dropTarget)) return;

    const position = clampToTable(
      this.tablePick.landingAt(event.dropPoint.x, event.dropPoint.y),
      this.tableSelecter.viewTable
    );
    const name = characterNameFromFileName(event.fileName, this.t('feature.tabletop.action.defaultCharacterName'));

    this.tabletopActionService.createGameCharacterWith(position, name, event.identifier);
    SoundEffect.play(PresetSound.piecePut);
  }
}
