import { inject, TestBed } from '@angular/core/testing';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { OVERLAY_BODY_CLASS, OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { AppConfigService, assetServerUrl } from '@axe/composition/app-config.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AppConfigService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, AppConfigService],
    });
    // the preference outlives the test bed in localStorage, so a test that turned it on would leak
    TestBed.inject(LocalModePreferenceService).set(false);
  });

  afterEach(() => {
    AssetHttpStore.instance.configure(null);
    AssetHttpStore.instance.useAccess(null);
    Network.setServerCredentials(null);
    vi.restoreAllMocks();
  });

  const loadConfig = () => TestBed.inject(AppConfigService).initialize();

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

    void TestBed.inject(AppConfigService).initialize();

    expect(await loaded).toBe(true);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('leaves the asset store off with SkyWay, whatever asset server config.json names', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ backend: { url: 'http://localhost:3000' }, assets: { url: 'https://assets.example' } })
      )
    );
    await loadConfig();

    expect(TestBed.inject(AppConfigService).config().transport).toBe('skyway');
    expect(AssetHttpStore.instance.isEnabled).toBe(false);
  });

  it('keeps pictures and sounds in the room server’s room the seat is in, with the room’s token', async () => {
    const access = { roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' };
    const inRoom = vi.spyOn(Network.instance, 'assetAccess', 'get').mockReturnValue(null);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          transport: 'server',
          backend: { url: 'https://rooms.example' },
          assets: { url: 'https://assets.elsewhere.example' },
        })
      )
    );
    await loadConfig();

    expect(AssetHttpStore.instance.isEnabled).toBe(false);
    inRoom.mockReturnValue(access);
    expect(AssetHttpStore.instance.isEnabled).toBe(true);
  });

  it('has the room server log in for rooms', async () => {
    const setCredentials = vi.spyOn(Network, 'setServerCredentials');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example/' } }))
    );
    await loadConfig();

    expect(setCredentials).toHaveBeenCalledWith(TestBed.inject(ServerAuthService));
  });

  it('lets a screen laid over a stream in as a guest of its own, not as the account logged in', async () => {
    TestBed.inject(OverlayModeService).activate();
    const setCredentials = vi.spyOn(Network, 'setServerCredentials');
    const loginConfigured = vi.spyOn(TestBed.inject(ServerAuthService), 'configure');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example/' } }))
    );
    try {
      await loadConfig();

      expect(setCredentials).not.toHaveBeenCalled();
      expect(loginConfigured).not.toHaveBeenCalled();
    } finally {
      document.body.classList.remove(OVERLAY_BODY_CLASS);
    }
  });

  it('takes only a backend address that is text, and keeps the defaults for a file of another shape', async () => {
    const service = TestBed.inject(AppConfigService);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 42 } }))
    );
    await service.initialize();
    expect(service.config()).toEqual({ transport: 'server', backend: { url: '' }, localMode: false });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(['server'])));
    await service.initialize();
    expect(service.config()).toEqual({ transport: 'skyway', backend: { url: '' }, localMode: false });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ backend: 'https://rooms.example' })));
    await service.initialize();
    expect(service.config()).toEqual({ transport: 'skyway', backend: { url: '' }, localMode: false });
  });

  it('settles without rejecting when applying the configuration throws', async () => {
    vi.spyOn(TestBed.inject(ServerAuthService), 'configure').mockImplementation(() => {
      throw new Error('refused');
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example/' } }))
    );

    await expect(loadConfig()).resolves.toBeUndefined();
  });

  it('keeps them on the room server, and with SkyWay nowhere', () => {
    expect(assetServerUrl({ transport: 'server', backend: { url: 'https://rooms.example' }, localMode: false })).toBe(
      'https://rooms.example'
    );
    expect(assetServerUrl({ transport: 'skyway', backend: { url: 'https://token.example' }, localMode: false })).toBe(
      ''
    );
  });
});
