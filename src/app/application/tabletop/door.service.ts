import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Terrain } from '@axe/domain/tabletop/terrain';

/**
 * Opens and shuts the doors on the table, with the sound of it for the room, however this seat asks:
 * a click on the door, its menu, the key ahead of the eye, an AI.
 *
 * Every way goes through here, so none of them opens a door a seat may not: a guest none, and nobody a
 * door they are not shown, a pane of glass or one the fog lies over whole, whose sound would give it away.
 */
@Injectable({ providedIn: 'root' })
export class DoorService {
  private readonly permission = inject(RolePermissionService);
  private readonly pieces = inject(TablePiecesService);

  /**
   * Whether this seat may open and shut a block: a door, on a table this seat may change things on,
   * and shown to it (see `TablePiecesService.isBlockShown`).
   */
  mayWork(terrain: Terrain): boolean {
    return terrain.isDoor && this.permission.canEditTabletop() && this.pieces.isBlockShown(terrain);
  }

  /** Opens a door or shuts it, where this seat may, with the sound of it; answers whether it did. */
  setOpen(terrain: Terrain, open: boolean): boolean {
    if (!this.mayWork(terrain)) return false;
    terrain.isDoorOpen = open;
    SoundEffect.play(open ? PresetSound.unlock : PresetSound.lock);
    return true;
  }

  /** Opens a shut door and shuts an open one, where this seat may; answers whether it did. */
  toggle(terrain: Terrain): boolean {
    return this.setOpen(terrain, !terrain.isDoorOpen);
  }
}
