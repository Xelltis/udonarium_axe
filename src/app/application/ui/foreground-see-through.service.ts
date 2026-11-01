import { computed, inject, Injectable, signal } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** How much of the picture in front the game master sees while seeing through it. */
export const FOREGROUND_SEE_THROUGH_OPACITY = 0.25;

/**
 * Whether the game master sees through the picture a table lays in front of everything, on this
 * screen alone, to work on the board under it. Kept in this browser; a player always sees the
 * picture as the table lays it.
 */
@Injectable({ providedIn: 'root' })
export class ForegroundSeeThroughService {
  private readonly permission = inject(RolePermissionService);

  /** What this browser asked for, whoever is sitting at it. */
  readonly asked = signal(readLocal(STORAGE_KEYS.foregroundSeeThrough) === 'on');

  /** Whether the picture is seen through here: asked for, by the game master. */
  readonly active = computed(() => this.asked() && this.permission.canSeeHidden());

  set(seeThrough: boolean): void {
    this.asked.set(seeThrough);
    writeLocal(STORAGE_KEYS.foregroundSeeThrough, seeThrough ? 'on' : null);
  }
}
