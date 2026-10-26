import { TestBed } from '@angular/core/testing';
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';

const STORAGE_KEY = 'ui-inventory-view';

describe('InventoryViewPreferenceService', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  function service(): InventoryViewPreferenceService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(InventoryViewPreferenceService);
  }

  it('starts on the full picture', () => {
    expect(service().mode()).toBe('rich');
  });

  it('remembers what was picked', () => {
    service().set('table');

    expect(service().mode()).toBe('table');
  });

  it('ignores a way of reading it has never heard of', () => {
    localStorage.setItem(STORAGE_KEY, 'minimal');

    expect(service().mode()).toBe('rich');
  });

  it('opens an inventory with its folders open until the reader says otherwise', () => {
    expect(service().foldsOnOpen()).toBe(false);
  });

  it('remembers that an inventory is to open folded up', () => {
    service().setFoldsOnOpen(true);

    expect(service().foldsOnOpen()).toBe(true);
    expect(localStorage.getItem('ui-inventory-folded')).toBe('1');
  });

  it('remembers being told to stop folding them', () => {
    const preference = service();
    preference.setFoldsOnOpen(true);

    preference.setFoldsOnOpen(false);

    expect(preference.foldsOnOpen()).toBe(false);
    expect(localStorage.getItem('ui-inventory-folded')).toBe('');
  });

  describe('the search box above the list', () => {
    afterEach(() => localStorage.removeItem('ui-inventory-search-bar'));

    it('is off until the reader asks for it, as for somebody who has used the inventory all along', () => {
      expect(service().searchBar()).toBe(false);
    });

    it('is remembered once asked for, and once put away again', () => {
      service().setSearchBar(true);
      expect(service().searchBar()).toBe(true);
      expect(localStorage.getItem('ui-inventory-search-bar')).toBe('1');

      service().setSearchBar(false);
      expect(service().searchBar()).toBe(false);
    });

    it('reads anything else written there as off', () => {
      localStorage.setItem('ui-inventory-search-bar', 'yes');

      expect(service().searchBar()).toBe(false);
    });
  });

  describe('the round strip waiting for a round to begin', () => {
    afterEach(() => localStorage.removeItem('ui-inventory-round-in-play'));

    it('does not wait until the reader asks it to', () => {
      expect(service().roundInPlay()).toBe(false);
    });

    it('is remembered once asked for', () => {
      service().setRoundInPlay(true);

      expect(service().roundInPlay()).toBe(true);
      expect(localStorage.getItem('ui-inventory-round-in-play')).toBe('1');
    });
  });

  describe('the folded rows of the rich view', () => {
    afterEach(() => localStorage.removeItem('ui-inventory-compact'));

    it('does not fold until the reader asks', () => {
      expect(service().compact()).toBe(false);
    });

    it('is remembered once asked for', () => {
      service().setCompact(true);

      expect(service().compact()).toBe(true);
      expect(localStorage.getItem('ui-inventory-compact')).toBe('1');
    });
  });

  it('holds for the session where the browser refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });
    const preference = service();

    expect(() => preference.set('table')).not.toThrow();
    expect(preference.mode()).toBe('table');
    setItem.mockRestore();
  });
});
