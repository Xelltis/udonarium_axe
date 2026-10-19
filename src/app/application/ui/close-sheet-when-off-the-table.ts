import { effect, inject, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BottomSheetRef } from '@axe/application/ui/bottom-sheet.service';

/**
 * Closes the sheet from the bottom it is called in once this seat may no longer change the table,
 * as a panel that writes to the table closes; shown anywhere else, it does nothing. Called from the
 * content's constructor.
 */
export function closeSheetWhenOffTheTable(): void {
  const ref = inject(BottomSheetRef, { optional: true });
  if (!ref) return;
  const objectChange = inject(ObjectChangeService);
  const rolePermission = inject(RolePermissionService);
  effect(() => {
    objectChange.trackMyCursor();
    if (!rolePermission.canEditTabletop) untracked(() => ref.close());
  });
}
