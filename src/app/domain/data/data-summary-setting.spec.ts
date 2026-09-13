import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataSummarySetting, SortOrder } from '@axe/domain/data/data-summary-setting';

describe('DataSummarySetting', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    // Reset singleton
    (DataSummarySetting as unknown as Record<string, unknown>)['_instance'] = undefined;
  });

  describe('SortOrder enum', () => {
    it('ASC = "ASC"', () => {
      expect(SortOrder.ASC).toBe('ASC');
    });

    it('DESC = "DESC"', () => {
      expect(SortOrder.DESC).toBe('DESC');
    });
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      const instance1 = DataSummarySetting.instance;
      const instance2 = DataSummarySetting.instance;
      expect(instance1).toBe(instance2);
    });

    it('identifies itself as the summary setting', () => {
      expect(DataSummarySetting.instance.identifier).toBe('DataSummarySetting');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with nothing to sort by, since only the room knows what it is read by', () => {
      expect(DataSummarySetting.instance.sortTag).toBe('');
    });

    it('starts with the quickest at the top, which is the order a fight is read in', () => {
      expect(DataSummarySetting.instance.sortOrder).toBe(SortOrder.DESC);
    });

    it('starts breaking ties by name', () => {
      expect(DataSummarySetting.instance.sortTag2nd).toBe('name');
    });

    it('breaks them upwards', () => {
      expect(DataSummarySetting.instance.sortOrder2nd).toBe(SortOrder.ASC);
    });

    it('names no items of its own, so nothing of the sample sheet is a default for every room', () => {
      expect(DataSummarySetting.instance.dataTags).toEqual([]);
    });

    it('names none for the table either', () => {
      expect(DataSummarySetting.instance.tableDataTags).toEqual([]);
    });

    it('keeps the two lists apart', () => {
      DataSummarySetting.instance.tableDataTag = 'HP 毒';

      expect(DataSummarySetting.instance.tableDataTags).toEqual(['HP', '毒']);
      expect(DataSummarySetting.instance.dataTags).not.toEqual(['HP', '毒']);
    });
  });

  describe('folderPaths', () => {
    it('starts with no folders of its own', () => {
      expect(DataSummarySetting.instance.folderPaths).toEqual([]);
    });

    it('has no folders when older saved data says nothing about them', () => {
      const restored = ObjectSerializer.instance.parseXml(
        '<summary-setting sortTag="HP"></summary-setting>'
      ) as DataSummarySetting;

      expect(restored.folderPaths).toEqual([]);
    });

    it('writes its folders into saved data', () => {
      DataSummarySetting.instance.folderPaths = ['第1話', '第1話/洞窟'];

      const xml = ObjectSerializer.instance.toXml(DataSummarySetting.instance);

      expect(xml).toContain('folderPaths.0="第1話"');
      expect(xml).toContain('folderPaths.1="第1話/洞窟"');
    });

    it('reads the folders back out of what it wrote', () => {
      // The XML parser behind parseXml rejects a dotted attribute name, so the
      // attributes go straight to the serializer the way a browser would hand them over.
      const syncData = { folderPaths: [] as string[] };

      ObjectSerializer.parseAttributes(syncData, [
        { name: 'folderPaths.0', value: '第1話' },
        { name: 'folderPaths.1', value: '第1話/洞窟' },
      ] as unknown as NamedNodeMap);

      expect(syncData.folderPaths).toEqual(['第1話', '第1話/洞窟']);
    });

    it('reads saved data naming a setting it no longer has without tripping', () => {
      const restored = ObjectSerializer.instance.parseXml(
        '<summary-setting groupByFolder="false" sortTag="HP"></summary-setting>'
      ) as DataSummarySetting;

      expect(restored.sortTag).toBe('HP');
      expect(restored.folderPaths).toEqual([]);
    });
  });

  describe('dataTags', () => {
    it('returns them apart by their spaces', () => {
      DataSummarySetting.instance.dataTag = 'HP MP 敏捷度 精神力';

      expect(DataSummarySetting.instance.dataTags).toEqual(['HP', 'MP', '敏捷度', '精神力']);
    });

    it('keeps a quoted item whole, so a path or a name with a space can be written', () => {
      DataSummarySetting.instance.dataTag = 'HP "リソース/正気度" "所持金 合計"';

      expect(DataSummarySetting.instance.dataTags).toEqual(['HP', 'リソース/正気度', '所持金 合計']);
    });

    it('returns the same list again from the cache', () => {
      const tags1 = DataSummarySetting.instance.dataTags;
      const tags2 = DataSummarySetting.instance.dataTags;
      expect(tags1).toBe(tags2);
    });

    it('builds a new one when the tags change', () => {
      const instance = DataSummarySetting.instance;
      const tags1 = instance.dataTags;
      instance.dataTag = 'HP MP';
      const tags2 = instance.dataTags;
      expect(tags2).toEqual(['HP', 'MP']);
      expect(tags1).not.toBe(tags2);
    });
  });

  describe('innerXml / parseInnerXml', () => {
    it('writes nothing inside itself', () => {
      expect(DataSummarySetting.instance.innerXml()).toBe('');
    });
  });
});
