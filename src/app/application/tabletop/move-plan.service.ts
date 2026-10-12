import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { EngagementZoneService, metresPerCell, ZoneMoveStart } from '@axe/application/tabletop/engagement-zone.service';
import { InterruptOutcome, MoveInterruptService } from '@axe/application/tabletop/move-interrupt.service';
import { MoveRangeService, ReachTerms } from '@axe/application/tabletop/move-range.service';
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { MoveKind, moveKindNamed } from '@axe/domain/tabletop/move/move-kind';
import { cellsFrom, stepsFor } from '@axe/domain/tabletop/move/move-steps';
import { reachableCells } from '@axe/domain/tabletop/move/reachable-cells';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { indexAtLength } from '@axe/domain/tabletop/zone/interrupt';

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
  /**
   * What the settled way has cost, and what the piece had to spend altogether.
   *
   * Counted in steps rather than in cells, since a road is crossed in half a cell. What the
   * sheet said is two of these per cell; nothing shown to a reader is in these units.
   */
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
  /** The name of the kind of move being made, empty for the room's first or plain kind. */
  kind: string;
}

/** The kinds of move offered while a move is worked out, and how far the chosen one has left. */
export interface MoveKindBand {
  /**
   * The room's kinds, each with whether it may be chosen now: until the first leg is settled, and
   * where zones let the piece go by it.
   */
  readonly kinds: readonly { readonly name: string; readonly mayChoose: boolean }[];
  readonly chosen: string;
  readonly metresLeft: number;
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
  private readonly pieceStep = inject(PieceStepService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly zones = inject(EngagementZoneService);
  private readonly interrupts = inject(MoveInterruptService);

  private readonly held = signal<MovePlan | null>(null);
  /** Where the piece stood among the engagement zones as the move began. */
  private zoneStart: ZoneMoveStart | null = null;
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

  /**
   * The kinds of move a room plays, offered while a move is worked out, with how far the one chosen
   * has left in metres; null where the room has written no kinds of its own. The kind is chosen
   * before the first leg is settled, and kept from then on.
   */
  readonly kindBand = computed<MoveKindBand | null>(() => {
    const plan = this.held();
    if (!plan) return null;
    const kinds = this.zones.moveKinds();
    if (kinds.length < 2 && kinds[0].name === '') return null;
    const rules = resolveRoomRules(
      this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null,
      this.tableSelecter.viewTable
    );
    const metres = cellsFrom(Math.max(0, plan.budget - plan.spent)) * metresPerCell(rules);
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    const changeable = plan.settled.length < 2;
    return {
      kinds: kinds.map((kind) => ({
        name: kind.name,
        mayChoose:
          kind.name === plan.kind ||
          (changeable && character instanceof GameCharacter && this.zones.mayMove(character, kind.name)),
      })),
      chosen: plan.kind,
      metresLeft: Math.round(metres * 10) / 10,
    };
  });

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
    const kind = piece && plan ? plan.kind : '';
    if (
      cursor.movingCharacterIdentifier === piece &&
      cursor.movingTableIdentifier === on &&
      cursor.movingWay === way &&
      cursor.movingJumping === jumping &&
      cursor.movingKind === kind
    ) {
      return;
    }
    cursor.movingCharacterIdentifier = piece;
    cursor.movingTableIdentifier = on;
    cursor.movingWay = way;
    cursor.movingJumping = jumping;
    cursor.movingKind = kind;
    cursor.update();
  }

  /** Whether the piece is walking a settled way, during which nothing else may be asked of it. */
  get isWalking(): boolean {
    return this.walking;
  }

  /**
   * Opens a move for a piece standing where it began, by a kind of move the room plays, or answers
   * false where it has no reach. An empty kind is the room's first.
   */
  begin(character: GameCharacter, kindName = ''): boolean {
    if (this.walking) return false;
    const kind = this.zones.kindFor(character, kindName);
    if (kind === null) return false;
    const terms = this.moveRange.termsOf(character, kind);
    if (!terms) return false;
    this.terms = terms;
    this.legs = [];
    this.zoneStart = this.zones.startOfMove(character, kind);
    character.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
    this.opened.update((count) => count + 1);
    this.held.set({
      kind,
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

  /**
   * Changes the kind of move being worked out, while no leg of it has been settled yet; answers
   * whether it changed. The reach is worked out afresh for the new kind.
   */
  setKind(kindName: string): boolean {
    const plan = this.held();
    if (!plan || this.walking || plan.settled.length > 1) return false;
    const kind = moveKindNamed(this.zones.moveKinds(), kindName).name;
    if (kind === plan.kind) return false;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    if (!(character instanceof GameCharacter) || !this.zones.mayMove(character, kind)) return false;
    const terms = this.moveRange.termsOf(character, kind);
    if (!terms) return false;
    if (this.zoneStart) this.zoneStart = { ...this.zoneStart, kind };
    this.terms = terms;
    this.held.set({
      ...plan,
      kind,
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

  /** The kinds of move the room plays, for choosing between them while a move is worked out. */
  kinds(): MoveKind[] {
    return this.zones.moveKinds();
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
    const ahead = cheapestPath(
      plan.grid,
      plan.from,
      cell,
      this.legRoom(plan.budget - plan.spent, plan.jumping),
      stops,
      {
        ...terms.options,
        cornersCut: plan.cornersCut,
      }
    );
    this.held.set({ ...plan, ahead: ahead ?? [] });
  }

  /**
   * How far the next leg carries: what the move has left, or one leap of it where the piece
   * is jumping and the room says how far a leap goes.
   */
  private legRoom(left: number, jumping: boolean): number {
    if (!jumping) return left;
    const rules = resolveRoomRules(
      this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null,
      this.tableSelecter.viewTable
    );
    const leap = Math.max(0, Math.floor(rules.jumpCells));
    return leap > 0 ? Math.min(left, stepsFor(leap)) : left;
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
    const left = this.legRoom(plan.budget - plan.spent, jumping);
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
    const left = this.legRoom(plan.budget - spent, plan.jumping);
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
    let stopped: { outcome: InterruptOutcome; point: CellPoint } | null = null;
    try {
      const points = way.map((cell) => cellCenterOf(plan.grid, cell));
      const outcome = await this.interrupts.negotiate(character, points);
      const end = outcome ? indexAtLength(points, outcome.along) : way.length - 1;
      if (outcome) stopped = { outcome, point: points[end] };
      const steps = way.slice(1, end + 1);
      let standingZ = character.posZ;
      for (const [index, cell] of steps.entries()) {
        standingZ = await this.pieceStep.step(character, table, plan.grid, cell, index === steps.length - 1, standingZ);
      }
    } finally {
      this.walking = false;
    }
    SoundEffect.play(PresetSound.piecePut);
    const start = this.zoneStart;
    this.close();
    if (start) this.zones.afterMove(character, start);
    if (stopped) this.interrupts.settle(character, stopped.outcome, stopped.point);
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
    this.legs = [];
    this.zoneStart = null;
  }
}
