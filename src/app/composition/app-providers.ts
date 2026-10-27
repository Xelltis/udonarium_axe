import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  EnvironmentProviders,
  inject,
  provideAppInitializer,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { transLocoConfig } from '@axe/application/i18n/transloco.config';
import { TranslocoHttpLoader } from '@axe/application/i18n/transloco-http-loader';
import { PanelService } from '@axe/application/ui/panel.service';
import { AppInitializationService } from '@axe/composition/app-initialization.service';
import { BEFORE_BOARD_MODE_PROVIDER } from '@axe/composition/before-board-mode.provider';
import { BEFORE_RELOAD_PROVIDER } from '@axe/composition/before-reload.provider';
import { CLASS_SINGLETON_PROVIDERS } from '@axe/composition/class-provider';
import { OVERLAY_PROVIDERS } from '@axe/composition/overlay-providers';
import { provideTransloco } from '@jsverse/transloco';

/**
 * Everything the app is started with, but what runs before its first screen.
 *
 * PanelService is named here because every panel provides one of its own as well; the app's own is
 * the one a service outside any panel is given.
 */
export const APP_PROVIDERS: (Provider | EnvironmentProviders)[] = [
  provideZonelessChangeDetection(),
  provideHttpClient(withXhr()),
  provideTransloco({ config: transLocoConfig, loader: TranslocoHttpLoader }),
  ...CLASS_SINGLETON_PROVIDERS,
  ...OVERLAY_PROVIDERS,
  BEFORE_BOARD_MODE_PROVIDER,
  BEFORE_RELOAD_PROVIDER,
  PanelService,
];

/** What runs before the first screen is drawn, in this order: the language, the room's own objects, the start room. */
export const APP_INITIALIZERS: EnvironmentProviders[] = [
  provideAppInitializer(() => inject(LanguageService).initialize()),
  provideAppInitializer(() => inject(AppInitializationService).initialize()),
  provideAppInitializer(() => inject(StartRoomService).prepare()),
];
