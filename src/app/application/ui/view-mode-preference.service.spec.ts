import { TestBed } from '@angular/core/testing';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';

describe('ViewModePreferenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [ViewModePreferenceService] });
  });

  afterEach(() => localStorage.clear());

  it('looks along the table until somebody asks otherwise', () => {
    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('perspective');
  });

  it('remembers the choice for the next window', () => {
    TestBed.inject(ViewModePreferenceService).choose('flat');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ViewModePreferenceService] });

    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('flat');
  });

  it('reads a way of looking it does not know as the one it starts on', () => {
    localStorage.setItem('ui-view-mode', 'sideways');

    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('perspective');
  });
});
