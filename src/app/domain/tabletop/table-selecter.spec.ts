import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

describe('TableSelecter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    (TableSelecter as unknown as Record<string, unknown>)._instance = undefined;
  });

  afterEach(() => {
    (TableSelecter as unknown as Record<string, unknown>)._instance = undefined;
    vi.restoreAllMocks();
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      const instance1 = TableSelecter.instance;
      const instance2 = TableSelecter.instance;
      expect(instance1).toBe(instance2);
    });

    it('identifies itself as the table selector', () => {
      expect(TableSelecter.instance.identifier).toBe('TableSelecter');
    });

    it('makes one anew once the one held has left the store, rather than putting that one back', () => {
      const held = TableSelecter.instance;
      held.viewTableIdentifier = 'table-before';

      ObjectStore.instance.delete(held, false);

      expect(TableSelecter.instance).not.toBe(held);
      expect(TableSelecter.instance.viewTableIdentifier).toBe('');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts naming no table', () => {
      expect(TableSelecter.instance.viewTableIdentifier).toBe('');
    });
  });
});
