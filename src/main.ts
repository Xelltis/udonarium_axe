import { enableProdMode, ɵChangeDetectionScheduler as ChangeDetectionScheduler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from '@axe/app.component';
import { APP_INITIALIZERS, APP_PROVIDERS } from '@axe/composition/app-providers';
import { Logger } from '@axe/core/logging/logger';
import { setNetworkTick } from '@axe/core/network/network-messaging';
import { wipeBrowserDataIfRequested } from '@axe/core/storage/browser-data-wipe';
import { environment } from '@env/environment';

if (environment.production) {
  enableProdMode();
}

/** Starts the app, once whatever the page before asked to be wiped from this browser is gone. */
function bootstrap(): Promise<void> {
  return bootstrapApplication(AppComponent, { providers: [...APP_PROVIDERS, ...APP_INITIALIZERS] })
    .then((appRef) => {
      const scheduler = appRef.injector.get(ChangeDetectionScheduler);
      setNetworkTick(() => scheduler.notify(0));
    })
    .catch((err) => Logger.error('[Bootstrap] failed to bootstrap application', err));
}

void wipeBrowserDataIfRequested()
  .catch((err) => Logger.error('[Bootstrap] failed to wipe the browser data', err))
  .then(bootstrap);
