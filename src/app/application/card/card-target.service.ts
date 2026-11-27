import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePlaceService } from '@axe/application/tabletop/piece-place.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { TargetArrowGeometry, targetArrowGeometry } from '@axe/domain/card/target-arrow';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface TargetArrow extends TargetArrowGeometry {
  identifier: string;
}

@Injectable({ providedIn: 'root' })
export class CardTargetService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly piecePlace = inject(PiecePlaceService);
  private readonly transient = inject(TransientPlacementService);

  private readonly _pickingIdentifier = signal('');
  readonly pickingIdentifier = this._pickingIdentifier.asReadonly();
  readonly isPicking = computed(() => this._pickingIdentifier().length > 0);

  /**
   * The arrows of the cards pointing at something, from where each card is drawn to where what it
   * points at stands (see `PiecePlaceService.standingCentreOf`), following either end at each step
   * this seat drags it; an arrow whose ends stay where they are is not drawn again.
   */
  readonly arrows = computed<TargetArrow[]>(
    () => {
      this.objectChange.collectionOf('card')();
      this.transient.version();
      const arrows: TargetArrow[] = [];

      for (const card of this.tabletopService.cards) {
        this.objectChange.versionOf(card.identifier)();
        if (card.targetIdentifier.length < 1) continue;

        const target = this.objectStore.get<TabletopObject>(card.targetIdentifier);
        if (!(target instanceof TabletopObject) || !target.isVisibleOnTable) continue;
        this.objectChange.versionOf(target.identifier)();

        const geometry = targetArrowGeometry(
          this.piecePlace.standingCentreOf(card),
          this.piecePlace.standingCentreOf(target)
        );
        if (geometry) arrows.push({ identifier: card.identifier, ...geometry });
      }
      return arrows;
    },
    { equal: sameArrows }
  );

  /**
   * Points the card being chosen for at the next other piece selected. A seat made a guest while it
   * chose stops choosing, and points nothing.
   */
  constructor() {
    effect(() => {
      const selected = this.selectionSignalService.selectedObject();
      const source = untracked(this._pickingIdentifier);
      if (!selected || source.length < 1 || selected.identifier === source) return;

      this._pickingIdentifier.set('');
      if (!untracked(() => this.rolePermission.canEditTabletop())) return;
      const card = this.objectStore.get<Card>(source);
      if (card instanceof Card) card.targetIdentifier = selected.identifier;
    });
    effect(() => {
      this.objectChange.trackMyCursor();
      if (!this.rolePermission.canEditTabletop()) untracked(() => this.cancelPicking());
    });
  }

  /** Starts choosing a target for a card: the next other piece selected becomes the one its arrow points at. */
  beginPicking(card: Card): void {
    this._pickingIdentifier.set(card.identifier);
  }

  /** Stops choosing a target, and says whether one was being chosen. */
  cancelPicking(): boolean {
    if (this._pickingIdentifier().length < 1) return false;
    this._pickingIdentifier.set('');
    return true;
  }

  /** Takes the target arrow off a card, for every peer. */
  clearTarget(card: Card): void {
    card.targetIdentifier = '';
  }
}

/** Whether two sets of arrows are drawn alike, so that what moves elsewhere on the table draws none again. */
function sameArrows(a: readonly TargetArrow[], b: readonly TargetArrow[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (arrow, i) =>
        arrow.identifier === b[i].identifier &&
        arrow.x === b[i].x &&
        arrow.y === b[i].y &&
        arrow.z === b[i].z &&
        arrow.length === b[i].length &&
        arrow.angle === b[i].angle
    )
  );
}
