import { inject, Injectable } from '@angular/core';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { LoggerService } from '@axe/application/logging/logger.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { emitLoadConfig } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { trimBaseUrl } from '@axe/core/network/server/server-room-api';
import { Transport, transportOf } from '@axe/core/network/transport';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';

export interface AppConfig {
  /** How players connect: through SkyWay (the default) or through a room server at the backend url. */
  transport: Transport;
  backend: {
    url: string;
  };
  /** The asset server that keeps pictures and sounds; an empty url leaves them to travel between peers. */
  assets: {
    url: string;
  };
  localMode: boolean;
}

@Injectable()
export class AppConfigService {
  private readonly logger = inject(LoggerService);
  private readonly localMode = inject(LocalModePreferenceService);
  private readonly serverAuth = inject(ServerAuthService);

  constructor() {}

  peerHistory: string[] = [];
  isOpen: boolean = false;

  static appConfig: AppConfig = {
    transport: 'skyway',
    backend: {
      url: '',
    },
    assets: {
      url: '',
    },
    localMode: false,
  };

  /**
   * Loads the app configuration and announces it with the load-config event.
   *
   * In local mode no network is used and the file is not read. Otherwise the backend and asset
   * server addresses come from `assets/config.json`; a missing or unreadable file is logged and
   * the defaults are kept. The loading finishes after this returns.
   */
  initialize() {
    this.initAppConfig();
  }

  private async initAppConfig() {
    if (this.localMode.enabled()) {
      AppConfigService.appConfig.localMode = true;
      this.logger.info('ローカル確認モードで起動します。ネットワーク接続は行いません。');
      emitLoadConfig({ config: AppConfigService.appConfig });
      return;
    }

    AppConfigService.appConfig.localMode = false;
    try {
      const response = await fetch('./assets/config.json');
      if (response.ok) {
        const config = await response.json();
        AppConfigService.appConfig.transport = transportOf(config ?? {});
        if (config?.backend?.url) {
          AppConfigService.appConfig.backend.url = config.backend.url;
        }
        if (typeof config?.assets?.url === 'string') {
          AppConfigService.appConfig.assets.url = config.assets.url;
        }
      } else {
        this.logger.info('config.json が見つかりません。config.json.example を参考に作成してください。');
      }
    } catch (e) {
      this.logger.warn('config.json の読み込みに失敗しました', e);
    }
    AssetHttpStore.instance.configure(assetServerUrl(AppConfigService.appConfig));
    this.configureServerLogin(AppConfigService.appConfig);
    emitLoadConfig({ config: AppConfigService.appConfig });
  }

  /**
   * Points the login at the room server, and has every connection to it say hello with the login,
   * before anything connects; a reload may go straight back into a room. Uploads to the same server
   * carry the login too, as it takes them only from somebody logged in.
   */
  private configureServerLogin(config: AppConfig): void {
    if (config.transport !== 'server' || config.backend.url.trim().length === 0) return;
    this.serverAuth.configure(config.backend.url);
    Network.setServerCredentials(this.serverAuth);
    // The login's token goes only to the server it came from, never to an asset server elsewhere.
    if (trimBaseUrl(assetServerUrl(config)) === trimBaseUrl(config.backend.url)) {
      AssetHttpStore.instance.setAuthorization(() => this.serverAuth.accessToken());
    }
  }
}

/**
 * Where pictures and sounds are kept: the asset url, or for a room server, which keeps them too, the
 * backend url when no asset url is given. Empty leaves them to travel between peers.
 */
export function assetServerUrl(config: AppConfig): string {
  if (config.assets.url.trim().length > 0) return config.assets.url;
  return config.transport === 'server' ? config.backend.url : '';
}
