import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { TargetArrowGeometry, targetArrowGeometry, TargetArrowPoint } from '@axe/domain/card/target-arrow';
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

  private readonly _pickingIdentifier = signal('');
  readonly pickingIdentifier = this._pickingIdentifier.asReadonly();
  readonly isPicking = computed(() => this._pickingIdentifier().length > 0);

  readonly arrows = computed<TargetArrow[]>(() => {
    this.objectChange.collectionOf('card')();
    const gridSize = this.tabletopService.gridSize();
    const arrows: TargetArrow[] = [];

    for (const card of this.tabletopService.cards) {
      this.objectChange.versionOf(card.identifier)();
      if (card.targetIdentifier.length < 1) continue;

      const target = this.objectStore.get<TabletopObject>(card.targetIdentifier);
      if (!(target instanceof TabletopObject) || !target.isVisibleOnTable) continue;
      this.objectChange.versionOf(target.identifier)();

      const geometry = targetArrowGeometry(this.centerOf(card, gridSize), this.centerOf(target, gridSize));
      if (geometry) arrows.push({ identifier: card.identifier, ...geometry });
    }
    return arrows;
  });

  constructor() {
    effect(() => {
      const selected = this.selectionSignalService.selectedObject();
      const source = untracked(this._pickingIdentifier);
      if (!selected || source.length < 1 || selected.identifier === source) return;

      this._pickingIdentifier.set('');
      const card = this.objectStore.get<Card>(source);
      if (card instanceof Card) card.targetIdentifier = selected.identifier;
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

  private centerOf(object: TabletopObject, gridSize: number): TargetArrowPoint {
    const size = (object as { size?: number }).size;
    const half = (gridSize * (typeof size === 'number' && size > 0 ? size : 1)) / 2;
    return { x: object.location.x + half, y: object.location.y + half, z: object.posZ };
  }
}
