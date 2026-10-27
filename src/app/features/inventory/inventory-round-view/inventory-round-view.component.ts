import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The inventory shrunk to the turn order: a column of the round's pieces, gathered under their
 * sides when the round is taken side by side, with the presses that move it on above them.
 */
@Component({
  selector: 'inventory-round-view',
  templateUrl: './inventory-round-view.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SafePipe, TranslocoModule],
})
export class InventoryRoundViewComponent {
  protected readonly turns = inject(InventoryRoundService);
  private readonly rolePermission = inject(RolePermissionService);

  /** Whether this reader may press the round on, which a seat that is only watching may not. */
  protected readonly canEdit = computed<boolean>(() => this.rolePermission.canEditTabletop());
}
