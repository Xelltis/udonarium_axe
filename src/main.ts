import { ApplicationRef, enableProdMode, ɵChangeDetectionScheduler as ChangeDetectionScheduler } from '@angular/core';
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

/**
 * Has the screen checked again after what arrives from the network, which changes objects outside
 * anything Angular listens to.
 *
 * `ɵChangeDetectionScheduler` is private to Angular, and so is the `0` handed to it, which is
 * `NotificationSource.MarkAncestorsForTraversal`: a check asked for and run a moment later, the
 * arrivals before it runs sharing the one check. The public `ApplicationRef.tick()` checks at once,
 * for every arrival, so it is no replacement. This is the only place the app reaches for it; see
 * that the token and the number still mean this whenever Angular is upgraded.
 */
function checkAfterNetworkArrivals(appRef: ApplicationRef): void {
  const scheduler = appRef.injector.get(ChangeDetectionScheduler);
  setNetworkTick(() => scheduler.notify(0));
}

/** Starts the app, once whatever the page before asked to be wiped from this browser is gone. */
function bootstrap(): Promise<void> {
  return bootstrapApplication(AppComponent, { providers: [...APP_PROVIDERS, ...APP_INITIALIZERS] })
    .then(checkAfterNetworkArrivals)
    .catch((err) => Logger.error('[Bootstrap] failed to bootstrap application', err));
}

void wipeBrowserDataIfRequested()
  .catch((err) => Logger.error('[Bootstrap] failed to wipe the browser data', err))
  .then(bootstrap);
