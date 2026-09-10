import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
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
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { moveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { reachableCells, ReachOptions } from '@axe/domain/tabletop/move/reachable-cells';
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
  /** The same, for a piece that means to jump: height stops it no longer, sheer faces still do. */
  leapt: CellBits;
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
    this.held.set(this.build(character)?.view ?? null);
  }

  hide(): void {
    if (this.held() !== null) this.held.set(null);
  }

  /** Everything a piece's reach was worked out from, or nothing where it has none. */
  termsOf(character: GameCharacter): ReachTerms | null {
    const built = this.build(character);
    if (!built) return null;
    return { ...built.terms, grid: built.view.grid, start: built.start, cells: built.view.cells };
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
    const start = pieceCellOf(grid, character, table.gridSize);
    if (start < 0) return null;

    const blocked = blockedByTerrain(grid, table.terrains);
    // Only the terrain differs between walking and jumping; everything else stands in the way
    // of both, so it is gathered once and laid over each of them.
    const leapt = blockedByTerrain(grid, table.terrains, terrainBlocksJump);
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
