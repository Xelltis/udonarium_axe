import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';

function splitDataTag(dataTag: string): string[] {
  return dataTag != null && dataTag.trim().length > 0 ? dataTag.trim().split(/\s+/) : [];
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

@SyncObject('summary-setting')
export class DataSummarySetting extends GameObject implements InnerXml {
  private static _instance: DataSummarySetting;
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
   * These used to start on the names the sample sheet happens to use, which left a room built
   * out of imported sheets sorting by a status nothing carried and showing columns that
   * resolved to nothing at all. A room says what matters to it; where it has said nothing, the
   * views work it out from the pieces on the table (`application/inventory/summary-items`), and
   * the room that is set out with the samples is handed the samples' own vocabulary.
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
  get dataTags(): string[] {
    if (this._dataTag !== this.dataTag) {
      this._dataTag = this.dataTag;
      this._dataTags = splitDataTag(this.dataTag);
    }
    return this._dataTags;
  }

  private _tableDataTag!: string;
  private _tableDataTags!: string[];
  get tableDataTags(): string[] {
    if (this._tableDataTag !== this.tableDataTag) {
      this._tableDataTag = this.tableDataTag;
      this._tableDataTags = splitDataTag(this.tableDataTag);
    }
    return this._tableDataTags;
  }

  innerXml(): string {
    return '';
  }
  parseInnerXml(_element: Element) {
    // updates the existing object rather than making one from the saved data
    const context = DataSummarySetting.instance.toContext();
    context.syncData = this.toContext().syncData;
    DataSummarySetting.instance.apply(context);
    DataSummarySetting.instance.update();

    this.destroy();
  }
}
