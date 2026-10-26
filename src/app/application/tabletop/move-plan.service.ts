import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { InterruptOutcome, MoveInterruptService } from '@axe/application/tabletop/move-interrupt.service';
import {
  kindToChangeTo,
  MoveKindBand,
  moveKindBandOf,
  pieceOfPlan,
  pieceToChooseFor,
  tellTheRoomOf,
  UnstoppableBand,
  unstoppableBandOf,
} from '@axe/application/tabletop/move-plan-common';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { landingHeightAt } from '@axe/domain/tabletop/move/landing-height';
import { fineGridOf, isSquareGrid } from '@axe/domain/tabletop/move/move-grid';
import { moveModeTermsOf } from '@axe/domain/tabletop/move/move-mode';
import { cellsFrom, stepsFor } from '@axe/domain/tabletop/move/move-steps';
import {
  cellsCoveredAt,
  pieceCellOf,
  pieceCornerOn,
  pieceCornersNearest,
  pieceWidthPx,
  standsAt,
} from '@axe/domain/tabletop/move/piece-on-grid';
import { ReachTerms } from '@axe/domain/tabletop/move/reach-build';
import { reachableCells } from '@axe/domain/tabletop/move/reachable-cells';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { indexAtLength } from '@axe/domain/tabletop/zone/interrupt';
import { metresPerCell, ZoneMoveStart } from '@axe/domain/tabletop/zone/zone-queries';

/** Where in a square a piece is put down, rather than in the middle of it. */
export interface MoveLanding {
  /** The square. */
  readonly cell: number;
  /** Where the piece's corner goes. */
  readonly x: number;
  readonly y: number;
  /** How wide the piece stands, in px. */
  readonly width: number;
}

/** A square found to have no cell a piece could end on, with the leg of the move it was asked for. */
interface NowhereTry {
  readonly from: number;
  readonly settled: number;
  readonly jumping: boolean;
  readonly square: number;
}

/** Whether a square was already found to have nowhere for the piece, for the same leg. */
function sameTry(held: NowhereTry | null, tried: NowhereTry): boolean {
  return (
    !!held &&
    held.from === tried.from &&
    held.settled === tried.settled &&
    held.jumping === tried.jumping &&
    held.square === tried.square
  );
}

