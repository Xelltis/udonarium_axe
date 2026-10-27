import { inject, Injectable, Injector } from '@angular/core';
import type { BattleLaunchService } from '@axe/application/battle/battle-launch.service';

/**
 * Fetches what plays bouts on the battle stage the first time one is played, so that it stays out
 * of what every screen downloads to open the room. Whatever only has to know a bout is wanted asks
 * here; a panel that plays bouts is fetched with it anyway, and takes the service itself.
 */
@Injectable({ providedIn: 'root' })
export class BattleLaunchLoaderService {
  private readonly injector = inject(Injector);
  private loading: Promise<BattleLaunchService | null> | null = null;

  /** The service that plays bouts, once fetched. Null where it could not be, which is asked again next time. */
  load(): Promise<BattleLaunchService | null> {
    this.loading ??= import('@axe/application/battle/battle-launch.service').then(
      (m) => this.injector.get(m.BattleLaunchService),
      () => {
        this.loading = null;
        return null;
      }
    );
    return this.loading;
  }
}
