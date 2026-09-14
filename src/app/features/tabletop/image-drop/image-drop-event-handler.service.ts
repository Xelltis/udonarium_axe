import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ImageDroppedEvent } from '@axe/core/event/domain-events';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { characterNameFromFileName } from '@axe/features/tabletop/image-drop/dropped-image-name';

const TABLE_LAYER_SELECTOR = '#app-table-layer';

/** Whether a drop landed on the table layer, the only place a dropped image becomes a character. */
export function isTabletopDropTarget(element: Element | null): boolean {
  return element?.closest(TABLE_LAYER_SELECTOR) != null;
}

@Injectable({ providedIn: 'root' })
export class ImageDropEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    this.objectChange.imageDropped$.subscribe((event) => this.createCharacter(event), this.destroyRef);
  }

  private createCharacter(event: ImageDroppedEvent): void {
    if (!this.rolePermission.canEditTabletop) return;

    const dropTarget = document.elementFromPoint(event.dropPoint.x, event.dropPoint.y) as HTMLElement | null;
    if (!isTabletopDropTarget(dropTarget)) return;

    const position = this.clampToTable(
      this.coordinateService.calcTabletopLocalCoordinate(
        { x: event.dropPoint.x, y: event.dropPoint.y, z: 0 },
        dropTarget!
      )
    );
    const name = characterNameFromFileName(event.fileName, this.t('feature.tabletop.action.defaultCharacterName'));

    this.tabletopActionService.createGameCharacterWith(position, name, event.identifier);
    SoundEffect.play(PresetSound.piecePut);
  }

  private clampToTable(position: PointerCoordinate): PointerCoordinate {
    const table = this.tableSelecter.viewTable;
    if (!table) return position;

    const halfGrid = table.gridSize / 2;
    return {
      x: clamp(position.x, halfGrid, table.width * table.gridSize - halfGrid),
      y: clamp(position.y, halfGrid, table.height * table.gridSize - halfGrid),
      z: Math.max(0, position.z ?? 0),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
