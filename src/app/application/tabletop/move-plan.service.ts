import { computed, inject, Injectable, signal } from '@angular/core';
import { MoveRangeService, ReachTerms } from '@axe/application/tabletop/move-range.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { reachableCells } from '@axe/domain/tabletop/move/reachable-cells';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/** How long the piece rests on each cell of the way it walks, once the way is settled. */
export const MOVE_STEP_MS = 90;

export interface MovePlan {
  characterIdentifier: string;
  grid: CellGrid;
  /** Where the piece began, and where cancelling puts it back. */
  origin: { x: number; y: number; z: number };
  /** The cell the next leg starts from: the last one settled, or where the piece began. */
  from: number;
  /** The whole way settled so far, cell by cell, beginning where the piece began. */
  settled: number[];
  /** The way from the last settled cell to wherever the pointer is, if it can be walked. */
  ahead: number[];
  /** What the settled way has cost, and what the piece had to spend altogether. */
  spent: number;
  budget: number;
  /** Where the piece may still get to, from the last settled cell. */
  reach: CellBits;
  /** The cells the way is settled on, for showing where it has been. */
  waypoints: number[];
}

/**
 * A move being worked out before it is made.
 *
 * A reach on its own says where a piece may end up, and a piece dragged there takes whatever
 * way the hand went. Where the room counts the way as well as the end, the way has to be
 * something a player can see and choose rather than something they discover by being sent
 * back, so it is drawn ahead of the pointer and settled a leg at a time.
 */
@Injectable({ providedIn: 'root' })
export class MovePlanService {
  private readonly moveRange = inject(MoveRangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);

  private readonly held = signal<MovePlan | null>(null);
  private terms: ReachTerms | null = null;
  private walking = false;

  readonly plan = this.held.asReadonly();
  readonly isPlanning = computed(() => this.held() !== null);

  /** Whether the piece is walking a settled way, during which nothing else may be asked of it. */
  get isWalking(): boolean {
    return this.walking;
  }

  /** Opens a move for a piece standing where it began, or answers false where it has no reach. */
  begin(character: GameCharacter): boolean {
    if (this.walking) return false;
    const terms = this.moveRange.termsOf(character);
    if (!terms) return false;
    this.terms = terms;
    character.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
    this.held.set({
      characterIdentifier: character.identifier,
      grid: terms.grid,
      origin: { x: character.location.x, y: character.location.y, z: character.posZ },
      from: terms.start,
      settled: [terms.start],
      ahead: [],
      spent: 0,
      budget: terms.walk,
      reach: terms.cells,
      waypoints: [],
    });
    return true;
  }

  /** Draws the way from the last settled cell to the table position the pointer is over. */
  lookAt(x: number, y: number): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    const cell = cellIndexAt(plan.grid, x, y);
    if (cell < 0 || cell === plan.from) {
      if (plan.ahead.length > 0) this.held.set({ ...plan, ahead: [] });
      return;
    }
    if (!plan.reach.get(cell)) {
      if (plan.ahead.length > 0) this.held.set({ ...plan, ahead: [] });
      return;
    }
    if (plan.ahead[plan.ahead.length - 1] === cell) return;
    const ahead = cheapestPath(
      plan.grid,
      plan.from,
      cell,
      plan.budget - plan.spent,
      (index) => terms.blocked.get(index),
      terms.options
    );
    this.held.set({ ...plan, ahead: ahead ?? [] });
  }

  /** Settles the way drawn so far, so the next leg is worked out from where it ends. */
  settle(): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking || plan.ahead.length < 2) return;
    const cost = walkedPath(plan.grid, plan.ahead, (index) => terms.blocked.get(index), terms.options).cost;
    const spent = plan.spent + cost;
    const left = plan.budget - spent;
    const from = plan.ahead[plan.ahead.length - 1];
    this.held.set({
      ...plan,
      from,
      settled: [...plan.settled, ...plan.ahead.slice(1)],
      waypoints: [...plan.waypoints, from],
      ahead: [],
      spent,
      reach:
        left > 0
          ? reachableCells(plan.grid, from, left, (index) => terms.blocked.get(index), terms.options)
          : new CellBits(plan.reach.count),
    });
  }

  /** The whole way the piece would walk if the move were made now. */
  wholeWay(): number[] {
    const plan = this.held();
    if (!plan) return [];
    return plan.ahead.length > 1 ? [...plan.settled, ...plan.ahead.slice(1)] : plan.settled;
  }

  /**
   * Walks the piece along the way that has been settled, a cell at a time.
   *
   * Nothing else may be asked of the plan while it walks: the piece is between cells, and a
   * second move begun over the top of this one would leave it there.
   */
  async run(): Promise<boolean> {
    const plan = this.held();
    if (!plan || this.walking) return false;
    const way = this.wholeWay();
    if (way.length < 2) return false;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    if (!(character instanceof GameCharacter)) return false;
    const table = this.tableSelecter.viewTable;
    if (!table) return false;

    this.walking = true;
    const corner = cornerShiftOf(character, table.gridSize);
    for (const cell of way.slice(1)) {
      const centre = cellCenterOf(plan.grid, cell);
      character.location.x = centre.x - corner;
      character.location.y = centre.y - corner;
      character.update();
      await new Promise((rest) => setTimeout(rest, MOVE_STEP_MS));
    }
    this.walking = false;
    SoundEffect.play(PresetSound.piecePut);
    this.close();
    return true;
  }

  /** Puts the piece back where it began and closes the move. */
  cancel(): void {
    const plan = this.held();
    if (!plan || this.walking) return;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    if (character instanceof GameCharacter) {
      character.location.x = plan.origin.x;
      character.location.y = plan.origin.y;
      character.posZ = plan.origin.z;
      character.update();
    }
    this.close();
  }

  private close(): void {
    this.held.set(null);
    this.terms = null;
  }
}

/**
 * How far a piece's corner sits from the middle of the cell it stands on.
 *
 * A piece is placed by its corner while a cell is found by its middle, and a piece of an even
 * number of cells straddles a grid line rather than sitting on one.
 */
function cornerShiftOf(character: GameCharacter, gridSize: number): number {
  const size = Math.max(1, character.size);
  const middle = (gridSize * size) / 2;
  const onACorner = size % 2 === 0 ? gridSize / 2 : 0;
  return middle - onACorner;
}
