import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Where a band of the table's hints stands on the screen. */
export type HintBandPlace = 'top' | 'bottom';

/**
 * The band at the foot of the screen, where a piece in hand or a turn under way speaks from. It is
 * drawn over the panels, where the planned move's band is, so the two never talk over each other.
 */
const BOTTOM_BAND =
  'bg-ui-panel shadow-ui-md text-ui-muted pointer-events-none absolute bottom-28 left-1/2 z-160 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-1.5 text-[0.86em] leading-snug opacity-95';

/** The band at the head of the screen, where picking a target is explained. */
const TOP_BAND =
  'bg-ui-panel text-ui-text pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-1.5 text-sm opacity-90';

/**
 * A rounded band laid over the table with a line of words in it: an icon, where one is given, and
 * whatever is projected after it. The band stands at the foot of the screen or at its head.
 */
@Component({
  selector: 'table-hint-band',
  templateUrl: './table-hint-band.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'bandClass()' },
})
export class TableHintBandComponent {
  /** Where the band stands: at the foot of the screen, or at its head. */
  readonly band = input.required<HintBandPlace>();
  /** The icon drawn ahead of the words, by its name in the icon font, or none. */
  readonly icon = input<string>('');

  protected readonly bandClass = computed(() => (this.band() === 'bottom' ? BOTTOM_BAND : TOP_BAND));
}
