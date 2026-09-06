import { inject, Injectable } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SeatDisplayPreferenceService } from '@axe/application/ui/seat-display-preference.service';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  resolveTabletopDisplay,
  TabletopDisplaySection,
  TabletopDisplaySettings,
} from '@axe/domain/tabletop/tabletop-display';

/**
 * The one place the settings of a flat table are read and written from.
 *
 * A setting goes to the table, so that everyone around one screen sees the same thing, unless
 * this reader has taken that feature over, in which case it goes no further than this browser.
 */
@Injectable({ providedIn: 'root' })
export class TabletopDisplayService {
  private readonly tabletop = inject(TabletopService);
  private readonly seat = inject(SeatDisplayPreferenceService);

  /** What is in force here: the table's answer, with anything this reader took over on top. */
  readonly settings = this.tabletop.display;

  /** The same, for a table being edited rather than the one being looked at. */
  settingsOf(table: GameTable | null): TabletopDisplaySettings {
    return table ? resolveTabletopDisplay(table, this.seat.override()) : this.settings();
  }

  takesOver(section: TabletopDisplaySection): boolean {
    return this.seat.takesOver(section);
  }

  takeOver(section: TabletopDisplaySection, from: GameTable | null = null): void {
    this.seat.takeOver(section, this.settingsOf(from));
  }

  handBack(section: TabletopDisplaySection): void {
    this.seat.handBack(section);
  }

  set(section: TabletopDisplaySection, patch: Partial<TabletopDisplaySettings>, onto: GameTable | null = null): void {
    if (this.takesOver(section)) {
      this.seat.patch(patch);
      return;
    }
    const table = onto ?? this.tabletop.currentTable;
    Object.assign(table, patch);
    if (table.identifier) triggerUpdateGameObject(table.toContext());
  }
}
