import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CellBits, decodeCellBits, encodeCellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, sameCellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';

@SyncObject('fog-memory')
export class FogMemory extends ObjectNode {
  @SyncVar() cols: number = 0;
  @SyncVar() rows: number = 0;
  @SyncVar() gridType: GridType = GridType.SQUARE;
  @SyncVar() bits: string = '';
  /**
   * The pieces the party has laid eyes on, by identifier.
   *
   * Kept beside the ground rather than on the pieces themselves: it is the party's record of
   * what it has met, it is thrown away when the record is, and a piece carries no opinion
   * about who has seen it.
   */
  @SyncVar() found: string = '';
  /**
   * Bumped whenever the record is thrown away.
   *
   * Every client keeps its own running total of what the party has been shown, and would
   * write that total back over an empty record the moment one arrived. The count says which
   * record a total belongs to, so a clearing reaches the totals as well as the field.
   */
  @SyncVar() generation: number = 0;

  /**
   * The grid the stored record was written for. Its cell size is left at 0, since only how the
   * cells are numbered matters here.
   */
  get grid(): CellGrid {
    return { cols: this.cols, rows: this.rows, type: this.gridType, sizePx: 0 };
  }

  /** Whether the stored record was written for a grid numbered the same way as this one. */
  matches(grid: CellGrid): boolean {
    return sameCellGrid(this.grid, grid);
  }

  /**
   * The cells the party has explored, read for this grid.
   *
   * A record written for a different grid cannot be read cell for cell, so it reads as nothing
   * explored.
   */
  read(grid: CellGrid): CellBits {
    const count = cellCount(grid);
    if (!this.matches(grid)) return new CellBits(count);
    return decodeCellBits(this.bits, count);
  }

  /**
   * Stores the explored cells together with the grid they belong to. The change syncs to every
   * peer.
   */
  write(grid: CellGrid, bits: CellBits): void {
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.gridType = grid.type;
    this.bits = encodeCellBits(bits);
  }

  /** The identifiers of the pieces the party has found. */
  readFound(): Set<string> {
    return new Set(this.found.length > 0 ? this.found.split(' ') : []);
  }

  /**
   * Stores the pieces the party has found, sorted so that the same set always writes the same text.
   */
  writeFound(found: ReadonlySet<string>): void {
    this.found = [...found].sort().join(' ');
  }

  /**
   * Forgets every explored cell and found piece, and bumps the generation so that clients drop the
   * totals they were keeping for the old record.
   */
  reset(): void {
    this.bits = '';
    this.found = '';
    this.generation = (this.generation + 1) % 1_000_000;
  }
}

/** The fog record hanging on a table, or null when none has been made yet. */
export function fogMemoryOn(table: GameTable): FogMemory | null {
  return table.children.find((child): child is FogMemory => child instanceof FogMemory) ?? null;
}

/**
 * The name the record of a table goes under.
 *
 * Named after the table rather than given one of its own, so that two clients which both
 * believe themselves the scribe write the same record instead of hanging a second one on the
 * table. Two records would leave half the room reading one the other half never wrote to,
 * and a clearing would reach only one of them.
 */
export function fogMemoryIdentifierOf(table: GameTable): string {
  return `fog-memory_${table.identifier}`;
}

/**
 * The fog record hanging on a table, made and attached under the table's own name when there is
 * none.
 *
 * The new record is a synced child of the table, so making it reaches every peer.
 */
export function ensureFogMemoryOn(table: GameTable): FogMemory {
  const held = fogMemoryOn(table);
  if (held) return held;
  const memory = new FogMemory(fogMemoryIdentifierOf(table));
  memory.initialize();
  table.appendChild(memory);
  return memory;
}
