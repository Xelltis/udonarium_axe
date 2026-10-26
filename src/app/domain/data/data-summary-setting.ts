import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { splitSummaryTags } from '@axe/domain/data/summary-tag-list';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/** One step of the inventory's order: the data it reads and which way it runs. */
export interface SortKey {
  readonly tag: string;
  readonly order: SortOrder;
}

/**
 * Reads the steps of the order kept after the second, as they were sent or saved.
 *
 * Text that is not such a list gives none, so a room from a version that knew only two steps sorts
 * as it did. An entry without a name is passed over, and one without a direction it knows runs
 * ascending. A step with an empty name is kept: it is a row the room added and has yet to fill.
 */
export function readSortKeys(raw: unknown): SortKey[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const keys: SortKey[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const { tag, order } = entry as Record<string, unknown>;
      if (typeof tag !== 'string') continue;
      keys.push({ tag, order: order === SortOrder.DESC ? SortOrder.DESC : SortOrder.ASC });
    }
    return keys;
  } catch {
    return [];
  }
}

/** Writes steps of the order down as the text `readSortKeys` reads back. Empty when there are none. */
export function writeSortKeys(keys: readonly SortKey[]): string {
  return keys.length > 0 ? JSON.stringify(keys.map(({ tag, order }) => ({ tag, order }))) : '';
}

@SyncObject('summary-setting')
export class DataSummarySetting extends GameObject implements InnerXml {
  private static _instance: DataSummarySetting;
  /**
   * The room's one summary setting, shared by every peer under a fixed identifier.
   *
   * Prefers the copy already in the object store, such as one received from another peer, and creates and
   * registers it when there is none yet.
   */
  static get instance(): DataSummarySetting {
    const stored = ObjectStore.instance.get<DataSummarySetting>('DataSummarySetting');
    if (stored) return (DataSummarySetting._instance = stored);
    if (!DataSummarySetting._instance) DataSummarySetting._instance = new DataSummarySetting('DataSummarySetting');
    DataSummarySetting._instance.initialize();
    return DataSummarySetting._instance;
  }

  /**
   * Forgets the setting held here, so that the next reader is given one with the defaults.
   *
   * The setting is held here as well as in the store. Emptying the store leaves this one holding
   * whatever a room chose, sorting and columns alike, and it goes back into the store the moment it
   * is read. Only a test between two of its own has any reason to say this.
   */
  static forget(): void {
    DataSummarySetting._instance = undefined as unknown as DataSummarySetting;
  }

  /**
   * What the room chose to be read by, and nothing until it chooses.
   *
   * Starting these on the names the sample sheet happens to use would leave a room built out of
   * imported sheets sorting by a status nothing carries and showing columns that resolve to
   * nothing at all. A room says what matters to it; where it has said nothing, the views work
   * it out from the pieces on the table (`application/inventory/summary-items`), and the room
   * that is set out with the samples is handed the samples' own vocabulary.
   */
  @SyncVar() sortTag: string = '';
  @SyncVar() sortOrder: SortOrder = SortOrder.DESC;

  @SyncVar() sortTag2nd: string = 'name';
  @SyncVar() sortOrder2nd: SortOrder = SortOrder.ASC;

  /**
   * The steps of the order after the second, written by `writeSortKeys`. The first two keep the
   * attributes they always had, so a version that knows only those still reads them.
   */
  @SyncVar() sortMore: string = '';

  @SyncVar() dataTag: string = '';
  @SyncVar() tableDataTag: string = '';

  @SyncVar() folderPaths: string[] = [];

  private _sortMore!: string;
  private _extraSortKeys!: readonly SortKey[];
  /** The steps of the order after the second, read from `sortMore` and cached. */
  get extraSortKeys(): readonly SortKey[] {
    if (this._sortMore !== this.sortMore) {
      this._sortMore = this.sortMore;
      this._extraSortKeys = readSortKeys(this.sortMore);
    }
    return this._extraSortKeys;
  }
  set extraSortKeys(keys: readonly SortKey[]) {
    this.sortMore = writeSortKeys(keys);
  }

  /** Every step of the order, the first and second followed by the rest. */
  get sortKeys(): readonly SortKey[] {
    return [
      { tag: this.sortTag, order: this.sortOrder },
      { tag: this.sortTag2nd, order: this.sortOrder2nd },
      ...this.extraSortKeys,
    ];
  }

  private _dataTag!: string;
  private _dataTags!: string[];
  /** The display items the room lists for each piece in the inventory, split from `dataTag` and cached. */
  get dataTags(): string[] {
    if (this._dataTag !== this.dataTag) {
      this._dataTag = this.dataTag;
      this._dataTags = splitSummaryTags(this.dataTag);
    }
    return this._dataTags;
  }

  private _tableDataTag!: string;
  private _tableDataTags!: string[];
  /** The display items shown as columns when the inventory is laid out as a table, split from `tableDataTag`. */
  get tableDataTags(): string[] {
    if (this._tableDataTag !== this.tableDataTag) {
      this._tableDataTag = this.tableDataTag;
      this._tableDataTags = splitSummaryTags(this.tableDataTag);
    }
    return this._tableDataTags;
  }

  /** The setting saves only its attributes, so it writes no inner XML. */
  innerXml(): string {
    return '';
  }
  /**
   * Loading a saved room copies the saved settings onto the room's existing instance and discards this copy.
   *
   * This keeps a single summary setting in the room rather than adding a second one from the save file.
   */
  parseInnerXml(_element: Element) {
    // updates the existing object rather than making one from the saved data
    const context = DataSummarySetting.instance.toContext();
    context.syncData = this.toContext().syncData;
    DataSummarySetting.instance.apply(context);
    DataSummarySetting.instance.update();

    this.destroy();
  }
}
