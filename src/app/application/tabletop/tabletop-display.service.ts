import { inject, Injectable } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SeatDisplayPreferenceService } from '@axe/application/ui/seat-display-preference.service';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import {
  resolveTabletopDisplay,
  TabletopDisplaySection,
  TabletopDisplaySettings,
} from '@axe/domain/tabletop/tabletop-display';

/**
 * The one place the settings of a flat table are read and written from.
 *
 * A setting goes to the room, so that everyone playing around one screen sees the same thing,
 * unless this reader has taken that feature over, in which case it goes no further than this
 * browser.
 */
@Injectable({ providedIn: 'root' })
export class TabletopDisplayService {
  private readonly tabletop = inject(TabletopService);
  private readonly seat = inject(SeatDisplayPreferenceService);
  private readonly objectStore = inject(ObjectStore);

  /** What is in force here: the room's answer, with anything this reader took over on top. */
  readonly settings = this.tabletop.display;

  /**
   * The same, worked out from what is written down at this moment.
   *
   * A panel has to show the edit it has just made, and the signal the table and the room are
   * read through only counts a change once it has been round the object store.
   */
  settingsNow(): TabletopDisplaySettings {
    const config = this.objectStore.get<Config>('Config');
    return resolveTabletopDisplay(
      this.tabletop.currentTable,
      config?.tabletopDisplayAnswers ?? null,
      this.seat.override()
    );
  }

  takesOver(section: TabletopDisplaySection): boolean {
    return this.seat.takesOver(section);
  }

  takeOver(section: TabletopDisplaySection): void {
    this.seat.takeOver(section, this.settingsNow());
  }

  handBack(section: TabletopDisplaySection): void {
    this.seat.handBack(section);
  }

  set(section: TabletopDisplaySection, patch: Partial<TabletopDisplaySettings>): void {
    if (this.takesOver(section)) {
      this.seat.patch(patch);
      return;
    }
    const config = this.objectStore.get<Config>('Config') ?? Config.instance;
    config.setTabletopDisplay(patch);
    triggerUpdateGameObject(config.toContext());
  }
}
