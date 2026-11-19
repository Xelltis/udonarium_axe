import { EnvironmentProviders, Provider } from '@angular/core';
import { LoggerService } from '@axe/application/logging/logger.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Logger, LogLevel } from '@axe/core/logging/logger';
import { provideTranslocoTesting } from '@axe/testing/transloco-testing';

/**
 * The providers every TestBed module is given: only what the app provides outside the root
 * injector, and the logger quietened. A service provided in the root is found by any module that
 * asks for it, so naming it here would only load it, and all it reaches, into every spec.
 *
 * The test setup loads this, and what it imports, only for a spec that builds a TestBed module; the
 * picker of the specs to run reads it as such by its path (`scripts/vitest-reach.mjs`).
 */
export function testBedProviders(): (Provider | EnvironmentProviders)[] {
  return [
    // The service turns logging up to what the build calls for as it is made, which outside
    // production is everything. Made for a test, it leaves the level where the setup put it.
    {
      provide: LoggerService,
      useFactory: () => {
        const service = new LoggerService();
        Logger.setLevel(LogLevel.NONE);
        return service;
      },
    },
    PanelService,
    ...provideTranslocoTesting(),
  ];
}
