import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { TranslocoModule } from '@jsverse/transloco';

/** The strip above the inventory's list that says which round it is and moves the round on. */
@Component({
  selector: 'inventory-round-strip',
  templateUrl: './inventory-round-strip.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class InventoryRoundStripComponent {
  /** Whether the panel stands with its box off, which takes the strip's ground away with it. */
  readonly ghost = input(false);

  protected readonly turns = inject(InventoryRoundService);
  private readonly rolePermission = inject(RolePermissionService);

  /** Whether this reader may press the round on, which a seat that is only watching may not. */
  protected readonly canEdit = computed<boolean>(() => this.rolePermission.canEditTabletop());
}
