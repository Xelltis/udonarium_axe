import { TestBed } from '@angular/core/testing';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

describe('LocalModePreferenceService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.localMode);
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEYS.localMode));

  it('goes online until this browser says otherwise', () => {
    expect(TestBed.inject(LocalModePreferenceService).enabled()).toBe(false);
  });

  it('remembers the choice for the next load, which is when it takes effect', () => {
    TestBed.inject(LocalModePreferenceService).set(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(LocalModePreferenceService).enabled()).toBe(true);
  });

  it('leaves nothing behind once the browser goes back online', () => {
    const service = TestBed.inject(LocalModePreferenceService);
    service.set(true);
    service.set(false);

    expect(service.enabled()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.localMode)).toBeNull();
  });
});
