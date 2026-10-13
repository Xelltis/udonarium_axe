import { computed, inject, Injectable } from '@angular/core';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveKindBand, UnstoppableBand } from '@axe/application/tabletop/move-plan-common';
import { RideService } from '@axe/application/tabletop/ride.service';
import { GameCharacter } from '@axe/domain/character/game-character';

/**
 * The one door a move being worked out is opened and steered through, whichever way it is measured.
 *
 * A table with no grid whose room asks for it draws the way as straight legs in metres; every other
 * move is counted in cells. The hand, the band at the foot of the screen and the piece's own menu
 * talk to this, and it hands each word to whichever of the two moves is open.
 */
@Injectable({ providedIn: 'root' })
export class MovePlannerService {
  private readonly cells = inject(MovePlanService);
  private readonly free = inject(FreeMovePlanService);
  private readonly ride = inject(RideService);

  /** Whether a move is being worked out, of either kind. */
  readonly isPlanning = computed(() => this.cells.isPlanning() || this.free.isPlanning());
  /** Whether the move being worked out is drawn as straight legs, which has no jumping to offer. */
  readonly isFree = this.free.isPlanning;
  /** Whether the move being worked out is taken over what stands in the way. */
  readonly isJumping = computed(() => !this.free.isPlanning() && this.cells.isJumping());
  /** Counts the moves opened, so whatever listens for a press can tell one move from the next. */
  readonly openings = computed(() => this.cells.openings() + this.free.openings());
  /** The kinds of move offered while a move is worked out, and how far the chosen one has left. */
  readonly kindBand = computed<MoveKindBand | null>(() => this.free.kindBand() ?? this.cells.kindBand());
  /** Whether the move being worked out is one nobody may stop, and whether that may still be changed. */
  readonly unstoppableBand = computed<UnstoppableBand | null>(
    () => this.free.unstoppableBand() ?? this.cells.unstoppableBand()
  );
  /** The piece whose move is being worked out, or null. */
  readonly movingIdentifier = computed(
    () => this.free.plan()?.characterIdentifier ?? this.cells.plan()?.characterIdentifier ?? null
  );

  /** Whether the piece is being walked along the way just now. */
  get isWalking(): boolean {
    return this.cells.isWalking || this.free.isWalking;
  }

  /**
   * Opens a move for a piece, as straight legs where the table and the room ask for it and in cells
   * otherwise; false where the piece has no reach. A piece riding in front moves by its mount, so the
   * move opened is the mount's; one riding behind or carried, or a mount nobody rides, opens none.
   * Nor does a move the rules on riding stop while turns are taken.
   */
  begin(character: GameCharacter, kindName = ''): boolean {
    if (this.isWalking) return false;
    const mover = this.ride.moverFor(character);
    if (!mover || this.ride.moveRefusal(character) !== null) return false;
    return this.free.applies() ? this.free.begin(mover, kindName) : this.cells.begin(mover, kindName);
  }

  /** Draws the way ahead of the pointer, at a position on the table. */
  lookAt(x: number, y: number): void {
    if (this.free.isPlanning()) this.free.lookAt(x, y);
    else this.cells.lookAt(x, y);
  }

  /** Settles the way drawn so far, or takes the last corner back where nothing is drawn ahead. */
  settle(): void {
    if (this.free.isPlanning()) this.free.settle();
    else this.cells.settle();
  }

  /** Whether there is a way to walk at all, rather than only the spot the piece stands on. */
  hasWay(): boolean {
    return (this.free.isPlanning() ? this.free.wholeWay() : this.cells.wholeWay()).length > 1;
  }

  /** Walks the piece along the way and closes the move. */
  run(): Promise<boolean> {
    return this.free.isPlanning() ? this.free.run() : this.cells.run();
  }

  /** Puts the piece back where it began and closes the move. */
  cancel(): void {
    if (this.free.isPlanning()) this.free.cancel();
    else this.cells.cancel();
  }

  /** Turns the move over to jumping, or back, where it is counted in cells. */
  toggleJump(): void {
    if (!this.free.isPlanning()) this.cells.toggleJump();
  }

  /** Changes the kind of move being worked out, until the first corner is settled. */
  setKind(kindName: string): boolean {
    return this.free.isPlanning() ? this.free.setKind(kindName) : this.cells.setKind(kindName);
  }

  /** Makes the move being worked out one nobody may stop, or not, until the first corner is settled. */
  setUnstoppable(on: boolean): boolean {
    return this.free.isPlanning() ? this.free.setUnstoppable(on) : this.cells.setUnstoppable(on);
  }
}
