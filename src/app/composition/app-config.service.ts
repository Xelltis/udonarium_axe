import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@axe/application/logging/logger.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { emitLoadConfig } from '@axe/core/event/domain-events';

export interface AppConfig {
  backend: {
    url: string;
  };
  localMode: boolean;
}

@Injectable()
export class AppConfigService {
  private readonly logger = inject(LoggerService);
  private readonly localMode = inject(LocalModePreferenceService);

  constructor() {}

  peerHistory: string[] = [];
  isOpen: boolean = false;

  static appConfig: AppConfig = {
    backend: {
      url: '',
    },
    localMode: false,
  };

  /**
   * Loads the app configuration and announces it with the load-config event.
   *
   * In local mode no network is used and the file is not read. Otherwise the backend address
   * comes from `assets/config.json`; a missing or unreadable file is logged and the defaults
   * are kept. The loading finishes after this returns.
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
        if (config?.backend?.url) {
          AppConfigService.appConfig.backend.url = config.backend.url;
        }
      } else {
        this.logger.info('config.json が見つかりません。config.json.example を参考に作成してください。');
      }
    } catch (e) {
      this.logger.warn('config.json の読み込みに失敗しました', e);
    }
    emitLoadConfig({ config: AppConfigService.appConfig });
  }
}
