import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { splitSummaryTags } from '@axe/domain/data/summary-tag-list';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
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

  @SyncVar() dataTag: string = '';
  @SyncVar() tableDataTag: string = '';

  @SyncVar() folderPaths: string[] = [];

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
