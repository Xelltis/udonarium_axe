import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import type { GameCharacter } from '@axe/domain/character/game-character';
import { selectPieceGauges, shownGauge } from '@axe/domain/character/piece-gauge';
import { TranslocoModule } from '@jsverse/transloco';

/** A piece the list offers to aim at: its name as this seat is shown it, the first of its bars, and whether it is aimed at. */
export interface TargetRow {
  readonly piece: GameCharacter;
  readonly name: string;
  /** The first bar shown on the piece, as `HP 12/20`, or as its name alone where its numbers are kept from this seat; empty for none. */
  readonly gauge: string;
  readonly targeted: boolean;
  /** Whether the piece is taken off the field: listed only while aimed at, to be let go of. */
  readonly offField: boolean;
}

/** The pieces of one side of a fight the list offers, in the order they stand in the room. */
export interface TargetSection {
  readonly side: 'left' | 'right' | 'none';
  readonly rows: readonly TargetRow[];
}

/**
 * The pieces this seat may aim at, listed by the side of the fight each stands on, to be aimed at or
 * let go of by a press on its row: a way to aim that needs no press on the piece itself, where pieces
 * stand packed together, as in an engagement zone. Only the pieces this seat may aim at are listed,
 * as the table has them (see `PieceTargetService.aimable`), and the pieces aimed at that no longer
 * are, as one taken off the field, to be let go of, so the list holds every aim the band counts; each
 * by the name this seat is shown and under the side it is aimed at as standing on (see
 * `PieceTargetService.sideOf`).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'target-list-panel',
  templateUrl: './target-list-panel.component.html',
  host: { class: 'block h-full' },
  imports: [TranslocoModule],
})
export class TargetListPanelComponent {
  private readonly pieceTarget = inject(PieceTargetService);
  private readonly names = inject(PieceNameService);
  private readonly disclosure = inject(DisclosureService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignal = inject(UiSignalService);

  /** The sides of the fight, left, right and neither, each with the pieces on it, and none left empty. */
  readonly sections = computed<TargetSection[]>(() => {
    this.uiSignal.targetChange();
    this.objectChange.trackMyCursor();
    const rows: Record<TargetSection['side'], TargetRow[]> = { left: [], right: [], none: [] };
    const aimable = this.pieceTarget.aimable();
    const listed = new Set(aimable);
    const aimedOffField = this.pieceTarget.onTable().filter((piece) => !listed.has(piece));
    for (const piece of [...aimable, ...aimedOffField]) {
      rows[this.pieceTarget.sideOf(piece) ?? 'none'].push(this.rowOf(piece));
    }
    return (['left', 'right', 'none'] as const)
      .filter((side) => rows[side].length > 0)
      .map((side) => ({ side, rows: rows[side] }));
  });

  /** Aims at the piece of a row, or lets go of it where it is aimed at; a piece off the field is only let go of. */
  toggle(row: TargetRow): void {
    if (row.offField) this.pieceTarget.letGo(row.piece);
    else this.pieceTarget.toggle(row.piece);
  }

  private rowOf(piece: GameCharacter): TargetRow {
    const [first] = selectPieceGauges(piece.detailDataElement ?? null);
    const shown = first ? shownGauge(first, this.disclosure.canView(piece)) : null;
    return {
      piece,
      name: this.names.shown(piece),
      gauge: shown ? (shown.kept ? shown.gauge.name : `${shown.gauge.name} ${shown.numbers}`) : '',
      targeted: piece.targeted,
      offField: piece.offField === '1',
    };
  }
}
