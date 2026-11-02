import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { applyGroundDab, GroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import { GroundChunkData } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { ensureGroundFieldOn, groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import {
  FLAT_GROUND,
  GroundSurface,
  groundSurfaceOf,
  lowestGroundPxIn,
} from '@axe/domain/tabletop/ground/ground-surface';

/**
 * The raised, sunk and painted ground of the table in view, which what stands on the floor stands
 * on. A piece keeps the height it is put at over the board, as a version that knows nothing of the
 * ground reads it; the ground is added where it is drawn and judged.
 */
@Injectable({ providedIn: 'root' })
export class GroundService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletop = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);

  /** The ground of the table in view; flat where it keeps none. Follows every change to its chunks. */
  readonly surface = computed<GroundSurface>(() => {
    const table = this.tabletop.currentTableVersion();
    this.objectChange.collectionOf('ground-field')();
    this.objectChange.collectionOf('ground-chunk')();
    const field = groundFieldOn(table);
    if (!field) return FLAT_GROUND;
    this.objectChange.versionOf(field.identifier)();
    for (const chunk of field.children) this.objectChange.versionOf(chunk.identifier)();
    return groundSurfaceOf(field.readChunks());
  });

  /**
   * The others in the room whose version knows nothing of the ground, to whom the table is flat and
   * what stands on it stands on the board.
   */
  readonly unawarePeers = computed<readonly PeerCursor[]>(() => {
    this.objectChange.collectionOf(PeerCursor.aliasName)();
    const mine = PeerCursor.myCursor;
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).filter((cursor) => {
      this.objectChange.versionOf(cursor.identifier)();
      return cursor !== mine && cursor.peerId.length > 0 && cursor.groundProtocol !== '1';
    });
  });

  constructor() {
    // Said on this peer's cursor from the moment it is here, so a master shaping the ground knows
    // whom it reaches.
    effect(() => {
      this.objectChange.collectionOf(PeerCursor.aliasName)();
      const mine = PeerCursor.myCursor;
      if (mine && mine.groundProtocol !== '1') untracked(() => (mine.groundProtocol = '1'));
    });
  }

  /** How high the ground stands at a point of the board, in table pixels. */
  heightPxAt(x: number, y: number): number {
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    if (!(gridSize > 0)) return 0;
    return untracked(this.surface).heightAt(x / gridSize, y / gridSize) * gridSize;
  }

  /** How far the ground under a box of the board lifts what stands on it, in table pixels (`lowestGroundPxIn`). */
  lowestPxIn(x: number, y: number, width: number, height: number): number {
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    return lowestGroundPxIn(untracked(this.surface), gridSize, x, y, width, height);
  }

  /**
   * Lays a dab of the brush on the ground of the table in view, keeping the chunks it changes on the
   * table, and hands them back. The change syncs to every peer.
   */
  dab(dab: GroundDab): GroundChunkData[] {
    const table = this.tabletop.currentTable;
    if (!table.identifier) return [];
    const field = ensureGroundFieldOn(table);
    const changed = applyGroundDab(field.readChunks(), dab);
    for (const chunk of changed) field.writeChunk(chunk);
    return changed;
  }
}
