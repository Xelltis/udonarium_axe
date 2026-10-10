import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { wipeBrowserDataIfRequested } from '@axe/core/storage/browser-data-wipe';
import { BrowserDataWipeService } from '@axe/features/room-settings/browser-data-wipe.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BrowserDataWipeService', () => {
  let service: BrowserDataWipeService;
  let ask: ReturnType<typeof vi.spyOn>;
  let reload: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(BrowserDataWipeService);
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
    reload = vi.spyOn(service, 'reload').mockImplementation(() => {});
    vi.stubGlobal('indexedDB', undefined);
    localStorage.setItem('ui-theme', 'dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('asks first, as something that cannot be undone, and leaves everything when the reader says no', async () => {
    const t = TestBed.inject(TRANSLATE_FN);
    ask.mockResolvedValue(false);

    expect(await service.wipe()).toBe(false);

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ title: t('feature.roomSettings.wipeConfirmTitle'), danger: true })
    );
    expect(reload).not.toHaveBeenCalled();
    expect(await wipeBrowserDataIfRequested()).toBe(false);
    expect(localStorage.getItem('ui-theme')).toBe('dark');
  });

  it('asks the next load to wipe, and loads the page again', async () => {
    ask.mockResolvedValue(true);

    expect(await service.wipe()).toBe(true);

    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem('ui-theme')).toBe('dark');
    expect(await wipeBrowserDataIfRequested()).toBe(true);
    expect(localStorage.getItem('ui-theme')).toBeNull();
  });

  it('wipes here and now where the next load cannot be asked', async () => {
    ask.mockResolvedValue(true);
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('refused');
      },
      clear: () => {},
    });

    await service.wipe();

    expect(localStorage.getItem('ui-theme')).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });
});
