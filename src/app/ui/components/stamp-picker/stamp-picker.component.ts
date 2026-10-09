import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isArtStampFamily, STAMP_FAMILIES, StampFamily, stampOf, stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { TranslocoModule } from '@jsverse/transloco';

/** Where the stamps this viewer picked last are kept, newest first. */
export const RECENT_STAMPS_STORAGE_KEY = 'ui-stamp-recent';
const RECENT_LIMIT = 16;

type StampTab = 'recent' | StampFamily | `pack:${string}`;

/** A room's own set of stamps, as the picker offers it. */
export interface StampPickerPack {
  readonly identifier: string;
  readonly name: string;
  readonly stamps: readonly { readonly stampId: string }[];
}

/** Whether a tab holds pictures: one of the character's families, or one of the room's sets. */
function isPictureTab(tab: StampTab): boolean {
  return isArtStampFamily(tab) || tab.startsWith('pack:');
}

function readRecent(): string[] {
  try {
    const kept = JSON.parse(localStorage.getItem(RECENT_STAMPS_STORAGE_KEY) ?? '[]');
    return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string' && stampOf(id) !== null) : [];
  } catch {
    return [];
  }
}

function writeRecent(ids: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_STAMPS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // A browser that keeps nothing still lets the stamp be picked.
  }
}

/**
 * The stamps to choose from, a family to a tab, then a tab for each of the room's own sets, with
 * the ones this viewer picked last on a tab of their own.
 *
 * The tabs stand in two rows: the families the app draws, then the pictures, the character's
 * families and the room's sets, whose stamps are offered larger. Only the round seals are laid out
 * in narrow cells, so the words of a sound effect keep clear of the next. A tab opens at the top of
 * its stamps. Picking one only says which; the caller decides whether it answers a line or is sent
 * as one. It is drawn as a popover of a fixed height, which whoever opens it places, so moving
 * between tabs does not move it. For a reader who may change the sets, a button at the end of the
 * first row asks for them to be managed.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-stamp-picker',
  templateUrl: './stamp-picker.component.html',
  host: {
    popover: 'manual',
    class:
      'rounded-ui-lg border-ui-border-menu bg-ui-menu text-ui-text shadow-ui-lg fixed inset-auto m-0 flex h-80 flex-col overflow-hidden border border-solid p-0 [backdrop-filter:blur(12px)]',
    'data-testid': 'stamp-picker',
  },
  imports: [StampComponent, TranslocoModule],
})
export class StampPickerComponent {
  /** The room's own sets of stamps. */
  readonly packs = input<readonly StampPickerPack[]>([]);
  /** Whether the reader may change the room's sets, which puts the button to manage them at the end. */
  readonly canManage = input(false);

  /** The stamp that was picked, by its identifier. */
  readonly picked = output<string>();
  /** Asked for the room's sets to be managed. */
  readonly manage = output<void>();

  private readonly recent = signal<readonly string[]>(readRecent());

  protected readonly tabRows = computed<readonly (readonly StampTab[])[]>(() => {
    const tabs: StampTab[] = [
      ...(this.recent().length > 0 ? (['recent'] as const) : []),
      ...STAMP_FAMILIES,
      ...this.packs().map((pack) => `pack:${pack.identifier}` as const),
    ];
    return [tabs.filter((tab) => !isPictureTab(tab)), tabs.filter(isPictureTab)].filter((row) => row.length > 0);
  });

  protected readonly tab = signal<StampTab>(this.recent().length > 0 ? 'recent' : 'sfx');

  protected readonly stamps = computed<readonly string[]>(() => {
    const tab = this.tab();
    if (tab === 'recent') return this.recent();
    if (tab.startsWith('pack:')) {
      const pack = this.packs().find((each) => `pack:${each.identifier}` === tab);
      return pack ? pack.stamps.map((stamp) => stamp.stampId) : [];
    }
    return stampsOfFamily(tab as StampFamily).map((each) => each.id);
  });

  /** Whether the stamps of the open tab are pictures, which are offered larger. */
  protected readonly large = computed(() => isPictureTab(this.tab()));

  /** Whether the open tab is laid out in narrow cells, which only the round seals fit. */
  protected readonly narrow = computed(() => this.tab() === 'seal');

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  /** Opens a tab at the top of its stamps. */
  protected openTab(tab: StampTab): void {
    this.tab.set(tab);
    const list = this.list()?.nativeElement;
    if (list) list.scrollTop = 0;
  }

  /** The name of a tab: a family's, or a set's own. */
  protected tabName(tab: StampTab): string | null {
    if (!tab.startsWith('pack:')) return null;
    return this.packs().find((each) => `pack:${each.identifier}` === tab)?.name ?? '';
  }

  /** Picks a stamp, putting it first among the recent ones. */
  protected pick(id: string): void {
    const recent = [id, ...this.recent().filter((each) => each !== id)].slice(0, RECENT_LIMIT);
    this.recent.set(recent);
    writeRecent(recent);
    this.picked.emit(id);
  }
}
