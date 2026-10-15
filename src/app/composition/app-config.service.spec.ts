import { inject, TestBed } from '@angular/core/testing';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
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
    AppConfigService.appConfig.assets.url = '';
    AssetHttpStore.instance.configure(null);
    AssetHttpStore.instance.setAuthorization(null);
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

  it('points the asset store at the server config.json names', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ backend: { url: 'http://localhost:3000' }, assets: { url: 'https://assets.example' } })
      )
    );
    await loadConfig();

    expect(AppConfigService.appConfig.assets.url).toBe('https://assets.example');
    expect(AssetHttpStore.instance.isEnabled).toBe(true);
  });

  it('leaves the asset store off for a config.json without an asset server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ backend: { url: 'http://localhost:3000' }, assets: { url: '' } }))
    );
    await loadConfig();

    expect(AssetHttpStore.instance.isEnabled).toBe(false);
  });

  it('leaves the asset store off in local mode', async () => {
    TestBed.inject(LocalModePreferenceService).set(true);
    await loadConfig();

    expect(AssetHttpStore.instance.isEnabled).toBe(false);
  });

  it('connects through a room server when config.json asks for one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example' } }))
    );
    await loadConfig();

    expect(AppConfigService.appConfig.transport).toBe('server');
  });

  it('stays on SkyWay for a config.json that names no transport, or one it does not know', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ backend: { url: 'http://localhost:3000' } }))
    );
    await loadConfig();
    expect(AppConfigService.appConfig.transport).toBe('skyway');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'carrier-pigeon', backend: { url: 'http://localhost:3000' } }))
    );
    await loadConfig();
    expect(AppConfigService.appConfig.transport).toBe('skyway');
  });

  it('keeps pictures and sounds on the room server when it names no asset server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example' } }))
    );
    await loadConfig();

    expect(AssetHttpStore.instance.isEnabled).toBe(true);
  });

  it('has the room server log in for rooms and uploads, sending its token nowhere else', async () => {
    const setAuthorization = vi.spyOn(AssetHttpStore.instance, 'setAuthorization');
    const setCredentials = vi.spyOn(Network, 'setServerCredentials');
    const fetch = vi.spyOn(globalThis, 'fetch');
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ transport: 'server', backend: { url: 'https://rooms.example/' } }))
    );
    await loadConfig();

    expect(setCredentials).toHaveBeenCalledWith(TestBed.inject(ServerAuthService));
    expect(setAuthorization).toHaveBeenCalledTimes(1);

    setAuthorization.mockClear();
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          transport: 'server',
          backend: { url: 'https://rooms.example' },
          assets: { url: 'https://assets.elsewhere.example' },
        })
      )
    );
    await loadConfig();

    expect(setAuthorization).not.toHaveBeenCalled();
  });

  it('keeps them where the asset url says, over the room server', () => {
    expect(
      assetServerUrl({
        transport: 'server',
        backend: { url: 'https://rooms.example' },
        assets: { url: 'https://assets.example' },
        localMode: false,
      })
    ).toBe('https://assets.example');
  });

  it('leaves them to SkyWay peers when SkyWay names no asset server', () => {
    expect(
      assetServerUrl({
        transport: 'skyway',
        backend: { url: 'https://token.example' },
        assets: { url: '' },
        localMode: false,
      })
    ).toBe('');
  });
});
