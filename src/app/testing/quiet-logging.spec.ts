import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@axe/application/logging/logger.service';
import { Logger, LogLevel } from '@axe/core/logging/logger';

describe('logging while the tests run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays quiet once a module has built the logger service', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    TestBed.inject(LoggerService);

    Logger.info('printed into the test run');

    expect(info).not.toHaveBeenCalled();
  });

  it('turns logging up for a test that asks, as the logger specs do', () => {
    Logger.setLevel(LogLevel.DEBUG);

    expect(Logger.getLevel()).toBe(LogLevel.DEBUG);
  });

  it('starts the next test quiet again, whatever the one before it set', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    Logger.info('printed into the test run');

    expect(info).not.toHaveBeenCalled();
  });
});
