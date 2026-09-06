import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { moveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { reachableCells, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';
import { isHostileTo, zoneOfControl } from '@axe/domain/tabletop/move/zone-of-control';
import { resolveRoomRules, RoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';

export interface MoveRangeView {
  characterIdentifier: string;
  grid: CellGrid;
  cells: CellBits;
  /** The ground the enemies hold, which is why the reach stops where it does. */
  held: CellBits | null;
  /** Whether the reach itself is drawn, or only the ground held against the piece. */
  showsReach: boolean;
}

/** What it takes to price a way somebody actually walked, kept from when the piece was lifted. */
export interface WalkTerms {
  walk: number;
  blocked: CellBits;
  options: ReachOptions;
}

/** Everything a walk is worked out from, for anyone who wants to work out a different one. */
export interface ReachTerms extends WalkTerms {
  grid: CellGrid;
  start: number;
  cells: CellBits;
}

@Injectable({ providedIn: 'root' })
export class MoveRangeService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly selection = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);

  private readonly held = signal<MoveRangeView | null>(null);
  private lifted: { identifier: string; x: number; y: number; z: number } | null = null;
  private terms: WalkTerms | null = null;
  private walked: number[] = [];

  /**
   * What is drawn on the table: the piece in hand, or else the piece the reader has picked.
   *
   * A piece being carried always shows its reach. A piece merely chosen shows what the table
   * was told to keep showing - the reach, the ground held against it, or neither - so that a
   * reader can weigh a move before they lift anything.
   */
  readonly range = computed<MoveRangeView | null>(() => {
    const carried = this.held();
    if (carried) return carried;
    return this.standing();
  });

  private readonly standing = computed<MoveRangeView | null>(() => {
    // Everything this answer turns on is read before any of it can send us away early, or a
    // computed that says no once would go on saying it however the table changed afterwards.
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    this.objectChange.versionOf('Config')();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    const chosen = this.selection.selectedObject();
    if (chosen) this.objectChange.versionOf(chosen.identifier)();
    // The pieces are not children of the table, so their comings and goings and their walks
    // across it are watched one by one: an enemy that steps aside opens the ground it held.
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const standing = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const piece of standing) this.objectChange.versionOf(piece.identifier)();

    if (!table) return null;
    const rules = this.rulesOf(table);
    const wantsReach = rules.moveRangeAlways;
    const wantsHeld = rules.zocAlways;
    if (!wantsReach && !wantsHeld) return null;
    if (!chosen) return null;

    const character = this.objectStore.get<GameCharacter>(chosen.identifier);
    if (!(character instanceof GameCharacter)) return null;

    const built = this.build(character);
    if (!built) return null;
    return { ...built.view, held: wantsHeld ? built.view.held : null, showsReach: wantsReach };
  });

  show(character: GameCharacter): void {
    const built = this.build(character);
    this.held.set(built?.view ?? null);
    this.terms = built?.terms ?? null;
    this.walked = built ? [built.start] : [];
    this.lifted = built
      ? {
          identifier: character.identifier,
          x: character.location.x,
          y: character.location.y,
          z: character.posZ,
        }
      : null;
  }

  /**
   * Takes note of where a piece has got to, so the way it went can be priced when it lands.
   *
   * Only a cell it has not just come from is written down, so a hand wavering on a boundary
   * does not spend the piece's whole move going back and forth across one line.
   *
   * `at` is where the piece is being held this moment, which is not where it says it is: a
   * dragged piece writes its place down every sixty-six milliseconds, and a hand that has
   * crossed three cells by then would leave a trail with holes in it that no walk could
   * have made.
   */
  trace(character: GameCharacter, at?: { x: number; y: number }): void {
    const view = this.held();
    const table = this.tableSelecter.viewTable;
    if (!view || !table || view.characterIdentifier !== character.identifier) return;
    const cell = startCellOf(view.grid, character, table, at);
    if (cell < 0) return;
    const last = this.walked[this.walked.length - 1];
    if (cell === last) return;
    if (this.walked.length > 1 && cell === this.walked[this.walked.length - 2]) {
      this.walked.pop();
      return;
    }
    this.walked.push(cell);
  }

  hide(): void {
    if (this.held() !== null) this.held.set(null);
    this.lifted = null;
    this.terms = null;
    this.walked = [];
  }

  /**
   * Sets a piece back where it was lifted from, where the room will not have it set down out
   * of reach.
   *
   * Only a piece that was showing a reach when it was lifted is held to one: a piece with no
   * move to speak of, or lifted while the room was not drawing reaches, is put down wherever
   * the hand left it.
   */
  returnIfOutOfReach(character: GameCharacter): boolean {
    const from = this.lifted;
    const view = this.held();
    this.lifted = null;
    if (!from || !view || from.identifier !== character.identifier) return false;
    if (!this.objectStore.get<Config>('Config')?.moveStrict) return false;

    const table = this.tableSelecter.viewTable;
    if (!table) return false;
    const landed = startCellOf(view.grid, character, table);
    if (landed >= 0 && view.cells.get(landed) && this.wayWasWalkable(landed)) return false;

    character.location.x = from.x;
    character.location.y = from.y;
    character.posZ = from.z;
    character.update();
    return true;
  }

  /** Everything a piece's reach was worked out from, or nothing where it has none. */
  termsOf(character: GameCharacter): ReachTerms | null {
    const built = this.build(character);
    if (!built) return null;
    return { ...built.terms, grid: built.view.grid, start: built.start, cells: built.view.cells };
  }

  /**
   * Whether the way the piece was actually taken is one it could have walked.
   *
   * The reach says where a piece may end up, worked out by the cheapest way round; it says
   * nothing about the way the hand went. A piece dragged straight over a wall lands somewhere
   * it could have reached the long way about, and only the way it went shows that it did not.
   *
   * A room that has not asked for this takes the reach's word for it.
   */
  private wayWasWalkable(landed: number): boolean {
    if (!this.objectStore.get<Config>('Config')?.moveStrictPath) return true;
    const terms = this.terms;
    if (!terms) return true;
    const view = this.held();
    if (!view) return true;
    const way = this.walked[this.walked.length - 1] === landed ? this.walked : [...this.walked, landed];
    const walk = walkedPath(view.grid, way, (index) => terms.blocked.get(index), terms.options);
    return walk.walkable && walk.cost <= terms.walk;
  }

  /** What the table is played by, which the room answers for wherever it has been asked. */
  private rulesOf(table: GameTable | null): RoomRules {
    return resolveRoomRules(this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null, table);
  }

  /** Whether a piece has a reach to be had at all, told without working one out. */
  canPlan(character: GameCharacter): boolean {
    return this.opening(character) !== null;
  }

  /** What a reach needs before any ground is walked: a table, the rules for it, and a piece that moves. */
  private opening(character: GameCharacter): { table: GameTable; rules: RoomRules; walk: number } | null {
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    const rules = this.rulesOf(table);
    if (!rules.moveRangeEnabled) return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    if (surfaceOf(character) !== 'floor') return null;

    const walk = moveCellsOf(character, rules.moveRangeElementNames, rules.cellDistance, rules.cellDistanceUnit);
    if (walk === null || walk < 1) return null;
    return { table, rules, walk };
  }

  private build(character: GameCharacter): { view: MoveRangeView; terms: WalkTerms; start: number } | null {
    const opened = this.opening(character);
    if (!opened) return null;
    const { table, rules, walk } = opened;

    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const start = startCellOf(grid, character, table);
    if (start < 0) return null;

    const blocked = blockedByTerrain(grid, table.terrains);
    const painted = moveBlockMapOn(table)?.read(grid);
    if (painted) blocked.or(painted);

    const standing = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    // Two pieces that may not share a cell may not pass through one either: the ground
    // somebody stands on is in the way, and a reach has to go round it.
    if (!rules.piecesShareCells) blocked.or(occupiedCells(grid, standing, character.identifier));

    const mode = rules.zocMode;
    const held = mode === 'none' ? null : this.heldGroundAround(grid, character, standing, rules);
    if (held && mode === 'block') blocked.or(held);
    const extra = Math.max(0, Math.floor(rules.zocExtraCost));

    const options: ReachOptions = {
      cutsCorners: rules.moveDiagonally,
      costOf: held && mode === 'cost' ? (index) => (held.get(index) ? 1 + extra : 1) : undefined,
      stopsAt: held && mode === 'stop' ? (index) => held.get(index) : undefined,
    };
    const cells = reachableCells(grid, start, walk, (index) => blocked.get(index), options);
    return {
      view: { characterIdentifier: character.identifier, grid, cells, held, showsReach: true },
      terms: { walk, blocked, options },
      start,
    };
  }

  /**
   * The ground the enemies on the board hold against this piece.
   *
   * Only the ones the person moving can see hold any: a range with a bite taken out of it
   * where nobody is standing tells the table there is something in the dark there, which is
   * the one thing the fog is for.
   */
  private heldGroundAround(
    grid: CellGrid,
    mover: GameCharacter,
    standing: readonly GameCharacter[],
    rules: RoomRules
  ): CellBits | null {
    const foes = standing.filter((piece) => isHostileTo(piece, mover) && this.vision.isTokenVisible(piece));
    const held = zoneOfControl(grid, foes, rules.zocRange, rules.moveDiagonally);
    return held.isEmpty ? null : held;
  }
}

/**
 * The cell a piece walks out of.
 *
 * A piece an odd number of cells across has a middle cell to start from. One an even number
 * across has its middle on the corner where four cells meet, and asking which cell that
 * point is in answers with the one down and to the right, which throws the whole reach a
 * cell that way. It steps back half a cell to the one up and to the left instead.
 */
function startCellOf(
  grid: CellGrid,
  character: GameCharacter,
  table: GameTable,
  at: { x: number; y: number } = character.location
): number {
  const size = Math.max(1, character.size);
  const middle = (table.gridSize * size) / 2;
  const onACorner = size % 2 === 0 ? table.gridSize / 2 : 0;
  return cellIndexAt(grid, at.x + middle - onACorner, at.y + middle - onACorner);
}
