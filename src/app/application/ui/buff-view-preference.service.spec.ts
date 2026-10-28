import { TestBed } from '@angular/core/testing';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';

describe('BuffViewPreferenceService', () => {
  const STORAGE_KEY = 'ui-buff-view';
  const SCALE_KEY = 'ui-buff-icon-scale';

  function service(): BuffViewPreferenceService {
    TestBed.resetTestingModule();
    return TestBed.inject(BuffViewPreferenceService);
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCALE_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCALE_KEY);
  });

  it('starts on the icons', () => {
    expect(service().mode()).toBe('icon');
  });

  it('walks the modes on and writes each one down', () => {
    const preference = service();

    preference.cycle();

    expect(preference.mode()).toBe('detail');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('detail');
  });

  it('takes up where the last session left off', () => {
    localStorage.setItem(STORAGE_KEY, 'count');

    expect(service().mode()).toBe('count');
  });

  it('falls back to the icons on a stored value it does not know', () => {
    localStorage.setItem(STORAGE_KEY, 'nonsense');

    expect(service().mode()).toBe('icon');
  });

  it('draws the icons at their usual size until told otherwise', () => {
    expect(service().iconScale()).toBe(100);
  });

  it('steps the icons up a size at a time, writes each one down, and takes it up again next time', () => {
    const preference = service();

    preference.cycleIconScale();
    preference.cycleIconScale();

    expect(preference.iconScale()).toBe(150);
    expect(localStorage.getItem(SCALE_KEY)).toBe('150');
    expect(service().iconScale()).toBe(150);
  });
});
