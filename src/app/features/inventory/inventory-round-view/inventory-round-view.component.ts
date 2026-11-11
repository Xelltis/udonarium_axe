import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { ROUND_SHOWN_WHOLE, roundRows, roundSideRows } from '@axe/features/inventory/inventory-round-view/round-rows';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The inventory shrunk to the turn order: the round's pieces, gathered under their sides when the
 * round is taken side by side, with the presses that move it on above them. A round of many pieces
 * gathers those done and those far off into a row each, and every side that is not up into one, so
 * the view stands no taller however many pieces there are; a gathered row is opened in place to
 * hand one of them the turn. Opened, it stands no higher than the screen leaves room for, scrolling
 * within, and brings the piece whose turn it is into view.
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

  /** Whether the round takes so many pieces that those done and those far off are gathered up. */
  protected readonly gathers = computed(() => this.turns.order().length > ROUND_SHOWN_WHOLE);
  /** The gathered rows this reader has opened, by their keys. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  protected readonly rows = computed(() =>
    roundRows(this.turns.order(), this.turns.progress(), this.opened(), this.gathers())
  );
  protected readonly sideRows = computed(() => {
    const sides = this.turns.sides();
    const laid = roundSideRows(sides, this.turns.currentSide(), this.turns.progress(), this.opened(), this.gathers());
    return sides.map((group, index) => ({ ...group, current: laid[index].current, rows: laid[index].rows }));
  });

  private readonly pieces = viewChild<ElementRef<HTMLElement>>('pieces');

  constructor() {
    afterRenderEffect(() => {
      const current = this.turns.progress().currentIdentifier;
      const list = this.pieces()?.nativeElement;
      if (!current || !list) return;
      const piece = list.querySelector<HTMLElement>(`[data-turn-piece="${CSS.escape(current)}"]`);
      piece?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  /** Lays a gathered row out in full, or gathers it up again. */
  protected toggle(key: string): void {
    this.opened.update((opened) => {
      const next = new Set(opened);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
}