/** Whether two landings put a piece in the same place, nothing being the same as nothing. */
function sameLanding(a: MoveLanding | null, b: MoveLanding | null): boolean {
  if (!a || !b) return a === b;
  return a.cell === b.cell && a.x === b.x && a.y === b.y && a.width === b.width;
}

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
  /** Whether the move is one nobody may stop. */
  unstoppable: boolean;
  /**
   * Where in the last square of the way the piece is put down, on a table whose pieces keep to the
   * cells of its squares; nothing puts it in the middle. Kept for the square the pointer was last
   * over, so it counts only while that square is where the way ends.
   */
  landing: MoveLanding | null;
  /**
   * Where on the square the settled way ends the piece is put down, as chosen when that leg was
   * settled or pointed at since; what the move lands on while the pointer is off out of reach.
   */
  settledLanding: MoveLanding | null;
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
  private readonly roomRules = inject(RoomRulesService);
  private readonly pieceStep = inject(PieceStepService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly zones = inject(EngagementZoneService);
  private readonly links = inject(PieceLinksService);
  private readonly interrupts = inject(MoveInterruptService);
  private readonly ride = inject(RideService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  private readonly held = signal<MovePlan | null>(null);
  /** Where the piece stood among the engagement zones as the move began. */
  private zoneStart: ZoneMoveStart | null = null;
  private terms: ReachTerms | null = null;
  /** Which of the table's own cells the piece may stand on, worked out once a move asks. */
  private standable: ((cell: number, fromPx?: number | null) => boolean) | null = null;
  /** The square last found to have no cell the piece could end on, with the leg it was asked for. */
  private nowhere: NowhereTry | null = null;
  /** The height last worked out for stepping into a square from the square before it. */
  private stepFrom: { readonly before: number; readonly px: number } | null = null;
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
    return moveKindBandOf(this.zones, pieceOfPlan(this.objectStore, plan), plan, () => {
      const rules = this.roomRules.rulesFor(this.tableSelecter.viewTable);
      return cellsFrom(Math.max(0, plan.budget - plan.spent)) * metresPerCell(rules);
    });
  });

  /**
   * Whether the move being worked out is one nobody may stop, offered where the room plays zones;
   * chosen before the first leg is settled, like the kind.
   */
  readonly unstoppableBand = computed<UnstoppableBand | null>(() => unstoppableBandOf(this.zones, this.held()));

  constructor() {
    // A move being worked out is one the whole table waits on, so it is drawn on every screen
    // rather than only the mover's. It leaves the room's sight the moment the move is over.
    effect(() => this.tellTheRoom(this.held()));
    // A seat made a guest while it worked a move out drops it, moving nothing.
    effect(() => {
      this.objectChange.trackMyCursor();
      if (!this.rolePermission.canEditTabletop() && untracked(this.held) && !this.walking)
        untracked(() => this.close());
    });
  }

  /**
   * Puts the move being worked out where the rest of the room can see it.
   *
   * What is sent is the piece, the table it stands on, and the way drawn so far. The reach is
   * not: it is shaped by what its owner can see, and the dents an unseen enemy leaves in one
   * would say where it stands, so each screen works the reach out from what it may know.
   */
  private tellTheRoom(plan: MovePlan | null): void {
    const table = this.tableSelecter.viewTable;
    if (!plan || !table) {
      tellTheRoomOf({ piece: '', table: '', way: '', jumping: '', points: '', kind: '' });
      return;
    }
    tellTheRoomOf({
      piece: plan.characterIdentifier,
      table: table.identifier,
      way: this.wholeWay().join(','),
      jumping: plan.jumping ? 'true' : '',
      points: '',
      kind: plan.kind,
    });
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
    if (character.unstoppableMove !== '') character.unstoppableMove = '';
    const terms = this.moveRange.termsOf(character, kind);
    if (!terms) return false;
    this.terms = terms;
    this.legs = [];
    this.standable = null;
    this.nowhere = null;
    this.stepFrom = null;
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
      unstoppable: false,
      landing: null,
      settledLanding: null,
    });
    return true;
  }

  /**
   * Makes the move being worked out one nobody may stop, or one that may be stopped again, while no
   * leg of it has been settled yet; answers whether it changed. The reach is worked out afresh, as
   * zones that would end the move no longer do.
   */
  setUnstoppable(on: boolean): boolean {
    const plan = this.held();
    const character = pieceToChooseFor(this.objectStore, plan, this.walking);
    if (!plan || !character || plan.unstoppable === on) return false;
    character.unstoppableMove = on ? '1' : '';
    const terms = this.moveRange.termsOf(character, plan.kind);
    if (!terms) return false;
    this.terms = terms;
    this.held.set({
      ...plan,
      unstoppable: on,
      from: terms.start,
      settled: [terms.start],
      ahead: [],
      spent: 0,
      budget: terms.walk,
      cornersCut: 0,
      reach: terms.cells,
      waypoints: [],
      jumping: false,
      landing: null,
      settledLanding: null,
    });
    return true;
  }

  /**
   * Changes the kind of move being worked out, while no leg of it has been settled yet; answers
   * whether it changed. The reach is worked out afresh for the new kind.
   */
  setKind(kindName: string): boolean {
    const plan = this.held();
    const character = pieceToChooseFor(this.objectStore, plan, this.walking);
    const kind = plan && character ? kindToChangeTo(this.zones, character, plan, kindName) : null;
    if (!plan || !character || kind === null) return false;
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
      landing: null,
      settledLanding: null,
    });
    return true;
  }

  /** Draws the way from the last settled cell to the table position the pointer is over. */
  lookAt(x: number, y: number): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    const cell = cellIndexAt(plan.grid, x, y);
    if (this.nowhere?.square !== cell) this.nowhere = null;
    if (cell < 0 || cell === plan.from || !plan.reach.get(cell)) {
      const settled = plan.settled.length > 1;
      const before = settled ? plan.settled[plan.settled.length - 2] : null;
      const landing = cell === plan.from ? this.landingAt(plan, cell, before, x, y).landing : this.keptLanding(plan);
      const settledLanding = settled && landing ? landing : plan.settledLanding;
      if (plan.ahead.length > 0 || !sameLanding(plan.landing, landing)) {
        this.held.set({ ...plan, ahead: [], landing, settledLanding });
      }
      return;
    }
    if (plan.ahead[plan.ahead.length - 1] === cell) {
      const { landing } = this.landingAt(plan, cell, plan.ahead[plan.ahead.length - 2], x, y);
      if (!sameLanding(plan.landing, landing)) this.held.set({ ...plan, landing });
      return;
    }
    const tried = { from: plan.from, settled: plan.settled.length, jumping: plan.jumping, square: cell };
    if (sameTry(this.nowhere, tried)) return;
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
    const { landing, nowhere } = ahead
      ? this.landingAt(plan, cell, ahead[ahead.length - 2], x, y)
      : { landing: null, nowhere: false };
    // A square with no cell the piece could stand on is no square to end the move on, though the
    // way may pass through it; the pointer moving about over it asks nothing again.
    this.nowhere = nowhere ? tried : null;
    this.held.set({ ...plan, ahead: nowhere ? [] : (ahead ?? []), landing });
  }

  /**
   * Where in a square the piece would be put down for the pointer at a place, on a table whose
   * pieces keep to the cells of its squares: on the cells under the pointer, or the nearest it could
   * stand on, stepping in from the square `before` it, or from where it stands where that is null.
   * No landing on any other table, nor for a piece wider than the square, which goes to its middle
   * as on another table; and none, with nowhere to stand, where no cell of the square will take it.
   *
   * The pointer on the piece itself is where it stands, so a tap on it walks it nowhere.
   */
  private landingAt(
    plan: MovePlan,
    cell: number,
    before: number | null,
    x: number,
    y: number
  ): { landing: MoveLanding | null; nowhere: boolean } {
    const table = this.tableSelecter.viewTable;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    const grid = plan.grid;
    const none = { landing: null, nowhere: false };
    if (!table || !(character instanceof GameCharacter) || !isSquareGrid(grid) || !grid.keepsToCells) return none;
    const width = pieceWidthPx(character, table.gridSize);
    const here = character.location;
    const onItself = x >= here.x && x < here.x + width && y >= here.y && y < here.y + width;
    if (onItself && pieceCellOf(grid, character, table.gridSize) === cell) {
      return { landing: { cell, x: here.x, y: here.y, width }, nowhere: false };
    }
    const places = pieceCornersNearest(grid, character, cell, { x, y });
    if (places.length < 1) return none;
    const fromPx = this.stepFromPx(plan, table, character, before);
    const standing = places.find((corner) => this.canStandAt(plan, character, fromPx, corner, width));
    return standing ? { landing: { cell, ...standing, width }, nowhere: false } : { landing: null, nowhere: true };
  }

  /**
   * How high the ground a piece steps into a square from stands: where it would stand on the square
   * `before`, or where it stands now where that is null or the square it stands on; nothing for a
   * piece jumping, or one that goes over what is in its way, which steps onto ground at any height.
   */
  private stepFromPx(
    plan: MovePlan,
    table: GameTable,
    character: GameCharacter,
    before: number | null
  ): number | null | undefined {
    if (this.leaps(plan, character)) return null;
    if (before === null || before === pieceCellOf(plan.grid, character, table.gridSize)) return undefined;
    if (this.stepFrom?.before === before) return this.stepFrom.px;
    const corner = pieceCornerOn(plan.grid, character, table.gridSize, before);
    const half = pieceWidthPx(character, table.gridSize) / 2;
    const px = landingHeightAt(table.terrains, table.gridSize, corner.x + half, corner.y + half, table.gridType);
    this.stepFrom = { before, px };
    return px;
  }

  /** Whether the piece steps onto ground at any height: one jumping, or one going over what is in its way. */
  private leaps(plan: MovePlan, character: GameCharacter): boolean {
    return plan.jumping || moveModeTermsOf(character.moveMode).clears;
  }

  /**
   * The landing kept with the pointer off anywhere the piece could go: the one chosen on the square
   * the settled way ends on, which is still where the move ends; none while nothing is settled, so
   * a tap there calls the move off rather than shifting the piece.
   */
  private keptLanding(plan: MovePlan): MoveLanding | null {
    return plan.settled.length > 1 ? plan.settledLanding : null;
  }

  /**
   * Whether every one of the table's cells a piece would cover with its corner at a place is one it
   * may stand on, stepping from ground `fromPx` high, from where it stands where that is undefined,
   * or at any height where it is null.
   */
  private canStandAt(
    plan: MovePlan,
    character: GameCharacter,
    fromPx: number | null | undefined,
    corner: CellPoint,
    width: number
  ): boolean {
    const standable = (this.standable ??= this.moveRange.cellsToStandOn(character) ?? (() => false));
    return cellsCoveredAt(plan.grid, corner, width).every((cell) => standable(cell, fromPx));
  }

  /**
   * Where the piece is put down at the end of a way, where that is somewhere other than the middle
   * of its last square: the cell the pointer chose there, or the one chosen as the settled way was.
   */
  private landingFor(plan: MovePlan, way: readonly number[]): MoveLanding | null {
    const last = way[way.length - 1];
    if (plan.landing?.cell === last) return plan.landing;
    return plan.settled.length > 1 && plan.settledLanding?.cell === last ? plan.settledLanding : null;
  }

  /**
   * Where the piece is put down at the end of a way, as {@link landingFor} has it, where it could
   * still stand there on the board as it is now.
   */
  private stillStanding(
    plan: MovePlan,
    table: GameTable,
    character: GameCharacter,
    way: readonly number[]
  ): MoveLanding | null {
    const landing = this.landingFor(plan, way);
    if (!landing) return null;
    this.standable = null;
    const before = way.length > 1 ? way[way.length - 2] : null;
    const fromPx = this.stepFromPx(plan, table, character, before);
    return this.canStandAt(plan, character, fromPx, landing, landing.width) ? landing : null;
  }

  /** Whether the pointer rests on a square with no cell the piece could end the move on. */
  pointsAtNowhere(): boolean {
    return this.nowhere !== null;
  }

  /**
   * Whether the move would only shift the piece onto other cells of the square it stands on,
   * which takes no step of the way.
   */
  movesWithinSquare(): boolean {
    const plan = this.held();
    if (!plan || this.wholeWay().length > 1) return false;
    const landing = this.landingFor(plan, plan.settled);
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    if (!landing || !(character instanceof GameCharacter)) return false;
    // A move that sets out from elsewhere than the square the piece stands on, as one leaving its
    // engagement zone does from the middle of the zone, has no square to shift within.
    if (plan.from !== pieceCellOf(plan.grid, character, fineGridOf(plan.grid).sizePx)) return false;
    return !standsAt(character, landing);
  }

  /**
   * How far the next leg carries: what the move has left, or one leap of it where the piece
   * is jumping and the room says how far a leap goes.
   */
  private legRoom(left: number, jumping: boolean): number {
    if (!jumping) return left;
    const rules = this.roomRules.rulesFor(this.tableSelecter.viewTable);
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
    this.held.set({ ...plan, jumping, reach, ahead: [], landing: null });
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
      settledLanding: plan.landing?.cell === from ? plan.landing : null,
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
   * Walks the piece along the way that has been settled, a cell at a time, and puts it down where
   * the move lands it in the last square; or, where the move only shifts it within the square it
   * stands on, puts it there.
   *
   * Nothing else may be asked of the plan while it walks: the piece is between cells, and a
   * second move begun over the top of this one would leave it there.
   */
  async run(): Promise<boolean> {
    const plan = this.held();
    if (!plan || this.walking || !this.rolePermission.canEditTabletop()) return false;
    const way = this.wholeWay();
    const inPlace = way.length < 2;
    if (inPlace && !this.movesWithinSquare()) return false;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    const table = this.tableSelecter.viewTable;
    // A piece that is no longer on the table cannot walk anywhere, and neither can the move be
    // left standing: while one is open the table's clicks are all taken by it, so a move whose
    // piece has been deleted out from under it would leave nothing on the board answering.
    if (!(character instanceof GameCharacter) || !table) {
      this.close();
      return false;
    }
    // Asked again of the board as it stands now: somebody may have walked onto the cell chosen, or
    // the ground under it been changed, while the move was being worked out.
    const chosen = this.stillStanding(plan, table, character, way);
    if (inPlace && !chosen) return false;

    this.walking = true;
    let stopped: { outcome: InterruptOutcome; point: CellPoint } | null = null;
    try {
      const points = way.map((cell) => cellCenterOf(plan.grid, cell));
      if (!inPlace) this.ride.recordMove(character, points);
      const outcome = await this.interrupts.negotiate(character, points, plan.kind);
      const end = outcome ? indexAtLength(points, outcome.along) : way.length - 1;
      if (outcome) stopped = { outcome, point: points[end] };
      const landing = outcome ? null : chosen;
      const steps = way.slice(1, end + 1);
      let standingZ = character.posZ;
      if (inPlace && landing && this.rolePermission.canEditTabletop()) {
        standingZ = await this.pieceStep.stepOnto(character, table, plan.grid, -1, landing, true, standingZ);
      }
      const leaping = this.leaps(plan, character);
      const standable = this.standable ?? this.moveRange.cellsToStandOn(character);
      const standsOn = standable
        ? (tableCell: number, px: number) => standable(tableCell, leaping ? null : px)
        : undefined;
      for (const [index, cell] of steps.entries()) {
        if (!this.rolePermission.canEditTabletop()) break;
        const ending = index === steps.length - 1;
        // The cell chosen is asked once more from the height the walk has actually come to, which
        // the step before it may have reached by a cell other than the one it was reckoned from.
        const lands =
          ending && landing && this.canStandAt(plan, character, leaping ? null : standingZ, landing, landing.width);
        standingZ = lands
          ? await this.pieceStep.stepOnto(character, table, plan.grid, cell, landing, ending, standingZ)
          : await this.pieceStep.step(character, table, plan.grid, cell, ending, standingZ, standsOn);
      }
    } finally {
      this.walking = false;
    }
    if (!this.rolePermission.canEditTabletop()) {
      this.close();
      return false;
    }
    SoundEffect.play(PresetSound.piecePut);
    const start = this.zoneStart;
    this.close();
    this.links.carryBound(character);
    this.ride.dropLeftBehind(character);
    // A shift within the square a piece stands on goes nowhere the move counts, so it neither
    // leaves a zone nor enters one, and offers nothing where it stands.
    if (start && !inPlace) this.zones.afterMove(character, start);
    if (stopped) {
      this.interrupts.settle(character, stopped.outcome, stopped.point);
    } else if (!inPlace) {
      this.zones.offerFight(character);
      this.ride.offerRide(character);
    }
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
      if (character.unstoppableMove !== '') character.unstoppableMove = '';
      character.update();
    }
    this.close();
  }

  private close(): void {
    this.held.set(null);
    this.terms = null;
    this.terms = null;
    this.standable = null;
    this.nowhere = null;
    this.stepFrom = null;
    this.zoneStart = null;
  }
}
