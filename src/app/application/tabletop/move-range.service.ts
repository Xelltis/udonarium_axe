import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { characterSceneKey } from '@axe/application/tabletop/vision-scene-assembly';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_MOVE_REACH_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
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
import { moveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { reachableCells, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';
import { isHostileTo, zoneOfControl } from '@axe/domain/tabletop/move/zone-of-control';
import { resolveRoomRules, RoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

/** How many pieces' reaches are kept at once, well above what a table draws. */
const REACH_CACHE_LIMIT = 64;

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
  return `${grid.cols}:${grid.rows}:${grid.sizePx}:${grid.type}`;
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
  walk: number;
  blocked: CellBits;
  /** The same, for a piece that means to jump: height stops it no longer, sheer faces still do. */
  leapt: CellBits;
  options: ReachOptions;
}

/** Everything a walk is worked out from, for anyone who wants to work out a different one. */
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
  show(character: GameCharacter): void {
    this.held.set(this.build(character)?.view ?? null);
  }

  /** Stops showing a carried piece's reach, leaving whatever the picked piece shows. */
  hide(): void {
    if (this.held() !== null) this.held.set(null);
  }

  /** Everything a piece's reach was worked out from, or nothing where it has none. */
  termsOf(character: GameCharacter): ReachTerms | null {
    const built = this.build(character);
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

  /** What the table is played by, which the room answers for wherever it has been asked. */
  private rulesOf(table: GameTable | null): RoomRules {
    return resolveRoomRules(this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null, table);
  }

  /** Whether a piece has a reach to be had at all, told without working one out. */
  canPlan(character: GameCharacter): boolean {
    return this.opening(character) !== null;
  }

  /**
   * The reach drawn for a piece somebody else is moving, kept until the ground or the pieces
   * standing on it change.
   *
   * The way they are drawing is theirs and comes over the wire; the reach around it is worked out
   * here, and a peer moving their pointer changes neither the ground nor where anybody stands.
   */
  shownReachOf(character: GameCharacter, jumping: boolean): { grid: CellGrid; cells: CellBits } | null {
    const held = this.reachEntry(character);
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

  private raster: { token: object; gridKey: string; blocked: CellBits; leapt: CellBits } | null = null;
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
    this.terrainToken();
    // What tells a piece the reader cannot see from one they can, which shapes the ground held
    // against them.
    this.vision.scene();
    this.vision.viewer();
    this.vision.overlayVision();
    this.vision.foundPieces();
    return {};
  });

  private readonly reaches = new Map<string, ReachEntry>();

  private reachEntry(character: GameCharacter): ReachEntry | null {
    const token = this.reachToken();
    const version = this.objectChange.versionOf(character.identifier)();
    const held = this.reaches.get(character.identifier);
    if (held && held.token === token && held.version === version) return held;
    const entry: ReachEntry = { token, version, built: this.build(character, true) };
    if (this.reaches.size >= REACH_CACHE_LIMIT) this.reaches.clear();
    this.reaches.set(character.identifier, entry);
    return entry;
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

  /**
   * Works a piece's reach out.
   *
   * `reuse` takes the ground from the rasterised board kept for the terrain as it stands, which a
   * caller reading through the signals may do. A caller asking outright is answered from the table
   * itself, since a wall that has just moved has not told anybody yet.
   */
  private build(character: GameCharacter, reuse = false): BuiltReach | null {
    const opened = this.opening(character);
    if (!opened) return null;
    perfCounters.bump(PERF_MOVE_REACH_BUILD);
    const { table, rules, walk } = opened;

    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const start = pieceCellOf(grid, character, table.gridSize);
    if (start < 0) return null;

    const paved = reuse ? this.rasterFor(grid) : null;
    const blocked = paved ? paved.blocked.copy() : blockedByTerrain(grid, table.terrains);
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

    const standing = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    // Two pieces that may not share a cell may not pass through one either: the ground
    // somebody stands on is in the way, and a reach has to go round it.
    if (!rules.piecesShareCells) otherwise.or(occupiedCells(grid, standing, character.identifier));

    const mode = rules.zocMode;
    const ground = mode === 'none' ? null : this.heldGroundAround(grid, character, standing, rules);
    const held = ground?.held ?? null;
    if (held && mode === 'block') otherwise.or(held);
    blocked.or(otherwise);
    leapt.or(otherwise);
    const extra = Math.max(0, Math.floor(rules.zocExtraCost));
    const fights = rules.breakOutMode === 'free' ? null : (ground?.fights ?? null);
    const flat = Math.max(0, Math.floor(rules.breakOutCost));
    const charges = (held !== null && mode === 'cost') || fights !== null;

    const options: ReachOptions = {
      diagonals: rules.diagonalMove,
      costOf: charges
        ? (index, from) => {
            const price = held && mode === 'cost' && held.get(index) ? 1 + extra : 1;
            if (!fights || !leavesFight(fights, from, index)) return price;
            return price + breakOutToll(rules.breakOutMode, fights.prices[from], flat);
          }
        : undefined,
      stopsAt: held && mode === 'stop' ? (index) => held.get(index) : undefined,
    };
    const cells = reachableCells(grid, start, walk, (index) => blocked.get(index), options);
    return {
      view: { characterIdentifier: character.identifier, grid, cells, held, showsReach: true },
      terms: { walk, blocked, leapt, options },
      start,
    };
  }

  /**
   * The ground the enemies on the board hold against this piece.
   *
   * Only the ones the person moving can see hold any: a range with a bite taken out of it
   * where nobody is standing tells the table there is something in the dark there, which is
   * the one thing the fog is for.
   *
   * Where the table holds a fight as one place rather than as pairs, the whole of the fight
   * this piece is in holds it, allies and all, and getting out of it costs what the two sides
   * come to when they are weighed against one another. A side that outweighs the other walks
   * away as though the fight were not there, which is the whole of what breaking through is.
   */
  private heldGroundAround(
    grid: CellGrid,
    mover: GameCharacter,
    standing: readonly GameCharacter[],
    rules: RoomRules
  ): HeldGround | null {
    const cutsCorners = allowsDiagonal(rules.diagonalMove);
    const seen = standing.filter((piece) => piece.identifier === mover.identifier || this.vision.isTokenVisible(piece));
    const foes = seen.filter((piece) => isHostileTo(piece, mover));
    if (!rules.zocEngages) {
      const held = zoneOfControl(grid, foes, rules.zocRange, cutsCorners);
      return held.isEmpty ? null : { held, fights: null };
    }
    if (foes.length < 1) return null;

    const caught = engagementOf(engagementsOn(grid, seen, cutsCorners), mover);
    const held = zoneOfControl(grid, holdersOf(mover, foes, caught), rules.zocRange, cutsCorners);
    const fights = fightsByCell(grid, mover, seen, rules.engagementCountsSize, cutsCorners);
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
