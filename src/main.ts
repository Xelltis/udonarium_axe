import { CommonModule } from '@angular/common';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { ɵChangeDetectionScheduler as ChangeDetectionScheduler } from '@angular/core';
import { APP_INITIALIZER, enableProdMode, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication, BrowserModule } from '@angular/platform-browser';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { AppComponent } from '@axe/app.component';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { transLocoConfig } from '@axe/application/i18n/transloco.config';
import { TranslocoHttpLoader } from '@axe/application/i18n/transloco-http-loader';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { LoggerService } from '@axe/application/logging/logger.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { AppConfigService } from '@axe/composition/app-config.service';
import { AppInitializationService } from '@axe/composition/app-initialization.service';
import { CLASS_SINGLETON_PROVIDERS } from '@axe/composition/class-provider';
import { Logger } from '@axe/core/logging/logger';
import { setNetworkTick } from '@axe/core/network/network-messaging';
import { environment } from '@env/environment';
import { provideTransloco } from '@jsverse/transloco';
import { NgSelectModule } from '@ng-select/ng-select';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, CommonModule, FormsModule, YouTubePlayerModule, NgSelectModule),
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    provideTransloco({ config: transLocoConfig, loader: TranslocoHttpLoader }),
    ...CLASS_SINGLETON_PROVIDERS,
    AppConfigService,
    ChatMessageService,
    ContextMenuService,
    LoggerService,
    ModalService,
    GameObjectInventoryService,
    PanelService,
    PointerDeviceService,
    TabletopService,
    {
      provide: APP_INITIALIZER,
      useFactory: (service: LanguageService) => () => service.initialize(),
      deps: [LanguageService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (service: AppInitializationService) => () => service.initialize(),
      deps: [AppInitializationService],
      multi: true,
    },
  ],
})
  .then((appRef) => {
    const scheduler = appRef.injector.get(ChangeDetectionScheduler);
    setNetworkTick(() => scheduler.notify(0));
  })
  .catch((err) => Logger.error('[Bootstrap] failed to bootstrap application', err));
