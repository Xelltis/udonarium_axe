import { inject, TestBed } from '@angular/core/testing';
import { AppConfigService, isLocalModeSearch } from '@axe/composition/app-config.service';

describe('AppConfigService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppConfigService],
    });
  });

  it('should be created', inject([AppConfigService], (service: AppConfigService) => {
    expect(service).toBeTruthy();
  }));

  it.each(['?local=1', '?local=true', '?foo=bar&local=1'])('recognizes local mode in %s', (search) => {
    expect(isLocalModeSearch(search)).toBe(true);
  });

  it.each(['', '?local=0', '?local=false', '?local=yes'])('keeps networking enabled for %s', (search) => {
    expect(isLocalModeSearch(search)).toBe(false);
  });
});
