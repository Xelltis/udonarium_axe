import { inject, Injectable } from '@angular/core';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { HotbarPreferenceService } from '@axe/application/ui/hotbar-preference.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HOTBAR_PAGES, HOTBAR_SLOTS_PER_PAGE, HotbarCell } from '@axe/domain/hotbar/hotbar-size';

/**
 * Putting something on the bar from wherever the reader found it.
 *
 * An effect on the shelf or a line of a palette is worth a slot the moment it is worth
 * pressing twice, and the reader should not have to open the bar's own editor and type the
 * name in again. It goes in the first free slot on the page they are looking at, and the bar
 * is brought out where it was put away, since a slot nobody can see is no use.
 */
@Injectable({ providedIn: 'root' })
export class HotbarFillService {
  private readonly hotbarStore = inject(HotbarStoreService);
  private readonly preference = inject(HotbarPreferenceService);
  private readonly widgets = inject(WidgetVisibilityService);

  /** Where it landed, or null where every slot on every page is spoken for. */
  fill(draft: HotbarSlotDraft): HotbarCell | null {
    const hotbar = this.hotbarStore.ensureOwn();
    if (!hotbar) return null;

    const cell = this.firstFreeCell();
    if (!cell) return null;
    if (!hotbar.put(cell.page, cell.slotIndex, draft)) return null;

    this.widgets.hotbar.set(true);
    this.preference.gotoPage(cell.page);
    return cell;
  }

  /** The page the reader is looking at first, then the rest in their order. */
  private firstFreeCell(): HotbarCell | null {
    const hotbar = this.hotbarStore.own();
    if (!hotbar) return null;

    const standing = this.preference.page();
    const pages = [standing, ...Array.from({ length: HOTBAR_PAGES }, (_, page) => page).filter((p) => p !== standing)];
    for (const page of pages) {
      for (let slotIndex = 0; slotIndex < HOTBAR_SLOTS_PER_PAGE; slotIndex++) {
        if (!hotbar.slotAt(page, slotIndex)) return { page, slotIndex };
      }
    }
    return null;
  }
}
