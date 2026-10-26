import { TestBed } from '@angular/core/testing';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { refuseLocalStorage } from '@axe/testing/refused-storage';

describe('MobileLayoutService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('still takes the desktop layout where the browser refuses to keep the choice', () => {
    refuseLocalStorage();
    const service = TestBed.inject(MobileLayoutService);

    service.useDesktopLayout();
    TestBed.tick();

    expect(service.prefersDesktop()).toBe(true);
  });
});
