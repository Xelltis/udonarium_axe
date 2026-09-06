import { inject, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { AppConfigService } from '@axe/composition/app-config.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AppConfigService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, AppConfigService],
    });
  });

  it('should be created', inject([AppConfigService], (service: AppConfigService) => {
    expect(service).toBeTruthy();
  }));

  it('starts the room on its own when this browser asked for local mode', async () => {
    TestBed.inject(LocalModePreferenceService).set(true);
    const loaded = new Promise<boolean>((resolve) =>
      TestBed.inject(ObjectChangeService).loadConfig$.subscribe((event) =>
        resolve((event.config as { localMode: boolean }).localMode)
      )
    );
    const fetched = vi.spyOn(globalThis, 'fetch');

    TestBed.inject(AppConfigService).initialize();

    expect(await loaded).toBe(true);
    expect(fetched).not.toHaveBeenCalled();
  });
});
