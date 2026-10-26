import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_MOVE_REACH_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { allianceOf, PartyAlliance } from '@axe/domain/party/party-alliance';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { blockedByTerrain, terrainBlocksJump } from '@axe/domain/tabletop/move/blocked-cells';
import {
  isLevelWith,
  isWalkableStep,
  landingHeightAt,
  landingHeightsOn,
} from '@axe/domain/tabletop/move/landing-height';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { exactMoveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { moveCostCells } from '@axe/domain/tabletop/move/move-cost-cells';
import { isSquareGrid, moveGridOf, spanOf, squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { cellsByKind, moveKindNamed } from '@axe/domain/tabletop/move/move-kind';
import { pieceCellOf, pieceWidthPx } from '@axe/domain/tabletop/move/piece-on-grid';
import {
  buildReach,
  BuiltReach,
  MoveRangeView,
  piecePassageOf,
  ReachTerms,
} from '@axe/domain/tabletop/move/reach-build';
import { reachableCells } from '@axe/domain/tabletop/move/reachable-cells';
import { inTheWayOf } from '@axe/domain/tabletop/ride/ride-rules';
import { RoomRules } from '@axe/domain/tabletop/room-rules';
import { moveCostsOn, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { characterSceneKey } from '@axe/domain/tabletop/vision-scene-assembly';
import { metresPerCell } from '@axe/domain/tabletop/zone/zone-queries';

/** How many pieces' reaches are kept at once, well above what a table draws. */
const REACH_CACHE_LIMIT = 64;

/** One piece's reach, kept against the piece and everything else it turns on. */
interface ReachEntry {
  token: object;
  version: number;
  built: BuiltReach | null;
  /** The same reach for a piece that means to jump, worked out only if it is asked for. */
  leapt?: CellBits;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** What tells one board from another, for anything rasterised over the cells of one. */
function gridKeyOf(grid: CellGrid): string {
  const clip = grid.clip ? `:${grid.clip.width}x${grid.clip.height}` : '';
  return `${grid.cols}:${grid.rows}:${grid.sizePx}:${grid.type}:${spanOf(grid)}${clip}`;
}

@Injectable({ providedIn: 'root' })
export class MoveRangeService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly roomRules = inject(RoomRulesService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly selection = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly zones = inject(EngagementZoneService);

  private readonly held = signal<MoveRangeView | null>(null);

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
    // across it are watched: an enemy that steps aside opens the ground it held. What they give
    // a reach is read rather than their versions, so a piece renamed changes nothing here.
    this.standingPieces();

    if (!table) return null;
    const rules = this.roomRules.rulesFor(table);
    const wantsReach = rules.moveRangeAlways;
    const wantsHeld = rules.zocAlways;
    if (!wantsReach && !wantsHeld) return null;
    if (!chosen) return null;

    const character = this.objectStore.get<GameCharacter>(chosen.identifier);
    if (!(character instanceof GameCharacter)) return null;

    const built = this.reachEntry(character)?.built ?? null;
    if (!built) return null;
    return { ...built.view, held: wantsHeld ? built.view.held : null, showsReach: wantsReach };
  });

  /** Shows the reach of a piece that has just been picked up, for as long as it is carried. */
  show(character: GameCharacter, kindName = ''): void {
    this.held.set(this.build(character, false, kindName)?.view ?? null);
  }

  /** Stops showing a carried piece's reach, leaving whatever the picked piece shows. */
  hide(): void {
    if (this.held() !== null) this.held.set(null);
  }

  /**
   * Everything a piece's reach was worked out from, or nothing where it has none.
   *
   * `kindName` is the kind of move the piece makes, by the name the room gave it; empty or a name the
   * room does not play takes the room's first kind.
   */
  termsOf(character: GameCharacter, kindName = ''): ReachTerms | null {
    const built = this.build(character, false, kindName);
    if (!built) return null;
    const { grid, cells } = built.view;
    const terms = built.terms;
    let leaptCells: CellBits | null = null;
    return {
      ...terms,
      grid,
      start: built.start,
      cells,
      leaptCells: () =>
        (leaptCells ??= reachableCells(
          grid,
          built.start,
          terms.walk,
          (index) => terms.leapt.get(index),
          terms.options
        )),
    };
  }

  canStepTo(character: GameCharacter, cell: number): boolean {
    const table = this.tableSelecter.viewTable;
    if (!table || cell < 0 || table.gridSize <= 0) return false;
    // The cell asked about is one of the table's own; a reach over squares of several cells
    // numbers its squares instead, so it is answered from the table's cells below.
    const terms = squareSpanOf(table) > 1 ? null : this.termsOf(character);
    if (terms) return cell < terms.cells.count && terms.cells.get(cell);
    return this.cellsToStandOn(character)?.(cell) ?? false;
  }

  /**
   * How high the ground a piece sets out from stands: that of its square, or on a grid keeping its
   * pieces to the cells, that under the piece's own middle, which is not the square's.
   */
  private standingHeightOf(
    character: GameCharacter,
    table: GameTable,
    grid: CellGrid,
    start: number,
    heights: Float64Array
  ): number {
    if (isSquareGrid(grid) && grid.keepsToCells && start === pieceCellOf(grid, character, table.gridSize)) {
      const half = pieceWidthPx(character, table.gridSize) / 2;
      const { x, y } = character.location;
      return landingHeightAt(table.terrains, table.gridSize, x + half, y + half, table.gridType);
    }
    return start < heights.length ? heights[start] : 0;
  }

  /**
   * Which of the table's own cells a piece could stand on, as the ground and the pieces on it have
   * it: not ground too sheer to be stood on, nor too high or too low to step onto, nor ground
   * painted shut, nor ground somebody holds that it may not stop on. Nothing where no table is in
   * view.
   *
   * A step is measured from the ground the piece stands on, or from `fromPx` where the answer
   * gives one, and not at all where it gives null, as for a piece jumping. Worked out for the whole
   * board as it is first needed, so one asking about many cells pays for it once.
   */
  cellsToStandOn(character: GameCharacter): ((cell: number, fromPx?: number | null) => boolean) | null {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0) return null;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const total = cellCount(grid);
    const walled = blockedByTerrain(grid, table.terrains);
    let sheer: CellBits | null = null;
    let heights: Float64Array | null = null;
    const start = pieceCellOf(grid, character, table.gridSize);
    const painted = moveBlockMapOn(table)?.read(grid) ?? null;
    const rules = this.roomRules.rulesFor(table);
    const standing = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.identifier === character.identifier || this.vision.isTokenVisible(piece));
    const passage = piecePassageOf(grid, character, this.inTheWayOf(character, standing), rules, this.alliance());
    return (cell: number, fromPx?: number | null): boolean => {
      if (cell < 0 || cell >= total) return false;
      if (walled.get(cell)) {
        sheer ??= blockedByTerrain(grid, table.terrains, terrainBlocksJump);
        if (sheer.get(cell)) return false;
        if (fromPx !== null) {
          heights ??= landingHeightsOn(grid, table.terrains);
          const standingPx = fromPx ?? (start >= 0 && start < heights.length ? heights[start] : 0);
          if (!isWalkableStep(heights[cell], standingPx, table.gridSize)) return false;
        }
      }
      if (painted?.get(cell)) return false;
      return !passage.blocked.get(cell) && !passage.noStop.get(cell);
    };
  }

  /**
   * The pieces whose ground stands in the way of a piece's move: a mount and those riding it are
   * ground a piece that is no mount may walk onto, to get on.
   */
  private inTheWayOf(character: GameCharacter, standing: readonly GameCharacter[]): GameCharacter[] {
    const asRiding = (piece: GameCharacter) => ({
      id: piece.identifier,
      ridingOn: piece.ridingOn,
      rideSeat: piece.rideSeat,
      mountable: piece.mountable === '1',
      piece,
    });
    return inTheWayOf(asRiding(character), standing.map(asRiding)).map((one) => one.piece);
  }

  /**
   * Which of the room's parties stand together, as the move layer asks it.
   *
   * Read from the store rather than from a signal so that a reach asked for outright is
   * answered by the parties as they stand; what watches them is the reach token.
   */
  private alliance(): PartyAlliance {
    return allianceOf(this.objectStore.getObjects<Party>(Party));
  }

  /** Whether a piece has a reach to be had at all, told without working one out. */
  canPlan(character: GameCharacter, kindName = ''): boolean {
    const opened = this.opening(character);
    const kind = opened ? this.zones.kindFor(character, kindName) : null;
    if (!opened || kind === null) return false;
    return cellsByKind(moveKindNamed(this.zones.moveKinds(), kind), opened.walk, metresPerCell(opened.rules)) >= 1;
  }

  /**
   * The reach drawn for a piece somebody else is moving, kept until the ground or the pieces
   * standing on it change.
   *
   * The way they are drawing is theirs and comes over the wire; the reach around it is worked out
   * here, and a peer moving their pointer changes neither the ground nor where anybody stands.
   */
  shownReachOf(character: GameCharacter, jumping: boolean, kindName = ''): { grid: CellGrid; cells: CellBits } | null {
    const held = this.reachEntry(character, kindName);
    if (!held?.built) return null;
    const { view, terms, start } = held.built;
    if (!jumping) return { grid: view.grid, cells: view.cells };
    held.leapt ??= reachableCells(view.grid, start, terms.walk, (index) => terms.leapt.get(index), terms.options);
    return { grid: view.grid, cells: held.leapt };
  }

  /**
   * What every piece on the table gives a reach, as one list.
   *
   * A piece is changed for many things a reach never reads — its name, its wounds — and reading
   * each piece's version instead would work every reach out again for all of them.
   */
  private readonly pieceKeys = new Map<string, { version: number; key: string }>();

  private readonly standingPieces = computed<string[]>(
    () => {
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      const keys: string[] = [];
      const standing = new Set<string>();
      for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
        const version = this.objectChange.versionOf(piece.identifier)();
        standing.add(piece.identifier);
        let held = this.pieceKeys.get(piece.identifier);
        if (!held || held.version !== version) {
          held = { version, key: characterSceneKey(piece) };
          this.pieceKeys.set(piece.identifier, held);
        }
        keys.push(piece.identifier, held.key);
      }
      for (const identifier of [...this.pieceKeys.keys()]) {
        if (!standing.has(identifier)) this.pieceKeys.delete(identifier);
      }
      return keys;
    },
    { equal: sameStrings }
  );

  private readonly terrainList = computed<readonly Terrain[]>(
    () => {
      this.objectChange.versionOf(this.tableSelecter.identifier)();
      const table = this.tableSelecter.viewTable;
      if (!table) return [];
      this.objectChange.versionOf(table.identifier)();
      return table.terrains;
    },
    { equal: sameElements }
  );

  /** A fresh object whenever a terrain changes, which is what the rasterised ground is kept against. */
  private readonly terrainToken = computed<object>(() => {
    for (const terrain of this.terrainList()) this.objectChange.versionOf(terrain.identifier)();
    return {};
  });

  /** The stretches of ground on the table that cost more to cross than plain footing. */
  private readonly dearGround = computed<readonly TableMoveCost[]>(
    () => {
      this.objectChange.collectionOf(TableMoveCost.aliasName)();
      this.objectChange.versionOf(this.tableSelecter.identifier)();
      const table = this.tableSelecter.viewTable;
      if (!table) return [];
      this.objectChange.versionOf(table.identifier)();
      return moveCostsOn(table);
    },
    { equal: sameElements }
  );

  /** A fresh object whenever dear ground changes, which is what the priced board is kept against. */
  private readonly dearToken = computed<object>(() => {
    for (const area of this.dearGround()) this.objectChange.versionOf(area.identifier)();
    return {};
  });

  private raster: { token: object; gridKey: string; blocked: CellBits; leapt: CellBits } | null = null;
  private prices: { token: object; gridKey: string; costs: Float64Array | null } | null = null;
  private heights: {
    token: object;
    gridKey: string;
    ground: Float64Array;
    /** The cells of each height already asked for, kept so the same set is handed back each time. */
    levels: Map<number, CellBits | null>;
  } | null = null;

  private rasterFor(grid: CellGrid): { blocked: CellBits; leapt: CellBits } {
    const token = this.terrainToken();
    const terrains = this.terrainList();
    const gridKey = gridKeyOf(grid);
    if (this.raster?.token !== token || this.raster.gridKey !== gridKey) {
      this.raster = {
        token,
        gridKey,
        blocked: blockedByTerrain(grid, terrains),
        leapt: blockedByTerrain(grid, terrains, terrainBlocksJump),
      };
    }
    return this.raster;
  }

  /** What each cell charges over a plain step, kept against the dear ground as it stands. */
  private pricesFor(grid: CellGrid): Float64Array | null {
    const token = this.dearToken();
    const gridKey = gridKeyOf(grid);
    if (this.prices?.token !== token || this.prices.gridKey !== gridKey) {
      this.prices = { token, gridKey, costs: moveCostCells(grid, this.dearGround()) };
    }
    return this.prices.costs;
  }

  /** How high the ground stands in each cell, kept against the terrain as it stands. */
  private heightsFor(grid: CellGrid): Float64Array {
    return this.groundOn(grid).ground;
  }

  private groundOn(grid: CellGrid): { ground: Float64Array; levels: Map<number, CellBits | null> } {
    const token = this.terrainToken();
    const gridKey = gridKeyOf(grid);
    if (this.heights?.token !== token || this.heights.gridKey !== gridKey) {
      this.heights = { token, gridKey, ground: landingHeightsOn(grid, this.terrainList()), levels: new Map() };
    }
    return this.heights;
  }

  /**
   * How high the ground stands in every cell of the board, in pixels above the floor.
   *
   * What a piece put down on a cell would be standing on: the floor unless a block it can get
   * on top of is there to be stood on.
   */
  groundHeightsOn(grid: CellGrid): Float64Array {
    return this.heightsFor(grid);
  }

  /**
   * The ground lying level with one height above the floor, or nothing where none of it does.
   *
   * A piece standing on a block is walking along the tops of the blocks rather than along the
   * table, and what it can reach up there belongs on top of them: drawn on the table it would
   * be under the very ground it is describing.
   */
  groundAtHeight(grid: CellGrid, heightPx: number): CellBits | null {
    if (!(heightPx > 0)) return null;
    const { ground, levels } = this.groundOn(grid);
    const held = levels.get(heightPx);
    // The same set is handed back rather than one built afresh: the overlay traces its paths
    // once per set of cells, and a new set on every step of a pointer would trace them again.
    if (held !== undefined) return held;
    const cells = new CellBits(cellCount(grid));
    for (let cell = 0; cell < ground.length; cell++) {
      if (isLevelWith(ground[cell], heightPx)) cells.set(cell);
    }
    const level = cells.isEmpty ? null : cells;
    levels.set(heightPx, level);
    return level;
  }

  /** Everything a reach turns on besides the piece itself, as one object that is new whenever any of it is. */
  private readonly reachToken = computed<object>(() => {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    this.objectChange.versionOf('Config')();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    this.standingPieces();
    this.partyToken();
    this.terrainToken();
    this.dearToken();
    // What tells a piece the reader cannot see from one they can, which shapes the ground held
    // against them.
    this.vision.scene();
    this.vision.viewer();
    this.vision.overlayVision();
    this.vision.foundPieces();
    // Where the fights stand, which shapes where a piece may start from, enter and stop: as a key, so
    // an edit to a piece that leaves the fights as they were keeps every reach.
    this.zones.moveShapingKey();
    return {};
  });

  /** What the parties of the room come to, so that changing an alliance redraws every reach. */
  private readonly partyToken = computed<object>(() => {
    this.objectChange.collectionOf(Party.aliasName)();
    for (const party of this.objectStore.getObjects<Party>(Party)) {
      this.objectChange.versionOf(party.identifier)();
    }
    return {};
  });

  private readonly reaches = new Map<string, ReachEntry>();

  private reachEntry(character: GameCharacter, kindName = ''): ReachEntry | null {
    const token = this.reachToken();
    const version = this.objectChange.versionOf(character.identifier)();
    const key = `${character.identifier}|${kindName}`;
    const held = this.reaches.get(key);
    if (held && held.token === token && held.version === version) return held;
    const entry: ReachEntry = { token, version, built: this.build(character, true, kindName) };
    if (this.reaches.size >= REACH_CACHE_LIMIT) this.reaches.clear();
    this.reaches.set(key, entry);
    return entry;
  }

  /**
   * What a reach needs before any ground is walked: a table, the rules for it, and a piece that moves,
   * with its movement as the sheet gives it, not yet rounded down to whole cells: a kind of move
   * multiplies it first, as a move measured along a line does.
   */
  private opening(character: GameCharacter): { table: GameTable; rules: RoomRules; walk: number } | null {
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    const rules = this.roomRules.rulesFor(table);
    if (!rules.moveRangeEnabled) return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    if (surfaceOf(character) !== 'floor') return null;

    const walk = exactMoveCellsOf(character, rules.moveRangeElementNames, rules.cellDistance, rules.cellDistanceUnit);
    if (walk === null || walk <= 0) return null;
    return { table, rules, walk };
  }

  /**
   * Works a piece's reach out.
   *
   * `reuse` takes the ground from the rasterised board kept for the terrain as it stands, which a
   * caller reading through the signals may do. A caller asking outright is answered from the table
   * itself, since a wall that has just moved has not told anybody yet.
   */
  private build(character: GameCharacter, reuse = false, kindName = ''): BuiltReach | null {
    const opened = this.opening(character);
    if (!opened) return null;
    perfCounters.bump(PERF_MOVE_REACH_BUILD);
    const { table, rules } = opened;
    const kind = moveKindNamed(this.zones.moveKinds(), kindName);
    const walk = cellsByKind(kind, opened.walk, metresPerCell(rules));
    if (walk < 1) return null;

    const grid = moveGridOf(table);
    const fight = this.zones.reachTermsFor(character, grid, kind.name);
    if (fight?.noReach) return null;
    const start = fight?.startPoint
      ? cellIndexAt(grid, fight.startPoint.x, fight.startPoint.y)
      : pieceCellOf(grid, character, table.gridSize);
    if (start < 0) return null;

    const paved = reuse ? this.rasterFor(grid) : null;
    const heights = reuse ? this.heightsFor(grid) : landingHeightsOn(grid, table.terrains);
    // Only the pieces the person moving can see stand in the way. A reach with a bite taken out
    // of it where nobody is standing tells the table there is something in the dark there, and
    // the bite now says which side it is on as well, since a reach goes through one's own side
    // and round the other.
    const standing = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.identifier === character.identifier || this.vision.isTokenVisible(piece));
    return buildReach({
      character,
      table,
      rules,
      grid,
      start,
      walk,
      zones: fight,
      closed: {
        blocked: paved ? paved.blocked.copy() : blockedByTerrain(grid, table.terrains),
        leapt: paved ? paved.leapt.copy() : blockedByTerrain(grid, table.terrains, terrainBlocksJump),
      },
      heights,
      standingPx: this.standingHeightOf(character, table, grid, start, heights),
      standing,
      inTheWay: this.inTheWayOf(character, standing),
      allied: this.alliance(),
      dearGround: () => (reuse ? this.pricesFor(grid) : moveCostCells(grid, moveCostsOn(table))),
    });
  }
}
