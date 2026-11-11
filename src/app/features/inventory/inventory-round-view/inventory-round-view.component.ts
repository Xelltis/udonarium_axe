import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** How many pieces a round may take before its faces are made smaller and laid two to a row. */
const ROOMY_PIECES = 6;
/** How many pieces a round may take before its faces are made smaller still and laid three to a row. */
const PAIRED_PIECES = 16;

/**
 * How closely the faces of a round's pieces are laid: one to a row at their full size for a few, and
 * smaller and two or three to a row for more, so a round of many pieces is not drawn down the screen.
 */
export type TurnPieceDensity = 'roomy' | 'pair' | 'trio';

export function turnPieceDensity(count: number): TurnPieceDensity {
  return count <= ROOMY_PIECES ? 'roomy' : count <= PAIRED_PIECES ? 'pair' : 'trio';
}

/**
 * The inventory shrunk to the turn order: the round's pieces, gathered under their sides when the
 * round is taken side by side, with the presses that move it on above them. A round of many pieces
 * lays them smaller and several to a row, stands no higher than the screen leaves room for, scrolling
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

  protected readonly density = computed(() => turnPieceDensity(this.turns.order().length));
  protected readonly piecesLayout = computed(() => PIECES_LAYOUT[this.density()]);
  protected readonly faceSize = computed(() => FACE_SIZE[this.density()]);

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
}

/** How the faces are laid at each density. */
const PIECES_LAYOUT: Readonly<Record<TurnPieceDensity, string>> = {
  roomy: 'flex flex-col items-center gap-2.5',
  pair: 'grid grid-cols-2 justify-items-center gap-x-1.5 gap-y-2',
  trio: 'grid grid-cols-3 justify-items-center gap-1',
};

/** How large a face is drawn at each density. */
const FACE_SIZE: Readonly<Record<TurnPieceDensity, string>> = {
  roomy: 'size-12',
  pair: 'size-10',
  trio: 'size-7.5',
};
