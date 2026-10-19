import { inject, Injectable } from '@angular/core';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { LoggerService } from '@axe/application/logging/logger.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { emitLoadConfig } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { Transport, transportOf } from '@axe/core/network/transport';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';

export interface AppConfig {
  /** How players connect: through SkyWay (the default) or through a room server at the backend url. */
  transport: Transport;
  backend: {
    url: string;
  };
  localMode: boolean;
}

@Injectable()
export class AppConfigService {
  private readonly logger = inject(LoggerService);
  private readonly localMode = inject(LocalModePreferenceService);
  private readonly serverAuth = inject(ServerAuthService);
  private readonly overlay = inject(OverlayModeService);

  constructor() {}

  peerHistory: string[] = [];
  isOpen: boolean = false;

  static appConfig: AppConfig = {
    transport: 'skyway',
    backend: {
      url: '',
    },
    localMode: false,
  };

  /**
   * Loads the app configuration and announces it with the load-config event.
   *
   * In local mode no network is used and the file is not read. Otherwise the transport and the
   * backend address come from `assets/config.json`; a missing or unreadable file is logged and
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
   * before anything connects; a reload may go straight back into a room. The room's pictures and
   * sounds are reached with the token the room hands the seat.
   *
   * A screen laid over a stream leaves the login aside altogether and comes in as a guest of its
   * own, even where the browser is logged in: as the account it would take the account's one seat
   * and put the reader's own screen out, and minding a login it does not use would have it go into
   * the room again and again.
   */
  private configureServerLogin(config: AppConfig): void {
    if (config.transport !== 'server' || config.backend.url.trim().length === 0) return;
    if (!this.overlay.active()) {
      this.serverAuth.configure(config.backend.url);
      Network.setServerCredentials(this.serverAuth);
    }
    AssetHttpStore.instance.useAccess(
      () => Network.instance.assetAccess,
      () => Network.instance.refreshAssetAccess()
    );
  }
}

/**
 * Where pictures and sounds are kept: the room server, which keeps each room's apart for its seats.
 * With SkyWay there is no such place, and they travel between peers.
 */
export function assetServerUrl(config: AppConfig): string {
  return config.transport === 'server' ? config.backend.url : '';
}
