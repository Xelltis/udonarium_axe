import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { STAMP_FAMILIES, StampFamily, stampOf, stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { TranslocoModule } from '@jsverse/transloco';

/** Where the stamps this viewer picked last are kept, newest first. */
export const RECENT_STAMPS_STORAGE_KEY = 'ui-stamp-recent';
const RECENT_LIMIT = 16;

type StampTab = 'recent' | StampFamily;

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
 * The stamps to choose from, a family to a tab, with the ones this viewer picked last on a tab of
 * their own.
 *
 * Picking one only says which; the caller decides whether it answers a line or is sent as one. It
 * is drawn as a popover, which whoever opens it places.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-stamp-picker',
  templateUrl: './stamp-picker.component.html',
  host: {
    popover: 'manual',
    class:
      'rounded-ui-lg border-ui-border-menu bg-ui-menu text-ui-text shadow-ui-lg fixed inset-auto m-0 flex flex-col overflow-hidden border border-solid p-0 [backdrop-filter:blur(12px)]',
    'data-testid': 'stamp-picker',
  },
  imports: [StampComponent, TranslocoModule],
})
export class StampPickerComponent {
  /** The stamp that was picked, by its identifier. */
  readonly picked = output<string>();

  private readonly recent = signal<readonly string[]>(readRecent());

  protected readonly tabs = computed<readonly StampTab[]>(() =>
    this.recent().length > 0 ? ['recent', ...STAMP_FAMILIES] : [...STAMP_FAMILIES]
  );

  protected readonly tab = signal<StampTab>(this.recent().length > 0 ? 'recent' : 'sfx');

  protected readonly stamps = computed<readonly string[]>(() => {
    const tab = this.tab();
    return tab === 'recent' ? this.recent() : stampsOfFamily(tab).map((each) => each.id);
  });

  /** Picks a stamp, putting it first among the recent ones. */
  protected pick(id: string): void {
    const recent = [id, ...this.recent().filter((each) => each !== id)].slice(0, RECENT_LIMIT);
    this.recent.set(recent);
    writeRecent(recent);
    this.picked.emit(id);
  }
}
