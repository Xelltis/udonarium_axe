import { TestBed } from '@angular/core/testing';
import { SheetViewPreferenceService } from '@axe/application/ui/sheet-view-preference.service';

const STORAGE_KEY = 'ui-sheet-folded';

describe('SheetViewPreferenceService', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  function service(): SheetViewPreferenceService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(SheetViewPreferenceService);
  }

  it('opens every section until the reader folds one', () => {
    expect(service().isFolded('スキル')).toBe(false);
  });

  it('remembers a folded section in this browser', () => {
    service().setFolded('スキル', true);

    expect(service().isFolded('スキル')).toBe(true);
  });

  it('opens a folded section again', () => {
    const preference = service();
    preference.setFolded('スキル', true);
    preference.setFolded('スキル', false);

    expect(service().isFolded('スキル')).toBe(false);
  });

  it('folds or opens a whole sheet at once, leaving other sheets alone', () => {
    const preference = service();
    preference.setFolded('装備', true);
    preference.setAllFolded(['スキル', 'パーツ'], true);
    expect(['スキル', 'パーツ', '装備'].map((name) => preference.isFolded(name))).toEqual([true, true, true]);

    preference.setAllFolded(['スキル', 'パーツ'], false);
    expect(['スキル', 'パーツ', '装備'].map((name) => preference.isFolded(name))).toEqual([false, false, true]);
  });

  it('opens everything when what was written down cannot be read', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');

    expect(service().isFolded('スキル')).toBe(false);
  });
});
