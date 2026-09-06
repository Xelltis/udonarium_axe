import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@axe/application/logging/logger.service';
import { emitLoadConfig } from '@axe/core/event/domain-events';

export interface AppConfig {
  backend: {
    url: string;
  };
  localMode: boolean;
}

export function isLocalModeSearch(search: string): boolean {
  const value = new URLSearchParams(search).get('local');
  return value === '1' || value === 'true';
}

@Injectable()
export class AppConfigService {
  private readonly logger = inject(LoggerService);

  constructor() {}

  peerHistory: string[] = [];
  isOpen: boolean = false;

  static appConfig: AppConfig = {
    backend: {
      url: '',
    },
    localMode: false,
  };

  initialize() {
    this.initAppConfig();
  }

  private async initAppConfig() {
    const search = typeof location === 'undefined' ? '' : location.search;
    if (isLocalModeSearch(search)) {
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
