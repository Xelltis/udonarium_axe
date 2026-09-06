import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, sameCellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn, fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { fogRules } from '@axe/domain/tabletop/fog/fog-mode';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { FogRecord, mergeFogRecord } from '@axe/features/tabletop/fog-of-war/fog-record';

const FLUSH_DELAY_MS = 1000;

/**
 * Writes down where the party has been.
 *
 * Every client works out the same answer, since it is drawn from the pieces the players own
 * rather than from whoever happens to be looking, so what is written is only ever a copy of
 * what each of them already holds. One of them does the writing all the same, because the
 * field is settled by whichever version arrives last and two writers would take turns
 * undoing each other. What arrives is merged in rather than taken as the truth, so a
 * handover loses nothing.
 */
@Injectable({ providedIn: 'root' })
export class FogMemoryWriterService {
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly destroyRef = inject(DestroyRef);

  private held: FogRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const shared = this.vision.sharedVisibleCells();
      const table = this.currentTable();
      if (!shared || !table || !table.fogEnabled || !fogRules(table.fogMode).remembersGround) {
        this.forget();
        return;
      }
      const met = fogRules(table.fogMode).tracksFoundPieces ? this.vision.partyVisiblePieces() : new Set<string>();
      this.remember(table, shared.grid, shared.cells, met);
    });
    this.destroyRef.onDestroy(() => this.forget());
  }

  private currentTable(): GameTable | null {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table;
  }

  private forget(): void {
    this.held = null;
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private remember(table: GameTable, grid: CellGrid, visible: CellBits, met: ReadonlySet<string>): void {
    this.objectChange.collectionOf('fog-memory')();
    const memory = fogMemoryOn(table);
    if (memory) this.objectChange.versionOf(memory.identifier)();
    const stored = memory
      ? { generation: memory.generation, bits: memory.read(grid), found: memory.readFound() }
      : null;
    this.held = mergeFogRecord(this.held, grid, stored, visible, met);
    this.schedule(grid);
  }

  private schedule(grid: CellGrid): void {
    if (this.timer !== null || !this.isScribe()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush(grid);
    }, FLUSH_DELAY_MS);
  }

  private flush(grid: CellGrid): void {
    const held = this.held;
    const table = this.tableSelecter.viewTable;
    if (!held || !table || !table.fogEnabled || !fogRules(table.fogMode).remembersGround) return;
    if (!sameCellGrid(held.grid, grid)) return;
    const memory = fogMemoryOn(table);
    if (memory && memory.generation !== held.generation) return;
    const groundKnown = !!memory && memory.matches(grid) && memory.read(grid).covers(held.bits);
    const known = memory?.readFound();
    const metKnown = !known || [...held.found].every((identifier) => known.has(identifier));
    if (groundKnown && metKnown) return;
    const target = memory ?? ensureFogMemoryOn(table);
    target.write(grid, held.bits);
    target.writeFound(held.found);
  }

  /**
   * Whoever writes it down: the game master when one is at the table, and otherwise the first
   * player by name, which every client works out the same way.
   *
   * The exception is the local mode a room is tried out in, which never opens a connection and
   * so never gives anybody a name. Nobody would be chosen and the fog would go unwritten, so
   * the one client there does the writing. Everywhere else the rule is untouched.
   */
  private isScribe(): boolean {
    if (this.isLocalMode()) return PeerCursor.myCursor !== null;

    const mine = PeerCursor.myCursor?.userId;
    if (!mine) return false;
    const peers = this.objectStore.getObjects<PeerCursor>(PeerCursor).filter((peer) => peer.userId.length > 0);
    const masters = peers.filter((peer) => peer.isGameMaster).map((peer) => peer.userId);
    const pool = masters.length > 0 ? masters : peers.filter((peer) => peer.isPlayer).map((peer) => peer.userId);
    return pool.length > 0 && pool.sort()[0] === mine;
  }

  /** The same flag the room is started with, read here rather than reached for across the layers. */
  private isLocalMode(): boolean {
    if (typeof location === 'undefined') return false;
    const value = new URLSearchParams(location.search).get('local');
    return value === '1' || value === 'true';
  }
}
