import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { MoveRangeService, ReachTerms } from '@axe/application/tabletop/move-range.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { hopHeightAt, hopLiftFor, landingHeightAt } from '@axe/domain/tabletop/move/landing-height';
import { cornerShiftOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { reachableCells } from '@axe/domain/tabletop/move/reachable-cells';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/** How long the piece rests on each cell of the way it walks, once the way is settled. */
export const MOVE_STEP_MS = 90;

/** How a hop onto or off a ledge is drawn: how many times it is redrawn, and how long each lasts. */
export const HOP_FRAMES = 7;
export const HOP_FRAME_MS = 24;

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
  /** How many corners the settled way has cut, which a table counting them by turns goes on from. */
  cornersCut: number;
  /** Where the piece may still get to, from the last settled cell. */
  reach: CellBits;
  /** Whether the piece is being taken over what it stands on rather than around it. */
  jumping: boolean;
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
  private readonly triggerFire = inject(TriggerFireService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);

  private readonly held = signal<MovePlan | null>(null);
  private terms: ReachTerms | null = null;
  private walking = false;
  /** How the move stood before each corner was set, so the last one can be taken back up. */
  private legs: MovePlan[] = [];

  /** Which move this is, counted up as each one opens. */
  private readonly opened = signal(0);

  readonly plan = this.held.asReadonly();
  readonly isPlanning = computed(() => this.held() !== null);
  /** Whether the move being worked out goes over what stands in the way rather than around it. */
  readonly isJumping = computed(() => this.held()?.jumping === true);
  /**
   * How many moves have been opened.
   *
   * A move opened while another is already open is still a move of its own, and the press
   * that opened it has yet to finish. Nothing else says as much: the plan is a new object on
   * every step of the pointer, and a second move of the same piece reads the same as the first.
   */
  readonly openings = this.opened.asReadonly();

  constructor() {
    // A move being worked out is one the whole table waits on, so it is drawn on every screen
    // rather than only the mover's. It leaves the room's sight the moment the move is over.
    effect(() => this.tellTheRoom(this.held()));
  }

  /**
   * Puts the move being worked out where the rest of the room can see it.
   *
   * What is sent is the piece, the table it stands on, and the way drawn so far. The reach is
   * not: it is shaped by what its owner can see, and the dents an unseen enemy leaves in one
   * would say where it stands, so each screen works the reach out from what it may know.
   */
  private tellTheRoom(plan: MovePlan | null): void {
    const cursor = PeerCursor.myCursor;
    if (!cursor) return;
    const table = this.tableSelecter.viewTable;
    const piece = plan && table ? plan.characterIdentifier : '';
    const on = piece ? table!.identifier : '';
    const way = piece && plan ? this.wholeWay().join(',') : '';
    const jumping = piece && plan?.jumping ? 'true' : '';
    if (
      cursor.movingCharacterIdentifier === piece &&
      cursor.movingTableIdentifier === on &&
      cursor.movingWay === way &&
      cursor.movingJumping === jumping
    ) {
      return;
    }
    cursor.movingCharacterIdentifier = piece;
    cursor.movingTableIdentifier = on;
    cursor.movingWay = way;
    cursor.movingJumping = jumping;
    cursor.update();
  }

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
    this.legs = [];
    character.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
    this.opened.update((count) => count + 1);
    this.held.set({
      characterIdentifier: character.identifier,
      grid: terms.grid,
      origin: { x: character.location.x, y: character.location.y, z: character.posZ },
      from: terms.start,
      settled: [terms.start],
      ahead: [],
      spent: 0,
      budget: terms.walk,
      cornersCut: 0,
      reach: terms.cells,
      waypoints: [],
      jumping: false,
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
    const stops = this.stopsFor(plan);
    const ahead = cheapestPath(plan.grid, plan.from, cell, plan.budget - plan.spent, stops, {
      ...terms.options,
      cornersCut: plan.cornersCut,
    });
    this.held.set({ ...plan, ahead: ahead ?? [] });
  }

  /** What stands in the way of the move as it is being worked out now. */
  private stopsFor(plan: MovePlan): (index: number) => boolean {
    const terms = this.terms;
    const bits = plan.jumping ? terms?.leapt : terms?.blocked;
    return (index) => bits?.get(index) === true;
  }

  /**
   * Turns the move over to jumping, or back again.
   *
   * A piece that means to jump is stopped by a face it cannot climb and by nothing else it
   * could get on top of, so the reach is worked out afresh from where the piece stands now.
   * The leg drawn ahead goes with it: it was drawn under the other rule.
   */
  toggleJump(): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    const jumping = !plan.jumping;
    const bits = jumping ? terms.leapt : terms.blocked;
    const left = plan.budget - plan.spent;
    const reach =
      left > 0 && !terms.options.stopsAt?.(plan.from)
        ? reachableCells(plan.grid, plan.from, left, (index) => bits.get(index), {
            ...terms.options,
            cornersCut: plan.cornersCut,
          })
        : new CellBits(plan.reach.count);
    SoundEffect.play(PresetSound.piecePick);
    this.held.set({ ...plan, jumping, reach, ahead: [] });
  }

  /**
   * Settles the way drawn so far, so the next leg is worked out from where it ends.
   *
   * Pressing again on the corner just set takes it back up instead. Nothing is drawn ahead
   * while the pointer rests on the corner it is standing on, which is what says the reader
   * means that one rather than a new one somewhere else.
   */
  settle(): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    if (plan.ahead.length < 2) {
      this.unsettle();
      return;
    }
    this.legs.push(plan);
    const options = { ...terms.options, cornersCut: plan.cornersCut };
    const stops = this.stopsFor(plan);
    const walked = walkedPath(plan.grid, plan.ahead, stops, options);
    const spent = plan.spent + walked.cost;
    const left = plan.budget - spent;
    const from = plan.ahead[plan.ahead.length - 1];
    this.held.set({
      ...plan,
      from,
      settled: [...plan.settled, ...plan.ahead.slice(1)],
      waypoints: [...plan.waypoints, from],
      ahead: [],
      spent,
      cornersCut: walked.corners,
      // A leg that ended on ground an enemy holds ends the move. A reach worked out afresh from
      // that cell would forget it, since a reach only asks what stops it of the cells it steps
      // on to, never of the one it sets out from.
      reach:
        left > 0 && !terms.options.stopsAt?.(from)
          ? reachableCells(plan.grid, from, left, stops, {
              ...options,
              cornersCut: walked.corners,
            })
          : new CellBits(plan.reach.count),
    });
  }

  /** Takes back the corner set last, and only that one. */
  unsettle(): void {
    if (this.walking) return;
    const previous = this.legs.pop();
    if (!previous) return;
    this.held.set({ ...previous, ahead: [] });
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
    const table = this.tableSelecter.viewTable;
    // A piece that is no longer on the table cannot walk anywhere, and neither can the move be
    // left standing: while one is open the table's clicks are all taken by it, so a move whose
    // piece has been deleted out from under it would leave nothing on the board answering.
    if (!(character instanceof GameCharacter) || !table) {
      this.close();
      return false;
    }

    this.walking = true;
    try {
      const corner = cornerShiftOf(character, table.gridSize);
      const steps = way.slice(1);
      let standingZ = character.posZ;
      for (const [index, cell] of steps.entries()) {
        const centre = cellCenterOf(plan.grid, cell);
        const landing = landingHeightAt(table.terrains, table.gridSize, centre.x, centre.y);
        const from = { x: character.location.x, y: character.location.y, z: standingZ };
        const to = { x: centre.x - corner, y: centre.y - corner, z: landing };
        // Where the piece is going is written once, at the end of the step. Written before
        // the hop as well, every screen but this one saw the piece arrive, go back and cross
        // again, since the hop begins by winding it back to where it set out from.
        if (landing === standingZ) {
          character.location.x = to.x;
          character.location.y = to.y;
          character.posZ = to.z;
          character.update();
          await new Promise((rest) => setTimeout(rest, MOVE_STEP_MS));
        } else {
          await this.hop(character, from, to, table.gridSize);
        }
        // Sprung on arrival rather than once the walking is over, so what the ground does
        // happens where the piece is standing when it does it.
        this.triggerFire.stepped(character, plan.grid, cell, index === steps.length - 1);
        standingZ = landing;
      }
    } finally {
      this.walking = false;
    }
    SoundEffect.play(PresetSound.piecePut);
    this.close();
    return true;
  }

  /**
   * Draws a piece leaving the ground and coming down again on the next cell.
   *
   * The way across is walked evenly and the height is arched over it, so a piece is over the
   * ledge before it is above it rather than climbing the face on the way past.
   */
  private async hop(
    character: GameCharacter,
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    gridSize: number
  ): Promise<void> {
    const lift = hopLiftFor(from.z, to.z, gridSize);
    for (let frame = 1; frame <= HOP_FRAMES; frame++) {
      const along = frame / HOP_FRAMES;
      character.location.x = from.x + (to.x - from.x) * along;
      character.location.y = from.y + (to.y - from.y) * along;
      character.posZ = hopHeightAt(along, from.z, to.z, lift);
      character.update();
      await new Promise((rest) => setTimeout(rest, HOP_FRAME_MS));
    }
    character.location.x = to.x;
    character.location.y = to.y;
    character.posZ = to.z;
    character.update();
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
    this.legs = [];
  }
}
