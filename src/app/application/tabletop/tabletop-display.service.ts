import { inject, Injectable } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SeatDisplayPreferenceService } from '@axe/application/ui/seat-display-preference.service';
import { resolveTabletopDisplay, TabletopDisplaySettings } from '@axe/domain/tabletop/tabletop-display';

/**
 * The one place the settings of a flat table are read and written from.
 *
 * Everything here belongs to the screen in front of this reader, so a change reaches nobody
 * else. The table is asked only for what this screen has never been told.
 */
@Injectable({ providedIn: 'root' })
export class TabletopDisplayService {
  private readonly tabletop = inject(TabletopService);
  private readonly seat = inject(SeatDisplayPreferenceService);

  readonly settings = this.tabletop.display;

  /**
   * The same, worked out from what is written down at this moment.
   *
   * A panel has to show the edit it has just made, and the table is read through a signal that
   * only counts a change once it has been round the object store.
   */
  settingsNow(): TabletopDisplaySettings {
    return resolveTabletopDisplay(this.tabletop.currentTable, this.seat.own());
  }

  set(patch: Partial<TabletopDisplaySettings>): void {
    this.seat.set(patch);
  }

  forget(): void {
    this.seat.forget();
  }
}
