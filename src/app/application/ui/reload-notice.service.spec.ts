import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';
import { Logger } from '@axe/core/logging/logger';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReloadNoticeService', () => {
  let service: ReloadNoticeService;
  let ask: ReturnType<typeof vi.fn>;
  const reload = vi.fn<() => void>();

  function freshService(): ReloadNoticeService {
    const made = TestBed.runInInjectionContext(() => new ReloadNoticeService());
    (made as unknown as { reload: () => void }).reload = reload;
    return made;
  }

  beforeEach(() => {
    ask = vi.fn().mockResolvedValue(false);
    reload.mockReset();
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: TRANSLATE_FN, useValue: (key: string) => key }],
    });
    TestBed.overrideProvider(ConfirmService, { useValue: { ask } });
    service = freshService();
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('asks the reader to reload, offering to do it and to leave it for later', () => {
    service.tellReloadNeeded();

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith({
      title: 'common.dialog.updatedTitle',
      message: 'common.dialog.updatedMessage',
      okLabel: 'common.dialog.reload',
      cancelLabel: 'common.dialog.later',
    });
  });

  it('asks only once for the page, however many parts fail after it', () => {
    service.tellReloadNeeded();
    service.tellReloadNeeded();
    service.tellReloadNeeded();

    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('leaves the page as it is when the reader puts it off', async () => {
    service.tellReloadNeeded();
    await vi.waitFor(() => expect(ask).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads when the reader says so', async () => {
    ask.mockResolvedValue(true);

    service.tellReloadNeeded();

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('asks when a loader it watches cannot fetch, and still rejects', async () => {
    const failure = new TypeError('Failed to fetch dynamically imported module');
    const load = service.noticingFailure(() => Promise.reject(failure));

    await expect(load()).rejects.toBe(failure);

    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the loader it watches arrives', async () => {
    const load = service.noticingFailure(() => Promise.resolve('panel'));

    await expect(load()).resolves.toBe('panel');

    expect(ask).not.toHaveBeenCalled();
  });
});
