import { effect, inject, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';

/**
 * Closes the panel it is called in once this seat may no longer change the table, as when the game
 * master makes it a guest: a panel that writes to the table would otherwise go on writing what the
 * room no longer takes from it. Called from the panel's constructor.
 */
export function closeWhenOffTheTable(): void {
  const rolePermission = inject(RolePermissionService);
  const panelService = inject(PanelService);
  effect(() => {
    if (!rolePermission.canEditTabletop()) untracked(() => panelService.close());
  });
}
