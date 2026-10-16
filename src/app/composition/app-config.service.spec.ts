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
    AppConfigService.appConfig.transport = 'skyway';
    AppConfigService.appConfig.backend.url = '';
    AssetHttpStore.instance.configure(null);
    AssetHttpStore.instance.useAccess(null);
    Network.setServerCredentials(null);
    vi.restoreAllMocks();
  });

  // initialize() hands back nothing to wait on, so the loading it starts is awaited directly
  const loadConfig = () =>
    (TestBed.inject(AppConfigService) as unknown as { initAppConfig(): Promise<void> }).initAppConfig();

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

  it('leaves the asset store off with SkyWay, whatever asset server config.json names', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ backend: { url: 'http://localhost:3000' }, assets: { url: 'https://assets.example' } })
      )
    );
    await loadConfig();

    expect(AppConfigService.appConfig.transport).toBe('skyway');
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

  it('keeps them on the room server, and with SkyWay nowhere', () => {
    expect(assetServerUrl({ transport: 'server', backend: { url: 'https://rooms.example' }, localMode: false })).toBe(
      'https://rooms.example'
    );
    expect(assetServerUrl({ transport: 'skyway', backend: { url: 'https://token.example' }, localMode: false })).toBe(
      ''
    );
  });
});
