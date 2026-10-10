import { emitSelectGameTable, selectGameTable$ } from '@axe/core/event/domain-events';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';

@SyncObject('TableSelecter')
export class TableSelecter extends GameObject {
  private static _instance: TableSelecter;
  /**
   * The room's one table selecter: the synced one once it has arrived, otherwise a local one made
   * on first use.
   */
  static get instance(): TableSelecter {
    const stored = ObjectStore.instance.get<TableSelecter>('TableSelecter');
    if (stored) return (TableSelecter._instance = stored);
    if (!TableSelecter._instance) TableSelecter._instance = new TableSelecter('TableSelecter');
    TableSelecter._instance.initialize();
    return TableSelecter._instance;
  }

  @SyncVar() viewTableIdentifier: string = '';
  private cleanups: (() => void)[] = [];

  // GameObject Lifecycle
  /**
   * Starts following table selection: the table chosen becomes the viewed one and is marked
   * selected, and the one before is unmarked.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.cleanups.push(
      selectGameTable$.subscribe((data) => {
        if (this.viewTable) this.viewTable.selected = false;
        this.viewTableIdentifier = data.identifier;
        if (this.viewTable) this.viewTable.selected = true;
      })
    );
  }

  // GameObject Lifecycle
  /** Stops following table selection. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  /**
   * The table being viewed, or null when the room has no table.
   *
   * When the chosen table cannot be found it falls back to the first table, and adopts that one as
   * chosen, announcing the selection, if the stored choice was empty or deleted.
   */
  get viewTable(): GameTable | null {
    let table: GameTable | null = ObjectStore.instance.get<GameTable>(this.viewTableIdentifier);
    if (!table) {
      table = ObjectStore.instance.getObjects<GameTable>(GameTable)[0] ?? null;
      if (table && (this.viewTableIdentifier.length < 1 || ObjectStore.instance.isDeleted(this.viewTableIdentifier))) {
        this.viewTableIdentifier = table.identifier;
        emitSelectGameTable({ identifier: table.identifier });
      }
    }
    return table;
  }
}
