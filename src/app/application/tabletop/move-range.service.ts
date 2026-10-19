import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { characterSceneKey } from '@axe/application/tabletop/vision-scene-assembly';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_MOVE_REACH_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { allianceOf, PartyAlliance } from '@axe/domain/party/party-alliance';
import { Config } from '@axe/domain/peer/config';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { blockedByTerrain, terrainBlocksJump } from '@axe/domain/tabletop/move/blocked-cells';
import { allowsDiagonal } from '@axe/domain/tabletop/move/diagonal-move';
import {
  breakOutToll,
  Engagement,
  engagementOf,
  engagementsOn,
  Fights,
  fightsByCell,
  leavesFight,
} from '@axe/domain/tabletop/move/engagement';
import { isLevelWith, isWalkableStep, landingHeightsOn } from '@axe/domain/tabletop/move/landing-height';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { exactMoveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { moveCostCells } from '@axe/domain/tabletop/move/move-cost-cells';
import { moveGridOf, spanOf, squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { cellsByKind, moveKindNamed } from '@axe/domain/tabletop/move/move-kind';
import { moveModeTermsOf } from '@axe/domain/tabletop/move/move-mode';
import { STEPS_PER_CELL, stepsFor } from '@axe/domain/tabletop/move/move-steps';
import { pieceFitsOn } from '@axe/domain/tabletop/move/piece-footprint';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { passageCells, PiecePassageMode } from '@axe/domain/tabletop/move/piece-passage';
import { PieceRelation } from '@axe/domain/tabletop/move/piece-relation';
import { reachableCells, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';
import { isHostileTo, zoneOfControl } from '@axe/domain/tabletop/move/zone-of-control';
import { inTheWayOf } from '@axe/domain/tabletop/ride/ride-rules';
import { resolveRoomRules, RoomRules } from '@axe/domain/tabletop/room-rules';
import { moveCostsOn, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

/** What the table does with the ground a piece of this standing stands on. */
function passageModeOf(rules: RoomRules, relation: PieceRelation): PiecePassageMode {
  if (relation === 'same') return rules.samePartyPassage;
  return relation === 'other' ? rules.otherPartyPassage : rules.noPartyPassage;
}

/** How many pieces' reaches are kept at once, well above what a table draws. */
const REACH_CACHE_LIMIT = 64;

/**
 * What a cell costs where nothing is painted on it and nobody is holding it.
 *
 * Handed over even when there is nothing to charge for, since the search counts in steps and
 * would otherwise take its own default of one step - half a cell - for plain ground.
 */
const PLAIN_GOING = () => STEPS_PER_CELL;

/** A reach as it was worked out: what is drawn, what it was walked under, and where it set out from. */
interface BuiltReach {
  view: MoveRangeView;
  terms: WalkTerms;
  start: number;
}

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
  return `${grid.cols}:${grid.rows}:${grid.sizePx}:${grid.type}:${spanOf(grid)}`;
}

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
  /** How far it walks, in steps rather than in cells: a road is crossed in half a cell. */
  walk: number;
  blocked: CellBits;
  /** The same, for a piece that means to jump: height stops it no longer, sheer faces still do. */
  leapt: CellBits;
  options: ReachOptions;
}

/**
 * Everything a walk is worked out from, for anyone who wants to work out a different one.
 *
 * What it holds is counted in steps, two to the cell, and so is everything `costOf` answers.
 */
export interface ReachTerms extends WalkTerms {
  grid: CellGrid;
  start: number;
  cells: CellBits;
  /**
   * The same reach for a piece that means to jump.
   *
   * Worked out when it is asked for rather than alongside the other: every piece the room is
   * watching move has its reach drawn afresh on every redraw, and most of them are walking.
   */
  leaptCells: () => CellBits;
}

@Injectable({ providedIn: 'root' })
export class MoveRangeService {
  private readonly tableSelecter = inject(TableSelecter);
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
    const rules = this.rulesOf(table);
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
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    if (cell >= cellCount(grid)) return false;
    if (blockedByTerrain(grid, table.terrains).get(cell)) {
      if (blockedByTerrain(grid, table.terrains, terrainBlocksJump).get(cell)) return false;
      const heights = landingHeightsOn(grid, table.terrains);
      const start = pieceCellOf(grid, character, table.gridSize);
      const standingPx = start >= 0 && start < heights.length ? heights[start] : 0;
      if (!isWalkableStep(heights[cell], standingPx, table.gridSize)) return false;
    }
    if (moveBlockMapOn(table)?.read(grid)?.get(cell)) return false;
    const rules = this.rulesOf(table);
    const standing = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.identifier === character.identifier || this.vision.isTokenVisible(piece));
    const passage = passageCells(
      grid,
      this.inTheWayOf(character, standing),
      character,
      (relation) => passageModeOf(rules, relation),
      rules.sizeSlipsPast,
      this.alliance()
    );
    return !passage.blocked.get(cell) && !passage.noStop.get(cell);
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

  /** What the table is played by, which the room answers for wherever it has been asked. */
  private rulesOf(table: GameTable | null): RoomRules {
    return resolveRoomRules(this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null, table);
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
    const rules = this.rulesOf(table);
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

    const going = moveModeTermsOf(character.moveMode);
    const paved = reuse ? this.rasterFor(grid) : null;
    let blocked = paved ? paved.blocked.copy() : blockedByTerrain(grid, table.terrains);
    // Only the terrain differs between walking and jumping; everything else stands in the way
    // of both, so it is gathered once and laid over each of them.
    const leapt = paved ? paved.leapt.copy() : blockedByTerrain(grid, table.terrains, terrainBlocksJump);
    // What a piece can step to is ground rather than something to walk around: the tops of
    // the blocks it is already standing on, and anything within a cell of them, up or down.
    // A wall is only a wall to somebody it rises over.
    const heights = reuse ? this.heightsFor(grid) : landingHeightsOn(grid, table.terrains);
    const standingPx = start < heights.length ? heights[start] : 0;
    for (let cell = 0; cell < heights.length; cell++) {
      if (!blocked.get(cell)) continue;
      // A face too sheer to be stood on is the one thing a step does not answer.
      if (leapt.get(cell)) continue;
      if (!isWalkableStep(heights[cell], standingPx, table.gridSize)) continue;
      blocked.unset(cell);
    }
    const otherwise = new CellBits(cellCount(grid));
    const painted = moveBlockMapOn(table)?.read(grid);
    if (painted) otherwise.or(painted);
    if (fight?.blocked) otherwise.or(fight.blocked);

    // Only the pieces the person moving can see stand in the way. A reach with a bite taken out
    // of it where nobody is standing tells the table there is something in the dark there, and
    // the bite now says which side it is on as well, since a reach goes through one's own side
    // and round the other.
    const standing = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.identifier === character.identifier || this.vision.isTokenVisible(piece));
    // The ground somebody else stands on is in the way of a reach as the table has it: shut to
    // the piece, dear to cross, or ground it walks over without being able to stop on.
    // Which parties stand together, which is what tells an allied band from an enemy one.
    const allied = this.alliance();
    const passage = passageCells(
      grid,
      this.inTheWayOf(character, standing),
      character,
      (relation) => passageModeOf(rules, relation),
      rules.sizeSlipsPast,
      allied
    );
    otherwise.or(passage.blocked);

    // What the ground itself charges, which is owed by whoever enters it whatever else is
    // happening on the board.
    // A piece over the ground owes the ground nothing: a bog is no harder to cross than a
    // floor when the feet are not in it.
    const dear = going.paysGround ? (reuse ? this.pricesFor(grid) : moveCostCells(grid, moveCostsOn(table))) : null;

    const mode = rules.zocMode;
    const ground = mode === 'none' ? null : this.heldGroundAround(grid, character, standing, rules, allied);
    const held = ground?.held ?? null;
    if (held && mode === 'block') otherwise.or(held);
    blocked.or(otherwise);
    leapt.or(otherwise);
    // What stops a jump is what stops a piece that goes over things rather than round them.
    if (going.clears) blocked = leapt;
    const extra = Math.max(0, Math.floor(rules.zocExtraCost));
    const fights = rules.breakOutMode === 'free' ? null : (ground?.fights ?? null);
    const flat = Math.max(0, Math.floor(rules.breakOutCost));
    const crossing = passage.costly.isEmpty ? 0 : Math.max(0, Math.floor(rules.piecePassageCost));
    const noStop = passage.noStop.isEmpty ? null : passage.noStop;
    // A wide piece is answered for the cell its middle would be over, so where every cell it
    // covers has to be clear is asked here rather than by the search, which knows of one cell
    // at a time.
    const fits = pieceFitsOn(grid, character, table.gridSize, blocked);
    // Folding through a gap too small: the piece stands there as though it were a size
    // smaller. A piece two cells across folds down to one, which any clear cell holds, so
    // there is nothing left to ask and the answer is yes.
    const tight =
      fits && rules.squeezes
        ? (pieceFitsOn(grid, character, table.gridSize, blocked, Math.round(character.size) - 1) ?? (() => true))
        : null;
    // A piece wider than one cell cannot pass through a gap it could not stand in. The search
    // asks about the cell its middle would be over, so a golem three across would otherwise
    // thread a one-cell doorway and come out the far side of it. Worked out in full before any
    // of it is written down, since each answer is read off the ground as it stands.
    // Which cells are reached only folded up is written down here rather than asked again once
    // the search is running: folding the too-narrow cells into `blocked` just below changes what
    // `fits` and `tight` answer, since both read that set as it stands rather than as it stood.
    const squeezed = tight ? new CellBits(cellCount(grid)) : null;
    if (fits) {
      const total = cellCount(grid);
      const tooNarrow = new CellBits(total);
      for (let cell = 0; cell < total; cell++) {
        if (blocked.get(cell) || fits(cell)) continue;
        if (tight?.(cell) ?? false) {
          squeezed?.set(cell);
          continue;
        }
        tooNarrow.set(cell);
      }
      blocked.or(tooNarrow);
    }
    const charges =
      dear !== null ||
      going.toll > 0 ||
      crossing > 0 ||
      squeezed !== null ||
      (held !== null && mode === 'cost') ||
      fights !== null;

    // Everything the search is handed is in steps rather than in cells, since a road is
    // crossed in half of one. Prices are worked out in cells, the way a table talks about
    // them, and turned at the last moment.
    const options: ReachOptions = {
      diagonals: rules.diagonalMove,
      costOf: charges
        ? (index, from) => {
            let price = 1 + going.toll + (dear ? dear[index] : 0);
            // Squeezing costs the step again, which is what makes a gap worth going round.
            if (squeezed?.get(index)) price += 1;
            if (crossing > 0 && passage.costly.get(index)) price += crossing;
            if (held && mode === 'cost' && held.get(index)) price += extra;
            if (fights && leavesFight(fights, from, index)) {
              price += breakOutToll(rules.breakOutMode, fights.prices[from], flat);
            }
            return stepsFor(price);
          }
        : PLAIN_GOING,
      stopsAt: stopsWhere(held && mode === 'stop' ? held : null, fight?.stops ?? null),
      // Where a wide piece may stand is settled by what it may enter at all, above; what is
      // left here is ground somebody else is holding, which is crossed but not stopped on.
      restsAt: noStop ? (index) => !noStop.get(index) : undefined,
    };
    const steps = stepsFor(walk);
    const cells = reachableCells(grid, start, steps, (index) => blocked.get(index), options);
    return {
      view: { characterIdentifier: character.identifier, grid, cells, held, showsReach: true },
      terms: { walk: steps, blocked, leapt, options },
      start,
    };
  }

  /**
   * The ground the enemies on the board hold against this piece.
   *
   * Only the ones the person moving can see hold any, which is what it is handed: a range with
   * a bite taken out of it where nobody is standing tells the table there is something in the
   * dark there, which is the one thing the fog is for.
   *
   * Where the table holds a fight as one place rather than as pairs, the whole of the fight
   * this piece is in holds it, allies and all, and getting out of it costs what the two sides
   * come to when they are weighed against one another. A side that outweighs the other walks
   * away as though the fight were not there, which is the whole of what breaking through is.
   */
  private heldGroundAround(
    grid: CellGrid,
    mover: GameCharacter,
    seen: readonly GameCharacter[],
    rules: RoomRules,
    allied: PartyAlliance
  ): HeldGround | null {
    const cutsCorners = allowsDiagonal(rules.diagonalMove);
    const foes = seen.filter((piece) => isHostileTo(piece, mover, rules.hostilityBy, allied));
    if (!rules.zocEngages) {
      const held = zoneOfControl(grid, foes, rules.zocRange, cutsCorners);
      return held.isEmpty ? null : { held, fights: null };
    }
    if (foes.length < 1) return null;

    const caught = engagementOf(engagementsOn(grid, seen, cutsCorners, rules.hostilityBy, allied), mover);
    const held = zoneOfControl(grid, holdersOf(mover, foes, caught), rules.zocRange, cutsCorners);
    const fights = fightsByCell(grid, mover, seen, rules.engagementCountsSize, cutsCorners, rules.hostilityBy, allied);
    return { held: held.isEmpty ? null : held, fights };
  }
}

/** The ground held against a piece, and the fights it would have to walk out of to get anywhere. */
interface HeldGround {
  held: CellBits | null;
  fights: Fights | null;
}

/**
 * Who holds ground against the piece being moved.
 *
 * The fight it is in holds it whole, so the pieces on its own side are in the reckoning too:
 * standing among friends is standing in the thick of it, not standing clear.
 */
function holdersOf(mover: GameCharacter, foes: readonly GameCharacter[], caught: Engagement | null): GameCharacter[] {
  const holding = new Map<string, GameCharacter>();
  for (const piece of foes) holding.set(piece.identifier, piece);
  for (const piece of caught?.members ?? []) holding.set(piece.identifier, piece);
  holding.delete(mover.identifier);
  return [...holding.values()];
}

/** The cells a walk ends on: ground an enemy holds, where the table stops a piece there, and zones that hold it. */
function stopsWhere(held: CellBits | null, zones: CellBits | null): ((index: number) => boolean) | undefined {
  if (!held && !zones) return undefined;
  return (index) => (held?.get(index) ?? false) || (zones?.get(index) ?? false);
}
