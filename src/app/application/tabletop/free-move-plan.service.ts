import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  centreOf,
  EngagementZoneService,
  metresPerCell,
  ZoneMoveLimits,
  ZoneMoveStart,
} from '@axe/application/tabletop/engagement-zone.service';
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
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { MoveBlock, MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { clipToLength, LegLimits, stepsAlong, terrainMoveBlocks, walkLeg } from '@axe/domain/tabletop/move/free-path';
import { exactMoveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { lengthByKind, moveKindNamed } from '@axe/domain/tabletop/move/move-kind';
import { movingPointsAsRead, writeMovingPoints } from '@axe/domain/tabletop/move/moving-points';
import { resolveRoomRules, RoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';

/**
 * How far short of a face a leg stops, in pixels, so a piece put down on whole pixels does not land
 * a hair inside what stopped it.
 */
const FACE_GAP_PX = 1;

/** A move on a table with no grid, being worked out before it is made. */
export interface FreePlan {
  readonly characterIdentifier: string;
  /** Where the piece began, and where cancelling puts it back. */
  readonly origin: { x: number; y: number; z: number };
  /** The corners settled so far, beginning where the move begins, in table pixels. */
  readonly settled: readonly MovePoint[];
  /** The leg from the last corner to wherever the pointer is, as far as it can be walked. */
  readonly ahead: readonly MovePoint[];
  /** How far the settled legs go, and how far the piece may go altogether, in table pixels. */
  readonly spentPx: number;
  readonly budgetPx: number;
  /** How many table pixels make a metre, for saying what is left. */
  readonly pxPerMetre: number;
  /** The name of the kind of move being made, empty for the room's first or plain kind. */
  readonly kind: string;
  /** Whether a settled leg was ended by a zone, which ends the move there. */
  readonly ended: boolean;
  /** Whether the move is one nobody may stop. */
  readonly unstoppable: boolean;
}

interface FreeTerms {
  readonly budgetPx: number;
  readonly start: MovePoint;
  readonly blocks: readonly MoveBlock[];
  readonly zones: ZoneMoveLimits | null;
}

/**
 * A move on a table with no grid, drawn as a way of straight legs and measured in metres.
 *
 * It answers to the same hand as a move counted in cells: the way runs ahead of the pointer and is
 * settled a corner at a time, then walked. A leg goes no further than the move has left, stops short
 * of terrain it cannot cross and of a zone shut to it, and ends the move on walking into a zone that
 * holds it or out of one it stands in. Only a room that asks for it on a table with no grid moves
 * this way; every other move is counted in cells as it always was.
 */
@Injectable({ providedIn: 'root' })
export class FreeMovePlanService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly pieceStep = inject(PieceStepService);
  private readonly zones = inject(EngagementZoneService);
  private readonly interrupts = inject(MoveInterruptService);
  private readonly ride = inject(RideService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  private readonly held = signal<FreePlan | null>(null);
  private readonly opened = signal(0);
  private terms: FreeTerms | null = null;
  private zoneStart: ZoneMoveStart | null = null;
  private corners: FreePlan[] = [];
  private walking = false;

  readonly plan = this.held.asReadonly();
  readonly isPlanning = computed(() => this.held() !== null);
  /** Counts the moves opened, so whatever listens for a press can tell one move from the next. */
  readonly openings = this.opened.asReadonly();

  /**
   * The kinds of move a room plays, offered while a move is worked out, with how far the one chosen
   * has left in metres; null where the room has written no kinds of its own.
   */
  readonly kindBand = computed<MoveKindBand | null>(() => {
    const plan = this.held();
    if (!plan) return null;
    return moveKindBandOf(this.zones, pieceOfPlan(this.objectStore, plan), plan, () =>
      plan.pxPerMetre > 0 ? Math.max(0, plan.budgetPx - plan.spentPx) / plan.pxPerMetre : 0
    );
  });

  /** Whether the move being worked out is one nobody may stop, offered where the room plays zones. */
  readonly unstoppableBand = computed<UnstoppableBand | null>(() => unstoppableBandOf(this.zones, this.held()));

  constructor() {
    effect(() => this.tellTheRoom(this.held()));
    // A seat made a guest while it worked a move out drops it, moving nothing.
    effect(() => {
      this.objectChange.trackMyCursor();
      if (!this.rolePermission.canEditTabletop && untracked(this.held) && !this.walking) untracked(() => this.close());
    });
  }

  get isWalking(): boolean {
    return this.walking;
  }

  /** Whether moves on the table in view are drawn as ways of straight legs. */
  applies(): boolean {
    const table = this.tableSelecter.viewTable;
    return !!table && table.gridType === GridType.NONE && this.config()?.pathMove === true;
  }

  /**
   * Opens a move for a piece by a kind of move the room plays, or answers false where it has no
   * reach: no movement on its sheet, held in its zone, or not on a table with no grid that asks for
   * this. An empty kind is the room's first.
   */
  begin(character: GameCharacter, kindName = ''): boolean {
    if (this.walking || !this.applies()) return false;
    const kind = this.zones.kindFor(character, kindName);
    if (kind === null) return false;
    if (character.unstoppableMove !== '') character.unstoppableMove = '';
    const terms = this.termsOf(character, kind);
    if (!terms) return false;
    this.terms = terms;
    this.corners = [];
    this.zoneStart = this.zones.startOfMove(character, kind);
    character.toTopmost();
    SoundEffect.play(PresetSound.piecePick);
    this.opened.update((count) => count + 1);
    this.held.set({
      characterIdentifier: character.identifier,
      origin: { x: character.location.x, y: character.location.y, z: character.posZ },
      settled: [terms.start],
      ahead: [],
      spentPx: 0,
      budgetPx: terms.budgetPx,
      pxPerMetre: this.pxPerMetre(),
      kind,
      ended: false,
      unstoppable: false,
    });
    return true;
  }

  /**
   * Makes the move being worked out one nobody may stop, or one that may be stopped again, while no
   * corner has been settled yet; answers whether it changed.
   */
  setUnstoppable(on: boolean): boolean {
    const plan = this.held();
    const character = pieceToChooseFor(this.objectStore, plan, this.walking);
    if (!plan || !character || plan.unstoppable === on) return false;
    character.unstoppableMove = on ? '1' : '';
    const terms = this.termsOf(character, plan.kind);
    if (!terms) return false;
    this.terms = terms;
    this.held.set({
      ...plan,
      unstoppable: on,
      settled: [terms.start],
      ahead: [],
      spentPx: 0,
      budgetPx: terms.budgetPx,
    });
    return true;
  }

  /**
   * Changes the kind of move being worked out, while no corner has been settled yet; answers whether
   * it changed.
   */
  setKind(kindName: string): boolean {
    const plan = this.held();
    const character = pieceToChooseFor(this.objectStore, plan, this.walking);
    const kind = plan && character ? kindToChangeTo(this.zones, character, plan, kindName) : null;
    if (!plan || !character || kind === null) return false;
    const terms = this.termsOf(character, kind);
    if (!terms) return false;
    if (this.zoneStart) this.zoneStart = { ...this.zoneStart, kind };
    this.terms = terms;
    this.held.set({ ...plan, kind, settled: [terms.start], ahead: [], spentPx: 0, budgetPx: terms.budgetPx });
    return true;
  }

  /** Draws the leg from the last settled corner towards the table position the pointer is over. */
  lookAt(x: number, y: number): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    if (plan.ended) {
      if (plan.ahead.length > 0) this.held.set({ ...plan, ahead: [] });
      return;
    }
    const from = plan.settled[plan.settled.length - 1];
    const leg = walkLeg(from, { x, y }, this.limitsFor(plan, terms));
    this.held.set({ ...plan, ahead: leg.length > 0 ? [from, leg.end] : [] });
  }

  /**
   * Settles the leg drawn so far, so the next one is drawn from where it ends. Pressing again where
   * nothing is drawn ahead takes the last corner back up instead.
   */
  settle(): void {
    const plan = this.held();
    const terms = this.terms;
    if (!plan || !terms || this.walking) return;
    if (plan.ahead.length < 2) {
      this.unsettle();
      return;
    }
    const from = plan.ahead[0];
    const leg = walkLeg(from, plan.ahead[plan.ahead.length - 1], this.limitsFor(plan, terms));
    this.corners.push(plan);
    this.held.set({
      ...plan,
      settled: [...plan.settled, leg.end],
      ahead: [],
      spentPx: plan.spentPx + leg.length,
      ended: leg.stopped,
    });
  }

  /** Takes back the corner set last, and only that one. */
  unsettle(): void {
    if (this.walking) return;
    const previous = this.corners.pop();
    if (!previous) return;
    this.held.set({ ...previous, ahead: [] });
  }

  /** The whole way the piece would walk if the move were made now, beginning where it begins. */
  wholeWay(): MovePoint[] {
    const plan = this.held();
    if (!plan) return [];
    return plan.ahead.length > 1 ? [...plan.settled, plan.ahead[plan.ahead.length - 1]] : [...plan.settled];
  }

  /**
   * Walks the piece along the way, a short step at a time, so the ground it crosses goes off where
   * it crosses it, then settles what the move did among the zones.
   */
  async run(): Promise<boolean> {
    const plan = this.held();
    if (!plan || this.walking || !this.rolePermission.canEditTabletop) return false;
    const character = this.objectStore.get<GameCharacter>(plan.characterIdentifier);
    const table = this.tableSelecter.viewTable;
    const way = this.wholeWay();
    if (!(character instanceof GameCharacter) || !table || way.length < 2) {
      this.close();
      return false;
    }

    this.walking = true;
    let stopped: InterruptOutcome | null;
    let walked = way;
    try {
      this.ride.recordMove(character, way);
      stopped = await this.interrupts.negotiate(character, movingPointsAsRead(way), plan.kind);
      if (stopped) walked = clipToLength(way, stopped.along);
      const steps = stepsAlong(walked, table.gridSize / 2);
      let standingZ = character.posZ;
      for (const [index, point] of steps.entries()) {
        if (!this.rolePermission.canEditTabletop) break;
        standingZ = await this.pieceStep.stepToPoint(character, table, point, index === steps.length - 1, standingZ);
      }
    } finally {
      this.walking = false;
    }
    if (!this.rolePermission.canEditTabletop) {
      this.close();
      return false;
    }
    SoundEffect.play(PresetSound.piecePut);
    const start = this.zoneStart;
    this.close();
    this.zones.carryBound(character);
    this.ride.dropLeftBehind(character);
    if (start) this.zones.afterMove(character, start);
    if (stopped) {
      this.interrupts.settle(character, stopped, walked[walked.length - 1]);
    } else {
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
    this.corners = [];
    this.zoneStart = null;
  }

  private limitsFor(plan: FreePlan, terms: FreeTerms): LegLimits {
    return {
      budgetPx: Math.max(0, plan.budgetPx - plan.spentPx),
      blocks: terms.blocks,
      gapPx: FACE_GAP_PX,
      shut: terms.zones?.shut ?? [],
      stops: terms.zones?.stops ?? [],
      escapes: terms.zones?.escapes ?? [],
    };
  }

  private termsOf(character: GameCharacter, kindName: string): FreeTerms | null {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0 || surfaceOf(character) !== 'floor') return null;
    const rules = this.rulesOf(table);
    if (!rules.moveRangeEnabled) return null;
    const walk = exactMoveCellsOf(character, rules.moveRangeElementNames, rules.cellDistance, rules.cellDistanceUnit);
    if (walk === null || walk <= 0) return null;
    const kind = moveKindNamed(this.zones.moveKinds(), kindName);
    const budgetPx = lengthByKind(kind, walk, metresPerCell(rules)) * table.gridSize;
    if (budgetPx <= 0) return null;
    const zones = this.zones.moveLimitsFor(character, kind.name);
    if (zones?.noReach) return null;
    return {
      budgetPx,
      start: zones?.startPoint ?? centreOf(character, table.gridSize),
      blocks: terrainMoveBlocks(table.terrains, table.gridSize, character.size),
      zones,
    };
  }

  private pxPerMetre(): number {
    const table = this.tableSelecter.viewTable;
    if (!table) return 0;
    return table.gridSize / metresPerCell(this.rulesOf(table));
  }

  private rulesOf(table: GameTable): RoomRules {
    return resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }

  /**
   * Puts the move being worked out where the rest of the room can see it: the piece, the table it
   * stands on, the kind of move, and the way drawn so far.
   */
  private tellTheRoom(plan: FreePlan | null): void {
    const table = this.tableSelecter.viewTable;
    if (!plan || !table) {
      tellTheRoomOf({ piece: '', table: '', way: '', jumping: '', points: '', kind: '' });
      return;
    }
    tellTheRoomOf({
      piece: plan.characterIdentifier,
      table: table.identifier,
      way: '',
      jumping: '',
      points: writeMovingPoints(this.wholeWay()),
      kind: plan.kind,
    });
  }
}
