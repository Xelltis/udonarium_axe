import { TestBed } from '@angular/core/testing';
import { LOCAL_MODE_STORAGE_KEY, LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';

describe('LocalModePreferenceService', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.removeItem(LOCAL_MODE_STORAGE_KEY));

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
    expect(localStorage.getItem(LOCAL_MODE_STORAGE_KEY)).toBeNull();
  });
});
