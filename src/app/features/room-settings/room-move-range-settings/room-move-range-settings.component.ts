import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { DIAGONAL_MOVES } from '@axe/domain/tabletop/move/diagonal-move';
import { MOVE_UNITS } from '@axe/domain/tabletop/move/move-units';
import { PIECE_PASSAGE_MODES, PiecePassageMode } from '@axe/domain/tabletop/move/piece-passage';
import { isGroupAnswered, RoomRuleGroup } from '@axe/domain/tabletop/room-rules';
import { RoomSettingsAccessService, type SettingField } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/** One of the three sides a table answers for when a piece walks into another. */
type PiecePassageSide = 'samePartyPassage' | 'otherPartyPassage' | 'noPartyPassage';

/**
 * The move range's part of the room settings: whether pieces show how far they can move, what they
 * may walk through, how a move is measured, and the kinds of move there are.
 *
 * Each rule reads as the rules in force have it, and setting it hands it to the room; only a reader
 * who may edit the table can.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-move-range-settings',
  templateUrl: './room-move-range-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomMoveRangeSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);

  /** Whether the room has taken the group over from the table. */
  answersFor(group: RoomRuleGroup): boolean {
    return isGroupAnswered(this.access.config().roomRuleAnswers, group);
  }

  /** A hex board has no corners to cut, so the question is only put on squares. */
  get showsDiagonalOption(): boolean {
    return !isHexGrid(this.access.viewTable()?.gridType ?? 0);
  }

  /** Whether the cells a piece can walk to are shown while it is picked up. */
  readonly moveRangeEnabled = this.access.setting('moveRangeEnabled');

  /** Whether the reach of the picked piece stays shown. */
  readonly moveRangeAlways = this.access.setting('moveRangeAlways');

  readonly diagonalMoves = DIAGONAL_MOVES;

  /** How a step across a corner is counted; an unknown value falls back to the default. */
  readonly diagonalMove = this.access.setting('diagonalMove');

  /** Whether two pieces may stand on one cell; when off, an occupied cell is no place to stop. */
  readonly piecesShareCells = this.access.setting('piecesShareCells');

  /** The three sides a piece meets on the board, in the order the setting offers them. */
  readonly piecePassageSides = ['samePartyPassage', 'otherPartyPassage', 'noPartyPassage'] as const;
  readonly piecePassageModes = PIECE_PASSAGE_MODES;

  /** What the table does with the ground each of the three sides stands on. */
  private readonly piecePassages = {
    samePartyPassage: this.access.setting('samePartyPassage'),
    otherPartyPassage: this.access.setting('otherPartyPassage'),
    noPartyPassage: this.access.setting('noPartyPassage'),
  } satisfies Record<PiecePassageSide, SettingField<PiecePassageMode>>;

  /** What the table does with the ground one of the three sides stands on. */
  piecePassage(side: PiecePassageSide): PiecePassageMode {
    return this.piecePassages[side].value;
  }

  /** Says what the table does with the ground one of the three sides stands on. */
  setPiecePassage(side: PiecePassageSide, value: PiecePassageMode): void {
    this.piecePassages[side].value = value;
  }

  /** Whether any of the three sides is charged for, which is the only time the price is asked. */
  get showsPiecePassageCost(): boolean {
    const rules = this.access.rules();
    return this.piecePassageSides.some((side) => rules[side] === 'cost');
  }

  /** What crossing somebody costs, in cells; anything but a whole number above zero is stored as 0. */
  readonly piecePassageCost = this.access.setting('piecePassageCost');

  /** How far one leap carries, in cells. Nought carries as far as the move has left. */
  readonly jumpCells = this.access.setting('jumpCells');

  /** Whether a piece too big for a gap folds itself through it at a price. */
  readonly squeezes = this.access.setting('squeezes');

  /** Whether the ground between a piece's two ends goes off when a hand moves it. */
  readonly handTracesWay = this.access.setting('handTracesWay');

  /** Whether a piece squeezes past somebody far enough from it in size. */
  readonly sizeSlipsPast = this.access.setting('sizeSlipsPast');

  /**
   * Whether a piece walks the cheapest drawn way to where it is set down, stopping at walls and at
   * the end of its movement. No table answers it, so it is read as the room's config holds it.
   */
  readonly moveStrict = this.access.setting('moveStrict');

  /** Whether a move on a table with no grid is drawn as straight legs measured in metres. */
  readonly pathMove = this.access.setting('pathMove');

  /** The comma-separated sheet fields a piece's movement is read from, the first one the sheet has being used. */
  readonly moveRangeElementNames = this.access.setting('moveRangeElementNames');

  readonly moveUnits = MOVE_UNITS;

  /** What one cell stands for in the chosen unit; anything but a positive number is stored as 0. */
  readonly cellDistance = this.access.setting('cellDistance');

  /**
   * The unit a cell's distance is counted in. A table turned over to cells starts again at one cell a
   * cell: a distance written for metres or feet would otherwise go on dividing every sheet without
   * saying so.
   */
  readonly cellDistanceUnit = this.access.setting('cellDistanceUnit');

  /** The kinds of move the room plays, as it wrote them, empty where it plays the plain kind alone. */
  readonly moveKinds = this.access.setting('moveKinds');
}
